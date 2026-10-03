import type { AssetMeta, ID } from '../model/types';

/**
 * Decoded media for the renderer. The renderer asks synchronously
 * (`image(id)` returns a bitmap or null) and a miss starts an async load that
 * calls `onReady` when it lands, so the next frame has it.
 *
 * Memory is bounded: decoded images are evicted least-recently-used once they
 * pass a pixel budget, large photos are decoded no bigger than they can ever
 * be shown, and `release()` drops everything (Bohrified suspend).
 */

export type Loader = (id: ID) => Promise<Blob | undefined>;

export type ImageSource = ImageBitmap | HTMLImageElement;

interface ImageEntry {
  src: ImageSource;
  px: number;
  used: number;
  /** Object URL for SVGs, revoked on eviction. */
  url?: string;
}

const MAX_EDGE = 4096;
const BUDGET_PX = 72_000_000;

export class AssetStore {
  private images = new Map<ID, ImageEntry>();
  private loading = new Set<ID>();
  private failed = new Set<ID>();
  private videos = new Map<ID, { el: HTMLVideoElement; url: string; ready: boolean }>();
  private audios = new Map<ID, { el: HTMLAudioElement; url: string }>();
  private tick = 0;
  private disposed = false;

  constructor(
    private load: Loader,
    private meta: () => Record<ID, AssetMeta>,
    private onReady: () => void = () => {},
  ) {}

  setReadyHandler(fn: () => void) {
    this.onReady = fn;
  }

  /** Decoded image (or rasterised SVG) for an asset, or null while it loads or if it can't be decoded. */
  image(id: ID | null | undefined): ImageSource | null {
    if (!id) return null;
    const hit = this.images.get(id);
    if (hit) {
      hit.used = ++this.tick;
      return hit.src;
    }
    if (!this.loading.has(id) && !this.failed.has(id)) void this.decode(id);
    return null;
  }

  isFailed(id: ID | null | undefined) {
    return !!id && this.failed.has(id);
  }

  /** True when every image in `ids` is decoded (or failed): used by exports to wait for assets. */
  settled(ids: Iterable<ID>) {
    for (const id of ids) if (!this.images.has(id) && !this.failed.has(id)) return false;
    return true;
  }

  async ready(ids: Iterable<ID>, timeout = 15000) {
    const list = [...ids];
    const t0 = Date.now();
    for (const id of list) this.image(id);
    while (!this.settled(list) && Date.now() - t0 < timeout) await new Promise((r) => setTimeout(r, 30));
  }

  private async decode(id: ID) {
    this.loading.add(id);
    try {
      const blob = await this.load(id);
      if (this.disposed) return;
      if (!blob) throw new Error('missing');
      const kind = this.meta()[id]?.kind;
      if (kind === 'svg' || blob.type === 'image/svg+xml') {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        await img.decode();
        const w = img.naturalWidth || 512, h = img.naturalHeight || 512;
        this.images.set(id, { src: img, px: Math.min(w * h, 4_000_000), used: ++this.tick, url });
      } else {
        let bmp = await createImageBitmap(blob);
        const long = Math.max(bmp.width, bmp.height);
        if (long > MAX_EDGE) {
          const k = MAX_EDGE / long;
          const small = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: 'high' });
          bmp.close();
          bmp = small;
        }
        this.images.set(id, { src: bmp, px: bmp.width * bmp.height, used: ++this.tick });
      }
      this.evict();
    } catch {
      this.failed.add(id);
    } finally {
      this.loading.delete(id);
      if (!this.disposed) this.onReady();
    }
  }

  private evict() {
    let total = 0;
    for (const e of this.images.values()) total += e.px;
    if (total <= BUDGET_PX) return;
    const byAge = [...this.images.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [id, e] of byAge) {
      if (total <= BUDGET_PX * 0.8) break;
      this.dropImage(id, e);
      total -= e.px;
    }
  }

  private dropImage(id: ID, e = this.images.get(id)) {
    if (!e) return;
    if ('close' in e.src) e.src.close();
    if (e.url) URL.revokeObjectURL(e.url);
    this.images.delete(id);
  }

  // ── Video / audio ──

  video(id: ID | null | undefined): HTMLVideoElement | null {
    if (!id) return null;
    const hit = this.videos.get(id);
    if (hit) return hit.ready ? hit.el : null;
    if (this.failed.has(id) || this.loading.has(id)) return null;
    this.loading.add(id);
    void this.load(id).then((blob) => {
      this.loading.delete(id);
      if (this.disposed) return;
      if (!blob) return void this.failed.add(id);
      const url = URL.createObjectURL(blob);
      const el = document.createElement('video');
      el.preload = 'auto';
      el.playsInline = true;
      el.muted = true;
      el.crossOrigin = 'anonymous';
      const entry = { el, url, ready: false };
      el.addEventListener('loadeddata', () => {
        entry.ready = true;
        // Show the first frame as the poster.
        if (el.currentTime === 0) el.currentTime = 0.05;
        this.onReady();
      }, { once: true });
      el.addEventListener('seeked', () => this.onReady());
      el.addEventListener('error', () => this.failed.add(id), { once: true });
      el.src = url;
      this.videos.set(id, entry);
    });
    return null;
  }

  audio(id: ID | null | undefined): HTMLAudioElement | null {
    if (!id) return null;
    const hit = this.audios.get(id);
    if (hit) return hit.el;
    if (this.failed.has(id) || this.loading.has(id)) return null;
    this.loading.add(id);
    void this.load(id).then((blob) => {
      this.loading.delete(id);
      if (this.disposed || !blob) return;
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      el.preload = 'auto';
      this.audios.set(id, { el, url });
      this.onReady();
    });
    return null;
  }

  /** Stop and rewind all media (leaving a slide, or ending the show). */
  stopMedia() {
    for (const v of this.videos.values()) {
      v.el.pause();
    }
    for (const a of this.audios.values()) {
      a.el.pause();
    }
  }

  // ── Lifetime ──

  /** Drop everything decoded; entries reload on demand. */
  release() {
    for (const [id, e] of [...this.images]) this.dropImage(id, e);
    for (const v of this.videos.values()) {
      v.el.pause();
      v.el.removeAttribute('src');
      v.el.load();
      URL.revokeObjectURL(v.url);
    }
    this.videos.clear();
    for (const a of this.audios.values()) {
      a.el.pause();
      a.el.removeAttribute('src');
      URL.revokeObjectURL(a.url);
    }
    this.audios.clear();
    this.loading.clear();
  }

  /** Free media no longer used by the deck. */
  retainOnly(ids: Set<ID>) {
    for (const [id, e] of [...this.images]) if (!ids.has(id)) this.dropImage(id, e);
    for (const [id, v] of [...this.videos]) {
      if (ids.has(id)) continue;
      v.el.pause();
      URL.revokeObjectURL(v.url);
      this.videos.delete(id);
    }
    for (const [id, a] of [...this.audios]) {
      if (ids.has(id)) continue;
      a.el.pause();
      URL.revokeObjectURL(a.url);
      this.audios.delete(id);
    }
  }

  /** Forget a failed/decoded entry (after the asset blob was replaced). */
  invalidate(id: ID) {
    this.dropImage(id);
    this.failed.delete(id);
  }

  dispose() {
    this.release();
    this.disposed = true;
  }

  stats() {
    let px = 0;
    for (const e of this.images.values()) px += e.px;
    return { images: this.images.size, megapixels: Math.round(px / 1e5) / 10, videos: this.videos.size };
  }
}

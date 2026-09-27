import { elementBounds, rectsIntersect } from './geometry';
import { drawElement } from './renderer';
import type { BoardTheme } from './theme';
import type { BoardElement, Camera, Rect } from './types';

/**
 * Tiled raster cache for the committed scene.
 *
 * Canvas 2D defers rasterization, so repainting thousands of vector paths
 * every pan frame is expensive even when recording them is cheap. Instead
 * the world is cut into fixed-size device-pixel tiles per scale ("key" =
 * device px per world unit). Panning and zooming just blit cached bitmaps;
 * only newly exposed tiles are rasterized, under a per-frame time budget,
 * with other scales' tiles standing in until they're ready.
 *
 * While the camera moves we use scales quantized to √2 steps (so tiles are
 * reused across frames); once it settles, tiles are rendered at the exact
 * scale so ink and text are pixel-crisp at rest.
 */

const P = 256; // tile edge in device px

interface Tile {
  key: number;
  i: number;
  j: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  used: number;
}

export function quantizeScale(d: number) {
  return Math.pow(2, Math.ceil(2 * Math.log2(d) - 1e-6) / 2);
}

export class TileCache {
  private tiles = new Map<string, Tile>();
  private frame = 0;
  /** Tiles rasterized in the last composite (for diagnostics). */
  lastRendered = 0;

  constructor(
    private getElements: () => readonly BoardElement[],
    private isHidden: (id: string) => boolean,
    private theme: BoardTheme,
  ) {}

  setTheme(theme: BoardTheme) {
    this.theme = theme;
    this.clear();
  }

  get size() {
    return this.tiles.size;
  }

  private static id(key: number, i: number, j: number) {
    return `${key}|${i}|${j}`;
  }

  private worldRect(t: { key: number; i: number; j: number }): Rect {
    const w = P / t.key;
    return { x: t.i * w, y: t.j * w, w, h: w };
  }

  clear() {
    this.tiles.clear();
  }

  /** Drop every cached tile touching a world rect (content under it changed). */
  invalidate(r: Rect) {
    for (const [id, t] of this.tiles) {
      if (rectsIntersect(this.worldRect(t), r)) {
        this.tiles.delete(id);
      }
    }
  }

  /**
   * New elements on top of the stack: paint them straight into cached tiles
   * at `key` (cheap) and drop other scales' tiles they touch.
   */
  append(els: readonly BoardElement[], key: number) {
    for (const el of els) {
      const b = elementBounds(el);
      for (const [id, t] of this.tiles) {
        if (!rectsIntersect(this.worldRect(t), b)) continue;
        if (t.key === key) {
          this.prepare(t);
          drawElement(t.ctx, el, this.theme);
        } else {
          this.tiles.delete(id);
        }
      }
    }
  }

  private prepare(t: Tile) {
    t.ctx.setTransform(t.key, 0, 0, t.key, -t.i * P, -t.j * P);
    t.ctx.globalAlpha = 1;
    t.ctx.globalCompositeOperation = 'source-over';
  }

  private rasterize(key: number, i: number, j: number): Tile {
    // Fresh canvases, never recycled: reusing a canvas that was already
    // composited can blit a stale GPU snapshot in some Chromium builds.
    const canvas = Object.assign(document.createElement('canvas'), { width: P, height: P });
    const ctx = canvas.getContext('2d')!;
    const t: Tile = { key, i, j, canvas, ctx, used: this.frame };
    this.prepare(t);
    const r = this.worldRect(t);
    for (const el of this.getElements()) {
      if (this.isHidden(el.id) || !rectsIntersect(elementBounds(el), r)) continue;
      drawElement(ctx, el, this.theme);
    }
    this.tiles.set(TileCache.id(key, i, j), t);
    return t;
  }

  /**
   * Composite visible tiles for `cam` at scale `key` onto ctx (identity
   * transform, device px). Returns false if some tiles are still pending.
   */
  composite(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number, width: number, height: number, key: number, budgetMs: number): boolean {
    this.frame++;
    this.lastRendered = 0;
    const d = cam.z * dpr; // device px per world unit on screen
    const r = d / key; // tile px → screen px
    const ox = cam.x * d, oy = cam.y * d;
    const i0 = Math.floor((cam.x * key) / P), j0 = Math.floor((cam.y * key) / P);
    const i1 = Math.floor(((cam.x + width / cam.z) * key) / P), j1 = Math.floor(((cam.y + height / cam.z) * key) / P);
    const start = performance.now();
    let complete = true;
    ctx.imageSmoothingEnabled = true;
    // Scaled blits only happen mid-gesture; at rest tiles map 1:1.
    ctx.imageSmoothingQuality = 'low';

    const missing: { i: number; j: number; x0: number; y0: number; x1: number; y1: number }[] = [];
    // Nearest the centre first, so budgeted rendering fills in outward.
    const ci = (i0 + i1) / 2, cj = (j0 + j1) / 2;
    const order: [number, number][] = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) order.push([i, j]);
    order.sort((a, b) => Math.hypot(a[0] - ci, a[1] - cj) - Math.hypot(b[0] - ci, b[1] - cj));

    for (const [i, j] of order) {
      const x0 = Math.round(i * P * r - ox), x1 = Math.round((i + 1) * P * r - ox);
      const y0 = Math.round(j * P * r - oy), y1 = Math.round((j + 1) * P * r - oy);
      let t = this.tiles.get(TileCache.id(key, i, j));
      if (!t && performance.now() - start < budgetMs) {
        t = this.rasterize(key, i, j);
        this.lastRendered++;
      }
      if (t) {
        t.used = this.frame;
        ctx.drawImage(t.canvas, x0, y0, x1 - x0, y1 - y0);
      } else {
        complete = false;
        missing.push({ i, j, x0, y0, x1, y1 });
      }
    }

    // Stand-ins: the nearest other scale's tiles, clipped once to all missing areas.
    if (missing.length) {
      const wrs = missing.map((m) => this.worldRect({ key, i: m.i, j: m.j }));
      let best = 0, bestDist = Infinity;
      for (const t of this.tiles.values()) {
        if (t.key === key) continue;
        const dist = Math.abs(Math.log(t.key / key));
        if (dist < bestDist && wrs.some((w) => rectsIntersect(this.worldRect(t), w))) {
          best = t.key;
          bestDist = dist;
        }
      }
      if (best) {
        ctx.save();
        ctx.beginPath();
        for (const m of missing) ctx.rect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
        ctx.clip();
        const tr = d / best;
        for (const t of this.tiles.values()) {
          if (t.key !== best) continue;
          const tw = this.worldRect(t);
          if (!wrs.some((w) => rectsIntersect(tw, w))) continue;
          t.used = this.frame;
          ctx.drawImage(t.canvas, t.i * P * tr - ox, t.j * P * tr - oy, P * tr, P * tr);
        }
        ctx.restore();
      }
    }

    this.evict((i1 - i0 + 1) * (j1 - j0 + 1));
    return complete;
  }

  private evict(visible: number) {
    const max = Math.max(192, Math.ceil(visible * 2.5));
    if (this.tiles.size <= max) return;
    const sorted = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [id, t] of sorted.slice(0, this.tiles.size - max)) {
      if (t.used === this.frame) break;
      this.tiles.delete(id);
    }
  }
}

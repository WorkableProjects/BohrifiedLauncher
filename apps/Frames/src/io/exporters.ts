import { zipSync } from 'fflate';
import type { Deck, ID, Slide } from '../model/types';
import { assetIdsOf } from '../model/ops';
import { Player } from '../present/player';
import { AssetStore } from '../render/assets';
import { canvasToBlob, createCanvas, ctx2d, type AnyCanvas } from '../render/canvas';
import { paintSlide } from '../render/paint';
import { assets as liveAssets } from '../state/session';
import { finalState } from '../transitions/runner';
import { blobToDataUrl, getAssetBlob, getAssetBlobs, loadDeck } from './library';
import { buildPdf } from './pdf';
import { packProject, PROJECT_EXT } from './project';

export type ExportFormat = 'png' | 'jpg' | 'pdf' | 'video' | 'html' | 'frames';
export type ExportRange = 'all' | 'current' | 'selected';

export interface ExportOptions {
  format: ExportFormat;
  /** Output width multiplier relative to the deck size (1 = 1920 px for a 16:9 deck). */
  scale: 1 | 2;
  quality: 'standard' | 'high';
  fps: 30 | 60;
}

export interface ExportResult {
  blob: Blob;
  name: string;
}

const safe = (s: string) => s.replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-') || 'presentation';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Paint a slide in its finished state (every build played) at `width` px. */
export async function renderSlide(deck: Deck, slide: Slide, width: number, store: AssetStore = liveAssets, opaque = true): Promise<AnyCanvas> {
  await store.ready(assetIdsOf({ ...deck, slides: [slide] }), 12000);
  const k = width / deck.size.w;
  const c = createCanvas(width, Math.round(deck.size.h * k));
  const ctx = ctx2d(c);
  if (opaque) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.scale(k, k);
  paintSlide(ctx, { deck, assets: store, mode: 'export', px: k }, slide, slide.anims.length ? finalState(slide) : null);
  return c;
}

export interface Progress {
  (done: number, total: number, label?: string): void;
}

export async function exportImages(deck: Deck, slides: Slide[], o: ExportOptions, progress: Progress, signal?: AbortSignal): Promise<ExportResult> {
  const width = Math.round(deck.size.w * o.scale);
  const type = o.format === 'jpg' ? 'image/jpeg' : 'image/png';
  const q = o.quality === 'high' ? 0.94 : 0.8;
  const ext = o.format === 'jpg' ? 'jpg' : 'png';
  const files: Record<string, Uint8Array> = {};
  let single: Blob | null = null;
  for (let i = 0; i < slides.length; i++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    progress(i, slides.length, `Slide ${i + 1}`);
    const c = await renderSlide(deck, slides[i]!, width, liveAssets, o.format === 'jpg');
    const blob = await canvasToBlob(c, type, q);
    if (slides.length === 1) single = blob;
    else files[`${safe(deck.title)}-${String(i + 1).padStart(2, '0')}.${ext}`] = new Uint8Array(await blob.arrayBuffer());
    await new Promise((r) => setTimeout(r));
  }
  progress(slides.length, slides.length);
  if (single) return { blob: single, name: `${safe(deck.title)}.${ext}` };
  return { blob: new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }), name: `${safe(deck.title)}-${ext}.zip` };
}

export async function exportPdf(deck: Deck, slides: Slide[], o: ExportOptions, progress: Progress, signal?: AbortSignal): Promise<ExportResult> {
  const width = Math.round(deck.size.w * o.scale);
  const q = o.quality === 'high' ? 0.93 : 0.78;
  const pages = [];
  for (let i = 0; i < slides.length; i++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    progress(i, slides.length, `Slide ${i + 1}`);
    const c = await renderSlide(deck, slides[i]!, width);
    const jpeg = new Uint8Array(await (await canvasToBlob(c, 'image/jpeg', q)).arrayBuffer());
    pages.push({ jpeg, w: c.width, h: c.height, pageW: deck.size.w * 0.5, pageH: deck.size.h * 0.5 });
    await new Promise((r) => setTimeout(r));
  }
  progress(slides.length, slides.length);
  const bytes = buildPdf(pages, { title: deck.title, author: 'Frames' });
  return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), name: `${safe(deck.title)}.pdf` };
}

/** Record the presentation playing (transitions, builds and all) into a video. */
export async function exportVideo(deck: Deck, o: ExportOptions, progress: Progress, signal?: AbortSignal): Promise<ExportResult> {
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record video.');
  const shown = deck.slides.filter((s) => !s.hidden);
  const W = o.quality === 'high' ? 1920 : 1280;
  const H = Math.round((W * deck.size.h) / deck.size.w);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px';
  document.body.appendChild(canvas);
  const player = new Player({ canvas, deck, assets: liveAssets });
  player.resize(W, H, 1);
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: o.quality === 'high' ? 12_000_000 : 5_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let ticking = true;
  const tick = () => {
    if (!ticking) return;
    track.requestFrame?.();
    setTimeout(tick, 1000 / o.fps);
  };
  try {
    await liveAssets.ready(assetIdsOf(deck), 15000);
    player.start(0);
    rec.start(250);
    tick();
    for (let i = 0; i < shown.length; i++) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      progress(i, shown.length, `Slide ${i + 1}`);
      await wait(250);
      await player.settled();
      // Play every build step, pausing so each can be read.
      for (let guard = 0; guard < 60 && player.state.step < player.state.steps; guard++) {
        await wait(500);
        player.next();
        await player.settled();
      }
      await wait(shown[i]!.auto ? Math.min(shown[i]!.auto!, 8000) : 2400);
      if (i < shown.length - 1) {
        player.next();
        await wait(60);
        await player.settled();
      }
    }
    await wait(500);
    progress(shown.length, shown.length);
  } finally {
    ticking = false;
    if (rec.state !== 'inactive') rec.stop();
    await stopped.catch(() => {});
    player.dispose();
    canvas.remove();
  }
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  return { blob: new Blob(chunks, { type: mime || 'video/webm' }), name: `${safe(deck.title)}.${ext}` };
}

// ── Animated presentation (self-contained HTML) ──────────────────────────────

async function playerSource(): Promise<string> {
  const url = new URL(`${import.meta.env.BASE_URL}player/frames-player.js`, document.baseURI).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error('The player bundle is missing. Run the build and try again.');
  return await res.text();
}

const escScript = (s: string) => s.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export async function exportHtml(deck: Deck, progress: Progress): Promise<ExportResult> {
  const ids = assetIdsOf(deck);
  const data: Record<ID, string> = {};
  let n = 0;
  for (const id of ids) {
    progress(n++, ids.size + 1, 'Packing media');
    const blob = await getAssetBlob(id);
    if (blob) data[id] = await blobToDataUrl(blob);
  }
  progress(ids.size, ids.size + 1, 'Building player');
  const js = await playerSource();
  const payload = escScript(JSON.stringify({ deck, assets: data }));
  const safeJs = js.split('</script').join('<\\/script');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${deck.title.replace(/[<&]/g, '')}</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas{position:fixed;inset:0;width:100%;height:100%;display:block}#hint{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);color:#fff;font:13px system-ui;background:rgba(0,0,0,.6);padding:7px 14px;border-radius:99px;transition:opacity .6s;pointer-events:none}#bar{position:fixed;left:0;bottom:0;height:3px;background:#ff6083;transition:width .3s}</style></head>
<body><canvas id="c"></canvas><div id="bar"></div><div id="hint">Click or press → to advance · F for fullscreen · B for black</div>
<script id="frames-data" type="application/json">${payload}</script>
<script>${safeJs}</script></body></html>`;
  progress(ids.size + 1, ids.size + 1);
  return { blob: new Blob([html], { type: 'text/html' }), name: `${safe(deck.title)}.html` };
}

export async function exportProject(deck: Deck): Promise<ExportResult> {
  const blobs = await getAssetBlobs(Object.keys(deck.assets));
  return { blob: await packProject(deck, blobs), name: `${safe(deck.title)}${PROJECT_EXT}` };
}

export async function exportDeckProject(id: ID) {
  const deck = await loadDeck(id);
  if (!deck) return;
  const r = await exportProject(deck);
  downloadBlob(r.blob, r.name);
}

export async function runExport(deck: Deck, slides: Slide[], o: ExportOptions, progress: Progress, signal?: AbortSignal): Promise<ExportResult> {
  switch (o.format) {
    case 'png':
    case 'jpg':
      return exportImages(deck, slides, o, progress, signal);
    case 'pdf':
      return exportPdf(deck, slides, o, progress, signal);
    case 'video':
      return exportVideo(deck, o, progress, signal);
    case 'html':
      return exportHtml(deck, progress);
    case 'frames':
      return exportProject(deck);
  }
}

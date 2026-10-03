/** Offscreen canvas helpers shared by the renderer, transitions and exporters. */

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function createCanvas(w: number, h: number): AnyCanvas {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: AnyCanvas, opts?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  return c.getContext('2d', opts) as CanvasRenderingContext2D;
}

/** A small pool of scratch canvases, so per-frame effects don't allocate. */
const pool: AnyCanvas[] = [];
export function acquire(w: number, h: number): { canvas: AnyCanvas; ctx: CanvasRenderingContext2D } {
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));
  let i = pool.findIndex((c) => c.width >= w && c.height >= h && c.width <= w * 2 && c.height <= h * 2);
  let canvas: AnyCanvas;
  if (i >= 0) canvas = pool.splice(i, 1)[0]!;
  else canvas = createCanvas(w, h);
  const ctx = ctx2d(canvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if ('filter' in ctx) ctx.filter = 'none';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}
export function release(c: AnyCanvas) {
  if (pool.length < 8) pool.push(c);
}
/** Drop pooled canvases (Bohrified suspend). */
export function clearPool() {
  pool.length = 0;
}

export function canvasToBlob(c: AnyCanvas, type = 'image/png', quality?: number): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality));
}

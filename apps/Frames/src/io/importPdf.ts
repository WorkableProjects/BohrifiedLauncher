import { newImage, newSlide, solid } from '../model/defaults';
import { uid } from '../model/ids';
import type { AssetMeta, Slide } from '../model/types';
import type { ImportedAsset, ImportResult } from './importPptx';

/** PDF import: every page is rendered to a JPEG and placed full-bleed on its own slide. */

const MAX_RENDER_WIDTH = 2400;
const MAX_NOTES = 4000;
const DEFAULT_MAX_PAGES = 500;

export interface PageFit {
  /** Where the page image sits on the slide. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when the page doesn't match the target aspect and is letterboxed. */
  letterboxed: boolean;
  /** The slide size that would match the page exactly, at the target width. */
  size: { w: number; h: number };
}

/** Fit a page of `pageW × pageH` inside `target`, centred, preserving aspect. */
export function fitPage(pageW: number, pageH: number, target: { w: number; h: number }): PageFit {
  const aspect = pageW > 0 && pageH > 0 ? pageW / pageH : target.w / target.h;
  let w = target.w;
  let h = w / aspect;
  if (h > target.h) {
    h = target.h;
    w = h * aspect;
  }
  const letterboxed = Math.abs(w - target.w) > 0.5 || Math.abs(h - target.h) > 0.5;
  return { x: (target.w - w) / 2, y: (target.h - h) / 2, w, h, letterboxed, size: { w: target.w, h: Math.round(target.w / aspect) } };
}

/** Pixel width to render a page at: the placed width, capped. */
export const renderWidth = (placedW: number): number => Math.max(1, Math.min(MAX_RENDER_WIDTH, Math.round(placedW)));

/** Flatten pdf.js text items into plain, trimmed, length-limited text. */
export function pageText(items: readonly unknown[]): string {
  let out = '';
  for (const it of items) {
    if (typeof it !== 'object' || it === null || !('str' in it)) continue;
    const t = it as { str: string; hasEOL?: boolean };
    out += t.str + (t.hasEOL ? '\n' : '');
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_NOTES);
}

// ── DOM-dependent part ───────────────────────────────────────────────────────

interface Surface {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  toJpeg(): Promise<Blob>;
}

function createSurface(w: number, h: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (ctx) return { canvas, ctx, toJpeg: () => canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Couldn't create a canvas to render the PDF.");
  return {
    canvas,
    ctx,
    toJpeg: () => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't encode a PDF page."))), 'image/jpeg', 0.9)),
  };
}

const aborted = () => new DOMException('Import cancelled', 'AbortError');

export async function importPdf(
  data: ArrayBuffer | Blob,
  targetSize: { w: number; h: number },
  opts: { onProgress?: (done: number, total: number) => void; maxPages?: number; signal?: AbortSignal } = {},
): Promise<ImportResult> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const task = pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (e) {
    if (e instanceof Error && e.name === 'PasswordException') throw new Error('This PDF is password protected.');
    throw new Error("This isn't a PDF Frames can open.");
  }

  const warnings: string[] = [];
  const slides: Slide[] = [];
  const assets: ImportedAsset[] = [];
  let size: ImportResult['size'];
  try {
    const limit = opts.maxPages ?? DEFAULT_MAX_PAGES;
    const total = Math.min(doc.numPages, limit);
    if (doc.numPages > total) warnings.push(`Only the first ${total} of ${doc.numPages} pages were imported`);

    for (let n = 1; n <= total; n++) {
      if (opts.signal?.aborted) throw aborted();
      try {
        const page = await doc.getPage(n);
        try {
          const base = page.getViewport({ scale: 1 });
          const fit = fitPage(base.width, base.height, targetSize);
          size ??= fit.size;
          const px = renderWidth(fit.w);
          const viewport = page.getViewport({ scale: px / base.width });
          const surface = createSurface(Math.round(viewport.width), Math.round(viewport.height));
          await page.render({
            canvas: surface.canvas as HTMLCanvasElement,
            canvasContext: surface.ctx as CanvasRenderingContext2D,
            viewport,
            background: '#ffffff',
          }).promise;
          const blob = await surface.toJpeg();

          const meta: AssetMeta = {
            id: uid('as'), name: `Page ${n}.jpg`, kind: 'image', mime: 'image/jpeg', bytes: blob.size, w: Math.round(viewport.width), h: Math.round(viewport.height),
          };
          assets.push({ meta, blob });
          const notes = pageText((await page.getTextContent()).items);
          slides.push(newSlide({
            background: solid('#ffffff'),
            elements: [newImage(meta.id, fit.x, fit.y, fit.w, fit.h, { name: `Page ${n}` })],
            notes,
          }));
        } finally {
          page.cleanup();
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        warnings.push(`Page ${n}: couldn't be rendered and was skipped`);
      }
      opts.onProgress?.(n, total);
    }
  } finally {
    await doc.destroy();
  }
  return { slides, assets, size, warnings };
}

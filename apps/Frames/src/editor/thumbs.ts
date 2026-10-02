import type { Deck, Slide } from '../model/types';
import { assetIdsOf } from '../model/ops';
import { createCanvas, canvasToBlob, ctx2d, type AnyCanvas } from '../render/canvas';
import { paintSlide, type RenderEnv } from '../render/paint';
import { assets } from '../state/session';
import { finalState } from '../transitions/runner';

/**
 * Slide thumbnails. A thumbnail is cached per slide *object*: edits make a
 * new slide object, untouched slides keep theirs, so only changed slides
 * re-render. Painting runs one at a time in idle time, and only for
 * thumbnails that are on screen.
 */

let nextId = 1;
const ids = new WeakMap<object, number>();
const idOf = (o: object) => {
  let n = ids.get(o);
  if (!n) ids.set(o, (n = nextId++));
  return n;
};

const depsKey = (d: Deck, w: number) => `${idOf(d.theme)}:${idOf(d.master)}:${idOf(d.layouts)}:${d.size.w}x${d.size.h}:${w}`;

interface Entry { key: string; canvas: AnyCanvas; complete: boolean }
const cache = new WeakMap<Slide, Entry>();

export function renderThumb(deck: Deck, slide: Slide, width: number, dpr = Math.min(2, window.devicePixelRatio || 1)): Entry {
  const key = depsKey(deck, width);
  const hit = cache.get(slide);
  if (hit && hit.key === key && hit.complete) return hit;
  const k = (width * dpr) / deck.size.w;
  const c = createCanvas(width * dpr, Math.round(deck.size.h * k));
  const ctx = ctx2d(c);
  ctx.scale(k, k);
  const env: RenderEnv = { deck, assets, mode: 'thumb', px: k };
  paintSlide(ctx, env, slide, slide.anims.length ? finalState(slide) : null);
  const used = new Set<string>();
  const walk = (els: Slide['elements']) => els.forEach((e) => {
    if ((e.type === 'image') && e.asset) used.add(e.asset);
    if (e.type === 'group') walk(e.children);
  });
  walk(slide.elements);
  const entry = { key, canvas: c, complete: assets.settled(used) };
  cache.set(slide, entry);
  return entry;
}

type Job = () => void;
const queue: Job[] = [];
let running = false;
export function enqueue(job: Job) {
  queue.push(job);
  if (running) return;
  running = true;
  const pump = () => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 8) queue.shift()!();
    if (queue.length) (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 16)))(pump);
    else running = false;
  };
  (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 0)))(pump);
}

/** A small JPEG of the first slide, for the Home gallery. */
export async function deckThumb(deck: Deck): Promise<string | undefined> {
  const s = deck.slides[0];
  if (!s) return undefined;
  await assets.ready(assetIdsOf({ ...deck, slides: [s] }), 1500);
  const e = renderThumb(deck, s, 360, 1);
  const c = createCanvas(e.canvas.width, e.canvas.height);
  const ctx = ctx2d(c);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(e.canvas as CanvasImageSource, 0, 0);
  const blob = await canvasToBlob(c, 'image/jpeg', 0.7);
  return await new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(blob);
  });
}

import type { Direction } from '../model/types';
import { clamp } from '../model/geometry';
import { acquire, release, type AnyCanvas } from '../render/canvas';
import type { TG } from './types';

export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t: number) => t * t * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const expoIn = (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic hash → 0…1. */
export function rnd(i: number, seed = 0): number {
  let x = (i * 374761393 + seed * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 100000) / 100000;
}

export const VEC: Record<Direction, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

export const numParam = (g: TG, id: string, def: number): number => {
  const v = g.params[id];
  return typeof v === 'number' ? v : def;
};
export const strParam = (g: TG, id: string, def: string): string => {
  const v = g.params[id];
  return typeof v === 'string' && v !== '' ? v : def;
};
export const boolParam = (g: TG, id: string, def: boolean): boolean => {
  const v = g.params[id];
  return typeof v === 'boolean' ? v : def;
};

export interface Place {
  x?: number;
  y?: number;
  scale?: number;
  sx?: number;
  sy?: number;
  alpha?: number;
  blur?: number;
  /** Scale pivot in px (default: centre). */
  cx?: number;
  cy?: number;
  rot?: number;
  brightness?: number;
}

/** Draw a full-frame layer with a transform about a pivot. */
export function place(g: TG, c: AnyCanvas, o: Place = {}) {
  const { ctx, w, h } = g;
  const cx = o.cx ?? w / 2, cy = o.cy ?? h / 2;
  const a = o.alpha ?? 1;
  if (a <= 0.002) return;
  ctx.save();
  ctx.globalAlpha *= a;
  const filters: string[] = [];
  if (o.blur && o.blur > 0.3) filters.push(`blur(${o.blur}px)`);
  if (o.brightness !== undefined && o.brightness !== 1) filters.push(`brightness(${o.brightness})`);
  if (filters.length) ctx.filter = filters.join(' ');
  ctx.translate(cx + (o.x ?? 0), cy + (o.y ?? 0));
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale((o.sx ?? o.scale ?? 1), (o.sy ?? o.scale ?? 1));
  ctx.translate(-cx, -cy);
  ctx.drawImage(c as CanvasImageSource, 0, 0, w, h);
  ctx.restore();
}

/** A soft rectangular shadow on one side of a moving layer (cover / uncover). */
export function edgeShadow(g: TG, x: number, y: number, w: number, h: number, side: Direction, strength = 0.35) {
  const { ctx } = g;
  const span = Math.max(g.w, g.h) * 0.06;
  let grad: CanvasGradient;
  if (side === 'left') grad = ctx.createLinearGradient(x, 0, x - span, 0);
  else if (side === 'right') grad = ctx.createLinearGradient(x + w, 0, x + w + span, 0);
  else if (side === 'up') grad = ctx.createLinearGradient(0, y, 0, y - span);
  else grad = ctx.createLinearGradient(0, y + h, 0, y + h + span);
  grad.addColorStop(0, `rgba(0,0,0,${strength})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  if (side === 'left') ctx.fillRect(x - span, y, span, h);
  else if (side === 'right') ctx.fillRect(x + w, y, span, h);
  else if (side === 'up') ctx.fillRect(x, y - span, w, span);
  else ctx.fillRect(x, y + h, w, span);
}

/**
 * Draw `c` masked by a gradient along `angle` (degrees, 0 = to the right): everything
 * behind the moving edge shows, ahead of it doesn't.
 */
export function wipeAlong(g: TG, c: AnyCanvas, progress: number, angleDeg: number, feather = 0.06) {
  const { ctx, w, h } = g;
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2, cy = h / 2;
  const edge = lerp(-feather, 1 + feather, progress);
  const x0 = cx - (dx * len) / 2, y0 = cy - (dy * len) / 2, x1 = cx + (dx * len) / 2, y1 = cy + (dy * len) / 2;
  const tmp = acquire(w, h);
  tmp.ctx.drawImage(c as CanvasImageSource, 0, 0, w, h);
  tmp.ctx.globalCompositeOperation = 'destination-in';
  const grad = tmp.ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(clamp(edge - feather, 0, 1), 'rgba(0,0,0,1)');
  grad.addColorStop(clamp(edge + feather, 0, 1), 'rgba(0,0,0,0)');
  tmp.ctx.fillStyle = grad;
  tmp.ctx.fillRect(0, 0, w, h);
  ctx.drawImage(tmp.canvas as CanvasImageSource, 0, 0, w, h, 0, 0, w, h);
  release(tmp.canvas);
}

export const dirAngle = (d: Direction) => (d === 'right' ? 0 : d === 'down' ? 90 : d === 'left' ? 180 : 270);

export function text(g: TG, s: string, x: number, y: number, size: number, color: string, opts: { weight?: number; align?: CanvasTextAlign; italic?: boolean; family?: string; spacing?: number; baseline?: CanvasTextBaseline } = {}) {
  const { ctx } = g;
  ctx.save();
  ctx.font = `${opts.italic ? 'italic ' : ''}${opts.weight ?? 800} ${size}px ${opts.family ?? "Impact, 'Arial Narrow Bold', Inter, system-ui, sans-serif"}`;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = opts.baseline ?? 'alphabetic';
  if (opts.spacing && 'letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${opts.spacing}px`;
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** A parallelogram band, skewed by `skew` px, spanning x0…x1 across the full height. */
export function band(g: TG, x0: number, x1: number, skew: number, color: string, y0 = 0, y1 = g.h) {
  const { ctx } = g;
  ctx.beginPath();
  ctx.moveTo(x0 + skew, y0);
  ctx.lineTo(x1 + skew, y0);
  ctx.lineTo(x1 - skew, y1);
  ctx.lineTo(x0 - skew, y1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Zoom blur: draw the layer several times at growing scale with falling alpha, converging on (fx, fy). */
export function zoomBlur(g: TG, c: AnyCanvas, scale: number, strength: number, fx: number, fy: number, alpha = 1) {
  const n = Math.max(2, Math.round(10 * Math.min(1, strength)));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    place(g, c, { scale: scale * (1 + strength * 0.22 * t), cx: fx, cy: fy, alpha: (alpha * (1 - t * 0.85)) / Math.sqrt(n) * 1.9 });
  }
}

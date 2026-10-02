import type { El } from './types';

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rad = (deg: number) => (deg * Math.PI) / 180;
export const round = (v: number, step = 1) => Math.round(v / step) * step;

export function rotatePoint(p: Pt, c: Pt, deg: number): Pt {
  const r = rad(deg), cos = Math.cos(r), sin = Math.sin(r);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** The four corners of a rotated element, clockwise from top-left. */
export function corners(e: Pick<El, 'x' | 'y' | 'w' | 'h' | 'rot'>): Pt[] {
  const c = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
  const pts = [{ x: e.x, y: e.y }, { x: e.x + e.w, y: e.y }, { x: e.x + e.w, y: e.y + e.h }, { x: e.x, y: e.y + e.h }];
  return e.rot ? pts.map((p) => rotatePoint(p, c, e.rot)) : pts;
}

/** Axis-aligned bounds of a (possibly rotated) element. */
export function bounds(e: Pick<El, 'x' | 'y' | 'w' | 'h' | 'rot'>): Rect {
  if (!e.rot) return { x: e.x, y: e.y, w: e.w, h: e.h };
  return boundsOf(corners(e));
}

export function boundsOf(pts: Pt[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionRects(rs: Rect[]): Rect | null {
  if (!rs.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rs) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const rectsIntersect = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const rectContains = (r: Rect, p: Pt) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Is the slide-space point inside the (rotated) element's box? */
export function hitBox(e: Pick<El, 'x' | 'y' | 'w' | 'h' | 'rot'>, p: Pt, pad = 0): boolean {
  const c = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
  const q = e.rot ? rotatePoint(p, c, -e.rot) : p;
  return q.x >= e.x - pad && q.x <= e.x + e.w + pad && q.y >= e.y - pad && q.y <= e.y + e.h + pad;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

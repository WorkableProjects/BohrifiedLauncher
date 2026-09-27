import type { BoardElement, Camera, Rect, ShapeElement, Vec } from './types';

export const uid = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ─── Camera ───────────────────────────────────────────────────────────

export const screenToWorld = (cam: Camera, sx: number, sy: number): Vec => ({
  x: sx / cam.z + cam.x,
  y: sy / cam.z + cam.y,
});

export const worldToScreen = (cam: Camera, wx: number, wy: number): Vec => ({
  x: (wx - cam.x) * cam.z,
  y: (wy - cam.y) * cam.z,
});

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

/** Zoom around a fixed screen point so the content under it stays put. */
export function zoomAt(cam: Camera, sx: number, sy: number, nextZ: number): Camera {
  const z = clamp(nextZ, MIN_ZOOM, MAX_ZOOM);
  const w = screenToWorld(cam, sx, sy);
  return { x: w.x - sx / z, y: w.y - sy / z, z };
}

export function viewportRect(cam: Camera, width: number, height: number): Rect {
  return { x: cam.x, y: cam.y, w: width / cam.z, h: height / cam.z };
}

/** Camera that frames `r` inside a viewport, with padding in screen px. */
export function fitRect(r: Rect, width: number, height: number, pad = 96, maxZ = 2): Camera {
  const z = clamp(Math.min((width - pad * 2) / Math.max(r.w, 1), (height - pad * 2) / Math.max(r.h, 1)), MIN_ZOOM, maxZ);
  return { x: r.x + r.w / 2 - width / 2 / z, y: r.y + r.h / 2 - height / 2 / z, z };
}

// ─── Rects ────────────────────────────────────────────────────────────

export const rectsIntersect = (a: Rect, b: Rect) =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

export const rectContains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export const pointInRect = (p: Vec, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export const inflate = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 });

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectFromPoints(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

// ─── Element bounds (cached by identity) ──────────────────────────────

const boundsCache = new WeakMap<BoardElement, Rect>();

export const LINE_HEIGHT = 1.3;

type TextMeasurer = (line: string, fontSize: number) => number;

/** Approximate width without a DOM; the renderer swaps in canvas metrics. */
let measureLine: TextMeasurer = (line, fontSize) => line.length * fontSize * 0.56;

export function setTextMeasurer(fn: TextMeasurer) {
  measureLine = fn;
}

export function measureText(text: string, fontSize: number) {
  const lines = text.split('\n');
  const w = lines.reduce((m, l) => Math.max(m, measureLine(l, fontSize)), fontSize * 0.5);
  return { w, h: lines.length * fontSize * LINE_HEIGHT };
}

export function elementBounds(el: BoardElement): Rect {
  const cached = boundsCache.get(el);
  if (cached) return cached;
  let r: Rect;
  switch (el.type) {
    case 'stroke': {
      const p = el.points;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      r = inflate({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, el.size);
      break;
    }
    case 'shape': {
      if (el.kind === 'polygon' && el.pts) {
        const xs = el.pts.filter((_, i) => i % 2 === 0);
        const ys = el.pts.filter((_, i) => i % 2 === 1);
        r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      } else {
        r = rectFromPoints(el.x1, el.y1, el.x2, el.y2);
      }
      r = inflate(r, el.size / 2 + (el.kind === 'arrow' ? el.size * 3 : 0));
      break;
    }
    case 'text': {
      if (el.note) r = { x: el.x, y: el.y, w: el.note.w, h: el.note.h };
      else {
        const m = measureText(el.text || ' ', el.fontSize);
        r = { x: el.x, y: el.y, w: m.w, h: m.h };
      }
      break;
    }
    case 'image':
      r = { x: el.x, y: el.y, w: el.w, h: el.h };
      break;
  }
  boundsCache.set(el, r);
  return r;
}

// ─── Hit testing ──────────────────────────────────────────────────────

/** Squared distance from p to segment ab. */
export function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = clamp(t, 0, 1);
  const cx = ax + t * dx - px, cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/** Minimum squared distance between segments ab and cd. */
export function segmentsDistSq(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    distToSegmentSq(ax, ay, cx, cy, dx, dy),
    distToSegmentSq(bx, by, cx, cy, dx, dy),
    distToSegmentSq(cx, cy, ax, ay, bx, by),
    distToSegmentSq(dx, dy, ax, ay, bx, by),
  );
}

function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Outline segments of a shape, flat [ax, ay, bx, by, ...]. */
export function shapeSegments(el: ShapeElement): number[] {
  const { x1, y1, x2, y2 } = el;
  switch (el.kind) {
    case 'line':
    case 'arrow':
      return [x1, y1, x2, y2];
    case 'rect':
      return [x1, y1, x2, y1, x2, y1, x2, y2, x2, y2, x1, y2, x1, y2, x1, y1];
    case 'triangle': {
      const mx = (x1 + x2) / 2;
      const top = Math.min(y1, y2), bot = Math.max(y1, y2);
      return [mx, top, x2, bot, x2, bot, x1, bot, x1, bot, mx, top];
    }
    case 'polygon': {
      const p = el.pts ?? [];
      const out: number[] = [];
      for (let i = 0; i < p.length; i += 2) {
        const j = (i + 2) % p.length;
        out.push(p[i], p[i + 1], p[j], p[j + 1]);
      }
      return out;
    }
    case 'ellipse': {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
      const out: number[] = [];
      const N = 48;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
        out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, cx + Math.cos(b) * rx, cy + Math.sin(b) * ry);
      }
      return out;
    }
  }
}

function pointInPolygon(px: number, py: number, segs: number[]) {
  let inside = false;
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Does a point (with tolerance r) hit this element? */
export function hitTestPoint(el: BoardElement, p: Vec, r: number): boolean {
  const b = elementBounds(el);
  if (!pointInRect(p, inflate(b, r))) return false;
  switch (el.type) {
    case 'stroke': {
      const pts = el.points;
      const tol = (r + el.size / 2) ** 2;
      if (pts.length === 3) return (pts[0] - p.x) ** 2 + (pts[1] - p.y) ** 2 <= tol;
      for (let i = 3; i < pts.length; i += 3) {
        if (distToSegmentSq(p.x, p.y, pts[i - 3], pts[i - 2], pts[i], pts[i + 1]) <= tol) return true;
      }
      return false;
    }
    case 'shape': {
      const segs = shapeSegments(el);
      const tol = (r + el.size / 2) ** 2;
      for (let i = 0; i < segs.length; i += 4) {
        if (distToSegmentSq(p.x, p.y, segs[i], segs[i + 1], segs[i + 2], segs[i + 3]) <= tol) return true;
      }
      return el.fill && el.kind !== 'line' && el.kind !== 'arrow' && pointInPolygon(p.x, p.y, segs);
    }
    case 'text':
    case 'image':
      return true;
  }
}

/** Does the swept eraser segment a→b (radius r) touch this element? */
export function hitTestSegment(el: BoardElement, ax: number, ay: number, bx: number, by: number, r: number): boolean {
  const sweep = inflate(rectFromPoints(ax, ay, bx, by), r);
  if (!rectsIntersect(sweep, elementBounds(el))) return false;
  switch (el.type) {
    case 'stroke': {
      const pts = el.points;
      const tol = (r + el.size / 2) ** 2;
      if (pts.length === 3) return distToSegmentSq(pts[0], pts[1], ax, ay, bx, by) <= tol;
      for (let i = 3; i < pts.length; i += 3) {
        if (segmentsDistSq(ax, ay, bx, by, pts[i - 3], pts[i - 2], pts[i], pts[i + 1]) <= tol) return true;
      }
      return false;
    }
    case 'shape': {
      const segs = shapeSegments(el);
      const tol = (r + el.size / 2) ** 2;
      for (let i = 0; i < segs.length; i += 4) {
        if (segmentsDistSq(ax, ay, bx, by, segs[i], segs[i + 1], segs[i + 2], segs[i + 3]) <= tol) return true;
      }
      return false;
    }
    case 'text':
    case 'image':
      return hitTestPoint(el, { x: bx, y: by }, r);
  }
}

// ─── Transforms (return new elements) ─────────────────────────────────

export function translateElement<T extends BoardElement>(el: T, dx: number, dy: number): T {
  switch (el.type) {
    case 'stroke': {
      const p = el.points.slice();
      for (let i = 0; i < p.length; i += 3) { p[i] += dx; p[i + 1] += dy; }
      return { ...el, points: p };
    }
    case 'shape':
      return {
        ...el,
        x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy,
        pts: el.pts?.map((v, i) => v + (i % 2 ? dy : dx)),
      };
    case 'text':
    case 'image':
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
  return el;
}

/** Scale about origin (ox, oy) by factor s (uniform, keeps line weights). */
export function scaleElement<T extends BoardElement>(el: T, ox: number, oy: number, s: number): T {
  const sx = (x: number) => ox + (x - ox) * s;
  const sy = (y: number) => oy + (y - oy) * s;
  switch (el.type) {
    case 'stroke': {
      const p = el.points.slice();
      for (let i = 0; i < p.length; i += 3) { p[i] = sx(p[i]); p[i + 1] = sy(p[i + 1]); }
      return { ...el, points: p };
    }
    case 'shape':
      return {
        ...el,
        x1: sx(el.x1), y1: sy(el.y1), x2: sx(el.x2), y2: sy(el.y2),
        pts: el.pts?.map((v, i) => (i % 2 ? sy(v) : sx(v))),
      };
    case 'text':
      return {
        ...el,
        x: sx(el.x), y: sy(el.y),
        fontSize: Math.max(4, el.fontSize * s),
        note: el.note && { ...el.note, w: el.note.w * s, h: el.note.h * s },
      };
    case 'image':
      return { ...el, x: sx(el.x), y: sy(el.y), w: el.w * s, h: el.h * s };
  }
  return el;
}

import type { ShapeKind } from '../model/types';

type Pt = readonly [number, number];

// ── Path builders ────────────────────────────────────────────────────────────

function poly(pts: readonly Pt[]): Path2D {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

/** Stretch a point set so its bounding box exactly fills (0,0,w,h). */
function fit(pts: readonly Pt[], w: number, h: number): Pt[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const sx = x1 > x0 ? w / (x1 - x0) : 0, sy = y1 > y0 ? h / (y1 - y0) : 0;
  return pts.map(([x, y]) => [(x - x0) * sx, (y - y0) * sy] as const);
}

/** Alternating outer/inner radius polygon, first vertex at 12 o'clock. */
function starPts(n: number, inner: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : 1;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function regularPts(n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [Math.cos(a), Math.sin(a)] as const;
  });
}

function roundRect(p: Path2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  p.lineTo(x + w, y + h - r);
  p.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  p.lineTo(x + r, y + h);
  p.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  p.lineTo(x, y + r);
  p.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  p.closePath();
}

/** Block arrow pointing right in a (length × thickness) frame; mapped to the box by direction. */
function arrowPts(w: number, h: number, dir: 'right' | 'left' | 'up' | 'down'): Pt[] {
  const vertical = dir === 'up' || dir === 'down';
  const len = vertical ? h : w, th = vertical ? w : h;
  const head = Math.min(len * 0.5, th * 0.55);
  const shaft = th * 0.5, o = (th - shaft) / 2;
  const base: Pt[] = [
    [0, o], [len - head, o], [len - head, 0], [len, th / 2], [len - head, th], [len - head, th - o], [0, th - o],
  ];
  return base.map(([a, b]): Pt => {
    switch (dir) {
      case 'right': return [a, b];
      case 'left': return [w - a, b];
      case 'up': return [b, h - a];
      default: return [b, a];
    }
  });
}

function plusPts(t = 1 / 3): Pt[] {
  const a = t, b = 1 - t;
  return [[a, 0], [b, 0], [b, a], [1, a], [1, b], [b, b], [b, 1], [a, 1], [a, b], [0, b], [0, a], [a, a]];
}

function heartPath(w: number, h: number): Path2D {
  const p = new Path2D();
  const X = (v: number) => v * w, Y = (v: number) => v * h;
  p.moveTo(X(0.5), Y(1));
  p.bezierCurveTo(X(0.14), Y(0.74), X(0), Y(0.52), X(0), Y(0.3));
  p.bezierCurveTo(X(0), Y(0.12), X(0.13), Y(0), X(0.28), Y(0));
  p.bezierCurveTo(X(0.4), Y(0), X(0.47), Y(0.07), X(0.5), Y(0.19));
  p.bezierCurveTo(X(0.53), Y(0.07), X(0.6), Y(0), X(0.72), Y(0));
  p.bezierCurveTo(X(0.87), Y(0), X(1), Y(0.12), X(1), Y(0.3));
  p.bezierCurveTo(X(1), Y(0.52), X(0.86), Y(0.74), X(0.5), Y(1));
  p.closePath();
  return p;
}

/** Material-style cloud (bbox 0…24 × 4…20), stretched to the box. */
const CLOUD_D = 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z';

function cloudPath(w: number, h: number): Path2D {
  const p = new Path2D();
  if (typeof DOMMatrix === 'undefined') {
    roundRect(p, 0, 0, w, h, Math.min(w, h) / 3);
    return p;
  }
  p.addPath(new Path2D(CLOUD_D), new DOMMatrix([w / 24, 0, 0, h / 16, 0, (-4 * h) / 16]));
  return p;
}

function speechPath(w: number, h: number, adj: number): Path2D {
  const bh = h * 0.8;
  const r = Math.max(0, Math.min(adj, w / 2, bh / 2));
  const p = new Path2D();
  p.moveTo(r, 0);
  p.lineTo(w - r, 0);
  p.arc(w - r, r, r, -Math.PI / 2, 0);
  p.lineTo(w, bh - r);
  p.arc(w - r, bh - r, r, 0, Math.PI / 2);
  p.lineTo(w * 0.42, bh);
  p.lineTo(w * 0.12, h);
  p.lineTo(w * 0.17, bh);
  p.lineTo(r, bh);
  p.arc(r, bh - r, r, Math.PI / 2, Math.PI);
  p.lineTo(0, r);
  p.arc(r, r, r, Math.PI, Math.PI * 1.5);
  p.closePath();
  return p;
}

function ringPath(w: number, h: number, adj: number): Path2D {
  const p = new Path2D();
  const rx = w / 2, ry = h / 2;
  const t = (Math.min(w, h) / 2) * (adj / 100);
  p.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
  p.moveTo(rx + Math.max(rx - t, 0), ry);
  // Opposite winding so both nonzero and evenodd punch the hole.
  p.ellipse(rx, ry, Math.max(rx - t, 0), Math.max(ry - t, 0), 0, 0, Math.PI * 2, true);
  p.closePath();
  return p;
}

function customPath(w: number, h: number, d?: string, vb?: [number, number]): Path2D {
  const p = new Path2D();
  const [vw, vh] = vb && vb[0] > 0 && vb[1] > 0 ? vb : [100, 100];
  if (!d || typeof DOMMatrix === 'undefined') {
    p.rect(0, 0, w, h);
    return p;
  }
  try {
    p.addPath(new Path2D(d), new DOMMatrix([w / vw, 0, 0, h / vh, 0, 0]));
  } catch {
    p.rect(0, 0, w, h);
  }
  return p;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function build(kind: ShapeKind, w: number, h: number, adj?: number, d?: string, vb?: [number, number]): Path2D {
  const m = Math.min(w, h);
  switch (kind) {
    case 'rect': {
      const p = new Path2D();
      p.rect(0, 0, w, h);
      return p;
    }
    case 'round-rect': {
      const p = new Path2D();
      roundRect(p, 0, 0, w, h, adj ?? 24);
      return p;
    }
    case 'pill': {
      const p = new Path2D();
      roundRect(p, 0, 0, w, h, m / 2);
      return p;
    }
    case 'ellipse': {
      const p = new Path2D();
      p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      p.closePath();
      return p;
    }
    case 'triangle': return poly([[w / 2, 0], [w, h], [0, h]]);
    case 'right-triangle': return poly([[0, 0], [0, h], [w, h]]);
    case 'diamond': return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'pentagon': return poly(fit(regularPts(5), w, h));
    case 'hexagon': {
      const i = w * 0.25;
      return poly([[i, 0], [w - i, 0], [w, h / 2], [w - i, h], [i, h], [0, h / 2]]);
    }
    case 'octagon': {
      const i = m * 0.29;
      return poly([[i, 0], [w - i, 0], [w, i], [w, h - i], [w - i, h], [i, h], [0, h - i], [0, i]]);
    }
    case 'star': return poly(fit(starPts(Math.round(clamp(adj ?? 5, 3, 24)), 0.42), w, h));
    case 'burst': return poly(fit(starPts(Math.round(clamp(adj ?? 12, 5, 40)), 0.64), w, h));
    case 'arrow-right': return poly(arrowPts(w, h, 'right'));
    case 'arrow-left': return poly(arrowPts(w, h, 'left'));
    case 'arrow-up': return poly(arrowPts(w, h, 'up'));
    case 'arrow-down': return poly(arrowPts(w, h, 'down'));
    case 'chevron': {
      const n = Math.min(h * 0.5, w * 0.4);
      return poly([[0, 0], [w - n, 0], [w, h / 2], [w - n, h], [0, h], [n, h / 2]]);
    }
    case 'parallelogram': {
      const s = Math.min(w * 0.25, h * 0.6);
      return poly([[s, 0], [w, 0], [w - s, h], [0, h]]);
    }
    case 'trapezoid': {
      const s = Math.min(w * 0.2, h * 0.6);
      return poly([[s, 0], [w - s, 0], [w, h], [0, h]]);
    }
    case 'plus': return poly(plusPts().map(([x, y]) => [x * w, y * h] as const));
    case 'cross': {
      // A plus rotated 45°, stretched back to the box.
      const c = Math.SQRT1_2;
      const rotated = plusPts(0.22).map(([x, y]) => [(x - 0.5) * c - (y - 0.5) * c, (x - 0.5) * c + (y - 0.5) * c] as const);
      return poly(fit(rotated, w, h));
    }
    case 'heart': return heartPath(w, h);
    case 'cloud': return cloudPath(w, h);
    case 'speech': return speechPath(w, h, adj ?? 24);
    case 'ring': return ringPath(w, h, adj ?? 30);
    case 'half-circle': {
      const p = new Path2D();
      p.ellipse(w / 2, h, w / 2, h, 0, Math.PI, Math.PI * 2);
      p.closePath();
      return p;
    }
    case 'path': return customPath(w, h, d, vb);
  }
}

// ── LRU cache ────────────────────────────────────────────────────────────────

const CACHE_MAX = 300;
const cache = new Map<string, Path2D>();

export function shapePath(kind: ShapeKind, w: number, h: number, adj?: number, d?: string, vb?: [number, number]): Path2D {
  w = Number.isFinite(w) ? Math.max(0, w) : 0;
  h = Number.isFinite(h) ? Math.max(0, h) : 0;
  const key = kind === 'path' ? `path|${w}|${h}|${d ?? ''}|${vb?.join(',') ?? ''}` : `${kind}|${w}|${h}|${adj ?? ''}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const p = build(kind, w, h, adj, d, vb);
  cache.set(key, p);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return p;
}

export function shapeFillRule(kind: ShapeKind): CanvasFillRule {
  return kind === 'ring' ? 'evenodd' : 'nonzero';
}

// ── Metadata ─────────────────────────────────────────────────────────────────

interface Adj { label: string; min: number; max: number; step: number; def: number }
export interface ShapeInfo { label: string; adj?: Adj; textInset?: number }

const corner: Adj = { label: 'Corner radius', min: 0, max: 200, step: 1, def: 24 };

export const SHAPE_INFO: Record<ShapeKind, ShapeInfo> = {
  rect: { label: 'Rectangle' },
  'round-rect': { label: 'Rounded rectangle', adj: corner, textInset: 0.04 },
  ellipse: { label: 'Ellipse', textInset: 0.146 },
  triangle: { label: 'Triangle', textInset: 0.3 },
  'right-triangle': { label: 'Right triangle', textInset: 0.22 },
  diamond: { label: 'Diamond', textInset: 0.25 },
  pentagon: { label: 'Pentagon', textInset: 0.12 },
  hexagon: { label: 'Hexagon', textInset: 0.1 },
  octagon: { label: 'Octagon', textInset: 0.1 },
  star: { label: 'Star', adj: { label: 'Points', min: 3, max: 24, step: 1, def: 5 }, textInset: 0.26 },
  burst: { label: 'Burst', adj: { label: 'Points', min: 5, max: 40, step: 1, def: 12 }, textInset: 0.2 },
  'arrow-right': { label: 'Arrow right', textInset: 0.1 },
  'arrow-left': { label: 'Arrow left', textInset: 0.1 },
  'arrow-up': { label: 'Arrow up', textInset: 0.1 },
  'arrow-down': { label: 'Arrow down', textInset: 0.1 },
  chevron: { label: 'Chevron', textInset: 0.12 },
  parallelogram: { label: 'Parallelogram', textInset: 0.1 },
  trapezoid: { label: 'Trapezoid', textInset: 0.1 },
  plus: { label: 'Plus', textInset: 0.3 },
  cross: { label: 'Cross', textInset: 0.3 },
  heart: { label: 'Heart', textInset: 0.2 },
  cloud: { label: 'Cloud', textInset: 0.16 },
  speech: { label: 'Speech bubble', adj: { ...corner, def: 24 }, textInset: 0.06 },
  ring: { label: 'Ring', adj: { label: 'Thickness %', min: 5, max: 90, step: 1, def: 30 }, textInset: 0.2 },
  'half-circle': { label: 'Half circle', textInset: 0.15 },
  pill: { label: 'Pill', textInset: 0.1 },
  path: { label: 'Custom path' },
};

export const SHAPE_GROUPS: { name: string; kinds: ShapeKind[] }[] = [
  { name: 'Basic', kinds: ['rect', 'round-rect', 'pill', 'ellipse', 'triangle', 'right-triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'parallelogram', 'trapezoid', 'half-circle', 'ring'] },
  { name: 'Arrows', kinds: ['arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'chevron'] },
  { name: 'Callouts & symbols', kinds: ['speech', 'cloud', 'heart', 'plus', 'cross'] },
  { name: 'Stars', kinds: ['star', 'burst'] },
];

// ── Tiny previews (24×24 SVG path data) ──────────────────────────────────────

const r1 = (v: number) => Math.round(v * 10) / 10;

function iconStar(n: number, inner: number): string {
  const pts = fit(starPts(n, inner), 20, 20);
  return 'M' + pts.map(([x, y]) => `${r1(x + 2)} ${r1(y + 2)}`).join('L') + 'z';
}

const ICON_PATHS: Record<ShapeKind, string> = {
  rect: 'M3 5h18v14H3z',
  'round-rect': 'M7 5h10a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4z',
  ellipse: 'M3 12a9 7 0 1 0 18 0 9 7 0 1 0-18 0z',
  triangle: 'M12 3l10 18H2z',
  'right-triangle': 'M4 3v18h16z',
  diamond: 'M12 2l10 10-10 10L2 12z',
  pentagon: 'M12 2l9.5 7-3.6 11.5H6.1L2.5 9z',
  hexagon: 'M7 3h10l5 9-5 9H7l-5-9z',
  octagon: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z',
  star: iconStar(5, 0.42),
  burst: iconStar(12, 0.64),
  'arrow-right': 'M2 9h12V4l8 8-8 8v-5H2z',
  'arrow-left': 'M22 9H10V4l-8 8 8 8v-5h12z',
  'arrow-up': 'M9 22V10H4l8-8 8 8h-5v12z',
  'arrow-down': 'M9 2v12H4l8 8 8-8h-5V2z',
  chevron: 'M2 4h13l7 8-7 8H2l7-8z',
  parallelogram: 'M7 5h15l-5 14H2z',
  trapezoid: 'M7 5h10l5 14H2z',
  plus: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  cross: 'M6 3l6 6 6-6 3 3-6 6 6 6-3 3-6-6-6 6-3-3 6-6-6-6z',
  heart: 'M12 21C5 15.5 2 12.5 2 8.5A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 10 1.5C22 12.5 19 15.5 12 21z',
  cloud: 'M7 19a5 5 0 0 1-.5-10A6 6 0 0 1 18 8a5.5 5.5 0 0 1 0 11z',
  speech: 'M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 5v-5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
  ring: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zM12 7a5 5 0 1 1 0 10 5 5 0 1 1 0-10z',
  'half-circle': 'M2 18a10 10 0 0 1 20 0z',
  pill: 'M8 6h8a6 6 0 0 1 0 12H8A6 6 0 0 1 8 6z',
  path: 'M4 18C4 8 10 4 20 6c-2 8-6 14-16 12z',
};

export function shapeIconPath(kind: ShapeKind): string {
  return ICON_PATHS[kind];
}

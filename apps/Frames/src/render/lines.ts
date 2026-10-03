import type { Arrowhead } from '../model/types';

export interface LineEnd { x: number; y: number; angle: number }
export interface LineGeom { path: Path2D; start: LineEnd; end: LineEnd }

type Pt = readonly [number, number];

/** Angle of the vector a→b, or `fallback` when the points coincide. */
function angleOf(a: Pt, b: Pt, fallback = 0): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9 ? fallback : Math.atan2(dy, dx);
}

/** First vector among the candidate point pairs that has non-zero length. */
function firstAngle(pairs: [Pt, Pt][]): number {
  for (const [a, b] of pairs) if (Math.abs(b[0] - a[0]) > 1e-9 || Math.abs(b[1] - a[1]) > 1e-9) return angleOf(a, b);
  return 0;
}

/**
 * Endpoint angles follow the direction of travel *into* each endpoint, so an arrowhead
 * drawn at `start` points backwards along the line (away from it).
 */
function ends(a: Pt, b: Pt, startDir: number, endDir: number): { start: LineEnd; end: LineEnd } {
  return {
    start: { x: a[0], y: a[1], angle: startDir + Math.PI },
    end: { x: b[0], y: b[1], angle: endDir },
  };
}

export function lineGeom(curve: 'straight' | 'curve' | 'elbow', w: number, h: number, up: boolean): LineGeom {
  w = Number.isFinite(w) ? Math.max(0, w) : 0;
  h = Number.isFinite(h) ? Math.max(0, h) : 0;
  const a: Pt = [0, up ? h : 0];
  const b: Pt = [w, up ? 0 : h];
  const path = new Path2D();
  path.moveTo(a[0], a[1]);

  if (curve === 'curve') {
    const c1: Pt = [w / 2, a[1]], c2: Pt = [w / 2, b[1]];
    path.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], b[0], b[1]);
    // Tangents: P1-P0 and P3-P2, falling back to the next control point when they collapse.
    const s = firstAngle([[a, c1], [a, c2], [a, b]]);
    const e = firstAngle([[c2, b], [c1, b], [a, b]]);
    return { path, ...ends(a, b, s, e) };
  }

  if (curve === 'elbow') {
    const m: Pt = [w / 2, a[1]], n: Pt = [w / 2, b[1]];
    path.lineTo(m[0], m[1]);
    path.lineTo(n[0], n[1]);
    path.lineTo(b[0], b[1]);
    const s = firstAngle([[a, m], [m, n], [n, b]]);
    const e = firstAngle([[n, b], [m, n], [a, m]]);
    return { path, ...ends(a, b, s, e) };
  }

  path.lineTo(b[0], b[1]);
  const t = angleOf(a, b);
  return { path, ...ends(a, b, t, t) };
}

// ── Arrowheads ───────────────────────────────────────────────────────────────

/** Head length along the line, scaled with stroke width but never tiny. */
function headLen(kind: Arrowhead, sw: number): number {
  const w = Math.max(sw, 1);
  switch (kind) {
    case 'arrow': return Math.max(w * 3.2, 12);
    case 'triangle': return Math.max(w * 3.6, 14);
    case 'diamond': return Math.max(w * 3.6, 14);
    case 'dot': return Math.max(w * 3, 10);
    case 'bar': return 0;
    default: return 0;
  }
}

const ARROW_HALF = (30 * Math.PI) / 180;
const TRI_HALF = (24 * Math.PI) / 180;

/** How far to shorten the line at this end so it doesn't poke through the head. */
export function arrowInset(kind: Arrowhead, strokeW: number): number {
  const L = headLen(kind, strokeW);
  switch (kind) {
    case 'arrow': return Math.max(strokeW, 0) * 0.5;
    case 'triangle': return L * 0.85;
    case 'diamond': return L * 0.5;
    case 'dot': return L * 0.5;
    default: return 0;
  }
}

export function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  kind: Arrowhead,
  x: number,
  y: number,
  angle: number,
  strokeW: number,
  color: string,
): void {
  if (kind === 'none') return;
  const sw = Math.max(strokeW, 0.5);
  const L = headLen(kind, sw);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Number.isFinite(angle) ? angle : 0);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.setLineDash([]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  // Local frame: +x is the direction of travel, the tip/outer edge sits at the origin.
  switch (kind) {
    case 'arrow': {
      // Round joins add sw/2 beyond the vertex; pull the vertex back so the outer tip lands on (x,y).
      const tipX = -sw / 2;
      ctx.lineWidth = sw;
      ctx.moveTo(tipX - Math.cos(ARROW_HALF) * L, -Math.sin(ARROW_HALF) * L);
      ctx.lineTo(tipX, 0);
      ctx.lineTo(tipX - Math.cos(ARROW_HALF) * L, Math.sin(ARROW_HALF) * L);
      ctx.stroke();
      break;
    }
    case 'triangle': {
      const hw = Math.tan(TRI_HALF) * L;
      ctx.lineWidth = 0.001;
      ctx.moveTo(0, 0);
      ctx.lineTo(-L, -hw);
      ctx.lineTo(-L, hw);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'diamond': {
      ctx.moveTo(0, 0);
      ctx.lineTo(-L / 2, -L * 0.36);
      ctx.lineTo(-L, 0);
      ctx.lineTo(-L / 2, L * 0.36);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'dot': {
      ctx.arc(-L / 2, 0, L / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bar': {
      const half = Math.max(sw * 2, 8);
      ctx.lineCap = 'butt';
      ctx.lineWidth = Math.max(sw, 2);
      ctx.moveTo(0, -half);
      ctx.lineTo(0, half);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

export function dashPattern(dash: 'solid' | 'dash' | 'dot' | undefined, w: number): number[] {
  const u = Math.max(Number.isFinite(w) ? w : 1, 2);
  if (dash === 'dash') return [u * 3.5, u * 2.2];
  if (dash === 'dot') return [u * 0.9, u * 2];
  return [];
}

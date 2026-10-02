import type { Rect } from '../model/geometry';

export interface GuideLine {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
  kind: 'align' | 'center' | 'margin' | 'guide' | 'slide' | 'space';
  /** For spacing markers: the measured gap. */
  gap?: number;
}

export interface SnapTargets {
  /** Other objects' bounds. */
  rects: Rect[];
  slide: { w: number; h: number };
  margin: number;
  guides?: { v: number[]; h: number[] };
  grid?: number;
  smart: boolean;
  objects: boolean;
}

interface Cand { pos: number; kind: GuideLine['kind']; src?: Rect }

function candidates(axis: 'x' | 'y', t: SnapTargets): Cand[] {
  const out: Cand[] = [];
  const size = axis === 'x' ? t.slide.w : t.slide.h;
  out.push({ pos: 0, kind: 'slide' }, { pos: size / 2, kind: 'slide' }, { pos: size, kind: 'slide' });
  if (t.margin > 0) out.push({ pos: t.margin, kind: 'margin' }, { pos: size - t.margin, kind: 'margin' });
  for (const g of (axis === 'x' ? t.guides?.v : t.guides?.h) ?? []) out.push({ pos: g, kind: 'guide' });
  if (t.objects) {
    for (const r of t.rects) {
      const a = axis === 'x' ? r.x : r.y, s = axis === 'x' ? r.w : r.h;
      out.push({ pos: a, kind: 'align', src: r }, { pos: a + s / 2, kind: 'center', src: r }, { pos: a + s, kind: 'align', src: r });
    }
  }
  return out;
}

export interface SnapResult {
  dx: number;
  dy: number;
  lines: GuideLine[];
}

/**
 * Snap a moving rectangle (its left/centre/right and top/middle/bottom) to
 * guides, margins, slide edges and other objects within `threshold` slide units.
 */
export function snapMove(r: Rect, t: SnapTargets, threshold: number): SnapResult {
  let dx = 0, dy = 0;
  const lines: GuideLine[] = [];

  for (const axis of ['x', 'y'] as const) {
    const a = axis === 'x' ? r.x : r.y, s = axis === 'x' ? r.w : r.h;
    const mine = [a, a + s / 2, a + s];
    let best: { d: number; cand: Cand } | null = null;
    for (const c of candidates(axis, t)) {
      for (const m of mine) {
        const d = c.pos - m;
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, cand: c };
      }
    }
    // Grid applies when nothing else caught.
    if (!best && t.grid && t.grid > 0) {
      const g = Math.round(a / t.grid) * t.grid;
      if (Math.abs(g - a) <= threshold) best = { d: g - a, cand: { pos: g, kind: 'guide' } };
    }
    if (best) {
      if (axis === 'x') dx = best.d;
      else dy = best.d;
    }
  }

  if (t.smart || t.objects) {
    const moved = { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
    for (const axis of ['x', 'y'] as const) {
      const a = axis === 'x' ? moved.x : moved.y, s = axis === 'x' ? moved.w : moved.h;
      for (const c of candidates(axis, t)) {
        for (const m of [a, a + s / 2, a + s]) {
          if (Math.abs(c.pos - m) > 0.5) continue;
          if (c.kind === 'align' || c.kind === 'center' || c.kind === 'guide' || c.kind === 'slide' || c.kind === 'margin') {
            const src = c.src;
            const lo = axis === 'x' ? Math.min(moved.y, src?.y ?? moved.y) : Math.min(moved.x, src?.x ?? moved.x);
            const hi = axis === 'x' ? Math.max(moved.y + moved.h, (src?.y ?? 0) + (src?.h ?? 0)) : Math.max(moved.x + moved.w, (src?.x ?? 0) + (src?.w ?? 0));
            lines.push({ axis, pos: c.pos, kind: c.kind, from: src ? lo : axis === 'x' ? 0 : 0, to: src ? hi : axis === 'x' ? t.slide.h : t.slide.w });
          }
        }
      }
    }
  }

  // Equal spacing between neighbours on the same row / column.
  if (t.objects && t.smart && t.rects.length >= 2) {
    const sp = spacing({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }, t.rects, threshold);
    if (sp) {
      if (sp.dx !== undefined) dx += sp.dx;
      if (sp.dy !== undefined) dy += sp.dy;
      lines.push(...sp.lines);
    }
  }
  return { dx, dy, lines: dedupe(lines) };
}

function dedupe(lines: GuideLine[]): GuideLine[] {
  const seen = new Map<string, GuideLine>();
  for (const l of lines) {
    const k = `${l.axis}:${Math.round(l.pos * 2)}:${l.kind}`;
    const prev = seen.get(k);
    if (!prev) seen.set(k, { ...l });
    else {
      prev.from = Math.min(prev.from, l.from);
      prev.to = Math.max(prev.to, l.to);
    }
  }
  return [...seen.values()];
}

function spacing(m: Rect, rects: Rect[], threshold: number): { dx?: number; dy?: number; lines: GuideLine[] } | null {
  const lines: GuideLine[] = [];
  let dx: number | undefined, dy: number | undefined;
  const overlapY = (r: Rect) => r.y < m.y + m.h && r.y + r.h > m.y;
  const overlapX = (r: Rect) => r.x < m.x + m.w && r.x + r.w > m.x;

  const left = rects.filter((r) => overlapY(r) && r.x + r.w <= m.x).sort((a, b) => b.x + b.w - (a.x + a.w))[0];
  const right = rects.filter((r) => overlapY(r) && r.x >= m.x + m.w).sort((a, b) => a.x - b.x)[0];
  if (left && right) {
    const gl = m.x - (left.x + left.w), gr = right.x - (m.x + m.w);
    if (Math.abs(gl - gr) <= threshold * 1.5) {
      dx = (gr - gl) / 2;
      const gap = (gl + gr) / 2;
      const y = m.y + m.h / 2;
      lines.push({ axis: 'y', pos: y, from: left.x + left.w, to: m.x + dx, kind: 'space', gap }, { axis: 'y', pos: y, from: m.x + m.w + dx, to: right.x, kind: 'space', gap });
    }
  }
  const above = rects.filter((r) => overlapX(r) && r.y + r.h <= m.y).sort((a, b) => b.y + b.h - (a.y + a.h))[0];
  const below = rects.filter((r) => overlapX(r) && r.y >= m.y + m.h).sort((a, b) => a.y - b.y)[0];
  if (above && below) {
    const ga = m.y - (above.y + above.h), gb = below.y - (m.y + m.h);
    if (Math.abs(ga - gb) <= threshold * 1.5) {
      dy = (gb - ga) / 2;
      const gap = (ga + gb) / 2;
      const x = m.x + m.w / 2;
      lines.push({ axis: 'x', pos: x, from: above.y + above.h, to: m.y + dy, kind: 'space', gap }, { axis: 'x', pos: x, from: m.y + m.h + dy, to: below.y, kind: 'space', gap });
    }
  }
  return lines.length ? { dx, dy, lines } : null;
}

/** Snap a single coordinate (a resizing edge). Returns the delta to apply and any guide line. */
export function snapEdge(axis: 'x' | 'y', value: number, t: SnapTargets, threshold: number, span: [number, number]): { d: number; line?: GuideLine } {
  let best: { d: number; cand: Cand } | null = null;
  for (const c of candidates(axis, t)) {
    const d = c.pos - value;
    if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, cand: c };
  }
  if (!best && t.grid && t.grid > 0) {
    const g = Math.round(value / t.grid) * t.grid;
    if (Math.abs(g - value) <= threshold) best = { d: g - value, cand: { pos: g, kind: 'guide' } };
  }
  if (!best) return { d: 0 };
  return { d: best.d, line: { axis, pos: best.cand.pos, kind: best.cand.kind, from: span[0], to: span[1] } };
}

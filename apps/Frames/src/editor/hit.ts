import { distToSegment, hitBox, rotatePoint, type Pt } from '../model/geometry';
import { absoluteRect } from '../model/ops';
import type { El } from '../model/types';
import { cellAt } from '../render/table';
import { lineEnds } from './frames';

/** Topmost element at a slide-space point among `level` (the siblings the user can currently pick). */
export function hitElement(all: readonly El[], level: readonly El[], p: Pt, tol = 6): El | null {
  for (let i = level.length - 1; i >= 0; i--) {
    const e = level[i]!;
    if (e.hidden || e.locked) continue;
    if (hits(all, e, p, tol)) return e;
  }
  return null;
}

function hits(all: readonly El[], e: El, p: Pt, tol: number): boolean {
  const r = absoluteRect(all, e.id) ?? e;
  const box = { x: r.x, y: r.y, w: r.w, h: r.h, rot: e.rot };
  if (e.type === 'line') {
    const [a, b] = lineEnds(all, e);
    return distToSegment(p, a, b) <= Math.max(tol, e.stroke.w / 2 + 4);
  }
  if (!hitBox(box, p, tol)) return false;
  // Outline-only shapes are picked by their edge, so they don't block what's inside them.
  if (e.type === 'shape' && !e.fill && !(e.doc && e.doc.some((q) => q.runs.some((x) => x.t)))) {
    const inner = { ...box, x: box.x + 16, y: box.y + 16, w: Math.max(0, box.w - 32), h: Math.max(0, box.h - 32) };
    return !hitBox(inner, p, 0);
  }
  return true;
}

/** The element-local point for a slide-space point (undoing rotation). */
export function toLocal(e: { x: number; y: number; w: number; h: number; rot: number }, p: Pt): Pt {
  const c = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
  const q = e.rot ? rotatePoint(p, c, -e.rot) : p;
  return { x: q.x - e.x, y: q.y - e.y };
}

export function tableCellAt(all: readonly El[], t: El, p: Pt) {
  if (t.type !== 'table') return null;
  const r = absoluteRect(all, t.id) ?? t;
  return cellAt(t, ...(Object.values(toLocal({ ...r, rot: t.rot }, p)) as [number, number]));
}

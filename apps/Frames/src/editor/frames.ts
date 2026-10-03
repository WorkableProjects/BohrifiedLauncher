import { absoluteRect, findEl } from '../model/ops';
import { bounds, boundsOf, corners, rotatePoint, type Pt, type Rect } from '../model/geometry';
import type { El, LineEl } from '../model/types';

/** A rotated rectangle in slide space (elements inside a group are resolved to absolute coordinates). */
export interface Frame extends Rect {
  rot: number;
}

export function frameOf(els: readonly El[], el: El): Frame {
  const r = absoluteRect(els, el.id) ?? el;
  return { x: r.x, y: r.y, w: r.w, h: r.h, rot: el.rot };
}

export const centerOf = (f: Frame): Pt => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

export function frameCorners(f: Frame): Pt[] {
  return corners(f);
}

export function frameBounds(f: Frame): Rect {
  return bounds(f);
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot' | 'p0' | 'p1';

export const HANDLE_POS: Record<Exclude<HandleId, 'rot' | 'p0' | 'p1'>, [number, number]> = {
  nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5],
};

/** Slide-space position of a handle on a frame. */
export function handlePoint(f: Frame, id: HandleId, rotOffset = 0): Pt {
  const c = centerOf(f);
  if (id === 'rot') return rotatePoint({ x: c.x, y: f.y - rotOffset }, c, f.rot);
  if (id === 'p0' || id === 'p1') return { x: c.x, y: c.y };
  const [fx, fy] = HANDLE_POS[id];
  return rotatePoint({ x: f.x + f.w * fx, y: f.y + f.h * fy }, c, f.rot);
}

/** Endpoints of a line element, in slide space. */
export function lineEnds(els: readonly El[], l: LineEl): [Pt, Pt] {
  const r = absoluteRect(els, l.id) ?? l;
  return [{ x: r.x, y: l.up ? r.y + r.h : r.y }, { x: r.x + r.w, y: l.up ? r.y : r.y + r.h }];
}

export function selectionFrame(els: readonly El[], ids: readonly string[]): Frame | null {
  const list = ids.map((id) => findEl(els, id)).filter((e): e is El => !!e);
  if (!list.length) return null;
  if (list.length === 1) return frameOf(els, list[0]!);
  const b = boundsOf(list.flatMap((e) => frameCorners(frameOf(els, e))));
  return { ...b, rot: 0 };
}

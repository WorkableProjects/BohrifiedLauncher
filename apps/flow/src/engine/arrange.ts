import { elementBounds, translateElement, unionRects } from './geometry';
import type { BoardElement, Rect } from './types';

/**
 * Arranging a selection: alignment, even distribution and snapping a
 * moving selection to its neighbours. Pure functions over world-space
 * rectangles, so they are unit-tested apart from the canvas.
 */

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type Axis = 'x' | 'y';

const EPS = 1e-6;

/** Move every element so the chosen edge or centre lines up across the selection. Needs two or more. */
export function alignElements(els: readonly BoardElement[], mode: AlignMode): BoardElement[] {
  if (els.length < 2) return [...els];
  const all = unionRects(els.map(elementBounds));
  if (!all) return [...els];
  return els.map((el) => {
    const b = elementBounds(el);
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case 'left': dx = all.x - b.x; break;
      case 'center': dx = all.x + all.w / 2 - (b.x + b.w / 2); break;
      case 'right': dx = all.x + all.w - (b.x + b.w); break;
      case 'top': dy = all.y - b.y; break;
      case 'middle': dy = all.y + all.h / 2 - (b.y + b.h / 2); break;
      case 'bottom': dy = all.y + all.h - (b.y + b.h); break;
    }
    return Math.abs(dx) < EPS && Math.abs(dy) < EPS ? el : translateElement(el, dx, dy);
  });
}

/**
 * Space elements so the gaps between neighbours are equal, keeping the
 * outermost two where they are. Needs three or more.
 */
export function distributeElements(els: readonly BoardElement[], axis: Axis): BoardElement[] {
  if (els.length < 3) return [...els];
  const key = axis === 'x' ? 'x' : 'y';
  const size = axis === 'x' ? 'w' : 'h';
  const items = els.map((el) => ({ el, b: elementBounds(el) })).sort((a, b) => a.b[key] - b.b[key]);
  const first = items[0].b;
  const last = items[items.length - 1].b;
  const total = last[key] + last[size] - first[key];
  const used = items.reduce((t, i) => t + i.b[size], 0);
  const gap = (total - used) / (items.length - 1);
  let cursor = first[key];
  const moved = new Map<string, BoardElement>();
  for (const { el, b } of items) {
    const d = cursor - b[key];
    moved.set(el.id, Math.abs(d) < EPS ? el : translateElement(el, axis === 'x' ? d : 0, axis === 'y' ? d : 0));
    cursor += b[size] + gap;
  }
  return els.map((el) => moved.get(el.id)!);
}

export interface SnapResult {
  /** How far to nudge the moving rectangle. */
  dx: number;
  dy: number;
  /** World positions of the guide lines to draw (vertical lines at x, horizontal at y). */
  guidesX: number[];
  guidesY: number[];
}

const anchors = (r: Rect, axis: Axis) => (axis === 'x' ? [r.x, r.x + r.w / 2, r.x + r.w] : [r.y, r.y + r.h / 2, r.y + r.h]);

/**
 * Snap a moving rectangle's edges and centre to those of `targets` when
 * within `tol` world units. Each axis snaps independently to the closest
 * match, and every guide that lines up after snapping is reported.
 */
export function snapMove(moving: Rect, targets: readonly Rect[], tol: number): SnapResult {
  const out: SnapResult = { dx: 0, dy: 0, guidesX: [], guidesY: [] };
  for (const axis of ['x', 'y'] as const) {
    const mine = anchors(moving, axis);
    let best = tol;
    let shift = 0;
    for (const t of targets) {
      for (const theirs of anchors(t, axis)) {
        for (const m of mine) {
          const d = theirs - m;
          if (Math.abs(d) < Math.abs(best) - EPS || (Math.abs(Math.abs(d) - Math.abs(best)) < EPS && best === tol)) {
            if (Math.abs(d) <= tol) {
              best = d;
              shift = d;
            }
          }
        }
      }
    }
    if (Math.abs(best) > tol - EPS && shift === 0) continue;
    if (axis === 'x') out.dx = shift;
    else out.dy = shift;
    // Guides: every target anchor that now coincides with one of ours.
    const after = anchors(axis === 'x' ? { ...moving, x: moving.x + shift } : { ...moving, y: moving.y + shift }, axis);
    const guides = new Set<number>();
    for (const t of targets) for (const theirs of anchors(t, axis)) if (after.some((m) => Math.abs(m - theirs) < 1e-4)) guides.add(Math.round(theirs * 1e4) / 1e4);
    (axis === 'x' ? out.guidesX : out.guidesY).push(...guides);
  }
  return out;
}

/** Nudge elements by a world-space offset. */
export const nudgeElements = (els: readonly BoardElement[], dx: number, dy: number): BoardElement[] => els.map((e) => translateElement(e, dx, dy));

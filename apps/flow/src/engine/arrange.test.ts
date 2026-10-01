import { describe, expect, it } from 'vitest';
import { alignElements, distributeElements, nudgeElements, snapMove } from './arrange';
import { elementBounds } from './geometry';
import { BoardStore, describeOp } from './store';
import type { BoardElement, ShapeElement } from './types';

const rect = (id: string, x: number, y: number, w: number, h: number): ShapeElement => ({ id, type: 'shape', kind: 'rect', x1: x, y1: y, x2: x + w, y2: y + h, color: 'label', size: 0, fill: false });
const b = (el: BoardElement) => elementBounds(el);

describe('alignElements', () => {
  const els = [rect('a', 0, 0, 40, 20), rect('b', 100, 50, 20, 60), rect('c', 30, 200, 80, 10)];
  it('aligns edges to the selection bounds', () => {
    expect(alignElements(els, 'left').map((e) => b(e).x)).toEqual([0, 0, 0]);
    expect(alignElements(els, 'right').map((e) => b(e).x + b(e).w)).toEqual([120, 120, 120]);
    expect(alignElements(els, 'top').map((e) => b(e).y)).toEqual([0, 0, 0]);
    expect(alignElements(els, 'bottom').map((e) => b(e).y + b(e).h)).toEqual([210, 210, 210]);
  });
  it('aligns centres', () => {
    const c = alignElements(els, 'center').map((e) => b(e).x + b(e).w / 2);
    expect(new Set(c).size).toBe(1);
    expect(c[0]).toBe(60);
    const m = alignElements(els, 'middle').map((e) => b(e).y + b(e).h / 2);
    expect(new Set(m).size).toBe(1);
  });
  it('leaves sizes alone and unchanged elements identical', () => {
    const out = alignElements(els, 'left');
    expect(b(out[1]).w).toBe(20);
    expect(out[0]).toBe(els[0]); // already at the left edge: same object
  });
  it('needs two elements', () => {
    expect(alignElements([els[0]], 'left')).toEqual([els[0]]);
  });
});

describe('distributeElements', () => {
  it('equalises the gaps, keeping the outer two fixed', () => {
    const els = [rect('a', 0, 0, 10, 10), rect('b', 20, 0, 30, 10), rect('c', 200, 0, 10, 10)];
    const out = distributeElements(els, 'x');
    expect(b(out[0]).x).toBe(0);
    expect(b(out[2]).x).toBe(200);
    const gap1 = b(out[1]).x - (b(out[0]).x + b(out[0]).w);
    const gap2 = b(out[2]).x - (b(out[1]).x + b(out[1]).w);
    expect(gap1).toBeCloseTo(gap2, 9);
    expect(gap1).toBeCloseTo(80, 9);
  });
  it('works vertically and regardless of selection order', () => {
    const els = [rect('c', 0, 300, 10, 10), rect('a', 0, 0, 10, 10), rect('b', 0, 20, 10, 40)];
    const out = distributeElements(els, 'y');
    expect(out.map((e) => e.id)).toEqual(['c', 'a', 'b']);
    const sorted = [...out].sort((p, q) => b(p).y - b(q).y);
    const g1 = b(sorted[1]).y - (b(sorted[0]).y + b(sorted[0]).h);
    const g2 = b(sorted[2]).y - (b(sorted[1]).y + b(sorted[1]).h);
    expect(g1).toBeCloseTo(g2, 9);
  });
  it('needs three elements', () => {
    const two = [rect('a', 0, 0, 1, 1), rect('b', 9, 9, 1, 1)];
    expect(distributeElements(two, 'x')).toEqual(two);
  });
});

describe('snapMove', () => {
  const target = { x: 100, y: 100, w: 50, h: 50 };
  it('snaps edges and centres within tolerance and reports the guide', () => {
    const r = snapMove({ x: 96, y: 300, w: 20, h: 20 }, [target], 6);
    expect(r.dx).toBe(4);
    expect(r.guidesX).toEqual([100]);
    expect(r.dy).toBe(0);
    expect(r.guidesY).toEqual([]);
  });
  it('snaps centre to centre', () => {
    const r = snapMove({ x: 113, y: 0, w: 24, h: 10 }, [target], 4); // centre 125 → 125
    expect(r.dx).toBe(0);
    expect(r.guidesX).toContain(125);
  });
  it('snaps both axes independently, choosing the nearest', () => {
    const r = snapMove({ x: 148, y: 97, w: 10, h: 10 }, [target, { x: 300, y: 0, w: 5, h: 5 }], 5);
    expect(r.dx).toBe(2); // left edge 148 → target right edge 150
    expect(r.dy).toBe(-2); // the nearest match: centre 102 → top edge 100
  });
  it('does nothing when nothing is close', () => {
    expect(snapMove({ x: 500, y: 500, w: 10, h: 10 }, [target], 6)).toEqual({ dx: 0, dy: 0, guidesX: [], guidesY: [] });
  });
});

describe('nudge', () => {
  it('moves elements by an offset', () => {
    const [m] = nudgeElements([rect('a', 0, 0, 10, 10)], 5, -3);
    expect(b(m)).toMatchObject({ x: 5, y: -3 });
  });
});

describe('history labels and page moves', () => {
  it('describes ops for undo and redo feedback', () => {
    const s = new BoardStore();
    expect(s.undoLabel).toBeNull();
    s.addElements([rect('a', 0, 0, 5, 5)]);
    expect(s.undoLabel).toBe('Shape');
    s.addElements([rect('b', 0, 0, 5, 5), rect('c', 0, 0, 5, 5)]);
    expect(s.undoLabel).toBe('Added 2 items');
    s.replaceElements(s.page.elements.map((e) => ({ ...e }) as BoardElement));
    expect(s.undoLabel).toBe('Changed 3 items');
    s.removeElements(['a']);
    expect(s.undoLabel).toBe('Deleted 1 item');
    expect(s.undoDepth).toBe(4);
    s.undo();
    expect(s.redoLabel).toBe('Deleted 1 item');
    expect(s.redoDepth).toBe(1);
    s.setTitle('Chem');
    expect(describeOp({ kind: 'title', before: '', after: '' })).toBe('Renamed lesson');
  });
  it('reorders pages as undoable, syncable history', () => {
    const s = new BoardStore();
    s.addPage();
    s.addPage();
    const names = () => s.doc.pages.map((p) => p.name);
    const before = names();
    s.movePageTo(s.doc.pages[2].id, 0);
    expect(names()).toEqual([before[2], before[0], before[1]]);
    expect(s.undoLabel).toBe('Moved page');
    s.undo();
    expect(names()).toEqual(before);
    s.redo();
    expect(names()[0]).toBe(before[2]);
    // Out-of-range targets clamp; no-op moves record nothing.
    const depth = s.undoDepth;
    s.movePageTo(s.doc.pages[0].id, -5);
    expect(s.undoDepth).toBe(depth);
    s.movePage(s.doc.pages[0].id, 99);
    expect(s.doc.pages.at(-1)!.name).toBe(before[2]);
  });
});

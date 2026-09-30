import { describe, expect, it } from 'vitest';
import { BoardStore } from './store';
import { hitTestPoint, hitTestSegment, scaleElement, translateElement } from './geometry';
import type { StrokeElement } from './types';

const stroke = (id: string, pts: number[]): StrokeElement => ({
  id, type: 'stroke', tool: 'pen', points: pts, color: 'label', size: 4, pressure: false,
});

describe('BoardStore history', () => {
  it('adds, undoes and redoes elements', () => {
    const s = new BoardStore();
    s.addElements([stroke('a', [0, 0, 0.5, 10, 10, 0.5])]);
    s.addElements([stroke('b', [0, 0, 0.5, 20, 20, 0.5])]);
    expect(s.page.elements.map((e) => e.id)).toEqual(['a', 'b']);
    s.undo();
    expect(s.page.elements.map((e) => e.id)).toEqual(['a']);
    s.redo();
    expect(s.page.elements.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('restores z-order when undoing a removal', () => {
    const s = new BoardStore();
    s.addElements(['a', 'b', 'c'].map((id) => stroke(id, [0, 0, 0.5])));
    s.removeElements(['a', 'c']);
    expect(s.page.elements.map((e) => e.id)).toEqual(['b']);
    s.undo();
    expect(s.page.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('replaces in place and reverts', () => {
    const s = new BoardStore();
    const a = stroke('a', [0, 0, 0.5, 10, 0, 0.5]);
    s.addElements([a, stroke('b', [0, 0, 0.5])]);
    s.replaceElements([translateElement(a, 5, 5)]);
    expect((s.page.elements[0] as StrokeElement).points[0]).toBe(5);
    s.undo();
    expect(s.page.elements[0]).toBe(a);
  });

  it('keeps at least one page and undoes page deletion', () => {
    const s = new BoardStore();
    s.deletePage();
    expect(s.doc.pages).toHaveLength(1);
    s.addPage();
    expect(s.doc.pages).toHaveLength(2);
    const id = s.page.id;
    s.deletePage(id);
    expect(s.doc.pages).toHaveLength(1);
    s.undo();
    expect(s.doc.pages.map((p) => p.id)).toContain(id);
  });

  it('flags append-only ops for incremental rendering', () => {
    const s = new BoardStore();
    const flags: boolean[] = [];
    s.subscribe((c) => c.type === 'op' && flags.push(c.appendOnly));
    s.addElements([stroke('a', [0, 0, 0.5])]);
    s.removeElements(['a']);
    expect(flags).toEqual([true, false]);
  });
});

describe('geometry', () => {
  const s = stroke('a', [0, 0, 0.5, 100, 0, 0.5]);
  it('hit-tests strokes by distance', () => {
    expect(hitTestPoint(s, { x: 50, y: 3 }, 2)).toBe(true);
    expect(hitTestPoint(s, { x: 50, y: 30 }, 2)).toBe(false);
  });
  it('detects eraser sweeps crossing a stroke', () => {
    expect(hitTestSegment(s, 50, -20, 50, 20, 4)).toBe(true);
    expect(hitTestSegment(s, 150, -20, 150, 20, 4)).toBe(false);
  });
  it('scales around an origin', () => {
    const t = scaleElement(s, 0, 0, 2);
    expect(t.points[3]).toBe(200);
  });
});

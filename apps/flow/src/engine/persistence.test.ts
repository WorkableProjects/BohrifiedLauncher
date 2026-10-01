import { describe, expect, it } from 'vitest';
import { safeFilename, summarize } from './persistence';
import { BoardStore, createDocument, isFlowDocument } from './store';
import type { BoardElement } from './types';

const stroke = (id: string): BoardElement => ({ id, type: 'stroke', tool: 'pen', points: [0, 0, 0.5, 10, 10, 0.5], color: 'label', size: 4, pressure: false });

describe('Flow documents: save, export and reopen', () => {
  it('survives the .flow JSON round trip with every element type', () => {
    const s = new BoardStore();
    s.addElements([
      stroke('s1'),
      { id: 'sh', type: 'shape', kind: 'ellipse', x1: 0, y1: 0, x2: 50, y2: 50, color: 'blue', size: 3, fill: false },
      { id: 't', type: 'text', x: 5, y: 5, text: 'H₂O', spans: [{ text: 'H₂O', marks: { bold: true } }], color: 'label', fontSize: 24 },
      { id: 'd', type: 'dot', x: 1, y: 2, r: 4, color: 'red' },
      { id: 'e', type: 'equation', x: 0, y: 0, w: 10, h: 10, latex: 'x^2', svg: '<svg/>', color: 'label' },
    ]);
    s.addPage();
    s.setTitle('Chemistry · 2026');
    const copy = JSON.parse(JSON.stringify(s.doc));
    expect(isFlowDocument(copy)).toBe(true);
    expect(copy.title).toBe('Chemistry · 2026');
    expect(copy.pages).toHaveLength(2);
    expect(copy.pages[0].elements.map((e: BoardElement) => e.type)).toEqual(['stroke', 'shape', 'text', 'dot', 'equation']);
    expect(copy.pages[0].elements[2].spans[0].marks).toEqual({ bold: true });
    const reopened = new BoardStore(copy);
    expect(reopened.page.id).toBe(s.doc.activePage);
    expect(reopened.canUndo).toBe(false);
  });

  it('rejects things that are not Flow documents', () => {
    for (const bad of [null, 42, {}, { version: 2 }, { version: 1, title: 'x', pages: [] }, { version: 1, title: 'x', pages: [{ id: 'p', elements: [] }] }, '[]']) {
      expect(isFlowDocument(bad)).toBe(false);
    }
    expect(isFlowDocument(createDocument())).toBe(true);
  });

  it('summarizes a lesson for the Recents list', () => {
    const d = createDocument();
    d.title = 'Moles';
    expect(summarize(d, 'data:image/png;base64,xx')).toEqual({ id: d.id, title: 'Moles', updatedAt: d.updatedAt, pages: 1, thumb: 'data:image/png;base64,xx' });
  });

  it('makes safe file names', () => {
    expect(safeFilename('Chem: Unit 1 / Quiz?')).toBe('Chem-Unit-1-Quiz');
    expect(safeFilename('***')).toBe('flow');
    expect(safeFilename('  My  Lesson ')).toBe('My-Lesson');
  });

  it('keeps edits applied after a reload undoable only within the session', () => {
    const s = new BoardStore();
    s.addElements([stroke('a')]);
    const reopened = new BoardStore(JSON.parse(JSON.stringify(s.doc)));
    expect(reopened.page.elements).toHaveLength(1);
    reopened.removeElements(['a']);
    reopened.undo();
    expect(reopened.page.elements.map((e) => e.id)).toEqual(['a']);
  });
});

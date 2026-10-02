import { describe, expect, it } from 'vitest';
import { buildPdf, pdfString } from './pdf';

// A 1×1 JPEG; the bytes only need to be carried through intact.
const JPEG = Uint8Array.from(
  atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='),
  (c) => c.charCodeAt(0),
);
const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('pdfString', () => {
  it('escapes delimiters and backslashes', () => {
    expect(pdfString('a(b)c\\d')).toBe('(a\\(b\\)c\\\\d)');
  });
  it('uses UTF-16BE hex for non-ASCII', () => {
    expect(pdfString('é')).toBe('<FEFF00E9>');
  });
});

describe('buildPdf', () => {
  const pdf = buildPdf(
    [
      { jpeg: JPEG, w: 1920, h: 1080 },
      { jpeg: JPEG, w: 100, h: 100, pageW: 200, pageH: 300 },
    ],
    { title: 'Deck (v1)', author: 'Me' },
  );
  const text = latin1(pdf);

  it('has header and trailer', () => {
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Producer (Frames)');
    expect(text).toContain('/Title (Deck \\(v1\\))');
    expect(text).toContain('/Count 2');
    expect(text).toContain('/MediaBox [0 0 1440 810]');
    expect(text).toContain('/MediaBox [0 0 200 300]');
    expect(text).toContain('/Filter /DCTDecode');
  });

  it('has xref offsets that point at objects', () => {
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const [, first, count] = /xref\n(\d+) (\d+)\n/.exec(text.slice(start))!.map(Number) as [number, number, number];
    expect(first).toBe(0);
    expect(count).toBe(10);
    const rows = text.slice(start).split('\n').slice(2, 2 + count);
    expect(rows[0]).toBe('0000000000 65535 f ');
    rows.slice(1).forEach((row, i) => {
      const off = Number(row.slice(0, 10));
      expect(text.slice(off).startsWith(`${i + 1} 0 obj`)).toBe(true);
    });
  });

  it('carries the JPEG bytes unchanged', () => {
    const i = text.indexOf('stream\n\xff\xd8');
    expect(i).toBeGreaterThan(0);
    expect(Array.from(pdf.slice(i + 7, i + 7 + JPEG.length))).toEqual(Array.from(JPEG));
  });

  it('opens in pdf.js', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: pdf.slice(), useWorkerFetch: false, verbosity: 0 }).promise;
    expect(doc.numPages).toBe(2);
    await doc.destroy();
  });
});

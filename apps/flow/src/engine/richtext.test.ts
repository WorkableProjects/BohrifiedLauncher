import { describe, expect, it } from 'vitest';
import { hasFormatting, markIsOn, normalizeSpans, plainText, splitLines, textFields, toggleMark, trimEndSpans, withSpans, wrapSpans } from './richtext';
import { measureSpans } from './geometry';

const measure = (t: string, size: number) => t.length * size * 0.5;

describe('rich text', () => {
  it('normalizes: merges equal neighbours, drops empties and unset marks', () => {
    expect(normalizeSpans([{ text: 'a' }, { text: 'b', marks: { bold: false } }, { text: '' }, { text: 'c', marks: { bold: true } }, { text: 'd', marks: { bold: true } }])).toEqual([
      { text: 'ab' },
      { text: 'cd', marks: { bold: true } },
    ]);
  });

  it('keeps a plain mirror and only stores spans when formatted', () => {
    expect(textFields([{ text: 'hi' }])).toEqual({ text: 'hi' });
    const f = textFields([{ text: 'hi ' }, { text: 'there', marks: { italic: true } }]);
    expect(f.text).toBe('hi there');
    expect(f.spans).toHaveLength(2);
    expect(hasFormatting([{ text: '  ', marks: { bold: true } }])).toBe(false);
  });

  it('toggles a mark across the whole element', () => {
    const on = toggleMark([{ text: 'a' }, { text: 'b', marks: { bold: true } }], 'bold');
    expect(on).toEqual([{ text: 'ab', marks: { bold: true } }]);
    expect(markIsOn(on, 'bold')).toBe(true);
    expect(toggleMark(on, 'bold')).toEqual([{ text: 'ab' }]);
  });

  it('withSpans drops stale spans when formatting is removed', () => {
    const el = { id: 'x', text: 'ab', spans: [{ text: 'ab', marks: { bold: true } }] };
    expect(withSpans(el, [{ text: 'ab' }])).toEqual({ id: 'x', text: 'ab' });
  });

  it('splits lines and trims trailing whitespace across runs', () => {
    expect(splitLines([{ text: 'a\nb', marks: { bold: true } }, { text: 'c' }]).map((l) => plainText(l))).toEqual(['a', 'bc']);
    expect(trimEndSpans([{ text: 'hi', marks: { bold: true } }, { text: ' \n ' }])).toEqual([{ text: 'hi', marks: { bold: true } }]);
  });

  it('wraps at whitespace, never inside a word that crosses runs', () => {
    const lines = wrapSpans([{ text: 'one tw' }, { text: 'o', marks: { bold: true } }, { text: ' three' }], 30, 10, measure);
    expect(lines.map(plainText)).toEqual(['one', 'two', 'three']);
  });

  it('measures bold wider than regular', () => {
    expect(measureSpans([{ text: 'Hello', marks: { bold: true } }], 20).w).toBeGreaterThan(measureSpans([{ text: 'Hello' }], 20).w);
  });
});

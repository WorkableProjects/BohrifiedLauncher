import { describe, expect, it } from 'vitest';
import { fitPage, pageText, renderWidth } from './importPdf';

describe('fitPage', () => {
  const target = { w: 1920, h: 1080 };
  it('fills a matching page', () => {
    const f = fitPage(960, 540, target);
    expect(f).toMatchObject({ x: 0, y: 0, w: 1920, h: 1080, letterboxed: false, size: { w: 1920, h: 1080 } });
  });
  it('pillarboxes a portrait page', () => {
    const f = fitPage(612, 792, target);
    expect(f.letterboxed).toBe(true);
    expect(f.h).toBe(1080);
    expect(f.w).toBeCloseTo((1080 * 612) / 792, 5);
    expect(f.x).toBeCloseTo((1920 - f.w) / 2, 5);
    expect(f.y).toBe(0);
    expect(f.size).toEqual({ w: 1920, h: Math.round(1920 * (792 / 612)) });
  });
  it('letterboxes a very wide page', () => {
    const f = fitPage(2000, 500, target);
    expect(f.w).toBe(1920);
    expect(f.h).toBe(480);
    expect(f.y).toBe(300);
  });
  it('survives a degenerate page', () => {
    expect(fitPage(0, 0, target).letterboxed).toBe(false);
  });
});

describe('helpers', () => {
  it('caps the render width', () => {
    expect(renderWidth(1920)).toBe(1920);
    expect(renderWidth(5000)).toBe(2400);
    expect(renderWidth(0)).toBe(1);
  });
  it('flattens, trims and limits page text', () => {
    expect(pageText([{ str: 'Hello ', hasEOL: false }, { str: 'world', hasEOL: true }, { type: 'beginMarkedContent' }, { str: 'Bye' }])).toBe('Hello world\nBye');
    expect(pageText([{ str: 'x'.repeat(5000) }])).toHaveLength(4000);
  });
});

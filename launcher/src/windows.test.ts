import { describe, expect, it } from 'vitest';
import { MIN_H, MIN_W, clampRect, tileRects, zoneAt, zoneRect } from './windows';

describe('snap zones', () => {
  it('halves and quarters fill the stage exactly', () => {
    const W = 1001;
    const H = 701;
    const l = zoneRect('left', W, H);
    const r = zoneRect('right', W, H);
    expect(l.x + l.w).toBe(r.x);
    expect(r.x + r.w).toBe(W);
    expect([l.h, r.h]).toEqual([H, H]);
    const tl = zoneRect('top-left', W, H);
    const bl = zoneRect('bottom-left', W, H);
    expect(tl.y + tl.h).toBe(bl.y);
    expect(bl.y + bl.h).toBe(H);
  });
  it('edges snap to halves, corners to quarters, the top maximizes', () => {
    expect(zoneAt(2, 300, 1000, 700)).toBe('left');
    expect(zoneAt(998, 300, 1000, 700)).toBe('right');
    expect(zoneAt(500, 1, 1000, 700)).toBe('max');
    expect(zoneAt(3, 2, 1000, 700)).toBe('top-left');
    expect(zoneAt(997, 699, 1000, 700)).toBe('bottom-right');
    expect(zoneAt(500, 300, 1000, 700)).toBeNull();
  });
});

describe('clampRect', () => {
  it('enforces the minimum size and keeps the title bar reachable', () => {
    const r = clampRect({ x: -5000, y: -40, w: 10, h: 10 }, 1000, 700);
    expect(r.w).toBe(MIN_W);
    expect(r.h).toBe(MIN_H);
    expect(r.y).toBe(0);
    expect(r.x + r.w).toBeGreaterThan(0);
    const far = clampRect({ x: 5000, y: 5000, w: 400, h: 300 }, 1000, 700);
    expect(far.x).toBeLessThan(1000);
    expect(far.y).toBeLessThan(700);
  });
  it('never exceeds a stage that is large enough', () => {
    const r = clampRect({ x: 0, y: 0, w: 5000, h: 5000 }, 1000, 700);
    expect([r.w, r.h]).toEqual([1000, 700]);
  });
});

describe('tileRects', () => {
  it('covers the stage without gaps or overlap', () => {
    for (const n of [1, 2, 3, 4, 5, 7]) {
      const rects = tileRects(n, 1000, 700);
      expect(rects).toHaveLength(n);
      const area = rects.reduce((a, r) => a + r.w * r.h, 0);
      expect(area).toBe(1000 * 700);
    }
    expect(tileRects(2, 1000, 700).map((r) => r.w)).toEqual([500, 500]);
  });
});

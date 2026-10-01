import { describe, expect, it } from 'vitest';
import { BUDGETS, checkBudgets, percentile } from './budgets';

describe('budgets', () => {
  it('passes values within the limit and fails values over it', () => {
    const r = checkBudgets({ coldOpenMs: BUDGETS.coldOpenMs.max, switchMs: BUDGETS.switchMs.max + 1, suspendedCanvases: 0 });
    expect(r.find((x) => x.name === 'coldOpenMs')!.ok).toBe(true);
    expect(r.find((x) => x.name === 'switchMs')!.ok).toBe(false);
    expect(r.find((x) => x.name === 'suspendedCanvases')!.ok).toBe(true);
  });
  it('leaves unmeasured budgets out', () => {
    expect(checkBudgets({})).toEqual([]);
    expect(checkBudgets({ coldOpenMs: NaN })).toEqual([]);
  });
  it('computes percentiles', () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
  });
});

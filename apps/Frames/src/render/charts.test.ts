import { describe, expect, it } from 'vitest';
import { applyChartCsv, chartDataToCsv, niceScale } from './charts';
import type { ChartEl } from '../model/types';

const chart = (over: Partial<ChartEl> = {}): ChartEl => ({
  id: 'c', type: 'chart', x: 0, y: 0, w: 800, h: 500, rot: 0, opacity: 1,
  kind: 'column', categories: ['Q1', 'Q2'], series: [{ name: 'Sales', values: [1, 2.5] }, { name: 'Cost', values: [3, 4], color: '@danger' }],
  legend: 'bottom', grid: true, labels: false, stacked: false, smooth: false,
  base: { font: '@body', size: 24, weight: 400, color: '@text', align: 'left', lh: 1.2, ls: 0 },
  ...over,
});

describe('chart csv', () => {
  it('exports header row and category column', () => {
    expect(chartDataToCsv(chart())).toBe(',Sales,Cost\nQ1,1,3\nQ2,2.5,4');
  });

  it('round-trips and keeps series colours', () => {
    const el = chart();
    const out = applyChartCsv(el, chartDataToCsv(el));
    expect(out.categories).toEqual(['Q1', 'Q2']);
    expect(out.series.map((s) => s.values)).toEqual([[1, 2.5], [3, 4]]);
    expect(out.series[1]!.color).toBe('@danger');
  });

  it('quotes fields that need it', () => {
    const el = chart({ categories: ['a,b', 'say "hi"'], series: [{ name: 'x\ty', values: [1, 2] }] });
    const csv = chartDataToCsv(el);
    const out = applyChartCsv(el, csv);
    expect(out.categories).toEqual(['a,b', 'say "hi"']);
    expect(out.series[0]!.name).toBe('x\ty');
  });

  it('parses tab-separated data and non-numeric cells', () => {
    const out = applyChartCsv(chart({ series: [] }), 'Month\tA\tB\nJan\t10\toops\nFeb\t$1,200\t3\n\n');
    expect(out.categories).toEqual(['Jan', 'Feb']);
    expect(out.series[0]).toEqual({ name: 'A', values: [10, 1200] });
    expect(out.series[1]!.values).toEqual([0, 3]);
  });

  it('handles CRLF, quoted newlines, short rows and empty input', () => {
    const out = applyChartCsv(chart({ series: [] }), '"",A,\r\n"x\ny",1\r\nz,2,3\r\n');
    expect(out.categories).toEqual(['x\ny', 'z']);
    expect(out.series).toEqual([{ name: 'A', values: [1, 2] }, { name: 'Series 2', values: [0, 3] }]);
    expect(applyChartCsv(chart(), '')).toEqual({ categories: [], series: [] });
    expect(applyChartCsv(chart(), 'only,header').series[0]!.values).toEqual([]);
  });
});

describe('niceScale', () => {
  it('produces round ticks that cover the data', () => {
    const s = niceScale(0, 87, 6);
    expect(s.min).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(87);
    expect(s.ticks.every((t) => Number.isInteger(t / s.step))).toBe(true);
  });
  it('survives degenerate ranges', () => {
    for (const [a, b] of [[0, 0], [5, 5], [-3, 0], [NaN, 1], [0, 1e-9]] as const) {
      const s = niceScale(a, b, 5);
      expect(Number.isFinite(s.min) && Number.isFinite(s.max) && s.step > 0 && s.ticks.length > 0).toBe(true);
    }
  });
});

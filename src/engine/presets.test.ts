import { describe, expect, it } from 'vitest';
import { bohrModel, MAX_ENERGY_LEVELS } from './presets';

const opts = { cx: 100, cy: 50, unit: 1, color: 'label' };
const rings = (n: number) => bohrModel(n, opts).filter((e) => e.type === 'shape');

describe('Bohr model preset', () => {
  it('draws the nucleus plus one ring per energy level', () => {
    expect(rings(1)).toHaveLength(2);
    expect(rings(3)).toHaveLength(4);
  });

  it('caps energy levels at five and floors at one', () => {
    expect(rings(9)).toHaveLength(MAX_ENERGY_LEVELS + 1);
    expect(rings(0)).toHaveLength(2);
  });

  it('keeps rings concentric and labels p/n inside the nucleus', () => {
    const els = bohrModel(2, opts);
    for (const r of els.filter((e) => e.type === 'shape')) {
      if (r.type !== 'shape') continue;
      expect((r.x1 + r.x2) / 2).toBe(100);
      expect((r.y1 + r.y2) / 2).toBe(50);
    }
    const labels = els.filter((e) => e.type === 'text').map((e) => (e.type === 'text' ? e.text : ''));
    expect(labels).toEqual(['p =', 'n =']);
    expect(new Set(els.map((e) => e.id)).size).toBe(els.length);
  });

  it('scales with zoom so it lands at a readable size', () => {
    const [a] = bohrModel(1, opts);
    const [b] = bohrModel(1, { ...opts, unit: 2 });
    if (a.type !== 'shape' || b.type !== 'shape') throw new Error('expected nucleus');
    expect(b.x2 - b.x1).toBe((a.x2 - a.x1) * 2);
  });
});

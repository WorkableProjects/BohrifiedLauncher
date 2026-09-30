import { describe, expect, it } from 'vitest';
import { bohrModel, electronConfiguration, fillSubshells, lewisDot, MAX_VALENCE, orbitalCapacity, orbitalDiagram, snapToRing, SUBSHELLS, MAX_ENERGY_LEVELS } from './presets';

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

describe('snapToRing', () => {
  const els = bohrModel(2, { cx: 0, cy: 0, unit: 1, color: 'label' });
  it('puts a dot dropped near an orbit exactly on it', () => {
    // Second ring radius: 56 + 2 * 40 = 136.
    const p = snapToRing(els, { x: 130, y: 5 }, 16);
    expect(p.snapped).toBe(true);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(136, 5);
  });
  it('leaves a dot alone when no ring is close', () => {
    expect(snapToRing(els, { x: 300, y: 300 }, 16)).toEqual({ x: 300, y: 300, snapped: false });
  });
  it('picks the nearest of several rings', () => {
    const p = snapToRing(els, { x: 100, y: 0 }, 16); // ring 1 at 96
    expect(p.x).toBeCloseTo(96, 5);
  });
});

describe('Bohr model QMM', () => {
  it('drops the p = and n = labels but keeps the rings', () => {
    const els = bohrModel(3, opts, { qmm: true });
    expect(els.filter((e) => e.type === 'text')).toHaveLength(0);
    expect(els.filter((e) => e.type === 'shape')).toHaveLength(4);
  });
});

describe('orbital diagram', () => {
  const boxes = (through: string, n = 0) => orbitalDiagram(through, n, opts).filter((e) => e.type === 'shape' && e.kind === 'rect');
  const arrows = (through: string, n: number) => orbitalDiagram(through, n, opts).filter((e) => e.type === 'shape' && e.kind === 'arrow');

  it('lists subshells 1s through 7p in filling order', () => {
    expect(SUBSHELLS.map((s) => s.id).slice(0, 8)).toEqual(['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p']);
    expect(SUBSHELLS.at(-1)?.id).toBe('7p');
    expect(SUBSHELLS).toHaveLength(19);
  });
  it('has one box per orbital up to the chosen subshell', () => {
    expect(boxes('1s')).toHaveLength(1);
    expect(boxes('2p')).toHaveLength(5);
    expect(boxes('7p')).toHaveLength(59);
  });
  it('holds two electrons per orbital', () => {
    expect(orbitalCapacity('1s')).toBe(2);
    expect(orbitalCapacity('4p')).toBe(36);
    expect(orbitalCapacity('7p')).toBe(118);
  });
  it('fills by Aufbau order', () => {
    expect([...fillSubshells(21, '7p')].filter(([, k]) => k).map(([id, k]) => `${id}${k}`)).toEqual(['1s2', '2s2', '2p6', '3s2', '3p6', '4s2', '3d1']);
    expect(electronConfiguration(8, '7p')).toBe('1s² 2s² 2p⁴');
  });
  it('follows Hund\'s rule: singles first, then pairs', () => {
    expect(arrows('2p', 4 + 3)).toHaveLength(7); // 1s2 2s2 2p3
    expect(arrows('2p', 4 + 4)).toHaveLength(8); // one p box now paired
    expect(arrows('2p', 0)).toHaveLength(0);
  });
  it('never exceeds capacity', () => {
    expect(arrows('1s', 50)).toHaveLength(2);
  });
});

describe('Lewis dot', () => {
  const dots = (v: number) => lewisDot('C', v, opts).filter((e) => e.type === 'dot');
  it('places one dot per valence electron, up to eight', () => {
    expect(dots(4)).toHaveLength(4);
    expect(dots(MAX_VALENCE + 5)).toHaveLength(MAX_VALENCE);
    expect(dots(0)).toHaveLength(0);
  });
  it('spreads four singles around the symbol before pairing', () => {
    const at = new Set(dots(4).map((d) => (d.type === 'dot' ? `${d.x},${d.y}` : '')));
    expect(at.size).toBe(4);
  });
  it('keeps the element symbol as editable text', () => {
    expect(lewisDot('Na', 1, opts).find((e) => e.type === 'text')).toMatchObject({ text: 'Na' });
  });
});

import { describe, expect, it } from 'vitest';
import { CATEGORY_LABEL, lewisElectrons, ELEMENTS, chargeText, configFor, configText, element, elementBySymbol, groundState, groupLabel, highestSubshell, massText, neutronCount, shellCounts, shorthandConfig, valenceElectrons } from './elements';
import { bohrModel, elementTile, lewisDot, orbitalCapacity, orbitalDiagramOf } from './presets';

const opts = { cx: 0, cy: 0, unit: 1, color: 'label' };
const cfg = (z: number, e = z) => configText(configFor(z, e), 'level');

describe('periodic table data (CA Chemistry Reference Sheet)', () => {
  it('has 118 elements in order with unique symbols', () => {
    expect(ELEMENTS).toHaveLength(118);
    ELEMENTS.forEach((e, i) => expect(e.z).toBe(i + 1));
    expect(new Set(ELEMENTS.map((e) => e.symbol)).size).toBe(118);
  });
  it('matches the sheet for spot checks', () => {
    const at = (z: number) => `${element(z)!.symbol} ${element(z)!.name} ${massText(element(z)!)}`;
    expect(at(1)).toBe('H Hydrogen 1.01');
    expect(at(13)).toBe('Al Aluminum 26.98');
    expect(at(24)).toBe('Cr Chromium 52.00');
    expect(at(43)).toBe('Tc Technetium (98)');
    expect(at(55)).toBe('Cs Cesium 132.91');
    expect(at(82)).toBe('Pb Lead 207.2');
    expect(at(113)).toBe('Uut Ununtrium (286)');
    expect(at(118)).toBe('Uuo Ununoctium (294)');
  });
  it('places elements in the sheet layout', () => {
    expect([element(1)!.group, element(2)!.group]).toEqual([1, 18]);
    expect([element(5)!.group, element(10)!.group]).toEqual([13, 18]);
    expect([element(21)!.group, element(30)!.group, element(36)!.group]).toEqual([3, 12, 18]);
    expect([element(57)!.group, element(58)!.group, element(71)!.group, element(72)!.group]).toEqual([3, null, null, 4]);
    expect([element(89)!.group, element(103)!.group, element(104)!.group, element(118)!.group]).toEqual([3, null, 4, 18]);
    expect([element(11)!.period, element(55)!.period, element(87)!.period]).toEqual([3, 6, 7]);
    expect([groupLabel(1), groupLabel(13), groupLabel(17), groupLabel(5), groupLabel(9), groupLabel(11), groupLabel(12), groupLabel(null)]).toEqual(['1A', '3A', '7A', '5B', '8B', '1B', '2B', '—']);
  });
  it('classifies elements, with the metalloid staircase from the sheet', () => {
    const cat = (s: string) => elementBySymbol(s)!.category;
    expect(['B', 'Si', 'Ge', 'As', 'Sb', 'Te'].map(cat).every((c) => c === 'metalloid')).toBe(true);
    expect([cat('Na'), cat('Ca'), cat('Fe'), cat('Al'), cat('C'), cat('Cl'), cat('Ar'), cat('Ce'), cat('U'), cat('H')]).toEqual([
      'alkali-metal', 'alkaline-earth-metal', 'transition-metal', 'post-transition-metal', 'nonmetal', 'halogen', 'noble-gas', 'lanthanide', 'actinide', 'nonmetal',
    ]);
    ELEMENTS.forEach((e) => expect(CATEGORY_LABEL[e.category]).toBeTruthy());
  });
  it('derives neutrons from the rounded mass', () => {
    expect(neutronCount(elementBySymbol('C')!)).toBe(6);
    expect(neutronCount(elementBySymbol('Na')!)).toBe(12);
    expect(neutronCount(elementBySymbol('Cl')!)).toBe(18);
  });
  it('looks elements up by symbol, ignoring case', () => {
    expect(elementBySymbol('fe')!.z).toBe(26);
    expect(elementBySymbol('Zz')).toBeUndefined();
  });
});

describe('electron configurations', () => {
  it('follows Aufbau for ordinary atoms', () => {
    expect(cfg(1)).toBe('1s¹');
    expect(cfg(11)).toBe('1s² 2s² 2p⁶ 3s¹');
    expect(cfg(26)).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁶ 4s²');
    expect(configText(configFor(26, 26))).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d⁶');
  });
  it('totals the atomic number for every element', () => {
    for (const e of ELEMENTS) {
      const total = [...groundState(e.z).values()].reduce((a, b) => a + b, 0);
      expect(total, e.symbol).toBe(e.z);
      for (const [id, k] of groundState(e.z)) expect(k, `${e.symbol} ${id}`).toBeGreaterThanOrEqual(0);
    }
  });
  it('never overfills a subshell', () => {
    const cap = (id: string) => ({ s: 2, p: 6, d: 10, f: 14 })[id[1] as 's'];
    for (const e of ELEMENTS) for (const [id, k] of groundState(e.z)) expect(k, `${e.symbol} ${id}`).toBeLessThanOrEqual(cap(id));
  });
  it('knows the textbook exceptions', () => {
    expect(configText(groundState(24))).toContain('4s¹ 3d⁵');
    expect(configText(groundState(29))).toContain('4s¹ 3d¹⁰');
    expect(configText(groundState(46))).toContain('4d¹⁰');
    expect(configText(groundState(46))).not.toContain('5s');
    expect(configText(groundState(47))).toContain('5s¹ 4d¹⁰');
    expect(configText(groundState(79))).toContain('6s¹');
    expect(groundState(57).get('5d')).toBe(1);
  });
  it('uses noble-gas shorthand', () => {
    expect(shorthandConfig(11, configFor(11, 11))).toBe('[Ne] 3s¹');
    expect(shorthandConfig(34, configFor(34, 34))).toBe('[Ar] 4s² 3d¹⁰ 4p⁴');
    expect(shorthandConfig(1, configFor(1, 1))).toBe('1s¹');
  });
  it('removes cation electrons from the outermost level first', () => {
    expect(cfg(11, 10)).toBe('1s² 2s² 2p⁶'); // Na⁺
    expect(cfg(26, 24)).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁶'); // Fe²⁺ loses 4s before 3d
    expect(cfg(26, 23)).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁵'); // Fe³⁺
    expect(cfg(50, 48)).toContain('5s²'); // Sn²⁺ loses 5p
    expect(cfg(50, 48)).not.toContain('5p');
  });
  it('fills anions in Aufbau order', () => {
    expect(cfg(17, 18)).toBe('1s² 2s² 2p⁶ 3s² 3p⁶'); // Cl⁻
    expect(valenceElectrons(configFor(17, 18))).toBe(8);
  });
  it('draws Lewis dots the way chemistry classes do', () => {
    expect([lewisElectrons(11, 11), lewisElectrons(11, 10), lewisElectrons(12, 10), lewisElectrons(13, 10)]).toEqual([1, 0, 0, 0]);
    expect([lewisElectrons(17, 17), lewisElectrons(17, 18), lewisElectrons(8, 10)]).toEqual([7, 8, 8]);
    expect([lewisElectrons(50, 48), lewisElectrons(26, 24), lewisElectrons(2, 2)]).toEqual([2, 0, 2]);
  });
  it('reports energy-level populations and valence electrons', () => {
    expect(shellCounts(configFor(11, 11))).toEqual([2, 8, 1]);
    expect(shellCounts(configFor(26, 26))).toEqual([2, 8, 14, 2]);
    expect(shellCounts(configFor(118, 118))).toEqual([2, 8, 18, 32, 32, 18, 8]);
    expect(valenceElectrons(configFor(6, 6))).toBe(4);
    expect(valenceElectrons(configFor(2, 2))).toBe(2);
    expect(valenceElectrons(configFor(35, 35))).toBe(7);
    expect(highestSubshell(configFor(26, 26))).toBe('3d');
    expect(highestSubshell(configFor(11, 11))).toBe('3s');
  });
  it('clamps the electron count', () => {
    expect([...configFor(6, 999).values()].reduce((a, b) => a + b, 0)).toBe(orbitalCapacity('7p'));
    expect([...configFor(6, -4).values()].reduce((a, b) => a + b, 0)).toBe(0);
  });
  it('writes ion charges', () => {
    expect([chargeText(0), chargeText(1), chargeText(-1), chargeText(2), chargeText(-3)]).toEqual(['', '⁺', '⁻', '²⁺', '³⁻']);
  });
});

describe('representations of a real element', () => {
  it('draws the Bohr model with electrons on each ring and filled-in labels', () => {
    const shells = shellCounts(configFor(11, 11));
    const els = bohrModel(0, opts, { shells, protons: 11, neutrons: 12 });
    expect(els.filter((e) => e.type === 'shape')).toHaveLength(shells.length + 1);
    expect(els.filter((e) => e.type === 'dot')).toHaveLength(11);
    expect(els.filter((e) => e.type === 'text').map((e) => (e.type === 'text' ? e.text : ''))).toEqual(['p = 11', 'n = 12']);
    // Each electron sits exactly on its ring.
    const radii = [56 + 40, 56 + 80, 56 + 120];
    const dotRadii = els.filter((e) => e.type === 'dot').map((e) => (e.type === 'dot' ? Math.hypot(e.x, e.y) : 0));
    expect(dotRadii.slice(0, 2).every((r) => Math.abs(r - radii[0]) < 1e-6)).toBe(true);
    expect(Math.abs(dotRadii[10] - radii[2])).toBeLessThan(1e-6);
  });
  it('supports seven rings for the heaviest elements', () => {
    const els = bohrModel(0, opts, { shells: shellCounts(configFor(118, 118)) });
    expect(els.filter((e) => e.type === 'shape')).toHaveLength(8);
    expect(els.filter((e) => e.type === 'dot')).toHaveLength(118);
  });
  it('leaves electrons off in QMM', () => {
    const els = bohrModel(0, opts, { shells: [2, 8, 1], qmm: true });
    expect(els.filter((e) => e.type === 'dot')).toHaveLength(0);
    expect(els.filter((e) => e.type === 'text')).toHaveLength(0);
  });
  it('draws orbital arrows by Hund and Pauli for an element', () => {
    const arrows = (z: number, through: string) =>
      orbitalDiagramOf(through, configFor(z, z), opts).filter((e) => e.type === 'shape' && e.kind === 'arrow' && Math.abs(e.y2 - e.y1) < 40 && e.size < 3);
    // Carbon 2p²: two up arrows, none paired. Nitrogen 2p³: three up. Oxygen 2p⁴: one pair.
    const count = (z: number) => arrows(z, '2p').length;
    expect(count(6)).toBe(6); // 1s² 2s² 2p² = 2+2+2 arrows
    expect(count(7)).toBe(7);
    expect(count(8)).toBe(8);
    const up = (z: number) => arrows(z, '2p').filter((e) => e.type === 'shape' && e.y2 < e.y1).length;
    const down = (z: number) => arrows(z, '2p').filter((e) => e.type === 'shape' && e.y2 > e.y1).length;
    expect([up(7), down(7)]).toEqual([5, 2]); // 1s,2s pairs + three unpaired 2p
    expect([up(8), down(8)]).toEqual([5, 3]);
  });
  it('shows ion charge beside the Lewis symbol', () => {
    const els = lewisDot('Na', 0, opts, '⁺');
    expect(els.filter((e) => e.type === 'text').map((e) => (e.type === 'text' ? e.text : ''))).toEqual(['Na', '⁺']);
    expect(lewisDot('Cl', 8, opts, '⁻').filter((e) => e.type === 'dot')).toHaveLength(8);
  });
  it('builds an element tile with number, symbol, name and mass', () => {
    const texts = elementTile({ z: 11, symbol: 'Na', name: 'Sodium', mass: '22.99' }, opts).filter((e) => e.type === 'text').map((e) => (e.type === 'text' ? e.text : ''));
    expect(texts).toEqual(['11', 'Na', 'Sodium', '22.99']);
  });
});

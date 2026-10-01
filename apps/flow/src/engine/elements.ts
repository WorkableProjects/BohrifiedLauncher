import { SUBSHELLS, orbitalCapacity } from './presets';

/**
 * The periodic table as printed on the California Standards Test Chemistry
 * Reference Sheet (California Department of Education, © 2003, updated 2012
 * using Wikipedia data). Names, symbols, spellings (Cesium, Aluminum) and
 * average atomic masses follow that sheet exactly, including its provisional
 * names for 113, 115, 117 and 118. A mass in parentheses is the atomic mass
 * of the element's most stable isotope.
 */

export type ElementCategory =
  | 'alkali-metal'
  | 'alkaline-earth-metal'
  | 'transition-metal'
  | 'post-transition-metal'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble-gas'
  | 'lanthanide'
  | 'actinide';

export interface ChemElement {
  /** Atomic number (protons). */
  z: number;
  symbol: string;
  name: string;
  /** Average atomic mass, or the most stable isotope's mass number when `massIsIsotope`. */
  mass: number;
  /** True when the sheet prints the mass in parentheses. */
  massIsIsotope: boolean;
  /** 1–18 (null for the lanthanides and actinides, which the sheet prints in two rows below the table). */
  group: number | null;
  period: number;
  category: ElementCategory;
}

export const SOURCE = 'California Department of Education, Chemistry Reference Sheet (California Standards Test), © 2003, updated 2012';

// "Z Symbol Name mass" — a mass written like (98) is a most-stable-isotope mass.
const RAW = `1 H Hydrogen 1.01|2 He Helium 4.00|3 Li Lithium 6.94|4 Be Beryllium 9.01|5 B Boron 10.81|6 C Carbon 12.01|7 N Nitrogen 14.01|8 O Oxygen 16.00|9 F Fluorine 19.00|10 Ne Neon 20.18|
11 Na Sodium 22.99|12 Mg Magnesium 24.31|13 Al Aluminum 26.98|14 Si Silicon 28.09|15 P Phosphorus 30.97|16 S Sulfur 32.07|17 Cl Chlorine 35.45|18 Ar Argon 39.95|
19 K Potassium 39.10|20 Ca Calcium 40.08|21 Sc Scandium 44.96|22 Ti Titanium 47.87|23 V Vanadium 50.94|24 Cr Chromium 52.00|25 Mn Manganese 54.94|26 Fe Iron 55.85|27 Co Cobalt 58.93|28 Ni Nickel 58.69|29 Cu Copper 63.55|30 Zn Zinc 65.39|31 Ga Gallium 69.72|32 Ge Germanium 72.61|33 As Arsenic 74.92|34 Se Selenium 78.96|35 Br Bromine 79.90|36 Kr Krypton 83.80|
37 Rb Rubidium 85.47|38 Sr Strontium 87.62|39 Y Yttrium 88.91|40 Zr Zirconium 91.22|41 Nb Niobium 92.91|42 Mo Molybdenum 95.94|43 Tc Technetium (98)|44 Ru Ruthenium 101.07|45 Rh Rhodium 102.91|46 Pd Palladium 106.42|47 Ag Silver 107.87|48 Cd Cadmium 112.41|49 In Indium 114.82|50 Sn Tin 118.71|51 Sb Antimony 121.76|52 Te Tellurium 127.60|53 I Iodine 126.90|54 Xe Xenon 131.29|
55 Cs Cesium 132.91|56 Ba Barium 137.33|57 La Lanthanum 138.91|58 Ce Cerium 140.12|59 Pr Praseodymium 140.91|60 Nd Neodymium 144.24|61 Pm Promethium (145)|62 Sm Samarium 150.36|63 Eu Europium 151.96|64 Gd Gadolinium 157.25|65 Tb Terbium 158.93|66 Dy Dysprosium 162.50|67 Ho Holmium 164.93|68 Er Erbium 167.26|69 Tm Thulium 168.93|70 Yb Ytterbium 173.04|71 Lu Lutetium 174.97|
72 Hf Hafnium 178.49|73 Ta Tantalum 180.95|74 W Tungsten 183.84|75 Re Rhenium 186.21|76 Os Osmium 190.23|77 Ir Iridium 192.22|78 Pt Platinum 195.08|79 Au Gold 196.97|80 Hg Mercury 200.59|81 Tl Thallium 204.38|82 Pb Lead 207.2|83 Bi Bismuth 208.98|84 Po Polonium (209)|85 At Astatine (210)|86 Rn Radon (222)|
87 Fr Francium (223)|88 Ra Radium (226)|89 Ac Actinium (227)|90 Th Thorium 232.04|91 Pa Protactinium 231.04|92 U Uranium 238.03|93 Np Neptunium (237)|94 Pu Plutonium (244)|95 Am Americium (243)|96 Cm Curium (247)|97 Bk Berkelium (247)|98 Cf Californium (251)|99 Es Einsteinium (252)|100 Fm Fermium (257)|101 Md Mendelevium (258)|102 No Nobelium (259)|103 Lr Lawrencium (262)|
104 Rf Rutherfordium (261)|105 Db Dubnium (262)|106 Sg Seaborgium (266)|107 Bh Bohrium (264)|108 Hs Hassium (269)|109 Mt Meitnerium (268)|110 Ds Darmstadtium (281)|111 Rg Roentgenium (281)|112 Cn Copernicium (285)|113 Uut Ununtrium (286)|114 Fl Flerovium (289)|115 Uup Ununpentium (294)|116 Lv Livermorium (293)|117 Uus Ununseptium (294)|118 Uuo Ununoctium (294)`;

/** Period 1–7 and group 1–18 (null for f-block) from the atomic number. */
function place(z: number): { period: number; group: number | null } {
  const rows = [2, 8, 8, 18, 18, 32, 32];
  let start = 1;
  for (let p = 0; p < rows.length; p++) {
    const end = start + rows[p] - 1;
    if (z <= end) {
      const i = z - start;
      if (p <= 2) return { period: p + 1, group: p === 0 ? (i === 0 ? 1 : 18) : i < 2 ? i + 1 : i + 11 };
      if (p <= 4) return { period: p + 1, group: i + 1 };
      // Periods 6 and 7: La/Ac sit in group 3; the other f-block elements have no group on the sheet.
      if (i < 2) return { period: p + 1, group: i + 1 };
      if (i === 2) return { period: p + 1, group: 3 };
      if (i < 17) return { period: p + 1, group: null };
      return { period: p + 1, group: i - 13 };
    }
    start = end + 1;
  }
  return { period: 7, group: 18 };
}

// The sheet's heavy staircase line puts these on the metalloid boundary.
const METALLOIDS = new Set([5, 14, 32, 33, 51, 52]);
const NONMETALS = new Set([1, 6, 7, 8, 15, 16, 34]);

function categorize(z: number, group: number | null): ElementCategory {
  if (z >= 57 && z <= 71 && z !== 57) return 'lanthanide';
  if (z >= 89 && z <= 103 && z !== 89) return 'actinide';
  if (z === 57) return 'lanthanide';
  if (z === 89) return 'actinide';
  if (METALLOIDS.has(z)) return 'metalloid';
  if (group === 18) return 'noble-gas';
  if (group === 17) return 'halogen';
  if (NONMETALS.has(z)) return 'nonmetal';
  if (group === 1) return z === 1 ? 'nonmetal' : 'alkali-metal';
  if (group === 2) return 'alkaline-earth-metal';
  if (group !== null && group >= 3 && group <= 12) return 'transition-metal';
  return 'post-transition-metal';
}

export const ELEMENTS: readonly ChemElement[] = RAW.split('|').map((row) => {
  const [zs, symbol, name, m] = row.trim().split(' ');
  const z = Number(zs);
  const { period, group } = place(z);
  const massIsIsotope = m.startsWith('(');
  return { z, symbol, name, mass: Number(m.replace(/[()]/g, '')), massIsIsotope, group, period, category: categorize(z, group) };
});

export const element = (z: number): ChemElement | undefined => ELEMENTS[z - 1];
export const elementBySymbol = (s: string) => ELEMENTS.find((e) => e.symbol.toLowerCase() === s.trim().toLowerCase());

/** Mass as the sheet prints it: "22.99", or "(98)" for a most-stable-isotope mass. */
export function massText(e: ChemElement): string {
  if (e.massIsIsotope) return `(${e.mass})`;
  // The sheet prints two decimals ("52.00") except Pb ("207.2").
  return e.z === 82 ? '207.2' : e.mass.toFixed(2);
}

/** Neutrons in the common isotope: mass number (rounded) minus protons. */
export const neutronCount = (e: ChemElement) => Math.max(0, Math.round(e.mass) - e.z);

export const CATEGORY_LABEL: Record<ElementCategory, string> = {
  'alkali-metal': 'Alkali metal',
  'alkaline-earth-metal': 'Alkaline earth metal',
  'transition-metal': 'Transition metal',
  'post-transition-metal': 'Post-transition metal',
  metalloid: 'Metalloid',
  nonmetal: 'Nonmetal',
  halogen: 'Halogen',
  'noble-gas': 'Noble gas',
  lanthanide: 'Lanthanide',
  actinide: 'Actinide',
};

/** The sheet's group names: 1A–8A for the tall columns, 3B–7B, 8B, 1B, 2B for the middle. */
export function groupLabel(group: number | null): string {
  if (group === null) return '—';
  if (group <= 2) return `${group}A`;
  if (group >= 13) return `${group - 10}A`;
  if (group <= 7) return `${group}B`;
  if (group <= 10) return '8B';
  return group === 11 ? '1B' : '2B';
}

// ─── Electron configuration ───────────────────────────────────────────

/** Ground states that break the Aufbau order, as NIST lists them: subshell → electrons (others follow Aufbau). */
const EXCEPTIONS: Record<number, Record<string, number>> = {
  24: { '4s': 1, '3d': 5 },
  29: { '4s': 1, '3d': 10 },
  41: { '5s': 1, '4d': 4 },
  42: { '5s': 1, '4d': 5 },
  44: { '5s': 1, '4d': 7 },
  45: { '5s': 1, '4d': 8 },
  46: { '5s': 0, '4d': 10 },
  47: { '5s': 1, '4d': 10 },
  57: { '4f': 0, '5d': 1 },
  58: { '4f': 1, '5d': 1 },
  64: { '4f': 7, '5d': 1 },
  78: { '6s': 1, '4f': 14, '5d': 9 },
  79: { '6s': 1, '4f': 14, '5d': 10 },
  89: { '5f': 0, '6d': 1 },
  90: { '5f': 0, '6d': 2 },
  91: { '5f': 2, '6d': 1 },
  92: { '5f': 3, '6d': 1 },
  93: { '5f': 4, '6d': 1 },
  96: { '5f': 7, '6d': 1 },
  103: { '5f': 14, '6d': 0, '7p': 1 },
};

const aufbau = (electrons: number): Map<string, number> => {
  const out = new Map<string, number>();
  let left = Math.max(0, Math.min(Math.round(electrons), orbitalCapacity('7p')));
  for (const s of SUBSHELLS) {
    const k = Math.min(left, s.boxes * 2);
    out.set(s.id, k);
    left -= k;
  }
  return out;
};

/** Ground-state electrons per subshell for the neutral atom with `z` electrons. */
export function groundState(z: number): Map<string, number> {
  const counts = aufbau(z);
  // Each exception lists every subshell that differs from Aufbau, so the total stays `z`.
  for (const [id, k] of Object.entries(EXCEPTIONS[z] ?? {})) counts.set(id, k);
  return counts;
}

/**
 * Electrons per subshell for an atom or ion of element `z` holding
 * `electrons` electrons. Neutral: the ground state (with the usual
 * exceptions). Cations lose electrons from the highest energy level first
 * (4s before 3d, 5p before 5s); anions fill on in Aufbau order.
 */
export function configFor(z: number, electrons: number): Map<string, number> {
  const e = Math.max(0, Math.min(Math.round(electrons), orbitalCapacity('7p')));
  if (e === z) return groundState(z);
  if (e > z) return aufbau(e);
  const out = groundState(z);
  let left = z - e;
  const outermostFirst = [...SUBSHELLS].sort((a, b) => b.n - a.n || 'spdf'.indexOf(b.l) - 'spdf'.indexOf(a.l));
  for (const s of outermostFirst) {
    if (!left) break;
    const take = Math.min(out.get(s.id) ?? 0, left);
    out.set(s.id, (out.get(s.id) ?? 0) - take);
    left -= take;
  }
  return out;
}

/** The last subshell (in filling order) that holds any electron. */
export function highestSubshell(counts: ReadonlyMap<string, number>): string {
  let last = SUBSHELLS[0].id;
  for (const s of SUBSHELLS) if ((counts.get(s.id) ?? 0) > 0) last = s.id;
  return last;
}

/** Electrons in each occupied energy level (principal quantum number), innermost first: Na → [2, 8, 1]. */
export function shellCounts(counts: ReadonlyMap<string, number>): number[] {
  const byN = new Map<number, number>();
  for (const s of SUBSHELLS) byN.set(s.n, (byN.get(s.n) ?? 0) + (counts.get(s.id) ?? 0));
  const out: number[] = [];
  for (let n = 1; n <= 7; n++) out.push(byN.get(n) ?? 0);
  while (out.length && out[out.length - 1] === 0) out.pop();
  return out;
}

/** Electrons in the outermost occupied energy level (what Lewis dots show). */
export const valenceElectrons = (counts: ReadonlyMap<string, number>) => shellCounts(counts).at(-1) ?? 0;

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).replace(/\d/g, (d) => SUP[Number(d)]);

/** "1s² 2s² 2p⁶ …" in the order a chemistry class writes it (by energy level, then s, p, d, f). */
export function configText(counts: ReadonlyMap<string, number>, style: 'filling' | 'level' = 'filling'): string {
  const shown = SUBSHELLS.filter((s) => (counts.get(s.id) ?? 0) > 0);
  if (style === 'level') shown.sort((a, b) => a.n - b.n || 'spdf'.indexOf(a.l) - 'spdf'.indexOf(b.l));
  return shown.map((s) => s.id + sup(counts.get(s.id)!)).join(' ');
}

/** Noble-gas shorthand: [Ar] 4s² 3d¹⁰ 4p⁴. Falls back to the full form for H, He and ions of them. */
export function shorthandConfig(z: number, counts: ReadonlyMap<string, number>): string {
  const gases = [2, 10, 18, 36, 54, 86];
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const core = [...gases].reverse().find((g) => g < total && g < z);
  if (!core) return configText(counts);
  const coreCounts = groundState(core);
  // Only a core whose subshells are all still full counts.
  for (const [id, k] of coreCounts) if (k > 0 && (counts.get(id) ?? 0) < k) return configText(counts);
  const rest = new Map(counts);
  for (const [id, k] of coreCounts) rest.set(id, (rest.get(id) ?? 0) - k);
  return `[${ELEMENTS[core - 1].symbol}] ${configText(rest)}`.trim();
}

/**
 * Dots to draw in a Lewis structure. Neutral atoms and anions show the electrons
 * in their outermost level. Cations show what is left of the atom's valence
 * electrons (none for Na⁺, Mg²⁺, Al³⁺), as chemistry classes draw them.
 */
export function lewisElectrons(z: number, electrons: number): number {
  if (electrons < z) return Math.max(0, valenceElectrons(groundState(z)) - (z - electrons));
  return valenceElectrons(configFor(z, electrons));
}

/** Net charge of an ion: protons minus electrons. */
export const chargeOf = (z: number, electrons: number) => z - electrons;

const SUP_SIGN: Record<string, string> = { '+': '⁺', '-': '⁻' };
/** "2+", "−", "" → superscript text such as "²⁺". */
export function chargeText(charge: number): string {
  if (!charge) return '';
  const mag = Math.abs(charge);
  return (mag === 1 ? '' : sup(mag)) + SUP_SIGN[charge > 0 ? '+' : '-'];
}

import { uid } from './geometry';
import type { BoardElement, ColorToken, ShapeElement, TextElement } from './types';

/**
 * Science presets for the Elements app: ready-made diagrams built from
 * ordinary board elements, so everything stays editable, movable and
 * erasable after it's placed.
 */

export const MAX_ENERGY_LEVELS = 5;

export interface PresetOptions {
  /** World-space centre. */
  cx: number;
  cy: number;
  /** World units per screen pixel (1 / zoom), so presets land at a readable size. */
  unit: number;
  color: ColorToken;
}

/** Screen-px dimensions of the Bohr model. */
export const BOHR = { nucleus: 56, gap: 40, stroke: 2.5, label: 22, electron: 5 };

const circle = (cx: number, cy: number, r: number, color: ColorToken, size: number): ShapeElement => ({
  id: uid(),
  type: 'shape',
  kind: 'ellipse',
  x1: cx - r,
  y1: cy - r,
  x2: cx + r,
  y2: cy + r,
  color,
  size,
  fill: false,
});

const label = (text: string, x: number, y: number, fontSize: number, color: ColorToken): TextElement => ({
  id: uid(),
  type: 'text',
  x,
  y,
  text,
  spans: [{ text, marks: { bold: true } }],
  color,
  fontSize,
});

/** Most rings a Bohr model can have: periods 1–7. */
export const MAX_SHELLS = 7;

export interface BohrOptions {
  /** Quantum mechanical model: no p = / n = labels, and no electrons placed on orbits. */
  qmm?: boolean;
  /** Electrons in each energy level, innermost first. Draws one ring per entry and puts the electrons on them. */
  shells?: readonly number[];
  /** Fills in the nucleus labels ("p = 6") instead of leaving them blank. */
  protons?: number;
  neutrons?: number;
}

/**
 * Bohr model: a nucleus with "p =" and "n =" labels to fill in, surrounded
 * by one ring per energy level (1–5). With `qmm` (quantum mechanical model)
 * the labels are left off, so the rings stand alone. Given `shells`, it is
 * drawn for a real atom: a ring per occupied level with its electrons evenly
 * spaced on it, and the labels filled in from `protons` / `neutrons`.
 */
export function bohrModel(levels: number, o: PresetOptions, opts: BohrOptions = {}): BoardElement[] {
  const shells = opts.shells?.slice(0, MAX_SHELLS);
  const n = shells ? Math.max(1, shells.length) : Math.max(1, Math.min(MAX_ENERGY_LEVELS, Math.round(levels)));
  const u = o.unit;
  const size = BOHR.stroke * u;
  const nucleus = BOHR.nucleus * u;
  const els: BoardElement[] = [circle(o.cx, o.cy, nucleus, o.color, size)];
  for (let k = 1; k <= n; k++) els.push(circle(o.cx, o.cy, nucleus + k * BOHR.gap * u, o.color, size));
  if (shells && !opts.qmm) {
    shells.forEach((count, i) => {
      const r = nucleus + (i + 1) * BOHR.gap * u;
      // Start at the top and go clockwise; offset each ring a little so the dots don't line up in a spoke.
      for (let d = 0; d < count; d++) {
        const a = -Math.PI / 2 + (d / count) * Math.PI * 2 + (count === 1 ? Math.PI / 2 : 0);
        els.push({ id: uid(), type: 'dot', x: o.cx + r * Math.cos(a), y: o.cy + r * Math.sin(a), r: BOHR.electron * u, color: o.color });
      }
    });
  }
  if (opts.qmm) return els;
  const fs = BOHR.label * u;
  const x = o.cx - nucleus * 0.5;
  const p = opts.protons === undefined ? 'p =' : `p = ${opts.protons}`;
  const nn = opts.neutrons === undefined ? 'n =' : `n = ${opts.neutrons}`;
  els.push(label(p, x, o.cy - fs * 1.35, fs, o.color), label(nn, x, o.cy + fs * 0.1, fs, o.color));
  return els;
}

/** Outer radius in screen px, for previews and fitting. */
export const bohrRadius = (levels: number, max = MAX_ENERGY_LEVELS) => BOHR.nucleus + Math.min(max, Math.max(1, levels)) * BOHR.gap;

/**
 * Where a dot dropped at `p` should land: exactly on the nearest circle or
 * ellipse outline within `tol` (world units), otherwise where it was
 * dropped. Lets electrons sit neatly on Bohr model orbits.
 */
export function snapToRing(elements: readonly BoardElement[], p: { x: number; y: number }, tol: number): { x: number; y: number; snapped: boolean } {
  let best: { x: number; y: number } | null = null;
  let bestD = tol;
  for (const el of elements) {
    if (el.type !== 'shape' || el.kind !== 'ellipse') continue;
    const cx = (el.x1 + el.x2) / 2, cy = (el.y1 + el.y2) / 2;
    const rx = Math.abs(el.x2 - el.x1) / 2, ry = Math.abs(el.y2 - el.y1) / 2;
    if (rx < 1e-6 || ry < 1e-6) continue;
    const nx = (p.x - cx) / rx, ny = (p.y - cy) / ry;
    const len = Math.hypot(nx, ny);
    if (len < 1e-6) continue;
    const q = { x: cx + (rx * nx) / len, y: cy + (ry * ny) / len };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best ? { ...best, snapped: true } : { ...p, snapped: false };
}

// ─── Orbital (energy) diagrams ────────────────────────────────────────

export interface Subshell {
  /** e.g. "2p". */
  id: string;
  n: number;
  l: 's' | 'p' | 'd' | 'f';
  /** Orbitals (boxes): s 1, p 3, d 5, f 7. */
  boxes: number;
}

const BOXES = { s: 1, p: 3, d: 5, f: 7 } as const;

/** Subshells in Aufbau (filling) order, 1s through 7p. */
export const SUBSHELLS: readonly Subshell[] = (
  ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p'] as const
).map((id) => {
  const l = id[1] as Subshell['l'];
  return { id, n: Number(id[0]), l, boxes: BOXES[l] };
});

/** Electrons the subshells 1s … `through` (inclusive) can hold. */
export function orbitalCapacity(through: string): number {
  const end = SUBSHELLS.findIndex((s) => s.id === through);
  return SUBSHELLS.slice(0, end < 0 ? SUBSHELLS.length : end + 1).reduce((t, s) => t + s.boxes * 2, 0);
}

/** Per-subshell electron counts for `electrons`, filled in Aufbau order (Cr and Cu exceptions aside). */
export function fillSubshells(electrons: number, through: string): Map<string, number> {
  const out = new Map<string, number>();
  let left = Math.max(0, Math.min(Math.round(electrons), orbitalCapacity(through)));
  const end = SUBSHELLS.findIndex((s) => s.id === through);
  for (const s of SUBSHELLS.slice(0, end < 0 ? SUBSHELLS.length : end + 1)) {
    const k = Math.min(left, s.boxes * 2);
    out.set(s.id, k);
    left -= k;
  }
  return out;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).replace(/\d/g, (d) => SUP[Number(d)]);

/** "1s² 2s² 2p⁶ …", listing only subshells that hold electrons. */
export function electronConfiguration(electrons: number, through: string): string {
  return [...fillSubshells(electrons, through)].filter(([, k]) => k > 0).map(([id, k]) => id + sup(k)).join(' ');
}

/** Screen-px dimensions of the orbital diagram. */
export const ORBITAL = { box: 34, boxGap: 6, row: 46, labelW: 40, groupGap: 52, axisW: 60, stroke: 2, arrow: 2.25 };

const ORBITAL_TYPES = ['s', 'p', 'd', 'f'] as const;

/** Layout in screen px: s, p, d, f boxes each sit in their own column group, left to right. */
function orbitalLayout(through: string) {
  const end = SUBSHELLS.findIndex((s) => s.id === through);
  const shown = SUBSHELLS.slice(0, end < 0 ? SUBSHELLS.length : end + 1);
  const { box, boxGap, row, groupGap, axisW } = ORBITAL;
  const startX = new Map<Subshell['l'], number>();
  let x = axisW;
  for (const l of ORBITAL_TYPES) {
    const n = Math.max(0, ...shown.filter((s) => s.l === l).map((s) => s.boxes));
    if (!n) continue;
    startX.set(l, x);
    x += n * box + (n - 1) * boxGap + groupGap;
  }
  return { shown, startX, w: x - groupGap, h: (shown.length - 1) * row + box };
}

/**
 * Energy orbital diagram: one row per subshell from 1s (bottom) up to
 * `through` (top), a box per orbital, and up/down arrows for `electrons`
 * placed by Aufbau, Hund's rule and the Pauli principle (0 = empty boxes).
 * s, p, d and f boxes sit in successive columns left to right, and an
 * "Increasing Energy" arrow runs up the left side.
 */
export function orbitalDiagram(through: string, electrons: number, o: PresetOptions): BoardElement[] {
  return orbitalDiagramOf(through, fillSubshells(electrons, through), o);
}

/**
 * The same diagram for explicit electrons per subshell (e.g. a real
 * element's ground state, exceptions included). Arrows follow Hund's rule
 * and the Pauli principle: every box gets one up arrow before any gets a down arrow.
 */
export function orbitalDiagramOf(through: string, filled: ReadonlyMap<string, number>, o: PresetOptions): BoardElement[] {
  const u = o.unit;
  const { box, boxGap, row, labelW } = ORBITAL;
  const { shown, startX, w, h } = orbitalLayout(through);
  const left = o.cx - (w * u) / 2;
  const top = o.cy - (h * u) / 2;
  const els: BoardElement[] = [];
  const axisX = left + 12 * u;
  els.push({ id: uid(), type: 'shape', kind: 'arrow', x1: axisX, y1: top + h * u, x2: axisX, y2: top - 26 * u, color: o.color, size: ORBITAL.stroke * u, fill: false });
  els.push(label('Increasing Energy', left, top - 26 * u - 18 * u * 1.6, 16 * u, o.color));
  shown.forEach((s, i) => {
    const y = top + ((shown.length - 1 - i) * row) * u;
    const x0 = left + (startX.get(s.l) ?? 0) * u;
    els.push(label(s.id, x0 - labelW * u, y + box * u * 0.5 - 9 * u * 1.3, 18 * u, o.color));
    const count = filled.get(s.id) ?? 0;
    for (let b = 0; b < s.boxes; b++) {
      const x = x0 + b * (box + boxGap) * u;
      els.push({ id: uid(), type: 'shape', kind: 'rect', x1: x, y1: y, x2: x + box * u, y2: y + box * u, color: o.color, size: ORBITAL.stroke * u, fill: false });
      // Hund's rule: one up arrow in every box before any box gets its down arrow.
      const up = count > b;
      const down = count > s.boxes + b;
      const pad = box * 0.16 * u;
      const arrow = (ax: number, from: number, to: number): ShapeElement => ({ id: uid(), type: 'shape', kind: 'arrow', x1: ax, y1: from, x2: ax, y2: to, color: o.color, size: ORBITAL.arrow * u, fill: false });
      if (up) els.push(arrow(x + box * u * (down ? 0.34 : 0.5), y + box * u - pad, y + pad));
      if (down) els.push(arrow(x + box * u * 0.66, y + pad, y + box * u - pad));
    }
  });
  return els;
}

/** Outer size in screen px, for previews. */
export const orbitalSize = (through: string) => {
  const { w, h } = orbitalLayout(through);
  return { w, h: h + 26 + 29 };
};

// ─── Lewis dot structure ──────────────────────────────────────────────

export const MAX_VALENCE = 8;

/** Screen-px dimensions of the Lewis dot structure. */
export const LEWIS = { symbol: 44, gap: 14, dot: 4, pair: 9 };

/**
 * Lewis dot structure: an element symbol with valence electrons placed
 * around it — one on each side (top, right, bottom, left) before any pair up.
 */
export function lewisDot(symbol: string, valence: number, o: PresetOptions, charge = ''): BoardElement[] {
  const v = Math.max(0, Math.min(MAX_VALENCE, Math.round(valence)));
  const u = o.unit;
  const sym = symbol.trim().slice(0, 2) || 'X';
  const fs = LEWIS.symbol * u;
  const w = sym.length * fs * 0.6;
  const h = fs * 1.15;
  const els: BoardElement[] = [
    {
      id: uid(), type: 'text', x: o.cx - w / 2, y: o.cy - h / 2, text: sym, spans: [{ text: sym, marks: { bold: true } }], color: o.color, fontSize: fs,
    },
  ];
  if (charge) {
    // Ion charge as a superscript at the top right, clear of the dots.
    const cs = fs * 0.5;
    els.push({ id: uid(), type: 'text', x: o.cx + w / 2 + LEWIS.gap * u * 1.5, y: o.cy - h / 2 - cs * 0.5, text: charge, spans: [{ text: charge, marks: { bold: true } }], color: o.color, fontSize: cs });
  }
  const hx = w / 2 + LEWIS.gap * u;
  const hy = h / 2 + LEWIS.gap * u * 0.4;
  const off = (LEWIS.pair / 2) * u;
  // Side order: top, right, bottom, left; each side takes two dots (a pair).
  const sides = [
    { x: 0, y: -hy, dx: off, dy: 0 },
    { x: hx, y: 0, dx: 0, dy: off },
    { x: 0, y: hy, dx: off, dy: 0 },
    { x: -hx, y: 0, dx: 0, dy: off },
  ];
  for (let i = 0; i < v; i++) {
    const side = sides[i % 4];
    const pair = v - (i % 4) > 4; // this side ends up with two dots
    const sign = i >= 4 ? 1 : -1;
    const k = pair ? sign : 0;
    els.push({ id: uid(), type: 'dot', x: o.cx + side.x + side.dx * k, y: o.cy + side.y + side.dy * k, r: LEWIS.dot * u, color: o.color });
  }
  return els;
}

/** Outer half-extents in screen px, for previews. */
export const lewisExtent = (symbol: string) => ({
  w: (symbol.trim().slice(0, 2) || 'X').length * LEWIS.symbol * 0.3 + LEWIS.gap + LEWIS.pair + LEWIS.dot,
  h: LEWIS.symbol * 0.575 + LEWIS.gap * 0.4 + LEWIS.dot + LEWIS.pair,
});

// ─── Electron configuration ───────────────────────────────────────────

/** A line of text such as "1s² 2s² 2p⁶ 3s¹", ready to edit on the board. */
export function electronConfigText(electrons: number, through: string, o: PresetOptions): BoardElement[] {
  const text = electronConfiguration(electrons, through) || '—';
  const fs = 26 * o.unit;
  const w = text.length * fs * 0.56;
  return [{ id: uid(), type: 'text', x: o.cx - w / 2, y: o.cy - fs * 0.65, text, spans: [{ text, marks: { bold: true } }], color: o.color, fontSize: fs }];
}

// ─── Element tile ─────────────────────────────────────────────────────

/** Screen-px size of an element tile (the periodic table cell). */
export const TILE = { w: 132, h: 156 };

export interface TileData {
  z: number;
  symbol: string;
  name: string;
  /** Average atomic mass as printed, e.g. "22.99" or "(98)". */
  mass: string;
}

/**
 * An element's periodic-table cell: atomic number, symbol, name and atomic
 * mass in a rounded box, laid out like the key on the California Chemistry
 * Reference Sheet.
 */
export function elementTile(t: TileData, o: PresetOptions): BoardElement[] {
  const u = o.unit;
  const w = TILE.w * u;
  const h = TILE.h * u;
  const left = o.cx - w / 2;
  const top = o.cy - h / 2;
  const centered = (text: string, fs: number, y: number, bold: boolean): BoardElement => ({
    id: uid(),
    type: 'text',
    x: o.cx - (text.length * fs * (bold ? 0.6 : 0.52)) / 2,
    y,
    text,
    spans: bold ? [{ text, marks: { bold: true } }] : undefined,
    color: o.color,
    fontSize: fs,
  });
  return [
    { id: uid(), type: 'shape', kind: 'rect', x1: left, y1: top, x2: left + w, y2: top + h, color: o.color, size: 2.5 * u, fill: false },
    centered(String(t.z), 20 * u, top + 10 * u, false),
    centered(t.symbol, 56 * u, top + 36 * u, true),
    centered(t.name, 17 * u, top + 104 * u, false),
    centered(t.mass, 20 * u, top + 126 * u, false),
  ];
}

/** A single bold line of text centred on the point, e.g. an electron configuration. */
export function textLine(text: string, o: PresetOptions, size = 26): BoardElement[] {
  const fs = size * o.unit;
  const w = text.length * fs * 0.56;
  return [{ id: uid(), type: 'text', x: o.cx - w / 2, y: o.cy - fs * 0.65, text, spans: [{ text, marks: { bold: true } }], color: o.color, fontSize: fs }];
}

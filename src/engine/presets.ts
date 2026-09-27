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
export const BOHR = { nucleus: 56, gap: 40, stroke: 2.5, label: 22 };

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

/**
 * Bohr model: a nucleus with "p =" and "n =" labels to fill in, surrounded
 * by one ring per energy level (1–5).
 */
export function bohrModel(levels: number, o: PresetOptions): BoardElement[] {
  const n = Math.max(1, Math.min(MAX_ENERGY_LEVELS, Math.round(levels)));
  const u = o.unit;
  const size = BOHR.stroke * u;
  const nucleus = BOHR.nucleus * u;
  const els: BoardElement[] = [circle(o.cx, o.cy, nucleus, o.color, size)];
  for (let k = 1; k <= n; k++) els.push(circle(o.cx, o.cy, nucleus + k * BOHR.gap * u, o.color, size));
  const fs = BOHR.label * u;
  const x = o.cx - nucleus * 0.5;
  els.push(label('p =', x, o.cy - fs * 1.35, fs, o.color), label('n =', x, o.cy + fs * 0.1, fs, o.color));
  return els;
}

/** Outer radius in screen px, for previews and fitting. */
export const bohrRadius = (levels: number) => BOHR.nucleus + Math.min(MAX_ENERGY_LEVELS, Math.max(1, levels)) * BOHR.gap;

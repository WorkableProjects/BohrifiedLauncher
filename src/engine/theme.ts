import type { ColorToken } from './types';

/**
 * Apple system colors (light) and their brighter dark-mode variants.
 * Drawing colors are stored as tokens so a board reads correctly in both
 * appearances — dark mode is a token swap, not a redraw.
 */
const LIGHT: Record<string, string> = {
  label: '#1C1C1E',
  blue: '#007AFF',
  red: '#FF3B30',
  green: '#34C759',
  orange: '#FF9500',
  yellow: '#FFCC00',
  purple: '#AF52DE',
  pink: '#FF2D55',
  teal: '#30B0C7',
  brown: '#A2845E',
};

const DARK: Record<string, string> = {
  label: '#F5F5F7',
  blue: '#0A84FF',
  red: '#FF453A',
  green: '#30D158',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  purple: '#BF5AF2',
  pink: '#FF375F',
  teal: '#40C8E0',
  brown: '#AC8E68',
};

/** Pastel sticky-note fills. */
const NOTE_LIGHT: Record<string, string> = {
  yellow: '#FFF3B0', blue: '#D6E9FF', green: '#D5F5DD', pink: '#FFD9E2', purple: '#EBDDF8', orange: '#FFE3C2',
};
const NOTE_DARK: Record<string, string> = {
  yellow: '#5C4F12', blue: '#123A63', green: '#18482A', pink: '#5E1F2F', purple: '#43275A', orange: '#5C3A10',
};

export const PALETTE: ColorToken[] = ['label', 'blue', 'red', 'green', 'orange', 'yellow', 'purple', 'pink'];
export const NOTE_TINTS: ColorToken[] = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange'];

export type Appearance = 'light' | 'dark';

export interface BoardTheme {
  appearance: Appearance;
  /** Board surface. */
  background: string;
  /** Pattern ink (dots / grid lines). */
  pattern: string;
  patternStrong: string;
  selection: string;
  resolve(c: ColorToken): string;
  noteFill(c: ColorToken): string;
}

export function boardTheme(appearance: Appearance): BoardTheme {
  const dark = appearance === 'dark';
  const map = dark ? DARK : LIGHT;
  const notes = dark ? NOTE_DARK : NOTE_LIGHT;
  return {
    appearance,
    background: dark ? '#141416' : '#FFFFFF',
    pattern: dark ? 'rgba(235,235,245,0.14)' : 'rgba(60,60,67,0.16)',
    patternStrong: dark ? 'rgba(235,235,245,0.32)' : 'rgba(60,60,67,0.36)',
    selection: dark ? '#0A84FF' : '#007AFF',
    resolve: (c) => map[c] ?? c,
    noteFill: (c) => notes[c] ?? notes.yellow,
  };
}

export function swatch(c: ColorToken, appearance: Appearance) {
  return (appearance === 'dark' ? DARK : LIGHT)[c] ?? c;
}

import type { Appearance } from './theme';

const parse = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number) => {
  const x = parse(a), y = parse(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
const luma = (hex: string) => {
  const [r, g, b] = parse(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const rgba = (hex: string, a: number) => `rgba(${parse(hex).join(', ')}, ${a})`;

/**
 * The UI is white (light) or black (dark); the accent colors everything
 * interactive. Returns the CSS custom properties to set on <html>.
 */
export function accentTokens(accent: string, appearance: Appearance): Record<string, string> {
  const dark = appearance === 'dark';
  const base = accent === 'mono' ? (dark ? '#ffffff' : '#000000') : accent;
  const onTint = luma(base) > 0.55 ? '#000000' : '#ffffff';
  return {
    '--brand': base,
    '--brand-2': mix(base, '#ffffff', 0.82),
    '--tint-soft': dark ? rgba(base, 0.24) : mix(base, '#ffffff', 0.82),
    '--on-tint': onTint,
    '--on-tint-soft': accent === 'mono' ? (dark ? '#ffffff' : '#000000') : dark ? mix(base, '#ffffff', 0.4) : mix(base, '#000000', 0.4),
    '--tint-glow': rgba(base, dark ? 0.4 : 0.32),
    '--home-bg': dark ? mix(base, '#000000', 0.96) : mix(base, '#ffffff', 0.82),
  };
}

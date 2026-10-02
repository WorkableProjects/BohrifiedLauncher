/** Small colour helpers: parse, mix, format. Colours are CSS strings; tokens ('@x') must be resolved first. */

export interface RGBA { r: number; g: number; b: number; a: number }

const cache = new Map<string, RGBA>();

export function parseColor(input: string): RGBA {
  const hit = cache.get(input);
  if (hit) return hit;
  let out: RGBA = { r: 0, g: 0, b: 0, a: 1 };
  const s = input.trim().toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /^#([0-9a-f]{3,8})$/.exec(s))) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    out = {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  } else if ((m = /^rgba?\(([^)]+)\)$/.exec(s))) {
    const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    out = { r: p[0] ?? 0, g: p[1] ?? 0, b: p[2] ?? 0, a: p[3] ?? 1 };
  } else if (s === 'transparent') out = { r: 0, g: 0, b: 0, a: 0 };
  else if (s === 'white') out = { r: 255, g: 255, b: 255, a: 1 };
  else if (s === 'black') out = { r: 0, g: 0, b: 0, a: 1 };
  if (cache.size > 500) cache.clear();
  cache.set(input, out);
  return out;
}

export const formatColor = ({ r, g, b, a }: RGBA): string =>
  a >= 0.999 ? `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})` : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+a.toFixed(3)})`;

export function mixColors(a: string, b: string, t: number): string {
  const x = parseColor(a), y = parseColor(b);
  return formatColor({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t, a: x.a + (y.a - x.a) * t });
}

export function toHex(c: string): string {
  const { r, g, b } = parseColor(c);
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function withAlpha(c: string, a: number): string {
  const p = parseColor(c);
  return formatColor({ ...p, a: p.a * a });
}

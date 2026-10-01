import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLOR_ROLES, MIN_TARGET, SPACING, TEXT_SCALES, TEXT_STYLES, concentricRadius, isTextSize } from './tokens';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const light = css.slice(0, css.indexOf(":root[data-theme='dark']"));
const dark = css.slice(css.indexOf(":root[data-theme='dark']"), css.indexOf('@media (prefers-reduced-transparency'));

describe('design tokens', () => {
  it('defines every semantic colour role for light mode', () => {
    for (const r of COLOR_ROLES) expect(light, r).toMatch(new RegExp(`--${r}:`));
  });
  it('swaps the core roles for dark mode', () => {
    for (const r of ['label', 'label-2', 'background', 'background-2', 'separator']) expect(dark, r).toMatch(new RegExp(`--${r}:`));
  });
  it('defines every text style as a size token and a class', () => {
    for (const t of TEXT_STYLES) {
      expect(css, t).toMatch(new RegExp(`--fs-${t}:`));
      expect(css, t).toMatch(new RegExp(`\\.t-${t} \\{`));
    }
  });
  it('keeps spacing on the 4 pt grid and defines the tokens', () => {
    for (const [k, v] of Object.entries(SPACING)) {
      expect(v % 4).toBe(0);
      expect(css).toContain(`--space-${k}: ${v}px;`);
    }
  });
  it('sets the 44 px minimum target', () => {
    expect(MIN_TARGET).toBe(44);
    expect(css).toContain('--target: 44px;');
  });
  it('honours Reduce Transparency and Reduce Motion', () => {
    expect(css).toMatch(/prefers-reduced-transparency: reduce\) \{[^}]*--glass: var\(--glass-solid\)/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[^}]*--dur-3: 0ms/);
  });
  it('scales text', () => {
    expect(css).toMatch(/--fs-body: calc\(17px \* var\(--text-scale\)\)/);
    expect(TEXT_SCALES.default).toBe(1);
    expect(isTextSize('large')).toBe(true);
    expect(isTextSize('huge')).toBe(false);
  });
  it('computes concentric radii', () => {
    expect(concentricRadius(20, 8)).toBe(12);
    expect(concentricRadius(4, 8)).toBe(0);
  });
});

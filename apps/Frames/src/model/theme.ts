import type { Color, DesignSystem, Effects, Shadow } from './types';

/** The font stacks the font picker offers. Web-safe or system, so decks look the same everywhere. */
export const FONTS: { name: string; stack: string }[] = [
  { name: 'Inter', stack: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" },
  { name: 'System', stack: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif" },
  { name: 'Helvetica', stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { name: 'Avenir', stack: "'Avenir Next', Avenir, 'Segoe UI', sans-serif" },
  { name: 'Futura', stack: "Futura, 'Century Gothic', 'Trebuchet MS', sans-serif" },
  { name: 'Trebuchet', stack: "'Trebuchet MS', 'Lucida Grande', sans-serif" },
  { name: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { name: 'Impact', stack: "Impact, 'Arial Narrow Bold', 'Haettenschweiler', sans-serif" },
  { name: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { name: 'Palatino', stack: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { name: 'Times', stack: "'Times New Roman', Times, serif" },
  { name: 'Didot', stack: "Didot, 'Bodoni MT', 'Playfair Display', Georgia, serif" },
  { name: 'Menlo', stack: "Menlo, Consolas, 'SF Mono', 'Courier New', monospace" },
  { name: 'Courier', stack: "'Courier New', Courier, monospace" },
];

const STACKS = new Map(FONTS.map((f) => [f.name, f.stack]));

/** '@heading' / '@body' / '@mono' → the theme's font; a known name → its stack; otherwise as written. */
export function resolveFont(theme: DesignSystem, font: string): string {
  if (font[0] === '@') font = theme.fonts[font.slice(1) as 'heading' | 'body' | 'mono'] ?? theme.fonts.body;
  return STACKS.get(font) ?? font;
}

/** Display name for a font value (for pickers). */
export function fontLabel(theme: DesignSystem, font: string): string {
  if (font[0] === '@') return `${font.slice(1)[0]!.toUpperCase()}${font.slice(2)} (${resolveFont(theme, font).split(',')[0]!.replace(/['"]/g, '')})`;
  return font;
}

/** '@primary' → '#…'; anything else is returned unchanged. */
export function resolveColor(theme: DesignSystem, c: Color): Color {
  if (c.charCodeAt(0) !== 64) return c;
  const v = (theme.colors as unknown as Record<string, string>)[c.slice(1)];
  return v ?? '#000000';
}

export function resolveShadow(theme: DesignSystem, s: Shadow | string | null | undefined): Shadow | null {
  if (!s) return null;
  if (typeof s === 'string') return theme.shadows[s as keyof DesignSystem['shadows']] ?? null;
  return s;
}

const shadow = (y: number, blur: number, a: number): Shadow => ({ x: 0, y, blur, c: `rgba(0,0,0,${a})` });
const SHADOWS = { sm: shadow(4, 12, 0.18), md: shadow(10, 30, 0.26), lg: shadow(24, 64, 0.34) };
const EFFECTS: Record<string, Effects> = {
  soft: { shadow: 'md' },
  lifted: { shadow: 'lg' },
  glow: { glow: { c: '@accent', blur: 40 } },
  frosted: { blur: 0, blend: 'source-over' },
};

const SCALE = { display: 144, title: 96, heading: 56, body: 36, caption: 24 };
const SPACING = { xs: 8, sm: 16, md: 32, lg: 64, xl: 112 };
const RADIUS = { sm: 8, md: 20, lg: 44 };

export function makeTheme(name: string, c: Partial<DesignSystem['colors']> & Pick<DesignSystem['colors'], 'bg' | 'text' | 'primary'>, fonts?: Partial<DesignSystem['fonts']>, extra?: Partial<DesignSystem>): DesignSystem {
  const colors: DesignSystem['colors'] = {
    surface: c.bg,
    muted: c.text,
    secondary: c.primary,
    accent: c.primary,
    success: '#34c759',
    danger: '#ff3b30',
    ...c,
  };
  return {
    name,
    colors,
    palette: [colors.primary, colors.secondary, colors.accent, colors.success, colors.danger, '#ffffff', '#000000', '#8e8e93'],
    fonts: { heading: 'Inter', body: 'Inter', mono: 'Menlo', ...fonts },
    type: { ...SCALE },
    spacing: { ...SPACING },
    radius: { ...RADIUS },
    shadows: { ...SHADOWS },
    effects: { ...EFFECTS },
    ...extra,
  };
}

/** Frames' own default: clean, light, Bohrified-pink accent. */
export const THEME_FRAMES = makeTheme(
  'Frames',
  { bg: '#ffffff', surface: '#f2f2f7', text: '#111114', muted: '#6b6b76', primary: '#ff6083', secondary: '#7c5cff', accent: '#ff9f0a' },
  { heading: 'Inter', body: 'Inter' },
);

export const THEME_MIDNIGHT = makeTheme(
  'Midnight',
  { bg: '#0b0d14', surface: '#151926', text: '#f4f6ff', muted: '#8f97b3', primary: '#6ea8ff', secondary: '#b18cff', accent: '#4ee3c1' },
  { heading: 'Inter', body: 'Inter' },
);

export const THEME_BROADCAST = makeTheme(
  'Broadcast',
  { bg: '#07090d', surface: '#10141c', text: '#ffffff', muted: '#8a93a6', primary: '#ff2e63', secondary: '#08d9d6', accent: '#ffd23f' },
  { heading: 'Impact', body: 'Inter' },
);

export const THEME_EDITORIAL = makeTheme(
  'Editorial',
  { bg: '#f6f1e9', surface: '#ebe3d6', text: '#1d1a16', muted: '#7b7266', primary: '#b6452c', secondary: '#2f5d50', accent: '#c9a227' },
  { heading: 'Didot', body: 'Georgia' },
);

export const THEME_PAPER = makeTheme(
  'Paper',
  { bg: '#fbfbf8', surface: '#efeee8', text: '#202124', muted: '#6d6f73', primary: '#1a73e8', secondary: '#188038', accent: '#e37400' },
  { heading: 'Helvetica', body: 'Helvetica' },
);

export const THEME_NEON = makeTheme(
  'Neon Grid',
  { bg: '#10002b', surface: '#240046', text: '#f8f0ff', muted: '#b196d6', primary: '#ff4ecd', secondary: '#4cc9f0', accent: '#f9f871' },
  { heading: 'Futura', body: 'Avenir' },
);

export const THEMES = [THEME_FRAMES, THEME_MIDNIGHT, THEME_BROADCAST, THEME_EDITORIAL, THEME_PAPER, THEME_NEON];

/** Is this colour light? Used for picking readable ink on a fill. */
export function isLight(hex: string): boolean {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex);
  if (!m) return true;
  let h = m[1]!;
  if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

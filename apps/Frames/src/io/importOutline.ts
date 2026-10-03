import { PRESET_MAP } from '../anim/presets';
import { newDeck, newImage, SLIDE_SIZES } from '../model/defaults';
import { uid } from '../model/ids';
import { makeTheme, THEMES } from '../model/theme';
import type { AssetMeta, Deck, DesignSystem, Direction, El, Fill, Para, Run, ShapeKind, Slide, TextEl, Transition } from '../model/types';
import { ICONS } from '../render/icons';
import { TRANSITION_MAP } from '../transitions/registry';
import { C, I, L, P, R, SB, T, TB, fl, lin, trn, type TO } from '../templates/kit';
import { putAsset, saveDeck } from './library';
import { parseLenient } from './lenientJson';

/**
 * The Frames outline: a small JSON format that people (and AI assistants) can
 * write by hand. Frames lays it out with the deck's design system.
 *
 * The importer is deliberately forgiving. Nothing in an outline can make it
 * fail except "there is no outline at all": unknown names are swapped for
 * safe defaults, values are coerced and clamped, and each slide is built on
 * its own so a broken one becomes a plain slide with a warning.
 *
 * The spec lives in docs/frames-outline.md; keep the two in step.
 */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

const LIMITS = { slides: 300, text: 4000, items: 12, cards: 6, stats: 4, steps: 8, rows: 20, cols: 8, series: 8, cats: 60, elements: 80 };

// ── Key normalisation ────────────────────────────────────────────────────────

/** speaker_notes / Speaker-Notes / SpeakerNotes → speakernotes; lookups compare this form. */
const norm = (k: string) => k.toLowerCase().replace(/[\s_-]+/g, '');

/** Read the first present field among `names` (case, spaces, dashes and underscores ignored). */
function get(o: Rec, ...names: string[]): unknown {
  for (const n of names) if (o[n] !== undefined && o[n] !== null) return o[n];
  const want = new Set(names.map(norm));
  for (const k of Object.keys(o)) if (want.has(norm(k)) && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

// ── Coercion ─────────────────────────────────────────────────────────────────

function str(v: unknown, d = ''): string {
  if (typeof v === 'string') return v.length > LIMITS.text ? v.slice(0, LIMITS.text) : v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (isRec(v)) { const t = get(v, 'text', 'title', 'label', 'value', 'name', 'content'); return t === undefined ? d : str(t, d); }
  if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean).join('\n');
  return d;
}
function num(v: unknown, d: number, min = -Infinity, max = Infinity): number {
  let n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/[,_\s]/g, '')) : NaN;
  if (!Number.isFinite(n)) n = d;
  return Math.max(min, Math.min(max, n));
}
/** Geometry: plain slide units, or "50%" of `total`. */
function dim(v: unknown, total: number, d: number): number {
  if (typeof v === 'string' && v.trim().endsWith('%')) return num(v.trim().slice(0, -1), (d / total) * 100) / 100 * total;
  return num(v, d, -total * 2, total * 3);
}
function list(v: unknown, max = LIMITS.items): unknown[] {
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined && x !== '').slice(0, max);
  if (typeof v === 'string' && v.trim()) return v.split(/\n+/).map((x) => x.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '').trim()).filter(Boolean).slice(0, max);
  if (isRec(v)) return [v];
  return [];
}
const strs = (v: unknown, max = LIMITS.items) => list(v, max).map((x) => str(x)).filter(Boolean);
const bool = (v: unknown) => v === true || v === 'true' || v === 'yes' || v === 1;

const TOKENS = new Set(['bg', 'surface', 'text', 'muted', 'primary', 'secondary', 'accent', 'success', 'danger']);
const TOKEN_ALIASES: Record<string, string> = { background: 'bg', foreground: 'text', fg: 'text', card: 'surface', subtle: 'muted', gray: 'muted', grey: 'muted', main: 'primary', brand: 'primary', highlight: 'accent', error: 'danger', red: 'danger', green: 'success', ok: 'success', warning: 'accent' };

/** A colour Frames can draw: a theme token (@primary), hex, rgb()/hsl() or a CSS colour name. Anything else → `d`. */
function color(v: unknown, d?: string): string | undefined {
  if (typeof v !== 'string') return d;
  const s = v.trim();
  if (!s) return d;
  const tok = s.replace(/^[@$]/, '').toLowerCase();
  if (s[0] === '@' || s[0] === '$' || TOKENS.has(tok) || TOKEN_ALIASES[tok]) {
    const t = TOKENS.has(tok) ? tok : TOKEN_ALIASES[tok];
    if (t) return `@${t}`;
    if (s[0] === '@' || s[0] === '$') return d;
  }
  if (/^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s[0] === '#' ? s : `#${s}`;
  if (typeof CSS !== 'undefined' && CSS.supports?.('color', s)) return s;
  if (typeof CSS === 'undefined' && /^(rgba?|hsla?)\(|^[a-z]+$/i.test(s)) return s;
  return d;
}

const SHAPES: ShapeKind[] = ['rect', 'round-rect', 'ellipse', 'triangle', 'right-triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'burst', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'chevron', 'parallelogram', 'trapezoid', 'plus', 'cross', 'heart'];
const SHAPE_ALIASES: Record<string, ShapeKind> = { rectangle: 'rect', square: 'rect', box: 'rect', 'rounded-rect': 'round-rect', 'rounded-rectangle': 'round-rect', rounded: 'round-rect', pill: 'round-rect', card: 'round-rect', circle: 'ellipse', oval: 'ellipse', dot: 'ellipse', arrow: 'arrow-right', 'right-arrow': 'arrow-right', 'left-arrow': 'arrow-left', rhombus: 'diamond', badge: 'burst', starburst: 'burst' };
function shapeKind(v: unknown, warn: (s: string) => void): ShapeKind {
  const s = str(v, 'rect').toLowerCase().trim().replace(/[\s_]+/g, '-');
  if ((SHAPES as string[]).includes(s)) return s as ShapeKind;
  if (SHAPE_ALIASES[s]) return SHAPE_ALIASES[s]!;
  warn(`unknown shape "${s}" (used a rectangle)`);
  return 'rect';
}

const ICON_ALIASES: Record<string, string> = { lightbulb: 'bulb', idea: 'bulb', money: 'dollar', cash: 'dollar', chart: 'bar-chart', graph: 'bar-chart', growth: 'trending-up', team: 'users', people: 'users', person: 'user', email: 'mail', chat: 'message', time: 'clock', date: 'calendar', security: 'shield', secure: 'shield', lightning: 'bolt', fast: 'zap', speed: 'zap', launch: 'rocket', goal: 'target', win: 'trophy', prize: 'award', location: 'map-pin', world: 'globe', earth: 'globe', game: 'gamepad', gaming: 'gamepad', tools: 'wrench', tool: 'wrench', settings: 'settings', gear: 'settings', heart: 'heart', love: 'heart', check: 'check', done: 'check', warning: 'alert', error: 'alert', education: 'book', learn: 'book', write: 'pen', fire: 'flame', hot: 'flame', nature: 'leaf', eco: 'leaf', weather: 'cloud', night: 'moon', day: 'sun', shop: 'cart', shopping: 'cart', music: 'headphones', video: 'tv', delivery: 'truck', travel: 'plane', code: 'code', computer: 'cpu', data: 'database', server: 'database', key: 'key', password: 'lock' };
function icon(v: unknown, warn: (s: string) => void): string {
  const s = str(v, 'star').toLowerCase().trim().replace(/[\s_]+/g, '-');
  if (ICONS[s]) return s;
  const a = ICON_ALIASES[s] ?? ICON_ALIASES[s.replace(/s$/, '')];
  if (a && ICONS[a]) return a;
  warn(`unknown icon "${s}" (used a star)`);
  return 'star';
}

const TRANSITION_ALIASES: Record<string, string> = { fade: 'dissolve', crossfade: 'dissolve', 'cross-fade': 'dissolve', slide: 'push', 'slide-left': 'push', move: 'push', 'zoom-in': 'zoom', 'zoom-out': 'zoom', glitch: 'signal', static: 'signal', 'magic move': 'magic-move', magicmove: 'magic-move', smart: 'morph', 'smart-animate': 'morph', cut: 'none', replay: 'replay-live', 'replay-to-live': 'replay-live', broadcast: 'broadcast-cut', score: 'scoreboard', rush: 'camera-rush', pan: 'camera-pan', dolly: 'camera-zoom', clock: 'wipe-clock', 'diagonal-wipe': 'wipe-diagonal', reveal: 'uncover', circle: 'shape', iris: 'shape', '3d': 'perspective', box: 'cube', card: 'flip' };
const DIRS = new Set(['left', 'right', 'up', 'down']);
const DIR_ALIASES: Record<string, Direction> = { top: 'up', bottom: 'down', north: 'up', south: 'down', east: 'right', west: 'left' };

function transitionOf(v: unknown, warn: (s: string) => void): Transition | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === false || v === 'none' || v === '') return null;
  const o = isRec(v) ? v : {};
  let type = str(isRec(v) ? get(o, 'type', 'name', 'style', 'effect') : v).toLowerCase().trim().replace(/[\s_]+/g, '-');
  if (!TRANSITION_MAP.has(type)) type = TRANSITION_ALIASES[type] ?? TRANSITION_ALIASES[type.replace(/-/g, ' ')] ?? type;
  if (type === 'none') return null;
  if (!TRANSITION_MAP.has(type)) { warn(`unknown transition "${type}" (used dissolve)`); type = 'dissolve'; }
  const over: Partial<Transition> & { dir?: Direction } = {};
  const d = str(get(o, 'direction', 'dir', 'from')).toLowerCase();
  if (DIRS.has(d)) over.dir = d as Direction;
  else if (DIR_ALIASES[d]) over.dir = DIR_ALIASES[d];
  const dur = get(o, 'duration', 'dur', 'ms', 'length');
  if (dur !== undefined) over.dur = seconds(dur, 800, 100, 10000);
  return trn(type, over);
}

/** Durations: numbers ≤ 20 are taken as seconds, larger ones as milliseconds; "1.5s" and "600ms" are understood. */
function seconds(v: unknown, d: number, min: number, max: number): number {
  if (typeof v === 'string') {
    const m = /^\s*([\d.]+)\s*(ms|s|sec|seconds?)?\s*$/i.exec(v);
    if (m) return Math.max(min, Math.min(max, m[2] && m[2].toLowerCase() !== 'ms' ? parseFloat(m[1]!) * 1000 : parseFloat(m[1]!) <= 20 && !m[2] ? parseFloat(m[1]!) * 1000 : parseFloat(m[1]!)));
  }
  const n = num(v, NaN);
  if (!Number.isFinite(n)) return d;
  return Math.max(min, Math.min(max, n <= 20 ? n * 1000 : n));
}

const PRESET_ALIASES: Record<string, string> = { fade: 'fade-in', 'fade-up': 'rise', 'slide-up': 'rise', up: 'rise', appear: 'fade-in', 'zoom': 'zoom-in', 'scale-in': 'zoom-in', bounce: 'spring-up', 'bounce-in': 'spring-up', grow: 'pop', 'pop-in': 'pop', type: 'typewriter', typing: 'typewriter', words: 'cascade-words', letters: 'cascade-letters', 'fly-in': 'slide-in', fly: 'slide-in', wipe: 'wipe-in', draw: 'draw-on', blur: 'blur-in', spin: 'spin-in', flip: 'flip-in', 'fade-away': 'fade-out', disappear: 'fade-out', hide: 'fade-out', 'fly-out': 'slide-out', wiggle: 'wobble', jiggle: 'wobble', glow: 'pulse', beat: 'heartbeat', bob: 'float', hover: 'float' };
/** A known animation preset id, `null` for "no animation", or `undefined` when the value is missing. */
function presetId(v: unknown, warn: (s: string) => void): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === false || v === null || v === 'none' || v === '') return null;
  let s = str(v).toLowerCase().trim().replace(/[\s_]+/g, '-');
  if (PRESET_MAP.has(s)) return s;
  s = PRESET_ALIASES[s] ?? s;
  if (PRESET_MAP.has(s)) return s;
  warn(`unknown animation "${s}" (used fade-in)`);
  return 'fade-in';
}

// ── Inline text: **bold**, *italic*, __underline__, ~~strike~~, ==highlight==, `code`, ^sup^, ~sub~, [link](https://…) ──

type RunIn = { t: string } & Omit<Run, 't'>;
function runs(text: string): RunIn[] {
  const out: RunIn[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|==(.+?)==|`(.+?)`|\^(.+?)\^|~(.+?)~|\*(.+?)\*|_(.+?)_|\[(.+?)\]\(((?:https?:|mailto:)[^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null;
  const push = (t: string, extra: Omit<Run, 't'> = {}) => { if (t) out.push({ t, ...extra }); };
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index));
    if (m[1] !== undefined) push(m[1], { b: true });
    else if (m[2] !== undefined) push(m[2], { u: true });
    else if (m[3] !== undefined) push(m[3], { s: true });
    else if (m[4] !== undefined) push(m[4], { hl: '@accent' });
    else if (m[5] !== undefined) push(m[5], { font: '@mono' });
    else if (m[6] !== undefined) push(m[6], { sup: true });
    else if (m[7] !== undefined) push(m[7], { sub: true });
    else if (m[8] !== undefined) push(m[8], { i: true });
    else if (m[9] !== undefined) push(m[9], { i: true });
    else if (m[10] !== undefined) push(m[10], { link: m[11], u: true, c: '@primary' });
    last = re.lastIndex;
  }
  push(text.slice(last));
  return out.length ? out : [{ t: '' }];
}
const rich = (text: string): Para[] => text.replace(/\r/g, '').split('\n').map((l) => P(runs(l)));

/** Bullets: strings, `{ text, sub: [...] }`, or strings indented with spaces / "- " for sub-points. */
function bulletParas(items: unknown[], numbered: boolean, gap = 18, level = 0): Para[] {
  const out: Para[] = [];
  for (const it of items) {
    if (isRec(it)) {
      out.push({ ...P(runs(str(get(it, 'text', 'title', 'label', 'point')))), list: numbered ? 'number' : 'bullet', level, after: gap });
      const sub = list(get(it, 'sub', 'subs', 'children', 'bullets', 'points', 'items'), LIMITS.items);
      if (sub.length && level < 3) out.push(...bulletParas(sub, numbered, Math.round(gap * 0.6), level + 1));
      continue;
    }
    const raw = str(it);
    const indent = /^(\s*)/.exec(raw)![1]!.replace(/\t/g, '    ').length;
    const lvl = Math.min(3, level + Math.floor(indent / 2));
    const t = raw.trim().replace(/^(?:[-*•–]|\d+[.)])\s+/, '');
    if (t) out.push({ ...P(runs(t)), list: numbered ? 'number' : 'bullet', level: lvl, after: lvl > level ? Math.round(gap * 0.6) : gap });
  }
  return out;
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const THEME_ALIASES: Record<string, string> = { frames: 'Frames', light: 'Frames', white: 'Frames', default: 'Frames', clean: 'Frames', minimal: 'Frames', midnight: 'Midnight', dark: 'Midnight', night: 'Midnight', black: 'Midnight', broadcast: 'Broadcast', esports: 'Broadcast', sports: 'Broadcast', gaming: 'Broadcast', tv: 'Broadcast', editorial: 'Editorial', magazine: 'Editorial', serif: 'Editorial', warm: 'Editorial', paper: 'Paper', google: 'Paper', simple: 'Paper', school: 'Paper', classroom: 'Paper', neon: 'Neon Grid', 'neon grid': 'Neon Grid', neongrid: 'Neon Grid', synthwave: 'Neon Grid', retro: 'Neon Grid', party: 'Neon Grid' };
const FONTS = ['Inter', 'Helvetica', 'Avenir', 'Futura', 'Georgia', 'Didot', 'Palatino', 'Times', 'Menlo', 'Courier', 'Impact', 'Arial', 'Verdana', 'Trebuchet MS', 'Gill Sans', 'Optima', 'Baskerville', 'Garamond', 'system-ui'];
function font(v: unknown): string | undefined {
  const s = str(v).trim();
  if (!s) return undefined;
  if (s === '@heading' || s === '@body' || s === '@mono') return s;
  const hit = FONTS.find((f) => f.toLowerCase() === s.toLowerCase());
  // Unknown fonts are allowed (they may be installed); quotes and semicolons are not.
  return hit ?? (/^[\w\s-]{1,40}$/.test(s) ? s : undefined);
}

function themeFrom(o: Rec, warn: (s: string) => void): DesignSystem {
  const raw = str(get(o, 'theme', 'style', 'look')).toLowerCase().trim();
  const want = THEME_ALIASES[raw] ?? THEME_ALIASES[raw.replace(/[\s_-]+/g, '')] ?? 'Frames';
  if (raw && !THEME_ALIASES[raw] && !THEME_ALIASES[raw.replace(/[\s_-]+/g, '')]) warn(`unknown theme "${raw}" (used Frames)`);
  const th = structuredClone(THEMES.find((t) => t.name === want) ?? THEMES[0]!);
  const c = get(o, 'colors', 'colours', 'palette');
  if (isRec(c)) {
    const merged = { ...th.colors };
    for (const k of Object.keys(merged) as Array<keyof typeof merged>) {
      const v = color(get(c, k, k === 'bg' ? 'background' : k));
      if (v && v[0] !== '@') merged[k] = v;
    }
    const t2 = makeTheme(th.name, merged, th.fonts);
    th.colors = t2.colors;
    th.palette = t2.palette;
  }
  const f = get(o, 'fonts', 'font', 'typography');
  if (isRec(f)) {
    const h = font(get(f, 'heading', 'headings', 'title', 'display')), b = font(get(f, 'body', 'text', 'paragraph'));
    if (h) th.fonts.heading = h;
    if (b) th.fonts.body = b;
  } else if (font(f)) th.fonts.heading = th.fonts.body = font(f)!;
  return th;
}

// ── Building ─────────────────────────────────────────────────────────────────

interface Ctx {
  th: DesignSystem;
  W: number;
  H: number;
  m: number;
  animate: boolean;
  defaultTransition: Transition | null | undefined;
  warn: (s: string) => void;
  image: (src: string) => Promise<AssetMeta | null>;
}

async function background(cx: Ctx, sb: SB, v: unknown): Promise<{ fill?: Fill | null; dark?: boolean }> {
  if (v === undefined) return {};
  if (v === null || v === 'none') return { fill: null };
  if (typeof v === 'string') {
    if (/^(https?:|data:image)/.test(v.trim())) return background(cx, sb, { image: v });
    const c = color(v);
    if (c) return { fill: fl(c) };
    cx.warn(`unknown background "${v.slice(0, 30)}"`);
    return {};
  }
  if (!isRec(v)) return {};
  const img = str(get(v, 'image', 'src', 'url', 'photo'));
  if (img) {
    const meta = await cx.image(img);
    if (meta) {
      const el = newImage(meta.id, 0, 0, cx.W, cx.H, { name: 'Background image', locked: true });
      coverCrop(el, meta, cx.W, cx.H);
      sb.slide.elements.unshift(el);
      const dimA = num(get(v, 'dim', 'darken', 'overlay', 'scrim'), 0.45, 0, 0.95);
      if (dimA > 0) sb.slide.elements.splice(1, 0, R('rect', 0, 0, cx.W, cx.H, `rgba(0,0,0,${dimA})`, { name: 'Background dim', locked: true }));
      return { dark: dimA >= 0.3 || bool(get(v, 'dark', 'lightText')) };
    }
  }
  const g = get(v, 'gradient', 'colors', 'stops');
  if (Array.isArray(g)) {
    const cs = g.map((c) => color(c)).filter((c): c is string => !!c).slice(0, 6);
    if (cs.length === 1) return { fill: fl(cs[0]!) };
    if (cs.length >= 2) return { fill: lin(num(get(v, 'angle', 'direction'), 135, -360, 360), ...cs.map((c, i): [string, number] => [c, i / (cs.length - 1)])) };
  }
  const c = color(get(v, 'color', 'colour', 'fill'));
  return c ? { fill: fl(c) } : {};
}

function coverCrop(img: { crop: { x: number; y: number; w: number; h: number } }, meta: AssetMeta, w: number, h: number) {
  if (!meta.w || !meta.h || w <= 0 || h <= 0) return;
  const ar = meta.w / meta.h, box = w / h;
  img.crop = ar > box ? { x: (1 - box / ar) / 2, y: 0, w: box / ar, h: 1 } : { x: 0, y: (1 - ar / box) / 2, w: 1, h: ar / box };
}

const LAYOUT_ALIASES: Record<string, string> = {
  'title-slide': 'title', cover: 'title', intro: 'title', opening: 'title', hero: 'title', start: 'title',
  divider: 'section', chapter: 'section', 'section-header': 'section', part: 'section', break: 'section',
  toc: 'agenda', contents: 'agenda', 'table-of-contents': 'agenda', outline: 'agenda', overview: 'agenda',
  bullet: 'bullets', list: 'bullets', content: 'bullets', text: 'bullets', points: 'bullets', 'title-and-content': 'bullets', default: 'bullets', 'bullet-points': 'bullets', numbered: 'numbered', steps_list: 'numbered',
  columns: 'two-column', 'two-columns': 'two-column', 'two-col': 'two-column', split: 'two-column', 'side-by-side': 'two-column',
  compare: 'comparison', versus: 'comparison', vs: 'comparison', 'before-after': 'comparison', 'pros-cons': 'comparison',
  features: 'cards', grid: 'cards', pillars: 'cards', boxes: 'cards', tiles: 'cards', team: 'cards', options: 'cards',
  numbers: 'stats', metrics: 'stats', kpis: 'stats', kpi: 'stats', statistics: 'stats', 'key-numbers': 'stats',
  number: 'big-number', 'big-stat': 'big-number', stat: 'big-number', metric: 'big-number', highlight: 'big-number',
  'big-statement': 'statement', headline: 'statement', 'big-idea': 'statement', message: 'statement', callout: 'statement',
  testimonial: 'quote', citation: 'quote', 'pull-quote': 'quote',
  graph: 'chart', data: 'chart', 'bar-chart': 'chart', 'line-chart': 'chart', 'pie-chart': 'chart',
  grid_table: 'table', schedule: 'table', matrix: 'table',
  process: 'timeline', steps: 'timeline', roadmap: 'timeline', journey: 'timeline', history: 'timeline', milestones: 'timeline', flow: 'timeline',
  photo: 'image', picture: 'image', screenshot: 'image', media: 'image', 'full-image': 'full-image', 'full-bleed': 'full-image', 'image-full': 'full-image', fullscreen: 'full-image',
  end: 'closing', 'thank-you': 'closing', thanks: 'closing', outro: 'closing', 'q&a': 'closing', qa: 'closing', questions: 'closing', contact: 'closing', conclusion_slide: 'closing',
  empty: 'blank', custom: 'blank', freeform: 'blank', 'free-form': 'blank', canvas: 'blank',
};
const LAYOUTS = new Set(['title', 'section', 'agenda', 'bullets', 'numbered', 'two-column', 'comparison', 'cards', 'stats', 'big-number', 'statement', 'quote', 'chart', 'table', 'timeline', 'image', 'full-image', 'closing', 'blank']);

/** Pick a layout: the one named, else the one the fields suggest. */
function layoutOf(s: Rec, i: number, total: number, warn: (x: string) => void): string {
  const raw = str(get(s, 'layout', 'type', 'kind', 'template')).toLowerCase().trim().replace(/[\s_]+/g, '-');
  if (raw) {
    if (LAYOUTS.has(raw)) return raw;
    const a = LAYOUT_ALIASES[raw] ?? LAYOUT_ALIASES[raw.replace(/-/g, '_')];
    if (a) return a;
  }
  const guess =
    get(s, 'chart') !== undefined ? 'chart'
    : get(s, 'rows', 'table') !== undefined ? 'table'
    : get(s, 'stats', 'metrics') !== undefined ? 'stats'
    : get(s, 'cards', 'features') !== undefined ? 'cards'
    : get(s, 'steps', 'milestones') !== undefined ? 'timeline'
    : get(s, 'quote') !== undefined ? 'quote'
    : get(s, 'left', 'right') !== undefined ? 'two-column'
    : get(s, 'value') !== undefined ? 'big-number'
    : get(s, 'bullets', 'points', 'items', 'body', 'content') !== undefined ? 'bullets'
    : get(s, 'image') !== undefined ? 'image'
    : i === 0 ? 'title'
    : i === total - 1 && total > 2 ? 'closing'
    : get(s, 'elements') !== undefined ? 'blank'
    : 'bullets';
  if (raw) warn(`unknown layout "${raw}" (used ${guess})`);
  return guess;
}

/** Text boxes never run off the slide: clamp them to the slide and let the type shrink to fit. */
function contain(els: El[], W: number, H: number, m: number) {
  for (const e of els) {
    if (e.type === 'text') {
      if (e.x < 0) { e.w += e.x; e.x = 0; }
      if (e.x + e.w > W) e.w = Math.max(80, W - e.x);
      const bottom = H - Math.max(24, m * 0.35);
      if (e.y + e.h > bottom && e.y < bottom - 40) { e.h = bottom - e.y; e.fit = 'shrink'; }
    }
    if (e.type === 'group') contain(e.children, W, H, m);
  }
}

/** Light text on dark backgrounds (background images, explicit `"textColor": "light"`). */
function ink(els: El[], light: boolean) {
  const map = light ? { '@text': '#ffffff', '@muted': 'rgba(255,255,255,0.78)' } : { '@text': '#111114', '@muted': '#55555e' };
  for (const e of els) {
    if (e.type !== 'text') continue;
    const c = e.base.color as keyof typeof map;
    if (map[c]) e.base.color = map[c];
    for (const p of e.doc) for (const r of p.runs) if (r.c && map[r.c as keyof typeof map]) r.c = map[r.c as keyof typeof map];
  }
}

async function buildSlide(cx: Ctx, s: Rec, i: number, total: number): Promise<Slide> {
  const { th, W, H, m, warn } = cx;
  const layout = layoutOf(s, i, total, warn);
  const tIn = transitionOf(get(s, 'transition', 'transitionIn'), warn);
  const title = str(get(s, 'title', 'heading', 'headline', 'header'));
  const subtitle = str(get(s, 'subtitle', 'subheading', 'tagline', 'subhead', 'kicker'));
  const sb = new SB(th, { w: W, h: H }, {
    name: (str(get(s, 'name')) || title).split('\n')[0]!.slice(0, 60) || undefined,
    notes: str(get(s, 'notes', 'speakerNotes', 'script', 'presenterNotes', 'talkingPoints')),
    section: str(get(s, 'section')) || undefined,
    hidden: bool(get(s, 'hidden', 'skip')) || undefined,
    transition: tIn !== undefined ? tIn : cx.defaultTransition !== undefined ? cx.defaultTransition : i === 0 ? null : trn(i === total - 1 ? 'morph' : 'dissolve'),
  });
  // Auto-advance is always in seconds ("5", 5, "5s"), or milliseconds when written "5000ms".
  const adv = get(s, 'advance', 'autoAdvance', 'auto');
  if (adv !== undefined && adv !== false) {
    const ms = typeof adv === 'string' && /ms\s*$/i.test(adv) ? num(adv.replace(/ms\s*$/i, ''), 0) : num(typeof adv === 'string' ? adv.replace(/s(ec(onds?)?)?\s*$/i, '') : adv, 0) * 1000;
    if (ms > 0) sb.slide.auto = Math.min(600000, ms);
  }
  const bgr = await background(cx, sb, get(s, 'background', 'bg', 'backgroundColor', 'backgroundImage'));
  if (bgr.fill !== undefined) sb.slide.background = bgr.fill;
  const before = sb.slide.elements.length;

  // Animation controls: off, or a different preset for the title / the content.
  const anim = cx.animate && get(s, 'animate', 'animations') !== false && get(s, 'animate') !== 'none';
  const titleFx = presetId(get(s, 'titleAnimation', 'titleAnimate'), warn);
  const bodyFx = presetId(get(s, 'animation', 'contentAnimation', 'bodyAnimation'), warn);
  const onClick = /click/i.test(str(get(s, 'reveal', 'build', 'trigger'))) || get(s, 'click') === true;
  const speed = num(get(s, 'speed', 'animationSpeed'), 1, 0.25, 4);
  type FxO = Parameters<SB['fx']>[2];
  const fx = (role: 'title' | 'body' | 'deco', preset: string, t: El | El[] | null | undefined, o: FxO = {}) => {
    const list0 = (Array.isArray(t) ? t : t ? [t] : []).filter(Boolean);
    if (!anim || !list0.length) return;
    const pick = role === 'title' ? titleFx : role === 'body' ? bodyFx : undefined;
    if (pick === null) return;
    const id = pick ?? preset;
    const opts = { ...o };
    if (pick && id !== preset) delete opts.params;
    if (speed !== 1) {
      if (opts.delay) opts.delay /= speed;
      if (opts.each) opts.each /= speed;
      const def = PRESET_MAP.get(id);
      opts.dur = (opts.dur ?? def?.dur ?? 600) / speed;
    }
    try { sb.fx(id, list0, opts); } catch { warn(`animation "${id}" couldn't be added`); }
  };
  const align = (str(get(s, 'align', 'alignment', 'textAlign')).toLowerCase() as 'left' | 'center' | 'right');
  const center = align === 'center';
  const cw = W - m * 2;
  const tSize = num(get(s, 'titleSize'), 76, 24, 220);
  const heading = (y = Math.round(m * 0.7)) => {
    if (!title) return null;
    const t = sb.t(rich(title), m, y, cw, { s: tSize, w: 700, ls: -1.5, lh: 1.1, f: '@heading', ph: 'title', name: 'Title', a: center ? 'center' : 'left' });
    const max = tSize * 1.1 * 2 + 10;
    if (t.h > max) { t.h = max; t.fit = 'shrink'; }
    return t;
  };
  const below = (t: TextEl | null, gap = 60) => (t ? t.y + t.h : m) + gap;
  const bottom = H - m;

  switch (layout) {
    case 'title':
    case 'closing': {
      const closing = layout === 'closing';
      const eyebrow = str(get(s, 'eyebrow', 'label', 'kicker', 'overline', 'tag'));
      const a = center ? 'center' : 'left';
      let y = H * (center ? 0.32 : 0.36);
      const bar = center ? null : sb.r('rect', m, y - 96, 96, 10, '@primary', { name: 'Accent bar', morph: 'accent-bar' });
      const eb = eyebrow ? sb.t(eyebrow.toUpperCase(), m, y - 60, cw, { s: 26, w: 600, ls: 4, c: '@primary', name: 'Eyebrow', a }) : null;
      const size = num(get(s, 'titleSize'), closing ? 160 : 128, 40, 260);
      const t = sb.t(rich(title || (closing ? 'Thank you' : str(get(s, 'deckTitle')) || 'Untitled')), m, y, cw, { s: size, w: 700, ls: -4, lh: 1.04, f: '@heading', ph: 'title', name: 'Title', a });
      if (t.h > size * 1.04 * 3) { t.h = size * 1.04 * 3; t.fit = 'shrink'; }
      y += t.h + 36;
      const sub = subtitle ? sb.t(rich(subtitle), center ? m + cw * 0.1 : m, y, center ? cw * 0.8 : Math.min(cw, 1300), { s: 44, c: '@muted', ph: 'subtitle', name: 'Subtitle', a }) : null;
      const by = str(get(s, 'author', 'presenter', 'contact', 'byline', 'speaker', 'date'));
      const who = by ? sb.t(rich(by), m, bottom - 60, cw, { s: 30, c: '@muted', name: closing ? 'Contact' : 'Presenter', a, h: 90 }) : null;
      fx('deco', 'fade-in', bar, { trigger: 'after', dur: 500 });
      fx('deco', 'fade-in', eb, { trigger: bar ? 'with' : 'after', delay: 100 });
      fx('title', closing ? 'cascade-letters' : 'cascade-words', t, { trigger: bar || eb ? 'with' : 'after', delay: 150 });
      fx('body', 'rise', sub, { delay: 500 });
      fx('body', 'fade-in', who, { delay: 700 });
      break;
    }
    case 'section': {
      if (bgr.fill === undefined && !bgr.dark) sb.slide.background = lin(135, ['@primary', 0], ['@secondary', 1]);
      const n = str(get(s, 'number', 'num', 'index', 'part'));
      const big = n ? sb.t(n, W * 0.3, H * 0.08, W * 0.7 - m * 0.5, { s: Math.round(Math.min(H * 0.62, (W * 0.7) / Math.max(1, n.length) / 0.62)), w: 800, c: '#ffffff', op: 0.14, a: 'right', lh: 1, h: H * 0.84, fit: 'none', name: 'Section number' }) : null;
      const t = sb.t(rich(title), m, H * 0.38, cw * 0.8, { s: num(get(s, 'titleSize'), 130, 40, 240), w: 700, ls: -4, lh: 1.05, c: '#ffffff', f: '@heading', ph: 'title', name: 'Title', a: center ? 'center' : 'left' });
      if (t.h > H * 0.42) { t.h = H * 0.42; t.fit = 'shrink'; }
      const sub = subtitle ? sb.t(rich(subtitle), m, t.y + t.h + 30, cw * 0.7, { s: 42, c: '#ffffff', op: 0.85, name: 'Subtitle', a: center ? 'center' : 'left' }) : null;
      fx('deco', 'fade-in', big, { trigger: 'after', dur: 900 });
      fx('title', 'cascade-words', t, { trigger: big ? 'with' : 'after', delay: big ? 200 : 0 });
      fx('body', 'rise', sub, { delay: 500 });
      break;
    }
    case 'bullets':
    case 'numbered': {
      const ttl = heading();
      const items = list(get(s, 'bullets', 'points', 'items', 'list', 'content'));
      let y = below(ttl, 70);
      const visual = str(get(s, 'icon')) ? 'icon' : str(get(s, 'image')) ? 'image' : '';
      const side = /left/i.test(str(get(s, 'imageSide', 'visualSide', 'side'))) ? 'left' : 'right';
      const w = visual ? cw * 0.56 : cw;
      const x = visual && side === 'left' ? m + cw - w : m;
      const body = str(get(s, 'body', 'text', 'paragraph', 'description', 'intro'));
      fx('title', 'fade-in', ttl, { trigger: 'after', dur: 500 });
      if (body) {
        const b = sb.t(rich(body), x, y, w, { s: items.length ? 38 : 46, c: items.length ? '@muted' : '@text', lh: 1.35, name: 'Body' });
        if (b.y + b.h > bottom - (items.length ? 200 : 0)) { b.h = Math.max(80, bottom - (items.length ? 200 : 0) - b.y); b.fit = 'shrink'; }
        y += b.h + 40;
        fx('body', 'fade-in', b, { delay: 100 });
      }
      const numbered = layout === 'numbered' || bool(get(s, 'numbered', 'ordered'));
      const paras = bulletParas(items, numbered, 0);
      // One box per top-level bullet so each can be revealed on its own click.
      const groups: Para[][] = [];
      for (const p of paras) {
        if (!p.level || !groups.length) groups.push([]);
        groups[groups.length - 1]!.push(p);
      }
      const lines = paras.length;
      const avail = Math.max(120, bottom - y);
      const size = num(get(s, 'textSize', 'fontSize'), Math.max(28, Math.min(54, Math.floor(avail / Math.max(1, lines) / 2.0))), 18, 96);
      const pitchOf = (g: Para[]) => g.reduce((a, p) => a + (p.level ? size * 0.85 * 1.6 : size * 1.25 + size * 0.75), 0);
      const needed = groups.reduce((a, g) => a + pitchOf(g), 0);
      const k = needed > avail ? avail / needed : 1;
      const els = groups.map((g, n) => {
        const h = pitchOf(g) * k;
        const doc = g.map((p) => (p.level ? { ...p, runs: p.runs.map((r) => ({ ...r, size: r.size ?? Math.round(size * 0.85) })) } : p));
        const e = sb.t(doc, x, y, w, { s: size, w: 500, lh: 1.25, name: `Bullet ${n + 1}`, h: Math.max(30, h - 4), fit: 'shrink' });
        y += h;
        return e;
      });
      els.forEach((e, n) => fx('body', 'rise', e, { trigger: onClick ? 'click' : 'with', delay: onClick ? 0 : 120 + n * 120, params: { dist: 36 } }));
      if (visual) {
        const top = below(ttl, 70);
        const vx = side === 'left' ? m : m + w + 80, vw = cw - w - 80, vh = bottom - top;
        if (visual === 'image') {
          const img = await placeImage(cx, sb, str(get(s, 'image')), vx, top, vw, vh, num(get(s, 'radius'), 32, 0, 400), get(s, 'fit') === 'contain' ? 'contain' : 'cover');
          fx('deco', 'zoom-in', img, { delay: 200 });
        } else {
          const card = sb.r('round-rect', vx, top, vw, vh, lin(145, ['@primary', 0], ['@secondary', 1]), { radius: 40, name: 'Visual card', fx: { shadow: 'lg' } });
          const sz = Math.min(240, vw * 0.5, vh * 0.5);
          const ic = sb.add(I(icon(get(s, 'icon'), warn), vx + vw / 2 - sz / 2, top + vh / 2 - sz / 2, sz, '#ffffff', { name: 'Icon' }));
          fx('deco', 'pop', [card, ic], { delay: 200, each: 120 });
        }
      }
      break;
    }
    case 'two-column':
    case 'comparison': {
      const ttl = heading();
      const top = below(ttl, 70);
      const L0 = get(s, 'left', 'leftColumn', 'before', 'pros', 'us', 'column1');
      const R0 = get(s, 'right', 'rightColumn', 'after', 'cons', 'them', 'column2');
      const colIn = (v: unknown, head: unknown) => isRec(v) ? { head: str(get(v, 'title', 'heading', 'label') ?? head), items: list(get(v, 'items', 'bullets', 'points', 'text')) } : { head: str(head), items: list(v) };
      const cols = [colIn(L0, get(s, 'leftTitle', 'leftHeading', 'beforeTitle', 'prosTitle')), colIn(R0, get(s, 'rightTitle', 'rightHeading', 'afterTitle', 'consTitle'))];
      const colW = (cw - 64) / 2;
      const cmp = layout === 'comparison';
      fx('title', 'fade-in', ttl, { trigger: 'after', dur: 500 });
      cols.forEach((c, k) => {
        const x = m + k * (colW + 64);
        const card = cmp ? sb.r('round-rect', x, top, colW, bottom - top, k ? '@bg' : '@surface', { radius: 36, name: `Card ${k + 1}`, ...(k ? { stroke: { c: '@primary', w: 4 } } : {}) }) : null;
        const pad = cmp ? 56 : 0;
        const h = c.head ? sb.t(c.head.toUpperCase(), x + pad, top + pad * 0.8, colW - pad * 2, { s: 28, w: 700, ls: 3, c: k ? '@primary' : '@muted', name: `Heading ${k + 1}`, h: 44 }) : null;
        const by = top + pad * 0.8 + (h ? 80 : 0);
        const b = sb.t(bulletParas(c.items, false, 26), x + pad, by, colW - pad * 2, { s: num(get(s, 'textSize'), 40, 18, 80), w: 500, lh: 1.25, name: `Column ${k + 1}`, h: bottom - by - pad * 0.6, fit: 'shrink' });
        fx('body', 'rise', [card, h, b].filter(Boolean) as El[], { trigger: onClick ? 'click' : 'with', delay: onClick ? 0 : 150 + k * 150, each: 60 });
      });
      break;
    }
    case 'quote': {
      const q = str(get(s, 'quote', 'text', 'body')) || title;
      const by = [str(get(s, 'author', 'by', 'name', 'source', 'who')), str(get(s, 'role', 'company', 'position', 'org'))].filter(Boolean);
      sb.t('“', m, H * 0.1, 300, { s: 380, w: 700, c: '@primary', f: 'Georgia', lh: 1, h: 360, fit: 'none', name: 'Quote mark' });
      const qt = sb.t(rich(q), m + 180, H * 0.3, cw - 260, { s: q.length > 200 ? 46 : q.length > 120 ? 56 : 72, w: 500, lh: 1.2, ls: -1, f: '@heading', name: 'Quote' });
      const maxQ = bottom - qt.y - (by.length ? 150 : 0);
      if (qt.h > maxQ) { qt.h = maxQ; qt.fit = 'shrink'; }
      const at = by.length ? sb.t([P([{ t: by[0]!, w: 600, size: 34 }]), ...(by[1] ? [P([{ t: by[1], c: '@muted', size: 28 }])] : [])], m + 180, qt.y + qt.h + 50, cw - 260, { lh: 1.35, name: 'Attribution' }) : null;
      fx('title', 'blur-in', qt, { trigger: 'after' });
      fx('body', 'fade-in', at, { delay: 600 });
      break;
    }
    case 'stats': {
      const ttl = heading();
      const stats = list(get(s, 'stats', 'metrics', 'numbers', 'kpis', 'items'), LIMITS.stats).map((x) => (isRec(x) ? x : { value: str(x) }));
      const n = Math.max(1, stats.length), gap = 64, colW = (cw - gap * (n - 1)) / n;
      const top = Math.max(below(ttl, 90), H * 0.36);
      const palette = ['@primary', '@secondary', '@accent', '@primary'];
      fx('title', 'fade-in', ttl, { trigger: 'after', dur: 500 });
      stats.forEach((st, k) => {
        const x = m + k * (colW + gap), c = color(get(st, 'color'), palette[k]!)!;
        const val = str(get(st, 'value', 'number', 'stat', 'figure', 'metric'));
        const vs = Math.min(n > 3 ? 120 : 150, Math.floor(colW / Math.max(2, val.length) / 0.58));
        const rule = sb.r('rect', x, top, colW, 8, c, { name: `Rule ${k + 1}` });
        const v = sb.t(val, x, top + 50, colW, { s: vs, w: 700, c, ls: -4, lh: 1, h: vs * 1.1, name: `Stat ${k + 1}`, fit: 'shrink' });
        const ly = top + 50 + vs * 1.1 + 30;
        const l = sb.t(rich(str(get(st, 'label', 'title', 'name', 'caption'))), x, ly, colW, { s: 40, w: 600, name: `Label ${k + 1}` });
        const note = str(get(st, 'note', 'description', 'detail', 'sub', 'text'));
        const d = note ? sb.t(rich(note), x, l.y + l.h + 12, colW, { s: 28, c: '@muted', name: `Note ${k + 1}` }) : null;
        fx('deco', 'wipe-in', rule, { trigger: onClick ? 'click' : 'with', delay: onClick ? 0 : 100 + k * 180 });
        fx('body', 'pop', v, { delay: 100 });
        fx('body', 'fade-in', [l, d].filter(Boolean) as El[], { delay: 150, each: 80 });
      });
      break;
    }
    case 'big-number':
    case 'statement': {
      const big = layout === 'big-number';
      const text = str(get(s, big ? 'value' : 'statement', 'value', 'number', 'text')) || title;
      const size = big ? Math.min(300, Math.floor(cw / Math.max(2, text.length) / 0.58)) : num(get(s, 'titleSize'), 110, 40, 200);
      const v = sb.t(rich(text), m, H * (big ? 0.22 : 0.28), cw, { s: size, w: 700, a: 'center', ls: big ? -8 : -3, lh: 1.05, c: big ? color(get(s, 'color'), '@primary') : '@text', f: '@heading', name: big ? 'Number' : 'Statement' });
      if (v.h > H * 0.5) { v.h = H * 0.5; v.fit = 'shrink'; }
      const lab = str(get(s, 'label', 'caption', 'description')) || (big && title !== text ? title : '') || subtitle;
      const l = lab ? sb.t(rich(lab), m + cw * 0.1, v.y + v.h + 40, cw * 0.8, { s: 48, a: 'center', c: '@muted', name: 'Label' }) : null;
      fx('title', big ? 'pop' : 'cascade-words', v, { trigger: 'after' });
      fx('body', 'fade-in', l, { delay: 400 });
      break;
    }
    case 'chart': {
      const ttl = heading();
      const ch0 = get(s, 'chart', 'data', 'graph');
      const ch = isRec(ch0) ? ch0 : s;
      const top = below(ttl, 60);
      const cap = str(get(s, 'caption', 'takeaway', 'insight', 'note'));
      const w = cap ? cw * 0.64 : cw;
      const el = chartEl(cx, ch, m, top, w, bottom - top);
      fx('title', 'fade-in', ttl, { trigger: 'after', dur: 500 });
      if (el) { sb.add(el); fx('body', 'draw-on', el, { delay: 150 }); }
      if (cap) { const c = sb.t(rich(cap), m + w + 80, top + 40, cw - w - 80, { s: 44, w: 600, lh: 1.25, name: 'Takeaway', h: bottom - top - 40, fit: 'shrink' }); fx('body', 'rise', c, { delay: 700 }); }
      break;
    }
    case 'table': {
      const ttl = heading();
      const top = below(ttl, 60);
      const el = tableEl(cx, s, m, top, cw, bottom - top);
      fx('title', 'fade-in', ttl, { trigger: 'after', dur: 500 });
      if (el) { sb.add(el); fx('body', 'wipe-in', el, { delay: 150 }); }
      break;
    }
    case 'image':
    case 'full-image': {
      const full = layout === 'full-image' || bool(get(s, 'full', 'fullBleed', 'fullscreen'));
      const src = str(get(s, 'image', 'src', 'url', 'photo'));
      const fit = get(s, 'fit') === 'contain' ? 'contain' : 'cover';
      if (full) {
        const img = src ? await placeImage(cx, sb, src, 0, 0, W, H, 0, 'cover') : null;
        fx('deco', 'focus-pull', img, { trigger: 'after' });
        if (title || subtitle) {
          sb.r('rect', 0, H * 0.5, W, H * 0.5, lin(180, ['rgba(0,0,0,0)', 0], ['rgba(0,0,0,0.72)', 1]), { name: 'Scrim' });
          const t = title ? sb.t(rich(title), m, H - m - 200 - (subtitle ? 70 : 0), cw, { s: 96, w: 700, c: '#ffffff', ls: -2, f: '@heading', ph: 'title', name: 'Title', h: 200, v: 'bottom', fit: 'shrink' }) : null;
          const st = subtitle ? sb.t(rich(subtitle), m, H - m - 60, cw, { s: 38, c: 'rgba(255,255,255,0.85)', name: 'Subtitle', h: 60, fit: 'shrink' }) : null;
          fx('title', 'rise', t, { delay: 300 });
          fx('body', 'fade-in', st, { delay: 500 });
        }
      } else {
        const ttl = heading();
        const top = below(ttl, 60);
        const cap = str(get(s, 'caption', 'credit', 'description'));
        const img = src ? await placeImage(cx, sb, src, m, top, cw, bottom - top - (cap ? 80 : 0), num(get(s, 'radius'), 24, 0, 400), fit) : null;
        const c = cap ? sb.t(rich(cap), m, bottom - 50, cw, { s: 30, c: '@muted', a: 'center', name: 'Caption', h: 50, fit: 'shrink' }) : null;
        fx('title', 'fade-in', ttl, { trigger: 'after', dur: 500 });
        fx('deco', 'zoom-in', img, { delay: 150 });
        fx('body', 'fade-in', c, { delay: 500 });
      }
      break;
    }
    case 'timeline': {
      const ttl = heading();
      const steps = list(get(s, 'steps', 'milestones', 'stages', 'events', 'items', 'phases'), LIMITS.steps).map((x) => (isRec(x) ? { label: str(get(x, 'label', 'title', 'date', 'name', 'year', 'step')), text: str(get(x, 'text', 'description', 'detail', 'body')) } : { label: str(x), text: '' }));
      const n = Math.max(1, steps.length), colW = cw / n, y = Math.max(below(ttl, 200), H * 0.5);
      const line = sb.add(L(m, y, m + cw, y, '@surface', 6, { name: 'Track' }));
      const ls = n > 5 ? 32 : 40;
      fx('title', 'fade-in', ttl, { trigger: 'after', dur: 500 });
      fx('deco', 'draw-on', line, { dur: 900 });
      steps.forEach((st, k) => {
        const x = m + k * colW + colW / 2;
        const dot = sb.r('ellipse', x - 22, y - 22, 44, 44, '@primary', { name: `Step ${k + 1} dot` });
        const l = sb.t(rich(st.label), x - colW / 2 + 12, y - 40 - ls * 2.4, colW - 24, { s: ls, w: 700, a: 'center', name: `Step ${k + 1}`, h: ls * 2.4, v: 'bottom', fit: 'shrink' });
        const d = st.text ? sb.t(rich(st.text), x - colW / 2 + 12, y + 56, colW - 24, { s: n > 5 ? 24 : 28, c: '@muted', a: 'center', name: `Step ${k + 1} text`, h: bottom - y - 56, fit: 'shrink' }) : null;
        fx('body', 'pop', dot, { trigger: onClick ? 'click' : 'with', delay: onClick ? 0 : 300 + k * 220 });
        fx('body', 'rise', [l, d].filter(Boolean) as El[], { delay: 80, each: 60, params: { dist: 24 } });
      });
      break;
    }
    case 'cards': {
      const ttl = heading();
      const cards = list(get(s, 'cards', 'features', 'items', 'pillars', 'boxes', 'people', 'team'), LIMITS.cards).map((x) => (isRec(x) ? x : { title: str(x) }));
      const n = Math.max(1, cards.length), perRow = n <= 3 ? n : Math.ceil(n / 2), rowsN = Math.ceil(n / perRow);
      const top = below(ttl, 60), gap = 40;
      const w = (cw - gap * (perRow - 1)) / perRow, h = Math.min((bottom - top - gap * (rowsN - 1)) / rowsN, Math.max(360, w * 0.85));
      fx('title', 'fade-in', ttl, { trigger: 'after', dur: 500 });
      for (let k = 0; k < cards.length; k++) {
        const c = cards[k]!;
        const x = m + (k % perRow) * (w + gap), y = top + Math.floor(k / perRow) * (h + gap);
        const card = sb.r('round-rect', x, y, w, h, color(get(c, 'color', 'fill'), '@surface')!, { radius: 32, name: `Card ${k + 1}` });
        const pad = Math.min(44, w * 0.1);
        const img = str(get(c, 'image'));
        const pic = img ? await placeImage(cx, sb, img, x, y, w, h * 0.42, 32) : null;
        const ic = !pic && get(c, 'icon') !== undefined ? sb.add(I(icon(get(c, 'icon'), warn), x + pad, y + pad, Math.min(96, h * 0.22), '@primary', { name: `Card ${k + 1} icon` })) : null;
        const ty = pic ? y + h * 0.42 + 24 : y + pad + (ic ? ic.h + 24 : 0);
        const tsz = rowsN > 1 ? 34 : 42;
        const t = sb.t(rich(str(get(c, 'title', 'name', 'heading', 'label'))), x + pad, ty, w - pad * 2, { s: tsz, w: 700, name: `Card ${k + 1} title`, h: tsz * 1.25 * 2, fit: 'shrink' });
        if (t.h > tsz * 1.3) t.h = tsz * 1.25 * 2;
        const txt = str(get(c, 'text', 'description', 'body', 'detail', 'role'));
        const d = txt ? sb.t(rich(txt), x + pad, ty + tsz * 1.3 + 14, w - pad * 2, { s: rowsN > 1 ? 26 : 30, c: '@muted', name: `Card ${k + 1} text`, h: Math.max(40, y + h - pad - (ty + tsz * 1.3 + 14)), fit: 'shrink' }) : null;
        fx('body', 'spring-up', [card, pic, ic, t, d].filter(Boolean) as El[], { trigger: onClick ? 'click' : 'with', delay: onClick ? 0 : 150 + k * 120, each: 40 });
      }
      break;
    }
    case 'agenda': {
      const ttl = heading();
      const items = strs(get(s, 'items', 'bullets', 'points', 'topics', 'sections'));
      const top = below(ttl, 70), pitch = Math.min(170, (bottom - top) / Math.max(1, items.length));
      fx('title', 'fade-in', ttl, { trigger: 'after', dur: 500 });
      items.forEach((t, k) => {
        const y = top + k * pitch;
        const sz = Math.min(54, pitch * 0.42);
        const nb = sb.t(String(k + 1).padStart(2, '0'), m, y, 140, { s: sz, w: 600, c: '@primary', name: `Num ${k + 1}`, h: pitch - 8 });
        const it = sb.t(rich(t), m + 180, y, cw - 180, { s: sz, w: 600, name: `Item ${k + 1}`, h: pitch - 8, fit: 'shrink' });
        fx('body', 'rise', [nb, it], { trigger: onClick ? 'click' : 'with', delay: onClick ? 0 : 120 + k * 140, params: { dist: 30 } });
      });
      break;
    }
    default: // blank
      if (title) { const t = heading(); fx('title', 'fade-in', t, { trigger: 'after' }); }
  }

  // Free-form extras on any slide.
  const extras = list(get(s, 'elements', 'objects', 'shapes', 'extras'), LIMITS.elements).filter(isRec);
  for (const raw of extras) {
    try {
      const el = await freeElement(cx, sb, raw);
      if (!el) continue;
      const a = get(raw, 'animate', 'animation', 'entrance');
      if (a === undefined || !anim) continue;
      const spec = isRec(a) ? a : { preset: a };
      const id = presetId(get(spec, 'preset', 'type', 'name', 'effect'), warn);
      if (!id) continue;
      const on = str(get(spec, 'on', 'trigger', 'start')).toLowerCase();
      const trigger = on.includes('with') ? 'with' : on.includes('after') ? 'after' : 'click';
      const dur = get(spec, 'duration', 'dur');
      sb.fx(id, el, { trigger, delay: seconds(get(spec, 'delay') ?? 0, 0, 0, 30000), ...(dur !== undefined ? { dur: seconds(dur, 600, 50, 30000) } : {}) });
    } catch {
      warn('an element couldn\'t be added');
    }
  }

  const tc = str(get(s, 'textColor', 'ink', 'text-color')).toLowerCase();
  if (tc === 'light' || tc === 'white' || (bgr.dark && tc !== 'dark')) ink(sb.slide.elements.slice(before), true);
  else if (tc === 'dark' || tc === 'black') ink(sb.slide.elements.slice(before), false);
  contain(sb.slide.elements, W, H, m);
  return sb.done();
}

function chartEl(cx: Ctx, ch: Rec, x: number, y: number, w: number, h: number) {
  const KINDS = ['column', 'bar', 'line', 'area', 'pie', 'donut', 'scatter'];
  let kind = str(get(ch, 'kind', 'chartType', 'type', 'style'), 'column').toLowerCase().replace(/[\s_-]*chart$/, '').trim();
  if (kind === 'doughnut' || kind === 'ring') kind = 'donut';
  if (kind === 'horizontal-bar' || kind === 'hbar') kind = 'bar';
  if (kind === 'vertical-bar' || kind === 'bars') kind = 'column';
  if (!KINDS.includes(kind)) { if (str(get(ch, 'kind', 'chartType'))) cx.warn(`unknown chart type "${kind}" (used column)`); kind = 'column'; }
  let cats = strs(get(ch, 'categories', 'labels', 'x', 'xAxis', 'keys'), LIMITS.cats);
  const data0 = get(ch, 'data');
  const seriesIn = get(ch, 'series', 'datasets') ?? (Array.isArray(data0) ? data0 : undefined);
  // A bare list of numbers is one series.
  const flatIn = Array.isArray(seriesIn) && seriesIn.every((v) => typeof v === 'number' || (typeof v === 'string' && Number.isFinite(parseFloat(v))));
  let series = (flatIn ? [] : list(seriesIn, LIMITS.series)).flatMap((sr, k) => {
    if (typeof sr === 'number' || typeof sr === 'string') return [];
    if (Array.isArray(sr)) return [{ name: `Series ${k + 1}`, values: sr.map((v) => num(v, 0)) }];
    if (!isRec(sr)) return [];
    const vals = get(sr, 'values', 'data', 'y', 'points');
    return [{ name: str(get(sr, 'name', 'label', 'title'), `Series ${k + 1}`), values: (Array.isArray(vals) ? vals : isRec(vals) ? Object.values(vals) : []).slice(0, LIMITS.cats).map((v) => num(isRec(v) ? get(v, 'value', 'y') : v, 0)), ...(color(get(sr, 'color')) ? { color: color(get(sr, 'color'))! } : {}) }];
  });
  // Also accept `values` directly, or `data: { "Jan": 3, "Feb": 5 }`.
  const flat = flatIn ? seriesIn : get(ch, 'values');
  if (!series.length && Array.isArray(flat)) series = [{ name: str(get(ch, 'name', 'seriesName'), 'Value'), values: flat.map((v) => num(v, 0)) }];
  const obj = data0;
  if (!series.length && isRec(obj)) { cats = Object.keys(obj).slice(0, LIMITS.cats); series = [{ name: 'Value', values: cats.map((c) => num(obj[c], 0)) }]; }
  if (!series.length) { cx.warn('a chart had no data'); return null; }
  const len = Math.max(cats.length, ...series.map((sr) => sr.values.length));
  while (cats.length < len) cats.push(String(cats.length + 1));
  series = series.map((sr) => ({ ...sr, values: Array.from({ length: len }, (_, i) => sr.values[i] ?? 0) }));
  return C(cx.th, x, y, w, h, {
    kind: kind as never, categories: cats, series,
    legend: series.length > 1 || kind === 'pie' || kind === 'donut' ? 'bottom' : 'none',
    labels: get(ch, 'showValues', 'labels', 'dataLabels') !== false, stacked: bool(get(ch, 'stacked')), smooth: bool(get(ch, 'smooth', 'curved')), size: 26, name: str(get(ch, 'title', 'name'), 'Chart'),
  });
}

function tableEl(cx: Ctx, o: Rec, x: number, y: number, w: number, h: number) {
  let rows: string[][] = [];
  const raw = get(o, 'rows', 'table', 'data', 'cells');
  const t = isRec(raw) ? raw : null;
  const rr = t ? get(t, 'rows', 'data', 'body') : raw;
  for (const r of (Array.isArray(rr) ? rr : []).slice(0, LIMITS.rows + 1)) {
    if (Array.isArray(r)) rows.push(r.slice(0, LIMITS.cols).map((c) => str(c)));
    else if (isRec(r)) rows.push(Object.values(r).slice(0, LIMITS.cols).map((c) => str(c)));
    else if (typeof r === 'string') rows.push(r.split(/\s*\|\s*/).filter((c, i, a) => c !== '' || (i > 0 && i < a.length - 1)).slice(0, LIMITS.cols));
  }
  // Header from `columns`/`headers`, or the keys of object rows.
  const hd = get(o, 'columns', 'headers', 'header') ?? (t ? get(t, 'columns', 'headers') : undefined);
  if (Array.isArray(hd)) rows.unshift(hd.slice(0, LIMITS.cols).map((c) => str(c)));
  else if (Array.isArray(rr) && isRec(rr[0]) && !Array.isArray(hd)) rows.unshift(Object.keys(rr[0] as Rec).slice(0, LIMITS.cols));
  rows = rows.filter((r) => r.length && !r.every((c) => /^:?-{2,}:?$/.test(c.trim())));
  if (!rows.length) { cx.warn('a table had no rows'); return null; }
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const header = get(o, 'header') !== false;
  const rowH = Math.max(44, Math.min(120, Math.floor(h / rows.length)));
  const widths = Array(cols).fill(w / cols);
  return TB(cx.th, x, y, {
    widths, rowH, size: rowH > 90 ? 32 : rowH > 64 ? 26 : 20, banded: true, header,
    rows: rows.map((r, k) => Array.from({ length: cols }, (_, j) => (k === 0 && header ? { t: r[j] ?? '', b: true } : r[j] ?? ''))),
    name: 'Table',
  });
}

async function placeImage(cx: Ctx, sb: SB, src: string, x: number, y: number, w: number, h: number, radius: number, fit: 'cover' | 'contain' = 'cover'): Promise<El | null> {
  if (w <= 4 || h <= 4) return null;
  const meta = await cx.image(src);
  if (!meta) return null;
  let bx = x, by = y, bw = w, bh = h;
  if (fit === 'contain' && meta.w && meta.h) {
    const k = Math.min(w / meta.w, h / meta.h);
    bw = meta.w * k; bh = meta.h * k; bx = x + (w - bw) / 2; by = y + (h - bh) / 2;
  }
  const img = newImage(meta.id, bx, by, bw, bh, { radius, name: meta.name });
  if (fit === 'cover') coverCrop(img, meta, w, h);
  return sb.add(img);
}

const SHADOW = (v: unknown) => (v === true ? 'md' : ['sm', 'md', 'lg'].includes(str(v)) ? str(v) : undefined);

async function freeElement(cx: Ctx, sb: SB, e: Rec): Promise<El | null> {
  const { th, W, H, warn } = cx;
  const x = dim(get(e, 'x', 'left'), W, 120), y = dim(get(e, 'y', 'top'), H, 120);
  const w = Math.max(4, dim(get(e, 'w', 'width'), W, 400)), h = Math.max(4, dim(get(e, 'h', 'height'), H, 200));
  const common = (el: El) => {
    el.rot = num(get(e, 'rotation', 'rotate', 'rot', 'angle'), 0, -360, 360);
    el.opacity = num(get(e, 'opacity', 'alpha'), 1, 0, 1);
    const nm = str(get(e, 'name', 'id'));
    if (nm) el.name = nm.slice(0, 60);
    const mk = str(get(e, 'match', 'morph', 'magicMove', 'key'));
    if (mk) el.morph = mk.slice(0, 60);
    const ln = str(get(e, 'link', 'href', 'url'));
    if (/^(https?:|mailto:)/.test(ln) && el.type !== 'image') el.link = ln;
    const sh = SHADOW(get(e, 'shadow'));
    if (sh) el.fx = { ...(el.fx ?? {}), shadow: sh };
    return el;
  };
  const type = str(get(e, 'type', 'kind', 'element'), get(e, 'text') !== undefined ? 'text' : get(e, 'icon') !== undefined ? 'icon' : get(e, 'src', 'image') !== undefined ? 'image' : 'shape').toLowerCase();
  switch (type) {
    case 'text': case 'textbox': case 'label': case 'heading': case 'title': case 'paragraph': {
      const a = str(get(e, 'align', 'textAlign')).toLowerCase();
      const o: TO = {
        s: num(get(e, 'size', 'fontSize'), type === 'heading' || type === 'title' ? 72 : 40, 8, 600),
        w: num(get(e, 'weight', 'fontWeight'), get(e, 'bold') === true || type === 'heading' || type === 'title' ? 700 : 400, 100, 900),
        c: color(get(e, 'color', 'textColor')), a: (['left', 'center', 'right'].includes(a) ? a : 'left') as TO['a'],
        f: font(get(e, 'font', 'fontFamily')) ?? (type === 'heading' || type === 'title' ? '@heading' : undefined),
        i: bool(get(e, 'italic')), ls: num(get(e, 'letterSpacing', 'tracking'), 0, -20, 40), lh: num(get(e, 'lineHeight', 'leading'), 1.25, 0.7, 3),
        v: (['top', 'middle', 'bottom'].includes(str(get(e, 'verticalAlign', 'valign'))) ? str(get(e, 'verticalAlign', 'valign')) : 'top') as TO['v'],
        up: bool(get(e, 'uppercase', 'caps')),
      };
      if (get(e, 'h', 'height') !== undefined) { o.h = h; o.fit = 'shrink'; }
      const bg = color(get(e, 'background', 'fill', 'highlight'));
      if (bg) { o.fill = bg; o.pad = num(get(e, 'padding', 'pad'), 24, 0, 200); o.r = num(get(e, 'radius'), 16, 0, 400); }
      const bl = get(e, 'bullets', 'points', 'items');
      const doc = bl !== undefined ? bulletParas(list(bl), bool(get(e, 'numbered'))) : rich(o.up ? str(get(e, 'text', 'content', 'value')).toUpperCase() : str(get(e, 'text', 'content', 'value')));
      return common(sb.add(T(th, doc, x, y, w, o)));
    }
    case 'shape': case 'box': case 'rect': case 'rectangle': case 'circle': case 'ellipse': {
      const shapeName = get(e, 'shape', 'form') ?? (type === 'circle' || type === 'ellipse' ? 'ellipse' : 'rect');
      const kind = shapeKind(shapeName, warn);
      const pill = str(shapeName).toLowerCase() === 'pill';
      const fill0 = get(e, 'fill', 'color', 'background');
      const fillC = isRec(fill0) || Array.isArray(fill0) ? (await background(cx, sb, Array.isArray(fill0) ? { gradient: fill0 } : fill0)).fill : fill0 === null || fill0 === 'none' ? null : fl(color(fill0, '@primary')!);
      const stroke = color(get(e, 'stroke', 'border', 'outline'));
      const el = sb.add(R(kind, x, y, w, h, fillC ?? (fill0 === null || fill0 === 'none' ? null : fl('@primary')), {
        radius: num(get(e, 'radius', 'cornerRadius', 'rounded'), pill ? Math.min(w, h) / 2 : kind === 'round-rect' ? 32 : 0, 0, 1000),
        ...(stroke ? { stroke: { c: stroke, w: num(get(e, 'strokeWidth', 'borderWidth'), 4, 0, 100) } } : {}),
      }));
      const label = str(get(e, 'text', 'label'));
      if (label) {
        el.doc = rich(label);
        el.base = { font: font(get(e, 'font')) ?? '@body', size: num(get(e, 'size', 'fontSize'), 36, 8, 400), weight: num(get(e, 'weight'), 600, 100, 900), color: color(get(e, 'textColor'), '#ffffff')!, align: 'center', lh: 1.2, ls: 0 };
        el.vAlign = 'middle';
      }
      return common(el);
    }
    case 'icon': {
      const size = num(get(e, 'size'), get(e, 'w', 'width') !== undefined ? w : 120, 8, 2000);
      return common(sb.add(I(icon(get(e, 'icon', 'name'), warn), x, y, size, color(get(e, 'color'), '@primary')!)));
    }
    case 'line': case 'arrow': case 'divider': case 'rule': {
      const x1 = dim(get(e, 'x1', 'x'), W, x), y1 = dim(get(e, 'y1', 'y'), H, y);
      const x2 = dim(get(e, 'x2'), W, x1 + w), y2 = dim(get(e, 'y2'), H, get(e, 'x2') !== undefined || get(e, 'y2') !== undefined ? y1 : y1);
      const el = sb.add(L(x1, y1, x2, y2, color(get(e, 'color', 'stroke'), '@text')!, num(get(e, 'width', 'thickness', 'strokeWidth'), 4, 1, 80)));
      if (type === 'arrow' || bool(get(e, 'arrow'))) el.end = 'arrow';
      return common(el);
    }
    case 'image': case 'photo': case 'picture': case 'logo': {
      const img = await placeImage(cx, sb, str(get(e, 'src', 'image', 'url')), x, y, w, h, num(get(e, 'radius'), 0, 0, 1000), get(e, 'fit') === 'contain' || type === 'logo' ? 'contain' : 'cover');
      return img ? common(img) : null;
    }
    case 'chart': case 'graph': {
      const c = chartEl(cx, e, x, y, w, h);
      return c ? common(sb.add(c)) : null;
    }
    case 'table': {
      const t = tableEl(cx, e, x, y, w, h);
      return t ? common(sb.add(t)) : null;
    }
    default:
      warn(`unknown element type "${type}"`);
      return null;
  }
}

/** A plain slide used when an outline slide couldn't be built. */
function fallbackSlide(cx: Ctx, s: unknown): Slide {
  const sb = new SB(cx.th, { w: cx.W, h: cx.H });
  const rec = isRec(s) ? s : {};
  const title = str(get(rec, 'title', 'heading')) || 'Slide';
  sb.t(rich(title), cx.m, cx.m, cx.W - cx.m * 2, { s: 76, w: 700, f: '@heading', ph: 'title', name: 'Title' });
  const body = isRec(s) ? '' : str(s);
  if (body) sb.t(rich(body), cx.m, cx.m + 200, cx.W - cx.m * 2, { s: 40, name: 'Body', h: cx.H - cx.m * 2 - 200, fit: 'shrink' });
  sb.slide.notes = str(get(rec, 'notes'));
  return sb.done();
}

/** Find the outline in parsed JSON: the object itself, a wrapper like `{ presentation: {...} }`, or a bare list of slides. */
function unwrap(v: unknown): Rec | null {
  if (Array.isArray(v)) return { slides: v };
  if (!isRec(v)) return null;
  if (Array.isArray(get(v, 'slides', 'pages', 'scenes'))) return v;
  for (const k of ['presentation', 'deck', 'outline', 'frames', 'data', 'result']) {
    const inner = get(v, k);
    const u = isRec(inner) || Array.isArray(inner) ? unwrap(inner) : null;
    if (u) return { ...v, ...u };
  }
  return null;
}

/** Pull the outline JSON out of whatever was pasted: raw JSON or a fenced code block in an AI reply. */
export function extractOutlineJson(text: string): unknown {
  const fences = [...text.matchAll(/```[\w-]*[^\S\n]*\n?([\s\S]*?)(?:```|$)/g)].map((m) => m[1]!.trim()).filter((b) => /[{[]/.test(b));
  const candidates = fences.length ? fences.sort((a, b) => b.length - a.length) : [text];
  let lastErr: Error | null = null;
  for (const c of candidates) {
    const start = c.search(/[{[]/);
    if (start < 0) continue;
    try {
      const { value } = parseLenient(c.slice(start));
      if (unwrap(value)) return value;
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw new Error(lastErr ? "Couldn't find a Frames outline in that text. Make sure you pasted the AI's whole reply." : "That doesn't look like a Frames outline. It should be JSON that starts with {.");
}

/** True when parsed JSON looks like an outline rather than a full project. */
export function isOutline(v: unknown): boolean {
  return unwrap(v) !== null && !(isRec(v) && v.v === 1 && isRec(v.theme) && isRec(v.size));
}

/** Build and save a deck from an outline object. Only fails when there are no slides at all. */
export async function importOutline(raw0: unknown): Promise<{ deck: Deck; warnings: string[] }> {
  const raw = unwrap(raw0);
  if (!raw) throw new Error('A Frames outline needs a "slides" list.');
  const warnings: string[] = [];
  const warn = (s: string) => { if (!warnings.includes(s) && warnings.length < 50) warnings.push(s); };
  const th = themeFrom(raw, warn);
  const sizeKey = str(get(raw, 'size', 'aspect', 'aspectRatio', 'ratio')).replace(/\s|x/gi, (c) => (c.toLowerCase() === 'x' ? ':' : '')).replace('/', ':');
  const size = { ...(SLIDE_SIZES[sizeKey as keyof typeof SLIDE_SIZES] ?? (/(portrait|vertical|story|phone)/i.test(sizeKey) ? SLIDE_SIZES['9:16'] : /square/i.test(sizeKey) ? SLIDE_SIZES['1:1'] : SLIDE_SIZES['16:9'])) };
  const deck = newDeck(str(get(raw, 'title', 'name', 'deckTitle'), 'Untitled presentation').split('\n')[0]!.slice(0, 120) || 'Untitled presentation', { theme: th, size });
  deck.margin = Math.round(Math.min(size.w, size.h) * 0.1);
  const footer = str(get(raw, 'footer'));
  if (footer) deck.master.elements = [T(th, footer, deck.margin, size.h - 70, size.w - deck.margin * 2, { s: 22, c: '@muted', name: 'Footer', h: 36, fit: 'shrink' })];

  const cache = new Map<string, Promise<AssetMeta | null>>();
  const cx: Ctx = {
    th, W: size.w, H: size.h, m: deck.margin, animate: get(raw, 'animate', 'animations') !== false && get(raw, 'animate') !== 'none', warn,
    defaultTransition: transitionOf(get(raw, 'transition', 'defaultTransition'), warn),
    image: (src) => {
      src = src.trim();
      if (!/^(https?:|data:image\/)/i.test(src)) { if (src) warn(`skipped an image that isn't a web address (${src.slice(0, 40)})`); return Promise.resolve(null); }
      if (!cache.has(src)) cache.set(src, (async () => {
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 15000);
          const res = await fetch(src, { signal: ctl.signal }).finally(() => clearTimeout(timer));
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          if (blob.size > 40 * 1024 * 1024) throw new Error('too large');
          const type = blob.type || (/\.svg(\?|$)/i.test(src) ? 'image/svg+xml' : '');
          if (!type.startsWith('image/')) throw new Error('not an image');
          const typed = type === blob.type ? blob : new Blob([blob], { type });
          const bmp = await createImageBitmap(typed).catch(() => null);
          if (!bmp && !type.includes('svg')) throw new Error('unreadable');
          const meta: AssetMeta = { id: uid('m'), name: src.startsWith('data:') ? 'Image' : decodeURIComponent(src.split('/').pop()!.split('?')[0]!).slice(0, 60) || 'Image', kind: type.includes('svg') ? 'svg' : 'image', mime: type, bytes: typed.size, w: bmp?.width, h: bmp?.height };
          bmp?.close();
          await putAsset(meta, typed);
          deck.assets[meta.id] = meta;
          return meta;
        } catch {
          warn(`an image couldn't be downloaded (${src.startsWith('data:') ? 'embedded image' : src.slice(0, 60)})`);
          return null;
        }
      })());
      return cache.get(src)!;
    },
  };
  const list0 = (get(raw, 'slides', 'pages', 'scenes') as unknown[]).filter((x) => x !== null && x !== undefined).slice(0, LIMITS.slides);
  for (let i = 0; i < list0.length; i++) {
    const s = list0[i];
    try {
      deck.slides.push(isRec(s) ? await buildSlide(cx, s, i, list0.length) : await buildSlide(cx, { title: str(s) }, i, list0.length));
    } catch (e) {
      console.warn('[frames] outline slide failed', i + 1, e);
      warn(`slide ${i + 1} was simplified`);
      deck.slides.push(fallbackSlide(cx, s));
    }
  }
  if (!deck.slides.length) throw new Error('The outline has no slides.');
  await saveDeck(deck);
  return { deck, warnings };
}

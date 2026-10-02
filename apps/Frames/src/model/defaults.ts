import { clone } from './clone';
import { uid } from './ids';
import { THEME_FRAMES } from './theme';
import type {
  ChartEl, DesignSystem, Deck, El, Fill, GroupEl, IconEl, ImageEl, Layout, LineEl, Para, RichDoc, Run, ShapeEl, ShapeKind, Slide, Stroke, TableCell, TableEl, TextBase, TextEl, VideoEl, AudioEl,
} from './types';

export const SLIDE_SIZES = {
  '16:9': { w: 1920, h: 1080 },
  '16:10': { w: 1920, h: 1200 },
  '4:3': { w: 1600, h: 1200 },
  '1:1': { w: 1440, h: 1440 },
  '9:16': { w: 1080, h: 1920 },
} as const;
export type SlideSizeKey = keyof typeof SLIDE_SIZES;

export const solid = (c: string): Fill => ({ t: 'solid', c });

// ── Rich text helpers ────────────────────────────────────────────────────────

export const para = (t: string, run: Omit<Run, 't'> = {}, rest: Omit<Para, 'runs'> = {}): Para => ({ runs: [{ t, ...run }], ...rest });

/** Plain text (newlines → paragraphs) as a RichDoc. */
export function plain(text: string, run: Omit<Run, 't'> = {}): RichDoc {
  return text.split('\n').map((line) => para(line, run));
}

export const docText = (doc: RichDoc | undefined): string => (doc ?? []).map((p) => p.runs.map((r) => r.t).join('')).join('\n');
export const docIsEmpty = (doc: RichDoc | undefined) => docText(doc).trim() === '';

// ── Text bases ───────────────────────────────────────────────────────────────

export function textBase(theme: DesignSystem, kind: 'display' | 'title' | 'heading' | 'body' | 'caption' = 'body', over: Partial<TextBase> = {}): TextBase {
  const heading = kind === 'display' || kind === 'title' || kind === 'heading';
  return {
    font: heading ? '@heading' : '@body',
    size: theme.type[kind],
    weight: heading ? 700 : 400,
    color: kind === 'caption' ? '@muted' : '@text',
    align: 'left',
    lh: heading ? 1.08 : 1.28,
    ls: kind === 'display' || kind === 'title' ? -2 : 0,
    ...over,
  };
}

// ── Element factories ────────────────────────────────────────────────────────

const base = (type: El['type'], x: number, y: number, w: number, h: number) => ({ id: uid('e'), type, x, y, w, h, rot: 0, opacity: 1 });

export function newText(theme: DesignSystem, text = '', x = 160, y = 160, w = 800, kind: 'display' | 'title' | 'heading' | 'body' | 'caption' = 'body', over: Partial<TextEl> = {}): TextEl {
  const b = textBase(theme, kind, over.base);
  return {
    ...base('text', x, y, w, Math.round(b.size * b.lh + 24)),
    type: 'text',
    doc: plain(text),
    base: b,
    pad: 12,
    vAlign: 'top',
    fit: 'grow',
    ...over,
  } as TextEl;
}

export function newShape(shape: ShapeKind, x: number, y: number, w: number, h: number, fill: Fill | null = solid('@primary'), over: Partial<ShapeEl> = {}): ShapeEl {
  return {
    ...base('shape', x, y, w, h),
    type: 'shape',
    shape,
    fill,
    stroke: null,
    radius: shape === 'round-rect' ? 24 : undefined,
    ...over,
  } as ShapeEl;
}

export const strokeOf = (c: string, w = 6, dash: Stroke['dash'] = 'solid'): Stroke => ({ c, w, dash, cap: 'round', join: 'round' });

export function newLine(x: number, y: number, w: number, h: number, over: Partial<LineEl> = {}): LineEl {
  return { ...base('line', x, y, w, h), type: 'line', stroke: strokeOf('@text', 6), curve: 'straight', start: 'none', end: 'none', ...over } as LineEl;
}

export function newImage(asset: string | null, x: number, y: number, w: number, h: number, over: Partial<ImageEl> = {}): ImageEl {
  return { ...base('image', x, y, w, h), type: 'image', asset, crop: { x: 0, y: 0, w: 1, h: 1 }, mask: 'rect', radius: 0, filters: {}, ...over } as ImageEl;
}

export function newIcon(icon: string, x: number, y: number, size = 160, over: Partial<IconEl> = {}): IconEl {
  return { ...base('icon', x, y, size, size), type: 'icon', icon, color: '@primary', sw: 1.75, ...over } as IconEl;
}

export function newVideo(asset: string | null, x: number, y: number, w: number, h: number, over: Partial<VideoEl> = {}): VideoEl {
  return { ...base('video', x, y, w, h), type: 'video', asset, crop: { x: 0, y: 0, w: 1, h: 1 }, radius: 0, loop: false, muted: false, autoplay: false, volume: 1, ...over } as VideoEl;
}

export function newAudio(asset: string | null, x: number, y: number, over: Partial<AudioEl> = {}): AudioEl {
  return { ...base('audio', x, y, 120, 120), type: 'audio', asset, loop: false, autoplay: false, volume: 1, ...over } as AudioEl;
}

export function newTable(theme: DesignSystem, rows = 4, cols = 3, x = 160, y = 260, w = 1200): TableEl {
  const cw = Math.round(w / cols), rh = 96;
  const cells: TableCell[][] = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ({ t: r === 0 ? `Column ${c + 1}` : '' })));
  return {
    ...base('table', x, y, cw * cols, rh * rows),
    type: 'table',
    cols: Array(cols).fill(cw),
    rows: Array(rows).fill(rh),
    cells,
    header: true,
    banded: true,
    border: strokeOf('@muted', 2),
    headerFill: '@primary',
    bandFill: '@surface',
    base: textBase(theme, 'body', { size: 32 }),
    pad: 20,
  } as TableEl;
}

export function newChart(theme: DesignSystem, kind: ChartEl['kind'] = 'column', x = 200, y = 200, w = 1200, h = 640): ChartEl {
  return {
    ...base('chart', x, y, w, h),
    type: 'chart',
    kind,
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'Revenue', values: [42, 58, 51, 76] },
      { name: 'Cost', values: [30, 36, 33, 41] },
    ],
    legend: 'bottom',
    grid: true,
    labels: false,
    stacked: false,
    smooth: false,
    base: textBase(theme, 'body', { size: 26, color: '@muted' }),
  } as ChartEl;
}

export function newGroup(children: El[], x: number, y: number, w: number, h: number): GroupEl {
  return { ...base('group', x, y, w, h), type: 'group', children } as GroupEl;
}

// ── Slides & decks ───────────────────────────────────────────────────────────

export function newSlide(over: Partial<Slide> = {}): Slide {
  return { id: uid('s'), elements: [], notes: '', transition: null, anims: [], ...over };
}

/** Clone elements with fresh ids (animations must be remapped by the caller via the returned map). */
export function cloneEl<T extends El>(el: T, ids?: Map<string, string>): T {
  const copy = clone(el) as T;
  const walk = (e: El) => {
    const old = e.id;
    e.id = uid('e');
    ids?.set(old, e.id);
    if (e.type === 'group') e.children.forEach(walk);
  };
  walk(copy);
  return copy;
}

export function cloneSlide(slide: Slide): Slide {
  const ids = new Map<string, string>();
  const copy = clone(slide);
  copy.id = uid('s');
  const walk = (e: El) => {
    const old = e.id;
    e.id = uid('e');
    ids.set(old, e.id);
    if (e.type === 'group') e.children.forEach(walk);
  };
  copy.elements.forEach(walk);
  copy.anims = copy.anims.map((a) => ({ ...a, id: uid('a'), el: a.el === '$camera' ? a.el : (ids.get(a.el) ?? a.el) }));
  return copy;
}

export function builtinLayouts(theme: DesignSystem, size = { w: 1920, h: 1080 }): Layout[] {
  const { w, h } = size;
  const m = 128;
  const title = (y = 96, ww = w - m * 2): TextEl =>
    newText(theme, 'Click to add title', m, y, ww, 'title', { ph: 'title', fit: 'shrink', vAlign: 'top', base: textBase(theme, 'title', { size: 84 }) });
  const body = (x: number, y: number, ww: number, hh: number): TextEl =>
    newText(theme, 'Click to add text', x, y, ww, 'body', { ph: 'body', fit: 'shrink', h: hh, base: textBase(theme, 'body', { size: 40 }) });
  const L = (name: string, elements: El[], background?: Fill | null): Layout => ({ id: uid('l'), name, elements, background });
  const mid = (hh: number) => Math.round((h - hh) / 2);
  return [
    L('Title', [
      newText(theme, 'Presentation title', m, mid(300) - 60, w - m * 2, 'display', { ph: 'title', fit: 'shrink', h: 300, vAlign: 'bottom', base: textBase(theme, 'display', { size: 132 }) }),
      newText(theme, 'Subtitle', m, mid(300) + 270, w - m * 2, 'heading', { ph: 'subtitle', fit: 'shrink', h: 110, base: textBase(theme, 'heading', { size: 48, weight: 400, color: '@muted' }) }),
    ]),
    L('Title and content', [title(), body(m, 300, w - m * 2, h - 300 - m)]),
    L('Section', [
      newShape('rect', 0, 0, 40, h, solid('@primary')),
      newText(theme, 'Section title', m + 40, mid(260), w - m * 2, 'display', { ph: 'title', fit: 'shrink', h: 260, vAlign: 'middle', base: textBase(theme, 'display', { size: 120 }) }),
    ]),
    L('Two columns', [
      title(),
      body(m, 300, (w - m * 2 - 64) / 2, h - 300 - m),
      body(m + (w - m * 2 - 64) / 2 + 64, 300, (w - m * 2 - 64) / 2, h - 300 - m),
    ]),
    L('Image and text', [
      newImage(null, 0, 0, w / 2, h, { ph: 'image' }),
      newText(theme, 'Click to add title', w / 2 + 96, 160, w / 2 - 192, 'title', { ph: 'title', fit: 'shrink', h: 280, base: textBase(theme, 'title', { size: 76 }) }),
      body(w / 2 + 96, 460, w / 2 - 192, h - 460 - 128),
    ]),
    L('Big statement', [
      newText(theme, 'One big idea', m, mid(520), w - m * 2, 'display', { ph: 'title', fit: 'shrink', h: 520, vAlign: 'middle', base: textBase(theme, 'display', { size: 150, align: 'center' }) }),
    ]),
    L('Quote', [
      newText(theme, '“A quote worth a full slide.”', m + 80, mid(420) - 40, w - m * 2 - 160, 'heading', { ph: 'body', fit: 'shrink', h: 420, vAlign: 'middle', base: textBase(theme, 'heading', { size: 84, weight: 500, lh: 1.2 }) }),
      newText(theme, '— Attribution', m + 80, mid(420) + 400, w - m * 2 - 160, 'caption', { ph: 'caption', base: textBase(theme, 'caption', { size: 36 }) }),
    ]),
    L('Comparison', [
      title(),
      newText(theme, 'Option A', m, 290, (w - m * 2 - 64) / 2, 'heading', { ph: 'subtitle', fit: 'shrink', h: 90, base: textBase(theme, 'heading', { size: 48, color: '@primary' }) }),
      body(m, 390, (w - m * 2 - 64) / 2, h - 390 - m),
      newText(theme, 'Option B', m + (w - m * 2 - 64) / 2 + 64, 290, (w - m * 2 - 64) / 2, 'heading', { ph: 'subtitle', fit: 'shrink', h: 90, base: textBase(theme, 'heading', { size: 48, color: '@secondary' }) }),
      body(m + (w - m * 2 - 64) / 2 + 64, 390, (w - m * 2 - 64) / 2, h - 390 - m),
    ]),
    L('Title only', [title()]),
    L('Blank', []),
  ];
}

export function newDeck(title = 'Untitled presentation', opts: { theme?: DesignSystem; size?: { w: number; h: number } } = {}): Deck {
  const theme = opts.theme ?? clone(THEME_FRAMES);
  const size = opts.size ?? SLIDE_SIZES['16:9'];
  const layouts = builtinLayouts(theme, size);
  const now = Date.now();
  return {
    v: 1,
    id: uid('d'),
    title,
    created: now,
    updated: now,
    size: { ...size },
    theme,
    master: { background: solid('@bg'), elements: [] },
    layouts,
    styles: [],
    slides: [],
    assets: {},
    margin: 96,
  };
}

export function slideFromLayout(layout: Layout): Slide {
  const elements = layout.elements
    .filter((e) => e.ph)
    .map((e) => {
      const c = cloneEl(e);
      if (c.type === 'text') c.doc = plain('');
      return c;
    });
  return newSlide({ layout: layout.id, elements });
}

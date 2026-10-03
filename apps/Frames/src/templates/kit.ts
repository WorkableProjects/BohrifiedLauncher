import { makeAnim } from '../anim/presets';
import { withAlpha } from '../model/color';
import {
  newChart, newGroup, newIcon, newLine, newShape, newSlide, newTable, newText, para, plain, solid, strokeOf,
} from '../model/defaults';
import { resolveColor } from '../model/theme';
import type {
  Align, ChartEl, DesignSystem, Direction, Effects, El, Fill, GroupEl, IconEl, LineEl, Para, RichDoc, Role, ShapeEl, ShapeKind, Slide, SlideAnim, Stroke, TableEl, TextEl, Transition,
} from '../model/types';
import { TRANSITION_MAP } from '../transitions/registry';

/** Shared building blocks for the built-in templates and slide recipes. */

export const W = 1920;
export const H = 1080;

export type FillIn = string | Fill | null;
export const fl = (f: FillIn): Fill | null => (f === null ? null : typeof f === 'string' ? solid(f) : f);

/** Linear gradient; angle 0 = towards the top, 90 = towards the right, 180 = down (CSS convention). */
export const lin = (angle: number, ...stops: Array<[string, number]>): Fill => ({ t: 'linear', angle, stops: stops.map(([c, o]) => ({ c, o })) });
export const rdl = (cx: number, cy: number, ...stops: Array<[string, number]>): Fill => ({ t: 'radial', cx, cy, stops: stops.map(([c, o]) => ({ c, o })) });

/** A token or colour with alpha applied (resolved against the theme at build time). */
export const alpha = (th: DesignSystem, c: string, a: number) => withAlpha(resolveColor(th, c), a);

/** A soft glow that fades to nothing: a radial gradient that works on any background. */
export function glow(th: DesignSystem, color: string, cx: number, cy: number, size: number, a = 0.5, over: Partial<ShapeEl> = {}): ShapeEl {
  return newShape('rect', cx - size / 2, cy - size / 2, size, size, rdl(0.5, 0.5, [alpha(th, color, a), 0], [alpha(th, color, 0), 0.7]), { name: 'Glow', ...over });
}

// ── Text ─────────────────────────────────────────────────────────────────────

export interface TO {
  /** Font size. */
  s?: number;
  /** Weight. */
  w?: number;
  c?: string;
  f?: string;
  a?: Align;
  lh?: number;
  ls?: number;
  /** Fixed height (the box then shrinks text to fit); omitted = grow with an estimated height. */
  h?: number;
  v?: 'top' | 'middle' | 'bottom';
  fit?: 'none' | 'shrink' | 'grow';
  pad?: number;
  i?: boolean;
  name?: string;
  ph?: Role;
  fill?: FillIn;
  r?: number;
  op?: number;
  morph?: string;
  /** Upper-case the string. */
  up?: boolean;
  stroke?: Stroke | null;
  fx?: Effects;
  rot?: number;
}

const fontWidth = (th: DesignSystem, font: string) => {
  const name = font[0] === '@' ? th.fonts[font.slice(1) as 'heading' | 'body' | 'mono'] : font;
  if (name === 'Impact') return 0.5;
  if (name === 'Menlo' || name === 'Courier') return 0.62;
  if (name === 'Didot' || name === 'Georgia' || name === 'Palatino' || name === 'Times') return 0.52;
  if (name === 'Futura' || name === 'Avenir') return 0.54;
  return 0.56;
};

/** Rough height of a text document in a box `w` wide; good enough for an initial box size. */
export function estH(th: DesignSystem, doc: RichDoc, size: number, font: string, lh: number, ls: number, w: number, pad: number): number {
  const cw = fontWidth(th, font);
  let h = 0;
  for (const p of doc) {
    const txt = p.runs.map((r) => r.t).join('');
    const sz = Math.max(size, ...p.runs.map((r) => r.size ?? 0));
    const upper = txt === txt.toUpperCase() && /[A-Z]/.test(txt) ? 1.18 : 1;
    const indent = p.list ? sz * 0.9 : 0;
    const lines = Math.max(1, Math.ceil((txt.length * (sz * cw * upper + ls)) / Math.max(40, w - pad * 2 - indent)));
    h += lines * sz * (p.lh ?? lh) + (p.before ?? 0) + (p.after ?? 0);
  }
  return Math.ceil(h + pad * 2);
}

export function T(th: DesignSystem, text: string | RichDoc, x: number, y: number, w: number, o: TO = {}): TextEl {
  const size = o.s ?? th.type.body;
  const font = o.f ?? '@body';
  const pad = o.pad ?? 0;
  const lh = o.lh ?? 1.25;
  const ls = o.ls ?? 0;
  const doc = typeof text === 'string' ? plain(o.up ? text.toUpperCase() : text) : text;
  const h = o.h ?? estH(th, doc, size, font, lh, ls, w, pad);
  const over: Partial<TextEl> = {
    doc,
    base: { font, size, weight: o.w ?? 400, italic: o.i, color: o.c ?? '@text', align: o.a ?? 'left', lh, ls },
    pad,
    h,
    vAlign: o.v ?? 'top',
    fit: o.fit ?? (o.h !== undefined ? 'shrink' : 'grow'),
  };
  if (o.name) over.name = o.name;
  if (o.ph) over.ph = o.ph;
  if (o.fill !== undefined) over.fill = fl(o.fill);
  if (o.r !== undefined) over.radius = o.r;
  if (o.op !== undefined) over.opacity = o.op;
  if (o.morph) over.morph = o.morph;
  if (o.stroke !== undefined) over.stroke = o.stroke;
  if (o.fx) over.fx = o.fx;
  if (o.rot) over.rot = o.rot;
  return newText(th, '', x, y, w, 'body', over);
}

/** Bulleted paragraphs. */
export function bullets(items: string[], gap = 18, o: { bold?: boolean } = {}): RichDoc {
  return items.map((t) => para(t, o.bold ? { b: true } : {}, { list: 'bullet', after: gap }));
}
/** Numbered paragraphs. */
export function numbered(items: string[], gap = 18): RichDoc {
  return items.map((t) => para(t, {}, { list: 'number', after: gap }));
}
/** A paragraph of several styled runs. */
export const P = (runs: Array<{ t: string } & Omit<import('../model/types').Run, 't'>>, rest: Omit<Para, 'runs'> = {}): Para => ({ runs, ...rest });

// ── Shapes, lines, icons ─────────────────────────────────────────────────────

export function R(kind: ShapeKind, x: number, y: number, w: number, h: number, fill: FillIn = '@primary', over: Partial<ShapeEl> = {}): ShapeEl {
  return newShape(kind, x, y, w, h, fl(fill), over);
}

/** A straight line between two points. */
export function L(x1: number, y1: number, x2: number, y2: number, color = '@text', width = 4, over: Partial<LineEl> = {}): LineEl {
  const up = (x2 - x1) * (y2 - y1) < 0;
  return newLine(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1), { stroke: { ...strokeOf(color, width), cap: 'butt' }, up, ...over });
}

export function I(name: string, x: number, y: number, size: number, color = '@primary', over: Partial<IconEl> = {}): IconEl {
  return newIcon(name, x, y, size, { color, ...over });
}

export function G(children: El[], x: number, y: number, w: number, h: number, name?: string): GroupEl {
  const g = newGroup(children, x, y, w, h);
  if (name) g.name = name;
  return g;
}

export interface ChartOpts {
  kind?: ChartEl['kind'];
  categories: string[];
  series: Array<{ name: string; values: number[]; color?: string }>;
  legend?: ChartEl['legend'];
  grid?: boolean;
  labels?: boolean;
  stacked?: boolean;
  smooth?: boolean;
  size?: number;
  color?: string;
  font?: string;
  title?: string;
  name?: string;
}
export function C(th: DesignSystem, x: number, y: number, w: number, h: number, o: ChartOpts): ChartEl {
  const c = newChart(th, o.kind ?? 'column', x, y, w, h);
  c.categories = o.categories;
  c.series = o.series;
  c.legend = o.legend ?? 'none';
  c.grid = o.grid ?? true;
  c.labels = o.labels ?? false;
  c.stacked = o.stacked ?? false;
  c.smooth = o.smooth ?? false;
  c.base = { ...c.base, size: o.size ?? 26, color: o.color ?? '@muted', font: o.font ?? '@body' };
  if (o.title) c.title = o.title;
  if (o.name) c.name = o.name;
  return c;
}

export interface TableOpts {
  widths: number[];
  rowH: number | number[];
  rows: Array<Array<string | { t: string; b?: boolean; c?: string; fill?: string; align?: Align }>>;
  size?: number;
  header?: boolean;
  banded?: boolean;
  headerFill?: string;
  bandFill?: string;
  border?: Stroke;
  pad?: number;
  font?: string;
  color?: string;
  name?: string;
}
export function TB(th: DesignSystem, x: number, y: number, o: TableOpts): TableEl {
  const rows = o.rows.length, cols = o.widths.length;
  const t = newTable(th, rows, cols, x, y, o.widths.reduce((a, b) => a + b, 0));
  t.cols = o.widths;
  t.rows = Array.isArray(o.rowH) ? o.rowH : Array(rows).fill(o.rowH);
  t.w = t.cols.reduce((a, b) => a + b, 0);
  t.h = t.rows.reduce((a, b) => a + b, 0);
  t.cells = o.rows.map((r) => r.map((c) => (typeof c === 'string' ? { t: c } : c)));
  t.header = o.header ?? true;
  t.banded = o.banded ?? false;
  if (o.headerFill) t.headerFill = o.headerFill;
  if (o.bandFill) t.bandFill = o.bandFill;
  if (o.border) t.border = o.border;
  t.pad = o.pad ?? 24;
  t.base = { ...t.base, size: o.size ?? 30, font: o.font ?? '@body', color: o.color ?? '@text' };
  if (o.name) t.name = o.name;
  return t;
}

// ── Transitions ──────────────────────────────────────────────────────────────

/** A transition at the registry's own default duration and easing, unless overridden. */
export function trn(type: string, over: Partial<Transition> & { dir?: Direction } = {}): Transition {
  const def = TRANSITION_MAP.get(type);
  if (!def) throw new Error(`Unknown transition: ${type}`);
  return { type, dur: def.dur, ease: def.ease, ...over };
}

// ── Slide builder ────────────────────────────────────────────────────────────

export interface FxOpts extends Partial<Omit<SlideAnim, 'id' | 'el'>> {
  /** For a list of targets: ms between consecutive starts. */
  each?: number;
}

export class SB {
  slide: Slide;
  constructor(public th: DesignSystem, public size: { w: number; h: number } = { w: W, h: H }, init: Partial<Slide> = {}) {
    this.slide = newSlide(init);
  }

  add<E extends El>(e: E): E {
    this.slide.elements.push(e);
    return e;
  }
  addAll(...es: El[]): void {
    es.forEach((e) => this.add(e));
  }
  /** One text box per bullet (so each can be revealed on its own click), stacked `pitch` apart. */
  bl(items: string[], x: number, y: number, w: number, pitch: number, o: TO = {}): TextEl[] {
    return items.map((t, i) => this.add(T(this.th, [para(t, {}, { list: 'bullet' })], x, y + i * pitch, w, { name: `Bullet ${i + 1}`, ...o })));
  }
  /** Text box. */
  t(text: string | RichDoc, x: number, y: number, w: number, o: TO = {}): TextEl {
    return this.add(T(this.th, text, x, y, w, o));
  }
  r(kind: ShapeKind, x: number, y: number, w: number, h: number, fill: FillIn = '@primary', over: Partial<ShapeEl> = {}): ShapeEl {
    return this.add(R(kind, x, y, w, h, fill, over));
  }
  l(x1: number, y1: number, x2: number, y2: number, color = '@text', width = 4, over: Partial<LineEl> = {}): LineEl {
    return this.add(L(x1, y1, x2, y2, color, width, over));
  }
  i(name: string, x: number, y: number, size: number, color = '@primary', over: Partial<IconEl> = {}): IconEl {
    return this.add(I(name, x, y, size, color, over));
  }

  /** Add one or several animations built from a preset. Targets after the first start `each` ms after the previous one. */
  fx(preset: string, target: El | El[], o: FxOpts = {}): SlideAnim[] {
    const { each = 0, ...over } = o;
    const list = Array.isArray(target) ? target : [target];
    const out = list.map((el, idx) => {
      const first = idx === 0;
      const a = makeAnim(preset, el.id, { el, slide: this.size }, {
        ...over,
        trigger: first ? (over.trigger ?? 'with') : 'with',
        delay: first ? (over.delay ?? 0) : each,
      });
      this.slide.anims.push(a);
      return a;
    });
    return out;
  }

  done(): Slide {
    return this.slide;
  }
}

export { newSlide, plain, para, solid, strokeOf };

// ── Layout helpers ───────────────────────────────────────────────────────────

import type { Layout, TextBase } from '../model/types';

export const layoutNamed = (ls: Layout[], name: string): Layout => {
  const l = ls.find((x) => x.name === name);
  if (!l) throw new Error(`No layout named ${name}`);
  return l;
};

/** Restyle / reposition every text placeholder with this role in a layout. */
export function setPh(l: Layout, role: Role, patch: { x?: number; y?: number; w?: number; h?: number; base?: Partial<TextBase>; vAlign?: 'top' | 'middle' | 'bottom'; prompt?: string }) {
  for (const e of l.elements) {
    if (e.type !== 'text' || e.ph !== role) continue;
    if (patch.x !== undefined) e.x = patch.x;
    if (patch.y !== undefined) e.y = patch.y;
    if (patch.w !== undefined) e.w = patch.w;
    if (patch.h !== undefined) e.h = patch.h;
    if (patch.vAlign) e.vAlign = patch.vAlign;
    if (patch.prompt) e.doc = plain(patch.prompt);
    if (patch.base) e.base = { ...e.base, ...patch.base };
  }
}

/** Put decoration (non-placeholder elements) behind a layout's placeholders. */
export function decorate(l: Layout, ...els: El[]) {
  l.elements.unshift(...els);
}

export function fallbackLayout(ls: Layout[], name: string): string {
  return layoutNamed(ls, name).id;
}

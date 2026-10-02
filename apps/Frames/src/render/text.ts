import { mixColors } from '../model/color';
import { resolveColor, resolveFont } from '../model/theme';
import type { Align, DesignSystem, Para, RichDoc, Run, TextBase } from '../model/types';
import type { UnitPose } from '../anim/pose';

/**
 * Rich text on canvas: layout (wrapping, alignment, lists, super/subscript)
 * and painting. Layouts are cached per document object — documents are
 * immutable, so identity is a perfect cache key.
 */

export interface Piece {
  text: string;
  x: number;
  w: number;
  font: string;
  size: number;
  color: string;
  hl?: string;
  u?: boolean;
  s?: boolean;
  link?: string;
  ls: number;
  o: number;
  /** Baseline shift (negative = up) for super/subscript. */
  dy: number;
  space: boolean;
}

export interface Line {
  top: number;
  h: number;
  baseline: number;
  ascent: number;
  descent: number;
  /** Left edge of the first piece after alignment. */
  x: number;
  w: number;
  pieces: Piece[];
  bullet?: { text: string; x: number; font: string; color: string; size: number };
  /** Index of the line across the whole text (for line staggering). */
  index: number;
}

export interface Layout {
  lines: Line[];
  /** Content height, including paragraph spacing. */
  height: number;
  /** Widest line. */
  width: number;
  /** Font scale applied by shrink-to-fit (1 = none). */
  scale: number;
  units?: Partial<Record<'char' | 'word' | 'line', UnitItem[]>>;
}

export interface UnitItem {
  text: string;
  x: number;
  w: number;
  piece: Piece;
  line: Line;
  /** Index among units of its kind; -1 for spaces (never animated). */
  unit: number;
}

let mctx: CanvasRenderingContext2D | null = null;
function measurer(): CanvasRenderingContext2D {
  if (!mctx) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
    mctx = c.getContext('2d') as CanvasRenderingContext2D;
  }
  return mctx;
}

const HAS_LS = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;

function setLS(ctx: CanvasRenderingContext2D, ls: number) {
  if (HAS_LS) (ctx as unknown as { letterSpacing: string }).letterSpacing = ls ? `${ls}px` : '0px';
}

function measure(ctx: CanvasRenderingContext2D, text: string, font: string, ls: number): number {
  ctx.font = font;
  setLS(ctx, ls);
  const w = ctx.measureText(text).width;
  return HAS_LS ? w : w + ls * text.length;
}

const fontCache = new Map<string, { asc: number; desc: number }>();
function vmetrics(ctx: CanvasRenderingContext2D, font: string, size: number) {
  let m = fontCache.get(font);
  if (!m) {
    ctx.font = font;
    const t = ctx.measureText('Hgé');
    m = { asc: t.fontBoundingBoxAscent ?? size * 0.8, desc: t.fontBoundingBoxDescent ?? size * 0.2 };
    if (fontCache.size > 500) fontCache.clear();
    fontCache.set(font, m);
  }
  return m;
}

export function fontString(theme: DesignSystem, run: Pick<Run, 'b' | 'i' | 'w' | 'font'>, base: TextBase, size: number): string {
  const weight = run.w ?? (run.b ? Math.max(700, base.weight) : base.weight);
  const italic = run.i ?? base.italic;
  return `${italic ? 'italic ' : ''}${weight} ${Math.max(1, size)}px ${resolveFont(theme, run.font ?? base.font)}`;
}

interface Token { text: string; run: Run; space: boolean }

function tokenize(p: Para): Token[] {
  const out: Token[] = [];
  for (const run of p.runs) {
    if (!run.t) continue;
    for (const part of run.t.split(/(\s+)/)) {
      if (!part) continue;
      out.push({ text: part.replace(/\s+/g, ' '), run, space: part.trim() === '' });
    }
  }
  return out;
}

const SUPSUB = 0.65;

function listIndent(size: number, level: number) {
  return size * 1.1 * (level + 1);
}

const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
function numberLabel(n: number, level: number) {
  if (level === 1) return `${String.fromCharCode(96 + ((n - 1) % 26) + 1)}.`;
  if (level === 2) return `${ROMAN[Math.min(n, 10)] ?? n}.`;
  return `${n}.`;
}

interface LayoutOpts {
  ctx: CanvasRenderingContext2D;
  theme: DesignSystem;
  base: TextBase;
  width: number;
  scale: number;
}

function layoutOnce(doc: RichDoc, o: LayoutOpts): Layout {
  const { ctx, theme, base, width, scale } = o;
  const lines: Line[] = [];
  let y = 0;
  let maxW = 0;
  const counters: number[] = [];

  doc.forEach((para, pi) => {
    const level = para.level ?? 0;
    const lh = para.lh ?? base.lh;
    const align: Align = para.align ?? base.align;
    const firstRun = para.runs[0];
    const paraSize = (firstRun?.size ?? base.size) * scale;
    const indent = para.list ? listIndent(paraSize, level) : 0;
    const avail = Math.max(10, width - indent);

    if (para.list === 'number') {
      counters.length = level + 1;
      counters[level] = (counters[level] ?? 0) + 1;
    } else if (!para.list) counters.length = 0;
    else counters.length = level + 1;

    y += (para.before ?? 0) * scale;

    const tokens = tokenize(para);
    type Cur = { pieces: Piece[]; w: number };
    let cur: Cur = { pieces: [], w: 0 };
    const rows: Cur[] = [];
    const flush = () => {
      // Drop trailing spaces: they'd skew alignment.
      while (cur.pieces.length && cur.pieces[cur.pieces.length - 1]!.space) cur.w -= cur.pieces.pop()!.w;
      rows.push(cur);
      cur = { pieces: [], w: 0 };
    };
    const push = (text: string, run: Run, space: boolean) => {
      const sz = (run.size ?? base.size) * scale * (run.sup || run.sub ? SUPSUB : 1);
      const font = fontString(theme, run, base, sz);
      const ls = (run.ls ?? base.ls) * scale;
      const w = measure(ctx, text, font, ls);
      const last = cur.pieces[cur.pieces.length - 1];
      const color = resolveColor(theme, run.c ?? base.color);
      if (last && !last.space && !space && last.font === font && last.color === color && last.hl === (run.hl ? resolveColor(theme, run.hl) : undefined) && last.link === run.link && last.ls === ls && !!last.u === !!run.u && !!last.s === !!run.s && last.o === (run.o ?? 1)) {
        last.text += text;
        last.w += w;
      } else {
        cur.pieces.push({
          text, x: cur.w, w, font, size: sz, color, hl: run.hl ? resolveColor(theme, run.hl) : undefined,
          u: run.u, s: run.s, link: run.link, ls, o: run.o ?? 1,
          dy: run.sup ? -sz * 0.55 : run.sub ? sz * 0.2 : 0, space,
        });
      }
      cur.w += w;
    };

    for (const tk of tokens) {
      if (tk.space) {
        if (cur.pieces.length) push(tk.text, tk.run, true);
        continue;
      }
      const sz = (tk.run.size ?? base.size) * scale;
      const w = measure(ctx, tk.text, fontString(theme, tk.run, base, sz * (tk.run.sup || tk.run.sub ? SUPSUB : 1)), (tk.run.ls ?? base.ls) * scale);
      if (cur.w + w > avail && cur.pieces.some((p) => !p.space)) flush();
      if (w > avail) {
        // A word wider than the box: break it by characters.
        let chunk = '';
        for (const ch of tk.text) {
          const cw = measure(ctx, chunk + ch, fontString(theme, tk.run, base, sz), (tk.run.ls ?? base.ls) * scale);
          if (cur.w + cw > avail && chunk) {
            push(chunk, tk.run, false);
            flush();
            chunk = ch;
          } else chunk += ch;
        }
        if (chunk) push(chunk, tk.run, false);
      } else push(tk.text, tk.run, false);
    }
    flush();

    rows.forEach((row, ri) => {
      let asc = 0, desc = 0, size = paraSize;
      if (row.pieces.length === 0) {
        const f = fontString(theme, firstRun ?? {}, base, paraSize);
        const m = vmetrics(ctx, f, paraSize);
        asc = m.asc;
        desc = m.desc;
      }
      for (const p of row.pieces) {
        const m = vmetrics(ctx, p.font, p.size);
        if (p.size >= size - 0.01 || !asc) {
          asc = Math.max(asc, m.asc);
          desc = Math.max(desc, m.desc);
        }
        size = Math.max(size, p.size);
      }
      const h = size * lh;
      const baseline = y + (h - (asc + desc)) / 2 + asc;
      const last = ri === rows.length - 1;
      let x = indent;
      const free = avail - row.w;
      if (align === 'center') x += free / 2;
      else if (align === 'right') x += free;
      else if (align === 'justify' && !last && free > 0) {
        const gaps = row.pieces.filter((p) => p.space).length;
        if (gaps) {
          const extra = free / gaps;
          let shift = 0;
          for (const p of row.pieces) {
            p.x += shift;
            if (p.space) {
              p.w += extra;
              shift += extra;
            }
          }
          row.w = avail;
        }
      }
      const line: Line = { top: y, h, baseline, ascent: asc, descent: desc, x, w: row.w, pieces: row.pieces, index: lines.length };
      if (ri === 0 && para.list) {
        const bsz = paraSize;
        const lbl = para.list === 'bullet' ? (level % 2 === 0 ? '•' : '–') : numberLabel(counters[level] ?? 1, level);
        line.bullet = {
          text: lbl,
          x: indent - bsz * (para.list === 'bullet' ? 0.75 : 1.15),
          font: fontString(theme, firstRun ?? {}, base, bsz),
          color: resolveColor(theme, firstRun?.c ?? base.color),
          size: bsz,
        };
      }
      lines.push(line);
      maxW = Math.max(maxW, line.x + line.w);
      y += h;
    });
    if (rows.length === 0) y += paraSize * lh;
    y += (para.after ?? 0) * scale;
    void pi;
  });

  return { lines, height: y, width: maxW, scale };
}

const cache = new WeakMap<RichDoc, Map<string, Layout>>();

const baseKey = (b: TextBase, theme: DesignSystem) => `${b.font}|${b.size}|${b.weight}|${b.italic ? 1 : 0}|${b.color}|${b.align}|${b.lh}|${b.ls}|${theme.fonts.heading}|${theme.fonts.body}|${theme.fonts.mono}`;

/**
 * Lay out `doc` in a box `width` wide. With `fitHeight`, shrinks the type
 * until the text fits (never below 30%).
 */
export function layoutText(doc: RichDoc, base: TextBase, theme: DesignSystem, width: number, fitHeight?: number): Layout {
  const key = `${Math.round(width)}|${fitHeight === undefined ? '' : Math.round(fitHeight)}|${baseKey(base, theme)}`;
  let per = cache.get(doc);
  const hit = per?.get(key);
  if (hit) return hit;

  const ctx = measurer();
  const run = (scale: number) => layoutOnce(doc, { ctx, theme, base, width, scale });
  let out = run(1);
  if (fitHeight !== undefined && out.height > fitHeight) {
    let lo = 0.3, hi = 1;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      const l = run(mid);
      if (l.height <= fitHeight) {
        lo = mid;
        out = l;
      } else hi = mid;
    }
    if (out.scale === 1) out = run(lo);
  }
  if (!per) cache.set(doc, (per = new Map()));
  if (per.size > 8) per.clear();
  per.set(key, out);
  return out;
}

/** Width of the longest unbreakable word — used to keep text boxes from shrinking narrower than it. */
export function minContentWidth(doc: RichDoc, base: TextBase, theme: DesignSystem): number {
  const ctx = measurer();
  let w = 0;
  for (const p of doc) for (const tk of tokenize(p)) if (!tk.space) w = Math.max(w, measure(ctx, tk.text, fontString(theme, tk.run, base, tk.run.size ?? base.size), tk.run.ls ?? base.ls));
  return w;
}

// ── Painting ─────────────────────────────────────────────────────────────────

export interface PaintTextOpts {
  /** Mix every colour toward `c` by `t`. */
  colorFx?: { c: string; t: number } | null;
  unit?: ((i: number, n: number) => UnitPose) | null;
  unitBy?: 'line' | 'word' | 'char' | 'child' | null;
  /** Scale shadows/blur (canvas does not transform them). */
  pxPerUnit?: number;
}

function resolveFx(theme: DesignSystem, fx?: { c: string; t: number } | null) {
  return fx && fx.c ? { c: resolveColor(theme, fx.c), t: fx.t } : null;
}

function decorate(ctx: CanvasRenderingContext2D, p: Piece, x: number, baseline: number, asc: number, desc: number, color: string) {
  if (p.hl) {
    ctx.fillStyle = p.hl;
    ctx.fillRect(x, baseline - asc, p.w, asc + desc);
  }
  if (p.u || p.s || p.link) {
    const th = Math.max(1, p.size / 16);
    ctx.fillStyle = color;
    if (p.u || p.link) ctx.fillRect(x, baseline + p.size * 0.1, p.w, th);
    if (p.s) ctx.fillRect(x, baseline - p.size * 0.3, p.w, th);
  }
}

/** Break the layout into letters/words/lines so each can be moved on its own. */
export function unitsOf(layout: Layout, by: 'char' | 'word' | 'line', ctx = measurer()): UnitItem[] {
  const hit = layout.units?.[by];
  if (hit) return hit;
  const items: UnitItem[] = [];
  let n = 0;
  for (const line of layout.lines) {
    if (by === 'line') {
      for (const p of line.pieces) items.push({ text: p.text, x: p.x, w: p.w, piece: p, line, unit: line.index });
      continue;
    }
    for (const p of line.pieces) {
      if (p.space) {
        items.push({ text: p.text, x: p.x, w: p.w, piece: p, line, unit: -1 });
        continue;
      }
      if (by === 'word') {
        // Pieces may hold several words only when merged across runs of equal style; split on spaces.
        items.push({ text: p.text, x: p.x, w: p.w, piece: p, line, unit: n++ });
        continue;
      }
      let acc = '';
      ctx.font = p.font;
      setLS(ctx, p.ls);
      for (const ch of p.text) {
        const x0 = p.x + (HAS_LS ? ctx.measureText(acc).width : ctx.measureText(acc).width + p.ls * acc.length);
        acc += ch;
        const x1 = p.x + (HAS_LS ? ctx.measureText(acc).width : ctx.measureText(acc).width + p.ls * acc.length);
        items.push({ text: ch, x: x0, w: x1 - x0, piece: p, line, unit: n++ });
      }
    }
  }
  (layout.units ??= {})[by] = items;
  return items;
}

/** Paint a layout with its top-left content corner at (ox, oy). */
export function paintLayout(ctx: CanvasRenderingContext2D, layout: Layout, theme: DesignSystem, ox: number, oy: number, o: PaintTextOpts = {}) {
  const fx = resolveFx(theme, o.colorFx);
  const col = (c: string) => (fx && fx.t > 0 ? mixColors(c, fx.c, fx.t) : c);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const alpha0 = ctx.globalAlpha;

  if (o.unit && o.unitBy && o.unitBy !== 'child') {
    const items = unitsOf(layout, o.unitBy);
    const count = o.unitBy === 'line' ? layout.lines.length : items.reduce((m, it) => Math.max(m, it.unit + 1), 0);
    for (const it of items) {
      const { piece: p, line } = it;
      const up = it.unit >= 0 ? o.unit(it.unit, count) : null;
      if (up && up.opacity <= 0.002) continue;
      const bx = ox + line.x + it.x;
      const by = oy + line.baseline + p.dy;
      ctx.save();
      if (up) {
        const cx = bx + it.w / 2, cy = by - p.size * 0.3;
        ctx.translate(cx + up.dx, cy + up.dy);
        if (up.rot) ctx.rotate((up.rot * Math.PI) / 180);
        ctx.scale(up.sx, up.sy);
        ctx.translate(-cx, -cy);
        ctx.globalAlpha = alpha0 * up.opacity * p.o;
        if (up.blur > 0.1 && 'filter' in ctx) ctx.filter = `blur(${up.blur * (o.pxPerUnit ?? 1)}px)`;
      } else ctx.globalAlpha = alpha0 * p.o;
      const color = col(p.color);
      if (it.unit >= 0 || o.unitBy === 'line') {
        decorate(ctx, { ...p, w: it.w }, bx, by, line.ascent, line.descent, color);
      }
      if (!it.piece.space) {
        ctx.font = p.font;
        setLS(ctx, p.ls);
        ctx.fillStyle = color;
        ctx.fillText(it.text, bx, by);
      }
      ctx.restore();
    }
    ctx.globalAlpha = alpha0;
    return;
  }

  for (const line of layout.lines) {
    if (line.bullet) {
      const b = line.bullet;
      ctx.font = b.font;
      setLS(ctx, 0);
      ctx.fillStyle = col(b.color);
      ctx.fillText(b.text, ox + b.x, oy + line.baseline);
    }
    for (const p of line.pieces) {
      const bx = ox + line.x + p.x;
      const by = oy + line.baseline + p.dy;
      const color = col(p.color);
      ctx.globalAlpha = alpha0 * p.o;
      decorate(ctx, p, bx, by, line.ascent, line.descent, color);
      if (p.space) continue;
      ctx.font = p.font;
      setLS(ctx, p.ls);
      ctx.fillStyle = color;
      ctx.fillText(p.text, bx, by);
    }
  }
  ctx.globalAlpha = alpha0;
  setLS(ctx, 0);
}

/** The link under a point in layout space (relative to the content corner), if any. */
export function linkAt(layout: Layout, x: number, y: number): string | null {
  for (const line of layout.lines) {
    if (y < line.top || y > line.top + line.h) continue;
    for (const p of line.pieces) if (p.link && x >= line.x + p.x && x <= line.x + p.x + p.w) return p.link;
  }
  return null;
}

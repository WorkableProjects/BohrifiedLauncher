import { formatColor, mixColors, parseColor } from '../model/color';
import { isLight, resolveColor } from '../model/theme';
import type { ChartEl, DesignSystem } from '../model/types';

export interface ChartEnv {
  theme: DesignSystem;
  /** Already-resolved CSS font stack. */
  fontFamily: string;
}

// ── Small helpers ────────────────────────────────────────────────────────────

const fin = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeOutBack = (t: number) => {
  const c = 1.70158, x = clamp01(t) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

/** Eased progress for item `i` of `n`, staggered so the last item starts `spread` into the animation. */
function local(progress: number, i: number, n: number, spread = 0.45): number {
  if (progress >= 1) return 1;
  const start = n > 1 ? (spread * i) / (n - 1) : 0;
  return easeOut((progress - start) / (1 - spread));
}

function withAlpha(c: string, a: number): string {
  const p = parseColor(c);
  return formatColor({ ...p, a: p.a * a });
}

/** Lines of text, truncated with an ellipsis to fit `maxW`. */
function fitText(ctx: CanvasRenderingContext2D, s: string, maxW: number): string {
  if (maxW <= 0) return '';
  if (ctx.measureText(s).width <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? s.slice(0, lo) + '…' : '';
}

function trimNum(v: number, dp = 2): string {
  return String(Number(v.toFixed(dp)));
}

/** Compact, human value formatting; `step` (tick spacing) decides the decimal places for axis labels. */
function fmt(v: number, step = 0): string {
  v = fin(v);
  const a = Math.abs(v);
  if (a >= 1e9) return trimNum(v / 1e9, 1) + 'B';
  if (a >= 1e6) return trimNum(v / 1e6, 1) + 'M';
  if (a >= 1e4) return trimNum(v / 1e3, 1) + 'k';
  if (step > 0 && step < 1) return v.toFixed(Math.min(6, Math.ceil(-Math.log10(step) - 1e-9)));
  const s = trimNum(v, step > 0 ? 0 : 2);
  return a >= 1000 ? Number(s).toLocaleString('en-US') : s;
}

// ── Nice axis scale ──────────────────────────────────────────────────────────

export interface Scale { min: number; max: number; step: number; ticks: number[] }

/** Smallest "nice" (1/2/5 × 10^k) axis covering [lo, hi] with at most `maxTicks` ticks. */
export function niceScale(lo: number, hi: number, maxTicks: number): Scale {
  lo = fin(lo); hi = fin(hi);
  if (hi <= lo) hi = lo + 1;
  maxTicks = Math.max(2, Math.floor(maxTicks));
  const exp = Math.floor(Math.log10((hi - lo) / Math.max(maxTicks - 1, 1)));
  let best: { min: number; max: number; step: number; count: number } | null = null;
  for (let e = exp - 1; e <= exp + 2; e++) {
    for (const m of [1, 2, 5]) {
      const step = m * Math.pow(10, e);
      const min = Math.floor(lo / step + 1e-9) * step, max = Math.ceil(hi / step - 1e-9) * step;
      const count = Math.round((max - min) / step) + 1;
      if (count < 2 || count > maxTicks) continue;
      // Least overshoot wins; on a tie prefer more ticks (smaller step).
      if (!best || max - min < best.max - best.min - 1e-12 || (Math.abs(max - min - (best.max - best.min)) < 1e-12 && count > best.count)) best = { min, max, step, count };
    }
  }
  if (!best) {
    const step = Math.pow(10, Math.ceil(Math.log10(hi - lo)));
    best = { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step, count: 2 };
  }
  const ticks: number[] = [];
  for (let i = 0; i < best.count; i++) ticks.push(Number((best.min + i * best.step).toFixed(10)));
  return { min: Number(best.min.toFixed(10)), max: Number(best.max.toFixed(10)), step: best.step, ticks };
}

// ── Drawing primitives ───────────────────────────────────────────────────────

type Radii = [number, number, number, number]; // tl tr br bl

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: Radii): void {
  const m = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v, m))) as Radii;
  ctx.moveTo(x + tl, y);
  ctx.arcTo(x + w, y, x + w, y + h, tr);
  ctx.arcTo(x + w, y + h, x, y + h, br);
  ctx.arcTo(x, y + h, x, y, bl);
  ctx.arcTo(x, y, x + w, y, tl);
  ctx.closePath();
}

interface Pt { x: number; y: number }

/** Append a polyline or monotone-cubic curve through `pts` (continuing from the current point if `join`). */
function tracePoints(ctx: CanvasRenderingContext2D, pts: Pt[], smooth: boolean, join = false): void {
  if (!pts.length) return;
  const first = pts[0]!;
  if (join) ctx.lineTo(first.x, first.y);
  else ctx.moveTo(first.x, first.y);
  if (pts.length < 3 || !smooth) {
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    return;
  }
  const n = pts.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1]!.x - pts[i]!.x;
    d.push(Math.abs(dx) < 1e-9 ? 0 : (pts[i + 1]!.y - pts[i]!.y) / dx);
  }
  const m: number[] = [d[0]!];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2);
  m.push(d[n - 2]!);
  // Fritsch–Carlson: keep tangents from overshooting between points.
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i]! / d[i]!, b = m[i + 1]! / d[i]!, s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i]!;
      m[i + 1] = t * b * d[i]!;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i]!, q = pts[i + 1]!, h = (q.x - p.x) / 3;
    ctx.bezierCurveTo(p.x + h, p.y + m[i]! * h, q.x - h, q.y - m[i + 1]! * h, q.x, q.y);
  }
}

// ── Chart state ──────────────────────────────────────────────────────────────

interface Rect { x: number; y: number; w: number; h: number }
interface Row { name: string; values: number[]; color: string }

interface Chart {
  ctx: CanvasRenderingContext2D;
  el: ChartEl;
  w: number;
  h: number;
  fs: number;
  afs: number;
  text: string;
  muted: string;
  family: string;
  progress: number;
  cats: string[];
  n: number;
  rows: Row[];
  placed: Rect[];
  colorAt: (i: number) => string;
}

function setFont(c: Chart, size: number, weight = c.el.base.weight || 400): void {
  c.ctx.font = `${c.el.base.italic ? 'italic ' : ''}${weight} ${size}px ${c.family}`;
}

function prepare(ctx: CanvasRenderingContext2D, el: ChartEl, env: ChartEnv, progress: number): Chart {
  const t = env.theme.colors;
  const cycle = [t.primary, t.secondary, t.accent, t.success, t.danger, t.muted].map((c) => resolveColor(env.theme, c));
  const colorAt = (i: number) => {
    const base = cycle[i % cycle.length]!;
    const lap = Math.floor(i / cycle.length);
    return lap ? mixColors(base, '#ffffff', Math.min(0.2 * lap, 0.6)) : base;
  };
  const seriesIn = Array.isArray(el.series) ? el.series : [];
  const cats0 = Array.isArray(el.categories) ? el.categories : [];
  let n = cats0.length;
  for (const s of seriesIn) n = Math.max(n, Array.isArray(s.values) ? s.values.length : 0);
  const fs = Math.max(8, fin(el.base.size) || 24);
  return {
    ctx,
    el,
    w: el.w,
    h: el.h,
    fs,
    afs: Math.max(7, fs * 0.82),
    text: resolveColor(env.theme, el.base.color || '@text'),
    muted: resolveColor(env.theme, t.muted),
    family: env.fontFamily,
    progress: clamp01(fin(progress)),
    cats: Array.from({ length: n }, (_, i) => String(cats0[i] ?? '')),
    n,
    rows: seriesIn.map((s, i) => ({
      name: String(s.name ?? ''),
      values: Array.from({ length: n }, (_, k) => fin(s.values?.[k])),
      color: s.color ? resolveColor(env.theme, s.color) : colorAt(i),
    })),
    placed: [],
    colorAt,
  };
}

// ── Legend & title ───────────────────────────────────────────────────────────

interface LegendItem { label: string; color: string; w: number }

function legendItems(c: Chart): LegendItem[] {
  const pie = c.el.kind === 'pie' || c.el.kind === 'donut';
  const src = pie ? c.cats.map((name, i) => ({ name, color: c.colorAt(i) })) : c.rows;
  setFont(c, c.afs);
  const sw = c.afs * 0.8;
  const maxLabel = Math.max(40, c.w * 0.3);
  return src
    .filter((s) => s.name !== '')
    .map((s) => {
      const label = fitText(c.ctx, s.name, maxLabel);
      return { label, color: s.color, w: sw + c.afs * 0.45 + c.ctx.measureText(label).width };
    });
}

/** Draws the title and legend, returning the rect left for the plot. */
function drawFurniture(c: Chart, area: Rect): Rect {
  const { ctx, el } = c;
  let { x, y, w, h } = area;

  if (el.title) {
    setFont(c, c.fs * 1.25, Math.max(600, el.base.weight || 400));
    ctx.fillStyle = c.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fitText(ctx, el.title, w), x, y);
    const used = c.fs * 1.25 * 1.3 + c.fs * 0.4;
    y += used;
    h -= used;
  }

  const pos = el.legend;
  if (pos === 'none' || !pos) return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
  const items = legendItems(c);
  if (!items.length) return { x, y, w: Math.max(0, w), h: Math.max(0, h) };

  setFont(c, c.afs);
  const sw = c.afs * 0.8, gap = c.afs * 1.4, rowH = c.afs * 1.6;
  const drawItem = (it: LegendItem, ix: number, iy: number) => {
    ctx.fillStyle = it.color;
    ctx.beginPath();
    roundedRect(ctx, ix, iy - sw / 2, sw, sw, [sw * 0.28, sw * 0.28, sw * 0.28, sw * 0.28]);
    ctx.fill();
    ctx.fillStyle = c.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.label, ix + sw + c.afs * 0.45, iy + 0.5);
  };

  if (pos === 'right') {
    const lw = Math.min(Math.max(...items.map((i) => i.w)), w * 0.4);
    const lh = items.length * rowH;
    const top = y + Math.max(0, (h - lh) / 2);
    items.forEach((it, i) => drawItem(it, x + w - lw, top + rowH * i + rowH / 2));
    return { x, y, w: Math.max(0, w - lw - c.fs * 0.8), h: Math.max(0, h) };
  }

  // top / bottom: wrap rows, centre each.
  const rows: LegendItem[][] = [[]];
  let rw = 0;
  for (const it of items) {
    const cur = rows[rows.length - 1]!;
    if (cur.length && rw + gap + it.w > w) { rows.push([it]); rw = it.w; }
    else { cur.push(it); rw += (cur.length > 1 ? gap : 0) + it.w; }
  }
  const total = rows.length * rowH;
  const y0 = pos === 'top' ? y : y + h - total;
  rows.forEach((row, ri) => {
    const rowW = row.reduce((s, i) => s + i.w, 0) + gap * (row.length - 1);
    let ix = x + Math.max(0, (w - rowW) / 2);
    for (const it of row) { drawItem(it, ix, y0 + rowH * ri + rowH / 2); ix += it.w + gap; }
  });
  const reserve = total + c.fs * 0.35;
  return pos === 'top' ? { x, y: y + reserve, w, h: Math.max(0, h - reserve) } : { x, y, w, h: Math.max(0, h - reserve) };
}

// ── Cartesian charts ─────────────────────────────────────────────────────────

function domain(c: Chart): { lo: number; hi: number } {
  const { kind, stacked } = c.el;
  let lo = 0, hi = 0;
  if (stacked && (kind === 'column' || kind === 'bar')) {
    for (let i = 0; i < c.n; i++) {
      let pos = 0, neg = 0;
      for (const r of c.rows) (r.values[i]! >= 0 ? (pos += r.values[i]!) : (neg += r.values[i]!));
      hi = Math.max(hi, pos); lo = Math.min(lo, neg);
    }
  } else if (stacked && kind === 'area') {
    for (let i = 0; i < c.n; i++) hi = Math.max(hi, c.rows.reduce((s, r) => s + Math.max(0, r.values[i]!), 0));
  } else {
    for (const r of c.rows) for (const v of r.values) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
  }
  return { lo, hi: hi === lo ? lo + 1 : hi };
}

function drawCartesian(c: Chart, area: Rect): void {
  const { ctx, el, n } = c;
  const horizontal = el.kind === 'bar';
  const gap = c.afs * 0.5;
  const showAxis = el.grid || !el.labels;

  const { lo, hi } = domain(c);
  setFont(c, c.afs);
  const catsUsed = c.cats.some((s) => s !== '');

  // Provisional scale for measuring tick labels.
  const roughSpan = horizontal ? area.w : area.h;
  const tickCount = (span: number) => Math.max(2, Math.min(7, Math.floor(span / (c.afs * (horizontal ? 4.5 : 2.6))) + 1));
  let scale = niceScale(lo, hi, tickCount(roughSpan));
  const tickW = Math.max(0, ...scale.ticks.map((v) => ctx.measureText(fmt(v, scale.step)).width));
  const maxCatW = Math.min(Math.max(0, ...c.cats.map((s) => ctx.measureText(s).width)), area.w * 0.32);
  const maxLabelW = el.labels ? Math.max(0, ...c.rows.flatMap((r) => r.values.map((v) => ctx.measureText(fmt(v)).width))) : 0;

  let plot: Rect;
  if (horizontal) {
    const left = catsUsed ? maxCatW + gap : 4;
    const bottom = showAxis ? c.afs * 1.3 + gap : 4;
    const right = Math.max(tickW / 2, el.labels ? maxLabelW + gap : 0, 6);
    plot = { x: area.x + left, y: area.y + 4, w: area.w - left - right, h: area.h - bottom - 4 };
  } else {
    const left = showAxis ? tickW + gap : 4;
    const top = el.labels ? c.afs * 1.5 : c.afs * 0.6;
    const bottom = catsUsed ? c.afs * 1.3 + gap : 4;
    plot = { x: area.x + left, y: area.y + top, w: area.w - left - 6, h: area.h - top - bottom };
  }
  if (plot.w < 4 || plot.h < 4) return;
  scale = niceScale(lo, hi, tickCount(horizontal ? plot.w : plot.h));

  const span = scale.max - scale.min || 1;
  const posV = (v: number) => (horizontal ? plot.x + ((v - scale.min) / span) * plot.w : plot.y + plot.h - ((v - scale.min) / span) * plot.h);
  const zero = posV(0);
  const slot = (horizontal ? plot.h : plot.w) / Math.max(n, 1);
  const slotCenter = (i: number) => (horizontal ? plot.y : plot.x) + (i + 0.5) * slot;

  // Gridlines + value axis labels.
  const lw = Math.max(1, c.fs * 0.045);
  ctx.lineWidth = lw;
  for (const v of scale.ticks) {
    const p = posV(v);
    if (el.grid) {
      ctx.strokeStyle = withAlpha(c.text, 0.12);
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(p, plot.y); ctx.lineTo(p, plot.y + plot.h); }
      else { ctx.moveTo(plot.x, p); ctx.lineTo(plot.x + plot.w, p); }
      ctx.stroke();
    }
    if (showAxis) {
      setFont(c, c.afs);
      ctx.fillStyle = withAlpha(c.text, 0.65);
      const s = fmt(v, scale.step);
      if (horizontal) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(s, Math.min(Math.max(p, plot.x), plot.x + plot.w), plot.y + plot.h + gap);
      } else {
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(s, plot.x - gap, p);
      }
    }
  }

  // Category labels (thinned out when they would collide).
  if (catsUsed) {
    setFont(c, c.afs);
    ctx.fillStyle = withAlpha(c.text, 0.8);
    if (horizontal) {
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const stride = Math.max(1, Math.ceil((c.afs * 1.2) / slot));
      for (let i = 0; i < n; i += stride) ctx.fillText(fitText(ctx, c.cats[i]!, maxCatW), plot.x - gap, slotCenter(i));
    } else {
      const widest = Math.max(...c.cats.map((s) => ctx.measureText(s).width));
      const stride = Math.max(1, Math.ceil((widest * 1.15) / slot));
      ctx.textBaseline = 'top';
      for (let i = 0; i < n; i += stride) {
        const label = fitText(ctx, c.cats[i]!, slot * stride * 0.95);
        const tw = ctx.measureText(label).width;
        const cx = Math.min(Math.max(slotCenter(i), area.x + tw / 2), area.x + area.w - tw / 2);
        ctx.textAlign = 'center';
        ctx.fillText(label, cx, plot.y + plot.h + gap);
      }
    }
  }

  // Zero baseline.
  ctx.strokeStyle = withAlpha(c.text, 0.4);
  ctx.lineWidth = lw * 1.4;
  ctx.beginPath();
  if (horizontal) { ctx.moveTo(zero, plot.y); ctx.lineTo(zero, plot.y + plot.h); }
  else { ctx.moveTo(plot.x, zero); ctx.lineTo(plot.x + plot.w, zero); }
  ctx.stroke();

  if (!c.rows.length || !n) return;
  switch (el.kind) {
    case 'column':
    case 'bar':
      drawBars(c, plot, horizontal, posV, zero, slot);
      break;
    case 'line':
    case 'area':
      drawLines(c, posV, zero, slotCenter);
      break;
    case 'scatter':
      drawScatter(c, posV, slotCenter);
      break;
    default:
      break;
  }
}

function drawLabel(c: Chart, text: string, x: number, y: number, align: CanvasTextAlign, base: CanvasTextBaseline, color: string, alpha: number): void {
  if (alpha <= 0) return;
  const { ctx } = c;
  setFont(c, c.afs, Math.max(500, c.el.base.weight || 400));
  const tw = ctx.measureText(text).width, th = c.afs;
  const box: Rect = {
    x: align === 'center' ? x - tw / 2 : align === 'left' ? x : x - tw,
    y: base === 'middle' ? y - th / 2 : base === 'bottom' ? y - th : y,
    w: tw,
    h: th,
  };
  // Skip a label that would sit on top of one already drawn (dense multi-series charts).
  if (c.placed.some((p) => box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y)) return;
  c.placed.push(box);
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(text, x, y);
  ctx.globalAlpha /= alpha;
}

function drawBars(c: Chart, plot: Rect, horizontal: boolean, posV: (v: number) => number, zero: number, slot: number): void {
  const { ctx, el, n, rows } = c;
  const S = rows.length;
  const stacked = el.stacked;
  const groupW = slot * (stacked ? 0.6 : 0.74);
  const inner = stacked ? 0 : Math.min(4, groupW * 0.04);
  const barW = stacked ? groupW : (groupW - inner * (S - 1)) / S;
  const r0 = Math.min(barW / 4, 12);
  const catStart = (i: number) => (horizontal ? plot.y : plot.x) + i * slot + (slot - groupW) / 2;

  for (let i = 0; i < n; i++) {
    // The outermost non-zero segment of each sign gets the rounded end.
    let lastPos = -1, lastNeg = -1;
    rows.forEach((r, s) => { if (r.values[i]! > 0) lastPos = s; else if (r.values[i]! < 0) lastNeg = s; });
    let accPos = 0, accNeg = 0;

    rows.forEach((r, s) => {
      const v = r.values[i]!;
      if (v === 0) return;
      const lp = local(c.progress, stacked ? i : i * S + s, stacked ? n : n * S, 0.5);
      let from: number, to: number;
      if (stacked) {
        if (v > 0) { from = accPos; accPos += v; to = accPos; } else { from = accNeg; accNeg += v; to = accNeg; }
      } else { from = 0; to = v; }
      const a = zero + (posV(from) - zero) * lp, b = zero + (posV(to) - zero) * lp;
      const len = Math.abs(b - a);
      if (len < 0.5) return;
      const off = catStart(i) + (stacked ? 0 : s * (barW + inner));
      const outer = !stacked || (v > 0 ? s === lastPos : s === lastNeg);
      const rad = outer ? Math.min(r0, len / 2) : 0;
      const pos = v > 0;
      const radii: Radii = horizontal ? (pos ? [0, rad, rad, 0] : [rad, 0, 0, rad]) : pos ? [rad, rad, 0, 0] : [0, 0, rad, rad];

      ctx.fillStyle = r.color;
      ctx.beginPath();
      const lo = Math.min(a, b);
      if (horizontal) roundedRect(ctx, lo, off, len, barW, radii);
      else roundedRect(ctx, off, lo, barW, len, radii);
      ctx.fill();

      if (el.labels) {
        const alpha = clamp01((lp - 0.55) / 0.45);
        const text = fmt(v);
        setFont(c, c.afs, Math.max(500, el.base.weight || 400));
        const tw = ctx.measureText(text).width;
        const mid = off + barW / 2;
        if (stacked) {
          const fits = horizontal ? tw + 10 <= len : c.afs * 1.25 <= len && tw <= barW;
          if (fits) {
            const ink = isLight(r.color) ? '#111114' : '#ffffff';
            if (horizontal) drawLabel(c, text, lo + len / 2, mid, 'center', 'middle', ink, alpha);
            else drawLabel(c, text, mid, lo + len / 2, 'center', 'middle', ink, alpha);
          }
        } else if (horizontal ? barW >= c.afs * 0.75 : tw <= (slot / S) * 1.1) {
          const pad = c.afs * 0.35;
          if (horizontal) drawLabel(c, text, pos ? Math.max(a, b) + pad : lo - pad, mid, pos ? 'left' : 'right', 'middle', c.text, alpha);
          else if (!pos && lo + len + pad + c.afs > plot.y + plot.h) {
            // No room below the bar (it reaches the axis bottom): tuck the label inside its end.
            if (len >= c.afs * 1.4) drawLabel(c, text, mid, lo + len - pad, 'center', 'bottom', isLight(r.color) ? '#111114' : '#ffffff', alpha);
          } else drawLabel(c, text, mid, pos ? lo - pad : lo + len + pad, 'center', pos ? 'bottom' : 'top', c.text, alpha);
        }
      }
    });
  }
}

function drawLines(c: Chart, posV: (v: number) => number, zero: number, slotCenter: (i: number) => number): void {
  const { ctx, el, n, rows } = c;
  const isArea = el.kind === 'area';
  const stacked = isArea && el.stacked;
  const lw = Math.max(2.5, c.fs * 0.14);
  const mr = Math.max(3.5, lw * 1.35);
  const showMarkers = n <= 30;

  // Cumulative bands for stacked areas.
  const cum: number[][] = [];
  if (stacked) {
    let acc = new Array<number>(n).fill(0);
    for (const r of rows) {
      acc = acc.map((a, i) => a + Math.max(0, r.values[i]!));
      cum.push(acc);
    }
  }
  const upper = (s: number, i: number) => (stacked ? cum[s]![i]! : rows[s]!.values[i]!);
  const lower = (s: number, i: number) => (stacked && s > 0 ? cum[s - 1]![i]! : 0);

  rows.forEach((r, s) => {
    const lp = local(c.progress, s, rows.length, 0.3);
    if (lp <= 0) return;
    const pts: Pt[] = Array.from({ length: n }, (_, i) => ({ x: slotCenter(i), y: posV(upper(s, i)) }));
    const x0 = pts[0]!.x, x1 = pts[n - 1]!.x;
    const reveal = x0 - lw * 2 + (x1 - x0 + lw * 4) * lp;

    ctx.save();
    if (lp < 1) {
      ctx.beginPath();
      ctx.rect(0, 0, reveal, c.h);
      ctx.clip();
    }
    if (isArea && n > 1) {
      const top = Math.min(...pts.map((p) => p.y));
      const g = ctx.createLinearGradient(0, Math.min(top, zero), 0, Math.max(top, zero) || 1);
      g.addColorStop(0, withAlpha(r.color, 0.5));
      g.addColorStop(1, withAlpha(r.color, 0.04));
      ctx.fillStyle = g;
      ctx.beginPath();
      tracePoints(ctx, pts, el.smooth);
      if (stacked && s > 0) {
        const low: Pt[] = Array.from({ length: n }, (_, k) => ({ x: slotCenter(n - 1 - k), y: posV(lower(s, n - 1 - k)) }));
        tracePoints(ctx, low, el.smooth, true);
      } else {
        ctx.lineTo(x1, zero);
        ctx.lineTo(x0, zero);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (n > 1) {
      ctx.strokeStyle = r.color;
      ctx.lineWidth = lw;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      tracePoints(ctx, pts, el.smooth);
      ctx.stroke();
    }
    if (showMarkers || n === 1) {
      ctx.fillStyle = r.color;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, mr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    if (el.labels) {
      for (let i = 0; i < n; i++) {
        const p = pts[i]!;
        const alpha = lp >= 1 ? 1 : clamp01((reveal - p.x) / (c.fs * 2));
        drawLabel(c, fmt(r.values[i]!), p.x, p.y - mr - c.afs * 0.35, 'center', 'bottom', c.text, alpha);
      }
    }
  });
}

function drawScatter(c: Chart, posV: (v: number) => number, slotCenter: (i: number) => number): void {
  const { ctx, el, n, rows } = c;
  const pr = Math.max(4, c.fs * 0.22);
  rows.forEach((r, s) => {
    for (let i = 0; i < n; i++) {
      const lp = local(c.progress, i * rows.length + s, n * rows.length, 0.5);
      if (lp <= 0) continue;
      const x = slotCenter(i), y = posV(r.values[i]!);
      ctx.fillStyle = withAlpha(r.color, 0.85);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0, pr * easeOutBack(lp)), 0, Math.PI * 2);
      ctx.fill();
      if (el.labels) drawLabel(c, fmt(r.values[i]!), x, y - pr - c.afs * 0.3, 'center', 'bottom', c.text, clamp01((lp - 0.5) * 2));
    }
  });
}

// ── Pie / donut ──────────────────────────────────────────────────────────────

function drawPie(c: Chart, area: Rect): void {
  const { ctx, el } = c;
  const donut = el.kind === 'donut';
  const cx = area.x + area.w / 2, cy = area.y + area.h / 2;
  const R = Math.min(area.w, area.h) / 2 - 2;
  if (R < 4) return;
  const inner = donut ? R * 0.58 : 0;
  const values = Array.from({ length: c.n }, (_, i) => Math.max(0, c.rows[0]?.values[i] ?? 0));
  const total = values.reduce((a, b) => a + b, 0);
  const start = -Math.PI / 2;

  if (total <= 0) {
    ctx.strokeStyle = withAlpha(c.text, 0.18);
    ctx.lineWidth = donut ? R - inner : 2;
    ctx.beginPath();
    ctx.arc(cx, cy, donut ? (R + inner) / 2 : R, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  const sweep = easeOut(c.progress) * Math.PI * 2;
  const live = values.filter((v) => v > 0).length;
  let a0 = start;
  values.forEach((v, i) => {
    if (v <= 0) return;
    const span = (v / total) * Math.PI * 2;
    const a1 = a0 + span;
    const gap = live > 1 ? Math.min(0.02, span / 4) : 0;
    const from = a0 + gap / 2, to = Math.min(a1 - gap / 2, start + sweep);
    if (to > from + 1e-4) {
      ctx.fillStyle = c.colorAt(i);
      ctx.beginPath();
      if (donut) {
        ctx.arc(cx, cy, R, from, to);
        ctx.arc(cx, cy, inner, to, from, true);
      } else {
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, from, to);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (el.labels && span / (Math.PI * 2) >= 0.05 && a1 <= start + sweep && c.progress > 0.7) {
      const mid = (a0 + a1) / 2, rr = donut ? (R + inner) / 2 : R * 0.64;
      const ink = isLight(c.colorAt(i)) ? '#111114' : '#ffffff';
      drawLabel(c, fmt(v), cx + Math.cos(mid) * rr, cy + Math.sin(mid) * rr, 'center', 'middle', ink, clamp01((c.progress - 0.7) / 0.3));
    }
    a0 = a1;
  });

  if (donut && el.labels && c.progress > 0.7) {
    const size = Math.min(c.fs * 1.8, inner * 0.5);
    const alpha = clamp01((c.progress - 0.7) / 0.3);
    ctx.globalAlpha *= alpha;
    setFont(c, size, Math.max(700, el.base.weight || 400));
    ctx.fillStyle = c.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(total), cx, cy - size * 0.1);
    setFont(c, Math.max(8, size * 0.38));
    ctx.fillStyle = withAlpha(c.text, 0.6);
    ctx.fillText('total', cx, cy + size * 0.62);
    ctx.globalAlpha /= alpha;
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function drawChart(ctx: CanvasRenderingContext2D, el: ChartEl, env: ChartEnv, progress = 1): void {
  if (!(el.w > 0) || !(el.h > 0)) return;
  const c = prepare(ctx, el, env, progress);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(0, 0, el.w, el.h);
    ctx.clip();
    const pad = Math.max(6, c.fs * 0.4);
    const area = drawFurniture(c, { x: pad, y: pad, w: el.w - pad * 2, h: el.h - pad * 2 });
    if (area.w < 8 || area.h < 8) return;

    const empty = !c.rows.length || c.n === 0;
    if (empty) {
      setFont(c, c.afs);
      ctx.fillStyle = withAlpha(c.text, 0.45);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No data', area.x + area.w / 2, area.y + area.h / 2);
    } else if (el.kind === 'pie' || el.kind === 'donut') {
      drawPie(c, area);
    } else {
      drawCartesian(c, area);
    }
  } finally {
    ctx.restore();
  }
}

// ── CSV ──────────────────────────────────────────────────────────────────────

const csvField = (s: string) => (/[",\t\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function chartDataToCsv(el: ChartEl): string {
  const n = Math.max(el.categories.length, ...el.series.map((s) => s.values.length), 0);
  const rows: string[][] = [['', ...el.series.map((s) => s.name)]];
  for (let i = 0; i < n; i++) rows.push([el.categories[i] ?? '', ...el.series.map((s) => String(fin(s.values[i])))]);
  return rows.map((r) => r.map(csvField).join(',')).join('\n');
}

function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = '';
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') endRow();
    else if (ch === '\r') { if (text[i + 1] === '\n') i++; endRow(); }
    else field += ch;
  }
  if (field !== '' || row.length) endRow();
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

function parseNumber(s: string | undefined): number {
  if (!s) return 0;
  const v = Number(s.replace(/[\s$€£%,]/g, ''));
  return Number.isFinite(v) ? v : 0;
}

export function applyChartCsv(el: ChartEl, csv: string): Pick<ChartEl, 'categories' | 'series'> {
  const text = csv.replace(/^﻿/, '');
  // Detect the delimiter on the first line outside quotes.
  const firstLine = (text.split(/\r?\n/, 1)[0] ?? '').replace(/"[^"]*"/g, '');
  const rows = parseDelimited(text, firstLine.includes('\t') ? '\t' : ',');
  if (!rows.length) return { categories: [], series: [] };
  const header = rows[0]!;
  const body = rows.slice(1);
  const series = header.slice(1).map((name, k) => {
    const prev = el.series[k];
    const s: ChartEl['series'][number] = {
      name: name.trim() || `Series ${k + 1}`,
      values: body.map((r) => parseNumber(r[k + 1]?.trim())),
    };
    if (prev?.color) s.color = prev.color;
    return s;
  });
  return { categories: body.map((r) => (r[0] ?? '').trim()), series };
}

import { cachedStrokePath } from './freehand';
import { elementBounds, LINE_HEIGHT, rectsIntersect, setTextMeasurer, viewportRect } from './geometry';
import { fontFor, splitLines, spansOf, wrapSpans, type RunMeasure } from './richtext';
import type { BoardTheme } from './theme';
import type { Background, BoardElement, Camera, EquationElement, ImageElement, Page, Rect, ShapeElement, TextElement, TextSpan } from './types';

export const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", system-ui, sans-serif';
export const HIGHLIGHT_ALPHA = 0.34;

// Canvas-accurate text metrics for bounds/hit-testing.
if (typeof document !== 'undefined') {
  const mctx = document.createElement('canvas').getContext('2d');
  if (mctx) {
    let lastFont = '';
    setTextMeasurer((text, fontSize, marks) => {
      const font = fontFor(marks, fontSize, FONT_STACK);
      if (font !== lastFont) {
        mctx.font = font;
        lastFont = font;
      }
      return mctx.measureText(text).width;
    });
  }
}

// ─── Images ───────────────────────────────────────────────────────────

const images = new Map<string, HTMLImageElement>();
const imageListeners = new Set<() => void>();

/** Called when an async image decode finishes, so views can repaint. */
export function onImageLoaded(fn: () => void) {
  imageListeners.add(fn);
  return () => imageListeners.delete(fn);
}

/** Drop decoded images (Flow suspended in Bohrified); they decode again on next paint. */
export function releaseImages() {
  for (const img of images.values()) img.onload = null;
  images.clear();
}

function getImage(src: string): HTMLImageElement | null {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => imageListeners.forEach((fn) => fn());
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

// ─── Background patterns ──────────────────────────────────────────────

/** Pattern spacing in world units, doubled until it's ≥ minPx on screen. */
function adaptiveStep(base: number, z: number, minPx: number) {
  let s = base;
  while (s * z < minPx) s *= 2;
  return s;
}

/**
 * Paint the board surface and pattern in *screen* space so lines stay
 * hairline-crisp at every zoom. `ctx` must have a dpr-only transform.
 */
export function drawBackground(ctx: CanvasRenderingContext2D, bg: Background, cam: Camera, w: number, h: number, theme: BoardTheme, fill = true) {
  if (fill) {
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);
  }
  if (bg === 'blank') return;
  const z = cam.z;

  if (bg === 'dots') {
    const step = adaptiveStep(24, z, 14);
    const r = Math.max(0.9, Math.min(1.6, 1.2 * Math.sqrt(z)));
    ctx.fillStyle = theme.patternStrong;
    const x0 = Math.floor(cam.x / step) * step;
    const y0 = Math.floor(cam.y / step) * step;
    ctx.beginPath();
    for (let wx = x0; (wx - cam.x) * z < w + step * z; wx += step) {
      const sx = (wx - cam.x) * z;
      for (let wy = y0; (wy - cam.y) * z < h + step * z; wy += step) {
        const sy = (wy - cam.y) * z;
        ctx.moveTo(sx + r, sy);
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    return;
  }

  const lines = (step: number, vertical: boolean, horizontal: boolean, color: string, width = 1) => {
    ctx.beginPath();
    if (vertical) {
      for (let wx = Math.floor(cam.x / step) * step; (wx - cam.x) * z < w; wx += step) {
        const sx = Math.round((wx - cam.x) * z) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
      }
    }
    if (horizontal) {
      for (let wy = Math.floor(cam.y / step) * step; (wy - cam.y) * z < h; wy += step) {
        const sy = Math.round((wy - cam.y) * z) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  if (bg === 'grid') {
    lines(adaptiveStep(32, z, 12), true, true, theme.pattern);
    return;
  }

  if (bg === 'lined') {
    lines(adaptiveStep(36, z, 10), false, true, theme.pattern);
    // Notebook margin at world x = 0.
    const mx = Math.round(-cam.x * z) + 0.5;
    if (mx > 0 && mx < w) {
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, h);
      ctx.strokeStyle = theme.appearance === 'dark' ? 'rgba(255,69,58,0.45)' : 'rgba(255,59,48,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    return;
  }

  // Graph paper: minor + major grid, x/y axes with unit labels at world origin.
  const minor = adaptiveStep(20, z, 8);
  const major = minor * 5;
  lines(minor, true, true, theme.pattern);
  lines(major, true, true, theme.patternStrong);
  const ox = Math.round(-cam.x * z) + 0.5;
  const oy = Math.round(-cam.y * z) + 0.5;
  ctx.beginPath();
  if (ox >= 0 && ox <= w) { ctx.moveTo(ox, 0); ctx.lineTo(ox, h); }
  if (oy >= 0 && oy <= h) { ctx.moveTo(0, oy); ctx.lineTo(w, oy); }
  ctx.strokeStyle = theme.resolve('label');
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Axis labels: one unit = one major square.
  ctx.fillStyle = theme.patternStrong;
  ctx.font = `500 11px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const unit = 100; // world units per labelled unit at base scale
  const labelStep = adaptiveStep(unit, z, 56);
  const ly = Math.min(Math.max(oy + 4, 4), h - 16);
  for (let wx = Math.floor(cam.x / labelStep) * labelStep; (wx - cam.x) * z < w; wx += labelStep) {
    if (Math.abs(wx) < 1e-6) continue;
    ctx.fillText(String(Math.round(wx / unit * 10) / 10), (wx - cam.x) * z, ly);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const lx = Math.min(Math.max(ox - 6, 28), w - 4);
  for (let wy = Math.floor(cam.y / labelStep) * labelStep; (wy - cam.y) * z < h; wy += labelStep) {
    if (Math.abs(wy) < 1e-6) continue;
    ctx.fillText(String(-Math.round(wy / unit * 10) / 10), lx, (wy - cam.y) * z);
  }
}

// ─── Elements ─────────────────────────────────────────────────────────

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement, theme: BoardTheme) {
  const color = theme.resolve(el.color);
  const { x1, y1, x2, y2 } = el;
  ctx.lineWidth = el.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  const path = new Path2D();
  switch (el.kind) {
    case 'line':
    case 'arrow': {
      path.moveTo(x1, y1);
      path.lineTo(x2, y2);
      if (el.kind === 'arrow') {
        const a = Math.atan2(y2 - y1, x2 - x1);
        const len = Math.min(Math.hypot(x2 - x1, y2 - y1) * 0.5, Math.max(12, el.size * 4));
        const spread = Math.PI / 7;
        path.moveTo(x2 - len * Math.cos(a - spread), y2 - len * Math.sin(a - spread));
        path.lineTo(x2, y2);
        path.lineTo(x2 - len * Math.cos(a + spread), y2 - len * Math.sin(a + spread));
      }
      break;
    }
    case 'rect': {
      const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
      path.roundRect(x, y, w, h, Math.min(w, h, 24) * 0.12);
      break;
    }
    case 'ellipse':
      path.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
      break;
    case 'triangle': {
      const top = Math.min(y1, y2), bot = Math.max(y1, y2);
      path.moveTo((x1 + x2) / 2, top);
      path.lineTo(x2, bot);
      path.lineTo(x1, bot);
      path.closePath();
      break;
    }
    case 'polygon': {
      const p = el.pts ?? [];
      for (let i = 0; i < p.length; i += 2) (i ? path.lineTo(p[i], p[i + 1]) : path.moveTo(p[i], p[i + 1]));
      path.closePath();
      break;
    }
  }
  if (el.fill && el.kind !== 'line' && el.kind !== 'arrow') {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16;
    ctx.fill(path);
    ctx.globalAlpha = 1;
  }
  ctx.stroke(path);
}

export const NOTE_PAD = 16;

/** Canvas metrics for runs, switching fonts only when marks change. */
function runMeasure(ctx: CanvasRenderingContext2D): RunMeasure {
  let last = '';
  return (text, fontSize, marks) => {
    const font = fontFor(marks, fontSize, FONT_STACK);
    if (font !== last) ctx.font = last = font;
    return ctx.measureText(text).width;
  };
}

/** One line of runs; `y` is the top of the glyph box (textBaseline 'top'). */
function drawRuns(ctx: CanvasRenderingContext2D, line: TextSpan[], x: number, y: number, fontSize: number, measure: RunMeasure) {
  let cx = x;
  for (const run of line) {
    if (!run.text) continue;
    const w = measure(run.text, fontSize, run.marks);
    ctx.fillText(run.text, cx, y);
    if (run.marks?.underline) {
      const t = Math.max(fontSize * 0.065, 0.5);
      ctx.fillRect(cx, y + fontSize * 0.98, w, t);
    }
    cx += w;
  }
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement, theme: BoardTheme) {
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const lh = el.fontSize * LINE_HEIGHT;
  const pad = (lh - el.fontSize) / 2;
  const measure = runMeasure(ctx);
  const spans = spansOf(el);
  if (el.note) {
    const { w, h, tint } = el.note;
    const r = Math.min(14, w * 0.06);
    ctx.save();
    ctx.shadowColor = theme.appearance === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = theme.noteFill(tint);
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, w, h, r);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(el.x, el.y, w, h);
    ctx.clip();
    ctx.fillStyle = theme.resolve(el.color);
    const scale = w / 220;
    const lines = wrapSpans(spans, w - NOTE_PAD * 2 * scale, el.fontSize, measure);
    lines.forEach((l, i) => drawRuns(ctx, l, el.x + NOTE_PAD * scale, el.y + NOTE_PAD * scale + pad + i * lh, el.fontSize, measure));
    ctx.restore();
    return;
  }
  ctx.fillStyle = theme.resolve(el.color);
  splitLines(spans).forEach((l, i) => drawRuns(ctx, l, el.x, el.y + pad + i * lh, el.fontSize, measure));
}

// ─── Equations ────────────────────────────────────────────────────────

/** SVG data URLs per element and resolved color (equations recolor per theme). */
const equationUrls = new WeakMap<EquationElement, Map<string, string>>();

export function equationDataUrl(svg: string, color: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/currentColor/g, color))}`;
}

function drawEquation(ctx: CanvasRenderingContext2D, el: EquationElement, theme: BoardTheme) {
  const color = theme.resolve(el.color);
  let urls = equationUrls.get(el);
  if (!urls) equationUrls.set(el, (urls = new Map()));
  let url = urls.get(color);
  if (!url) urls.set(color, (url = equationDataUrl(el.svg, color)));
  // Vector source: the browser rasterizes it at the drawn size, so
  // equations stay crisp at every zoom level.
  const img = getImage(url);
  if (img) ctx.drawImage(img, el.x, el.y, el.w, el.h);
}

function drawImage(ctx: CanvasRenderingContext2D, el: ImageElement, theme: BoardTheme) {
  const img = getImage(el.src);
  if (!img) {
    ctx.fillStyle = theme.pattern;
    ctx.fillRect(el.x, el.y, el.w, el.h);
    return;
  }
  ctx.drawImage(img, el.x, el.y, el.w, el.h);
}

export function drawElement(ctx: CanvasRenderingContext2D, el: BoardElement, theme: BoardTheme) {
  switch (el.type) {
    case 'stroke': {
      ctx.fillStyle = theme.resolve(el.color);
      if (el.tool === 'highlighter') {
        ctx.save();
        ctx.globalAlpha = HIGHLIGHT_ALPHA;
        if (theme.appearance === 'light') ctx.globalCompositeOperation = 'multiply';
        ctx.fill(cachedStrokePath(el));
        ctx.restore();
      } else {
        ctx.fill(cachedStrokePath(el));
      }
      break;
    }
    case 'shape':
      drawShape(ctx, el, theme);
      break;
    case 'text':
      drawText(ctx, el, theme);
      break;
    case 'image':
      drawImage(ctx, el, theme);
      break;
    case 'equation':
      drawEquation(ctx, el, theme);
      break;
    case 'dot':
      ctx.fillStyle = theme.resolve(el.color);
      ctx.beginPath();
      ctx.arc(el.x, el.y, el.r, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

// ─── Whole-page rendering ─────────────────────────────────────────────

export interface RenderOptions {
  cam: Camera;
  /** Viewport size in CSS px. */
  width: number;
  height: number;
  dpr: number;
  theme: BoardTheme;
  hidden?: ReadonlySet<string>;
  /** Skip the surface fill (for transparent exports). */
  transparent?: boolean;
}

/** Render background + visible elements. Returns number of elements drawn. */
export function renderPage(ctx: CanvasRenderingContext2D, page: Page, o: RenderOptions): number {
  const { cam, width, height, dpr, theme } = o;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (o.transparent) ctx.clearRect(0, 0, width, height);
  drawBackground(ctx, page.background, cam, width, height, theme, !o.transparent);
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, -cam.x * cam.z * dpr, -cam.y * cam.z * dpr);
  const view: Rect = viewportRect(cam, width, height);
  let drawn = 0;
  for (const el of page.elements) {
    if (o.hidden?.has(el.id)) continue;
    if (!rectsIntersect(elementBounds(el), view)) continue;
    drawElement(ctx, el, theme);
    drawn++;
  }
  return drawn;
}

/** Apply the world transform for incremental drawing onto a scene canvas. */
export function setWorldTransform(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number) {
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, -cam.x * cam.z * dpr, -cam.y * cam.z * dpr);
}

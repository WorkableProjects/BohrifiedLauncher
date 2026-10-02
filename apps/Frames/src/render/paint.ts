import { identityCamera, type CameraPose, type ColorFx, type Pose } from '../anim/pose';
import type { SlideState } from '../anim/engine';
import { mixColors } from '../model/color';
import { docIsEmpty, docText, plain } from '../model/defaults';
import { rad } from '../model/geometry';
import { resolveColor, resolveFont, resolveShadow } from '../model/theme';
import type { Crop, Deck, DesignSystem, El, Fill, ID, ImageEl, Layout, RichDoc, ShapeEl, Slide, TextEl, VideoEl } from '../model/types';
import { AssetStore, type ImageSource } from './assets';
import { acquire, release } from './canvas';
import { drawChart } from './charts';
import { drawIcon } from './icons';
import { arrowInset, dashPattern, drawArrowhead, lineGeom } from './lines';
import { SHAPE_INFO, shapeFillRule, shapePath } from './shapes';
import { drawTable } from './table';
import { drawTilted } from './perspective';
import { layoutText, paintLayout } from './text';

/**
 * Paints slides. One function family serves the editor canvas, presentation,
 * thumbnails and export, so what you see is what you present and export.
 */

export interface RenderEnv {
  deck: Deck;
  assets: AssetStore;
  mode: 'edit' | 'present' | 'export' | 'thumb';
  /** Device pixels per slide unit (shadows, blurs and 3D strips are in device pixels). */
  px: number;
  /** A text element currently being edited in the DOM overlay: its canvas text is skipped. */
  editingId?: ID | null;
  /** A table cell being edited. */
  editingCell?: { id: ID; r: number; c: number } | null;
  /** Clock in ms (ambient effects). */
  now?: number;
  /** Hide the layout's placeholder prompts. */
  noPrompts?: boolean;
}

interface Frame {
  env: RenderEnv;
  prompts: Map<ID, RichDoc>;
}

// ── Master / layout resolution ───────────────────────────────────────────────

export const layoutOf = (deck: Deck, slide: Slide): Layout | undefined => (slide.layout ? deck.layouts.find((l) => l.id === slide.layout) : undefined);

export function backgroundOf(deck: Deck, slide: Slide): Fill {
  return slide.background ?? layoutOf(deck, slide)?.background ?? deck.master.background;
}

/** Prompt text for each empty placeholder on a slide, taken from its layout. */
function promptsFor(deck: Deck, slide: Slide): Map<ID, RichDoc> {
  const out = new Map<ID, RichDoc>();
  const layout = layoutOf(deck, slide);
  if (!layout) return out;
  const used = new Set<ID>();
  for (const e of slide.elements) {
    if (e.type !== 'text' || !e.ph || !docIsEmpty(e.doc)) continue;
    const match = layout.elements.find((l) => l.type === 'text' && l.ph === e.ph && !used.has(l.id));
    if (match && match.type === 'text') {
      used.add(match.id);
      out.set(e.id, plain(docText(match.doc)));
    }
  }
  return out;
}

// ── Paint helpers ────────────────────────────────────────────────────────────

function gradientFor(ctx: CanvasRenderingContext2D, f: Extract<Fill, { t: 'linear' | 'radial' }>, w: number, h: number, theme: DesignSystem, fx?: ColorFx | null) {
  const stops = (g: CanvasGradient) => {
    for (const s of f.stops) g.addColorStop(Math.min(1, Math.max(0, s.o)), tintColor(resolveColor(theme, s.c), fx, theme));
    return g;
  };
  if (f.t === 'linear') {
    const a = rad(f.angle);
    const dx = Math.sin(a), dy = -Math.cos(a);
    const len = Math.abs(w * dx) + Math.abs(h * dy);
    const cx = w / 2, cy = h / 2;
    return stops(ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2));
  }
  const cx = (f.cx ?? 0.5) * w, cy = (f.cy ?? 0.5) * h;
  const r = Math.max(Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)), 1);
  return stops(ctx.createRadialGradient(cx, cy, 0, cx, cy, r));
}

function tintColor(c: string, fx: ColorFx | null | undefined, theme: DesignSystem) {
  return fx && fx.c && fx.t > 0 ? mixColors(c, resolveColor(theme, fx.c), fx.t) : c;
}

export function fillStyleFor(ctx: CanvasRenderingContext2D, fill: Fill | null | undefined, w: number, h: number, fr: Frame, fx?: ColorFx | null): string | CanvasGradient | CanvasPattern | null {
  if (!fill) return null;
  const theme = fr.env.deck.theme;
  switch (fill.t) {
    case 'solid':
      return tintColor(resolveColor(theme, fill.c), fx, theme);
    case 'linear':
    case 'radial':
      return gradientFor(ctx, fill, w, h, theme, fx);
    case 'image': {
      const src = fr.env.assets.image(fill.asset);
      if (!src) return 'rgba(128,128,128,0.2)';
      const sw = srcW(src), sh = srcH(src);
      const pat = ctx.createPattern(src as CanvasImageSource, fill.fit === 'tile' ? 'repeat' : 'no-repeat');
      if (!pat) return null;
      const k = fill.fit === 'contain' ? Math.min(w / sw, h / sh) : fill.fit === 'tile' ? 1 : Math.max(w / sw, h / sh);
      const m = new DOMMatrix();
      if (fill.fit !== 'tile') m.translateSelf((w - sw * k) / 2, (h - sh * k) / 2);
      m.scaleSelf(k, k);
      pat.setTransform(m);
      return pat;
    }
  }
}

const srcW = (s: ImageSource) => ('naturalWidth' in s ? s.naturalWidth || 512 : s.width);
const srcH = (s: ImageSource) => ('naturalHeight' in s ? s.naturalHeight || 512 : s.height);

export function paintBackground(ctx: CanvasRenderingContext2D, fr: Frame, fill: Fill, w: number, h: number) {
  const s = fillStyleFor(ctx, fill, w, h, fr);
  ctx.fillStyle = s ?? '#ffffff';
  ctx.fillRect(-1, -1, w + 2, h + 2);
}

function strokeOf(ctx: CanvasRenderingContext2D, s: { c: string; w: number; dash?: 'solid' | 'dash' | 'dot'; cap?: CanvasLineCap; join?: CanvasLineJoin }, theme: DesignSystem, fx?: ColorFx | null) {
  ctx.strokeStyle = tintColor(resolveColor(theme, s.c), fx, theme);
  ctx.lineWidth = s.w;
  ctx.lineCap = s.cap ?? 'round';
  ctx.lineJoin = s.join ?? 'round';
  ctx.setLineDash(dashPattern(s.dash, s.w));
}

function imageFilter(f: ImageEl['filters'], px: number): string {
  const parts: string[] = [];
  if (f.brightness !== undefined && f.brightness !== 1) parts.push(`brightness(${f.brightness})`);
  if (f.contrast !== undefined && f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
  if (f.saturate !== undefined && f.saturate !== 1) parts.push(`saturate(${f.saturate})`);
  if (f.grayscale) parts.push(`grayscale(${f.grayscale})`);
  if (f.sepia) parts.push(`sepia(${f.sepia})`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.blur) parts.push(`blur(${f.blur * px}px)`);
  return parts.join(' ');
}

function poseCrop(crop: Crop, pose: Pose | null): Crop {
  if (!pose || (!pose.cropX && !pose.cropY && !pose.cropW && !pose.cropH)) return crop;
  const w = Math.min(1, Math.max(0.02, crop.w + pose.cropW)), h = Math.min(1, Math.max(0.02, crop.h + pose.cropH));
  return { x: Math.min(1 - w, Math.max(0, crop.x + pose.cropX)), y: Math.min(1 - h, Math.max(0, crop.y + pose.cropY)), w, h };
}

function drawCropped(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, crop: Crop, w: number, h: number) {
  ctx.drawImage(src, crop.x * sw, crop.y * sh, Math.max(1, crop.w * sw), Math.max(1, crop.h * sh), 0, 0, w, h);
}

function placeholderBox(ctx: CanvasRenderingContext2D, w: number, h: number, path: Path2D, label: string | null, theme: DesignSystem) {
  ctx.fillStyle = 'rgba(128,128,140,0.14)';
  ctx.fill(path);
  ctx.strokeStyle = 'rgba(128,128,140,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.stroke(path);
  ctx.setLineDash([]);
  const s = Math.min(w, h) * 0.28;
  ctx.save();
  ctx.translate((w - s) / 2, (h - s) / 2 - (label ? s * 0.12 : 0));
  drawIcon(ctx, 'image', s, s, 'rgba(128,128,140,0.9)', 1.5);
  ctx.restore();
  if (label) {
    ctx.font = `500 ${Math.max(18, s * 0.28)}px ${resolveFont(theme, '@body')}`;
    ctx.fillStyle = 'rgba(128,128,140,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText(label, w / 2, h / 2 + s * 0.78);
    ctx.textAlign = 'left';
  }
}

// ── Element bodies ───────────────────────────────────────────────────────────

function textBox(ctx: CanvasRenderingContext2D, doc: RichDoc, base: import('../model/types').TextBase, fr: Frame, x: number, y: number, w: number, h: number, pad: number, fit: 'none' | 'shrink' | 'grow', vAlign: 'top' | 'middle' | 'bottom', pose: Pose | null, alpha = 1) {
  const theme = fr.env.deck.theme;
  const iw = Math.max(10, w - pad * 2);
  const layout = layoutText(doc, base, theme, iw, fit === 'shrink' ? Math.max(10, h - pad * 2) : undefined);
  const free = h - pad * 2 - layout.height;
  const oy = vAlign === 'top' || fit === 'grow' ? 0 : vAlign === 'middle' ? free / 2 : free;
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  paintLayout(ctx, layout, theme, x + pad, y + pad + Math.max(oy, fit === 'none' ? oy : 0), {
    colorFx: pose?.color,
    unit: pose?.unit,
    unitBy: pose?.unitBy,
    pxPerUnit: fr.env.px,
  });
  if (alpha !== 1) ctx.globalAlpha /= alpha;
}

function roundedRect(w: number, h: number, r: number): Path2D {
  return shapePath(r > 0 ? 'round-rect' : 'rect', w, h, r);
}

function drawText(ctx: CanvasRenderingContext2D, el: TextEl, w: number, h: number, pose: Pose | null, fr: Frame) {
  const theme = fr.env.deck.theme;
  if (el.fill || el.stroke) {
    const path = roundedRect(w, h, el.radius ?? 0);
    const fs = fillStyleFor(ctx, el.fill, w, h, fr, pose?.fill);
    if (fs) {
      ctx.fillStyle = fs;
      ctx.fill(path);
    }
    if (el.stroke) {
      strokeOf(ctx, el.stroke, theme, pose?.fill);
      ctx.stroke(path);
      ctx.setLineDash([]);
    }
  }
  if (fr.env.editingId === el.id) return;
  const empty = docIsEmpty(el.doc);
  if (empty) {
    const prompt = fr.prompts.get(el.id);
    if (prompt && fr.env.mode === 'edit' && !fr.env.noPrompts) textBox(ctx, prompt, { ...el.base, color: '@muted' }, fr, 0, 0, w, h, el.pad, el.fit, el.vAlign, null, 0.55);
    return;
  }
  textBox(ctx, el.doc, el.base, fr, 0, 0, w, h, el.pad, el.fit, el.vAlign, pose);
}

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeEl, w: number, h: number, pose: Pose | null, fr: Frame) {
  const theme = fr.env.deck.theme;
  const path = shapePath(el.shape, w, h, el.radius, el.d, el.vb);
  const fs = fillStyleFor(ctx, el.fill, w, h, fr, pose?.fill);
  if (fs) {
    ctx.fillStyle = fs;
    ctx.fill(path, shapeFillRule(el.shape));
  }
  if (el.stroke && el.stroke.w > 0) {
    strokeOf(ctx, el.stroke, theme, pose?.fill);
    ctx.stroke(path);
    ctx.setLineDash([]);
  }
  if (el.doc && el.base && !docIsEmpty(el.doc) && fr.env.editingId !== el.id) {
    const inset = (SHAPE_INFO[el.shape]?.textInset ?? 0) * Math.min(w, h);
    textBox(ctx, el.doc, el.base, fr, inset, inset, w - inset * 2, h - inset * 2, el.pad ?? 16, 'shrink', el.vAlign ?? 'middle', pose);
  }
}

function drawLine(ctx: CanvasRenderingContext2D, el: import('../model/types').LineEl, w: number, h: number, pose: Pose | null, fr: Frame) {
  const theme = fr.env.deck.theme;
  const g = lineGeom(el.curve, w, h, !!el.up);
  const color = tintColor(resolveColor(theme, el.stroke.c), pose?.fill, theme);
  strokeOf(ctx, el.stroke, theme, pose?.fill);
  const progress = pose ? pose.progress : 1;
  const inS = arrowInset(el.start, el.stroke.w), inE = arrowInset(el.end, el.stroke.w);
  if (progress < 1) {
    const L = (Math.hypot(w, h) + 1) * (el.curve === 'straight' ? 1 : 1.5);
    ctx.setLineDash([L * Math.max(0, progress), L * 2]);
  } else if ((inS || inE) && el.curve === 'straight') {
    // Trim the stroke so a pointed head's tip is crisp.
    ctx.save();
    ctx.beginPath();
    const a = g.start, b = g.end;
    const ux = Math.cos(b.angle), uy = Math.sin(b.angle);
    ctx.moveTo(a.x - Math.cos(a.angle) * -inS, a.y - Math.sin(a.angle) * -inS);
    ctx.lineTo(b.x - ux * inE, b.y - uy * inE);
    ctx.stroke();
    ctx.restore();
    if (el.start !== 'none') drawArrowhead(ctx, el.start, a.x, a.y, a.angle, el.stroke.w, color);
    if (el.end !== 'none') drawArrowhead(ctx, el.end, b.x, b.y, b.angle, el.stroke.w, color);
    ctx.setLineDash([]);
    return;
  }
  ctx.stroke(g.path);
  ctx.setLineDash([]);
  if (progress >= 1) {
    if (el.start !== 'none') drawArrowhead(ctx, el.start, g.start.x, g.start.y, g.start.angle, el.stroke.w, color);
    if (el.end !== 'none') drawArrowhead(ctx, el.end, g.end.x, g.end.y, g.end.angle, el.stroke.w, color);
  }
}

function drawImageEl(ctx: CanvasRenderingContext2D, el: ImageEl, w: number, h: number, pose: Pose | null, fr: Frame) {
  const theme = fr.env.deck.theme;
  const path = shapePath(el.mask === 'rect' && el.radius > 0 ? 'round-rect' : el.mask, w, h, el.radius || undefined);
  const src = fr.env.assets.image(el.asset);
  if (!src) {
    if (fr.env.mode === 'edit') placeholderBox(ctx, w, h, path, el.asset ? 'Loading…' : el.ph ? 'Drop an image' : null, theme);
    return;
  }
  ctx.save();
  ctx.clip(path, shapeFillRule(el.mask));
  const filter = imageFilter(el.filters, fr.env.px);
  if (filter && 'filter' in ctx) ctx.filter = filter;
  const crop = poseCrop(el.crop, pose);
  if (el.tint) {
    const { canvas, ctx: o } = acquire(Math.ceil(w * fr.env.px), Math.ceil(h * fr.env.px));
    o.scale(fr.env.px, fr.env.px);
    drawCropped(o, src as CanvasImageSource, srcW(src), srcH(src), crop, w, h);
    o.globalCompositeOperation = 'source-in';
    o.fillStyle = resolveColor(theme, el.tint);
    o.fillRect(0, 0, w, h);
    ctx.drawImage(canvas as CanvasImageSource, 0, 0, w * fr.env.px, h * fr.env.px, 0, 0, w, h);
    release(canvas);
  } else drawCropped(ctx, src as CanvasImageSource, srcW(src), srcH(src), crop, w, h);
  ctx.restore();
  if (el.stroke && el.stroke.w > 0) {
    strokeOf(ctx, el.stroke, theme);
    ctx.stroke(path);
    ctx.setLineDash([]);
  }
}

function drawVideo(ctx: CanvasRenderingContext2D, el: VideoEl, w: number, h: number, pose: Pose | null, fr: Frame) {
  const path = roundedRect(w, h, el.radius);
  const v = fr.env.assets.video(el.asset);
  ctx.save();
  ctx.clip(path);
  if (v && v.videoWidth) {
    drawCropped(ctx, v, v.videoWidth, v.videoHeight, poseCrop(el.crop, pose), w, h);
  } else {
    ctx.fillStyle = '#0c0c10';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  if (fr.env.mode === 'edit' || !v || v.paused) {
    const s = Math.min(w, h) * 0.22;
    ctx.save();
    ctx.globalAlpha *= v && !v.paused ? 0 : 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, s * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(w / 2 - s / 2, h / 2 - s / 2);
    drawIcon(ctx, 'play', s, s, '#ffffff', 2);
    ctx.restore();
  }
}

function drawBody(ctx: CanvasRenderingContext2D, el: El, w: number, h: number, pose: Pose | null, fr: Frame) {
  const theme = fr.env.deck.theme;
  switch (el.type) {
    case 'text':
      return drawText(ctx, el, w, h, pose, fr);
    case 'shape':
      return drawShape(ctx, el, w, h, pose, fr);
    case 'line':
      return drawLine(ctx, el, w, h, pose, fr);
    case 'image':
      return drawImageEl(ctx, el, w, h, pose, fr);
    case 'icon':
      return drawIcon(ctx, el.icon, w, h, tintColor(resolveColor(theme, el.color), pose?.color ?? pose?.fill, theme), el.sw);
    case 'video':
      return drawVideo(ctx, el, w, h, pose, fr);
    case 'audio':
      if (fr.env.mode === 'edit' || fr.env.mode === 'thumb') {
        ctx.fillStyle = 'rgba(120,120,128,0.2)';
        ctx.fill(roundedRect(w, h, 24));
        ctx.save();
        ctx.translate(w * 0.25, h * 0.25);
        drawIcon(ctx, 'volume', w * 0.5, h * 0.5, 'rgba(120,120,128,0.95)', 1.75);
        ctx.restore();
      }
      return;
    case 'table':
      return drawTable(ctx, el, theme, {
        colorFx: pose?.color,
        unit: null,
        skip: fr.env.editingCell?.id === el.id ? fr.env.editingCell : null,
      });
    case 'chart':
      ctx.save();
      drawChart(ctx, el, { theme, fontFamily: resolveFont(theme, el.base.font) }, pose ? pose.progress : 1);
      ctx.restore();
      return;
    case 'group':
      for (const c of el.children) paintElement(ctx, c, null, fr);
      return;
  }
}

// ── Pseudo-3D (tilt about X / Y) ─────────────────────────────────────────────

/** Draw an element rasterised at `px` device px per unit, tilted in perspective, centred on the origin. */
function draw3D(ctx: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number, px: number, rotX: number, rotY: number) {
  drawTilted(ctx, src, 0, 0, w * px, h * px, w, h, { rotX, rotY });
}

// ── Element painter ──────────────────────────────────────────────────────────

function applyFx(ctx: CanvasRenderingContext2D, el: El, pose: Pose | null, fr: Frame) {
  const theme = fr.env.deck.theme;
  const px = fr.env.px;
  const fx = el.fx;
  const shadow = resolveShadow(theme, fx?.shadow);
  if (shadow) {
    ctx.shadowColor = resolveColor(theme, shadow.c);
    ctx.shadowBlur = shadow.blur * px;
    ctx.shadowOffsetX = shadow.x * px;
    ctx.shadowOffsetY = shadow.y * px;
  } else if (fx?.glow) {
    ctx.shadowColor = resolveColor(theme, fx.glow.c);
    ctx.shadowBlur = fx.glow.blur * px;
  }
  const blur = (fx?.blur ?? 0) + (pose?.blur ?? 0);
  if (blur > 0.05 && 'filter' in ctx) ctx.filter = `blur(${blur * px}px)`;
  if (fx?.blend) ctx.globalCompositeOperation = fx.blend;
}

export function paintElement(ctx: CanvasRenderingContext2D, el: El, pose: Pose | null, fr: Frame) {
  if (el.hidden || (pose && !pose.visible)) return;
  const alpha = el.opacity * (pose?.opacity ?? 1);
  if (alpha <= 0.002) return;
  const w = Math.max(0, el.w + (pose?.dw ?? 0)), h = Math.max(0, el.h + (pose?.dh ?? 0));
  if (w <= 0 && h <= 0 && el.type !== 'line') return;

  ctx.save();
  ctx.translate(el.x + w / 2 + (pose?.x ?? 0), el.y + h / 2 + (pose?.y ?? 0));
  const rot = el.rot + (pose?.rot ?? 0);
  const sx = (pose?.sx ?? 1) * (el.flipX ? -1 : 1), sy = (pose?.sy ?? 1) * (el.flipY ? -1 : 1);
  if (rot || sx !== 1 || sy !== 1) {
    const px = ((pose?.ox ?? 0.5) - 0.5) * w, py = ((pose?.oy ?? 0.5) - 0.5) * h;
    ctx.translate(px, py);
    if (rot) ctx.rotate(rad(rot));
    ctx.scale(sx, sy);
    ctx.translate(-px, -py);
  }
  ctx.globalAlpha *= alpha;
  applyFx(ctx, el, pose, fr);

  const rotX = pose?.rotX ?? 0, rotY = pose?.rotY ?? 0;
  if (rotX || rotY) {
    const px = fr.env.px;
    const off = acquire(Math.ceil(w * px), Math.ceil(h * px));
    off.ctx.scale(px, px);
    if (pose && pose.reveal < 1) revealClip(off.ctx, w, h, pose);
    drawBody(off.ctx, el, w, h, pose, fr);
    draw3D(ctx, off.canvas as CanvasImageSource, w, h, px, rotX, rotY);
    release(off.canvas);
  } else {
    ctx.translate(-w / 2, -h / 2);
    if (pose && pose.reveal < 1) revealClip(ctx, w, h, pose);
    drawBody(ctx, el, w, h, pose, fr);
  }
  ctx.restore();
}

function revealClip(ctx: CanvasRenderingContext2D, w: number, h: number, pose: Pose) {
  const r = Math.max(0, Math.min(1, pose.reveal));
  ctx.beginPath();
  const pad = 200; // let shadows and overflow through on the open sides
  switch (pose.revealDir) {
    case 'left': ctx.rect(w * (1 - r), -pad, w * r + pad, h + pad * 2); break;
    case 'down': ctx.rect(-pad, -pad, w + pad * 2, h * r + pad); break;
    case 'up': ctx.rect(-pad, h * (1 - r), w + pad * 2, h * r + pad); break;
    default: ctx.rect(-pad, -pad, w * r + pad, h + pad * 2);
  }
  ctx.clip();
}

// ── Slides ───────────────────────────────────────────────────────────────────

export function applyCamera(ctx: CanvasRenderingContext2D, cam: CameraPose, w: number, h: number) {
  ctx.translate(w / 2, h / 2);
  if (cam.rot) ctx.rotate(rad(cam.rot));
  ctx.scale(cam.s, cam.s);
  ctx.translate(-(w / 2 + cam.x), -(h / 2 + cam.y));
}

export interface PaintSlideOpts {
  /** Skip the background (transitions composite their own). */
  noBackground?: boolean;
  /** Draw only the listed element ids (Magic Move draws matched elements separately). */
  only?: Set<ID>;
  /** Do not draw these ids. */
  except?: Set<ID>;
  /** Clip to the slide rectangle (default true). */
  clip?: boolean;
}

/**
 * Paint a whole slide in slide units. The caller has already set the canvas
 * transform (slide units → pixels) and passes the matching `env.px`.
 */
export function paintSlide(ctx: CanvasRenderingContext2D, env: RenderEnv, slide: Slide, state: SlideState | null = null, opts: PaintSlideOpts = {}) {
  const { w, h } = env.deck.size;
  const fr: Frame = { env, prompts: env.mode === 'edit' && !env.noPrompts ? promptsFor(env.deck, slide) : new Map() };
  ctx.save();
  if (opts.clip !== false) {
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
  }
  if (!opts.noBackground) paintBackground(ctx, fr, backgroundOf(env.deck, slide), w, h);
  const cam = state?.camera ?? identityCamera();
  const camera = cam.s !== 1 || cam.x || cam.y || cam.rot;
  if (camera) {
    ctx.save();
    applyCamera(ctx, cam, w, h);
    if (cam.blur > 0.05 && 'filter' in ctx) ctx.filter = `blur(${cam.blur * env.px}px)`;
  }
  const draw = (e: El, pose: Pose | null) => {
    if (opts.only && !opts.only.has(e.id)) return;
    if (opts.except?.has(e.id)) return;
    paintElement(ctx, e, pose, fr);
  };
  for (const e of env.deck.master.elements) draw(e, null);
  const layout = layoutOf(env.deck, slide);
  if (layout) for (const e of layout.elements) if (!e.ph) draw(e, null);
  for (const e of slide.elements) draw(e, state?.poses.get(e.id) ?? null);
  if (camera) ctx.restore();
  ctx.restore();
}

/** Paint one element on its own (Magic Move draws matched objects this way). */
export function paintLoose(ctx: CanvasRenderingContext2D, env: RenderEnv, el: El, pose: Pose | null = null) {
  paintElement(ctx, el, pose, { env, prompts: new Map() });
}

/** Paint only the background of a slide. */
export function paintSlideBackground(ctx: CanvasRenderingContext2D, env: RenderEnv, slide: Slide) {
  paintBackground(ctx, { env, prompts: new Map() }, backgroundOf(env.deck, slide), env.deck.size.w, env.deck.size.h);
}

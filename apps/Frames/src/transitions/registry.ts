import type { Direction } from '../model/types';
import { bezier, preset, springEase } from '../anim/easing';
import { clamp } from '../model/geometry';
import { acquire, release } from '../render/canvas';
import { drawTilted } from '../render/perspective';
import { shapePath } from '../render/shapes';
import {
  VEC, band, boolParam, dirAngle, easeIn, easeInOut, easeOut, edgeShadow, expoIn, lerp, numParam, place, rnd, roundRectPath, seg, smooth, strParam, text, wipeAlong, zoomBlur,
} from './helpers';
import type { TG, TParam, TransitionDef } from './types';

const SMOOTH = bezier(0.32, 0.72, 0, 1);
const blurAmt = (def = 24): TParam => ({ id: 'blur', label: 'Blur', type: 'range', min: 0, max: 80, step: 1, def });
const colorP = (label = 'Accent'): TParam => ({ id: 'color', label, type: 'color', def: '' });

const pickColor = (g: TG) => strParam(g, 'color', g.accent);

function cover(g: TG, p: number, reveal: boolean) {
  const { ctx, w, h } = g;
  const v = VEC[g.dir];
  if (!reveal) {
    place(g, g.from, { x: v.x * p * w * 0.25, y: v.y * p * h * 0.25, brightness: 1 - 0.45 * p });
    const x = v.x * (p - 1) * w, y = v.y * (p - 1) * h;
    edgeShadow(g, x, y, w, h, (v.x ? (v.x < 0 ? 'right' : 'left') : v.y < 0 ? 'down' : 'up') as Direction, 0.35 * (1 - p * 0.5));
    place(g, g.to, { x, y });
  } else {
    ctx.drawImage(g.to as CanvasImageSource, 0, 0, w, h);
    ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - p)})`;
    ctx.fillRect(0, 0, w, h);
    const x = v.x * p * w, y = v.y * p * h;
    edgeShadow(g, x, y, w, h, (v.x ? (v.x < 0 ? 'right' : 'left') : v.y < 0 ? 'down' : 'up') as Direction, 0.4);
    place(g, g.from, { x, y });
  }
}

/** Shared sliced-motion drawing used by pans and cuts: ghosts trail a moving layer. */
function streak(g: TG, c: TG['from'], x: number, y: number, speed: number, alpha: number, base: Partial<Parameters<typeof place>[2]> = {}) {
  const n = 7;
  for (let i = n - 1; i >= 0; i--) {
    const t = i / n;
    place(g, c, { ...base, x: x - (x === 0 ? 0 : Math.sign(x) * speed * t * g.w * 0.05) , y: y - (y === 0 ? 0 : Math.sign(y) * speed * t * g.h * 0.05), alpha: (alpha * (i === 0 ? 1 : 0.35)) / (1 + t * 2) });
  }
}

export const TRANSITIONS: TransitionDef[] = [
  // ── Basic ──
  { id: 'dissolve', name: 'Dissolve', category: 'Basic', desc: 'A clean cross-fade.', params: [], dur: 700, ease: preset('sine-in-out'), draw(g, p) {
    g.ctx.drawImage(g.from as CanvasImageSource, 0, 0, g.w, g.h);
    g.ctx.globalAlpha = p;
    g.ctx.drawImage(g.to as CanvasImageSource, 0, 0, g.w, g.h);
  } },
  { id: 'push', name: 'Push', category: 'Basic', desc: 'The new slide pushes the old one out of frame.', directional: true, params: [], dur: 800, ease: SMOOTH, draw(g, p) {
    const v = VEC[g.dir];
    place(g, g.from, { x: v.x * p * g.w, y: v.y * p * g.h });
    place(g, g.to, { x: v.x * (p - 1) * g.w, y: v.y * (p - 1) * g.h });
  } },
  { id: 'cover', name: 'Cover', category: 'Basic', desc: 'The new slide slides over the old one.', directional: true, params: [], dur: 800, ease: SMOOTH, draw: (g, p) => cover(g, p, false) },
  { id: 'uncover', name: 'Uncover', category: 'Basic', desc: 'The old slide slides away to reveal the new one.', directional: true, params: [], dur: 800, ease: SMOOTH, draw: (g, p) => cover(g, p, true) },
  { id: 'zoom', name: 'Zoom', category: 'Basic', desc: 'The old slide zooms away as the new one settles in.', params: [{ id: 'mode', label: 'Zoom', type: 'choice', options: [{ value: 'in', label: 'In' }, { value: 'out', label: 'Out' }], def: 'in' }], dur: 800, ease: SMOOTH, draw(g, p) {
    const zin = strParam(g, 'mode', 'in') === 'in';
    place(g, g.from, { scale: zin ? lerp(1, 1.45, p) : lerp(1, 0.6, p), alpha: 1 - smooth(seg(p, 0.1, 0.9)) });
    place(g, g.to, { scale: zin ? lerp(0.7, 1, p) : lerp(1.4, 1, p), alpha: smooth(seg(p, 0.1, 0.9)) });
  } },

  // ── Cinematic ──
  { id: 'blur', name: 'Blur', category: 'Cinematic', desc: 'Defocus into the next slide.', params: [blurAmt(28)], dur: 900, ease: preset('sine-in-out'), draw(g, p) {
    const b = numParam(g, 'blur', 28) * g.k;
    place(g, g.from, { blur: b * smooth(seg(p, 0, 0.7)), alpha: 1 - smooth(seg(p, 0.25, 0.75)), scale: 1 + 0.04 * p });
    place(g, g.to, { blur: b * (1 - smooth(seg(p, 0.3, 1))), alpha: smooth(seg(p, 0.25, 0.75)), scale: 1.04 - 0.04 * p });
  } },
  { id: 'depth', name: 'Depth', category: 'Cinematic', desc: 'The old slide recedes into the dark as the new one comes forward.', params: [{ id: 'mode', label: 'Move', type: 'choice', options: [{ value: 'forward', label: 'Forward' }, { value: 'back', label: 'Back' }], def: 'forward' }, blurAmt(6)], dur: 1000, ease: SMOOTH, draw(g, p) {
    const fwd = strParam(g, 'mode', 'forward') === 'forward';
    const b = numParam(g, 'blur', 6) * g.k;
    g.ctx.fillStyle = g.bg;
    g.ctx.fillRect(0, 0, g.w, g.h);
    if (fwd) {
      place(g, g.from, { scale: lerp(1, 0.78, easeOut(p)), alpha: 1 - smooth(seg(p, 0.35, 1)), brightness: 1 - 0.55 * p, blur: b * p });
      place(g, g.to, { scale: lerp(1.28, 1, easeOut(p)), alpha: smooth(seg(p, 0, 0.6)), blur: b * (1 - p) });
    } else {
      place(g, g.to, { scale: lerp(0.78, 1, easeOut(p)), alpha: smooth(seg(p, 0.1, 0.8)), brightness: 0.45 + 0.55 * p, blur: b * (1 - p) });
      place(g, g.from, { scale: lerp(1, 1.3, easeIn(p)), alpha: 1 - smooth(seg(p, 0, 0.55)), blur: b * p });
    }
  } },
  { id: 'cube', name: 'Cube', category: 'Cinematic', desc: 'The slides are faces of a cube that turns.', directional: true, params: [], dur: 1000, ease: SMOOTH, draw(g, p) {
    const { ctx, w, h } = g;
    ctx.fillStyle = g.bg;
    ctx.fillRect(0, 0, w, h);
    const th = p * 90, horiz = g.dir === 'left' || g.dir === 'right';
    const s = g.dir === 'left' || g.dir === 'up' ? 1 : -1;
    const D = Math.max(w, h) * 2.2;
    const faces: [TG['from'], number][] = [[g.from, -th * s], [g.to, (90 - th) * s]];
    faces.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    for (const [c, a] of faces) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      if (horiz) drawTilted(ctx, c as CanvasImageSource, 0, 0, c.width, c.height, w, h, { rotY: a, axisDepth: w / 2, distance: D });
      else drawTilted(ctx, c as CanvasImageSource, 0, 0, c.width, c.height, w, h, { rotX: a, distance: D });
      ctx.restore();
    }
  } },
  { id: 'flip', name: 'Flip', category: 'Cinematic', desc: 'The slide turns over like a card.', params: [], dur: 900, ease: SMOOTH, draw(g, p) {
    const { ctx, w, h } = g;
    ctx.fillStyle = g.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const first = p < 0.5;
    const a = first ? -p * 180 : (1 - p) * 180;
    drawTilted(ctx, (first ? g.from : g.to) as CanvasImageSource, 0, 0, w, h, w, h, { rotY: a, distance: Math.max(w, h) * 2.4 });
    ctx.restore();
  } },
  { id: 'door', name: 'Door', category: 'Cinematic', desc: 'The old slide swings open on a hinge.', directional: true, params: [], dur: 1000, ease: SMOOTH, draw(g, p) {
    const { ctx, w, h } = g;
    ctx.drawImage(g.to as CanvasImageSource, 0, 0, w, h);
    ctx.fillStyle = `rgba(0,0,0,${0.5 * (1 - p)})`;
    ctx.fillRect(0, 0, w, h);
    const left = g.dir === 'left' || g.dir === 'up';
    ctx.save();
    ctx.translate(w / 2, h / 2);
    drawTilted(ctx, g.from as CanvasImageSource, 0, 0, w, h, w, h, { rotY: (left ? -1 : 1) * p * 100, pivotX: (left ? -1 : 1) * (w / 2) * -1, distance: Math.max(w, h) * 2 });
    ctx.restore();
  } },
  { id: 'perspective', name: 'Perspective', category: 'Cinematic', desc: 'Both slides tilt in 3D as the camera moves across.', directional: true, params: [{ id: 'angle', label: 'Angle', type: 'range', min: 10, max: 70, step: 1, def: 38 }], dur: 1100, ease: SMOOTH, draw(g, p) {
    const { ctx, w, h } = g;
    ctx.fillStyle = g.bg;
    ctx.fillRect(0, 0, w, h);
    const v = VEC[g.dir], ang = numParam(g, 'angle', 38);
    const D = Math.max(w, h) * 2.2;
    const tilt = Math.sin(p * Math.PI) * ang;
    const layers: [TG['from'], number][] = [[g.to, p - 1], [g.from, p]];
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.globalAlpha = 1;
    for (const [c, o] of layers) {
      ctx.save();
      ctx.translate(v.x * o * w * 1.02, v.y * o * h * 1.02);
      ctx.scale(1 - 0.12 * Math.sin(p * Math.PI), 1 - 0.12 * Math.sin(p * Math.PI));
      if (v.x) drawTilted(ctx, c as CanvasImageSource, 0, 0, c.width, c.height, w, h, { rotY: tilt * -v.x * (o < 0 ? 1 : 1), distance: D });
      else drawTilted(ctx, c as CanvasImageSource, 0, 0, c.width, c.height, w, h, { rotX: tilt * v.y, distance: D });
      ctx.restore();
    }
    ctx.restore();
  } },

  // ── Camera ──
  { id: 'camera-pan', name: 'Camera pan', category: 'Camera', desc: 'A fast whip-pan across a wide canvas with motion blur.', directional: true, params: [{ id: 'streak', label: 'Motion blur', type: 'range', min: 0, max: 3, step: 0.1, def: 1.2 }], dur: 900, ease: bezier(0.7, 0, 0.2, 1), draw(g, p) {
    const v = VEC[g.dir], k = numParam(g, 'streak', 1.2);
    const speed = Math.sin(p * Math.PI) * k;
    const pull = 1 - 0.1 * Math.sin(p * Math.PI);
    streak(g, g.from, v.x * p * g.w, v.y * p * g.h, speed * 14, 1, { scale: pull, blur: speed * 3 * g.k });
    streak(g, g.to, v.x * (p - 1) * g.w, v.y * (p - 1) * g.h, speed * 14, 1, { scale: pull, blur: speed * 3 * g.k });
  } },
  { id: 'camera-zoom', name: 'Camera zoom', category: 'Camera', desc: 'A dolly move through the scene into the next.', params: [{ id: 'fx', label: 'Focus across', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5 }, { id: 'fy', label: 'Focus down', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5 }], dur: 1100, ease: preset('quart-in-out'), draw(g, p) {
    const fx = numParam(g, 'fx', 0.5) * g.w, fy = numParam(g, 'fy', 0.5) * g.h;
    place(g, g.from, { scale: lerp(1, 2.6, p), cx: fx, cy: fy, alpha: 1 - smooth(seg(p, 0.35, 0.75)), blur: 10 * g.k * seg(p, 0.2, 1) });
    place(g, g.to, { scale: lerp(0.55, 1, p), cx: fx, cy: fy, alpha: smooth(seg(p, 0.3, 0.8)), blur: 10 * g.k * (1 - seg(p, 0, 0.8)) });
  } },
  { id: 'camera-rush', name: 'Camera rush', category: 'Broadcast', desc: 'An aggressive zoom straight through the graphic into the next scene.', params: [{ id: 'fx', label: 'Focus across', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5 }, { id: 'fy', label: 'Focus down', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5 }, { id: 'flash', label: 'Flash', type: 'range', min: 0, max: 1, step: 0.05, def: 0.6 }], dur: 900, ease: preset('linear'), draw(g, p) {
    const { ctx, w, h } = g;
    const fx = numParam(g, 'fx', 0.5) * w, fy = numParam(g, 'fy', 0.5) * h;
    const a = easeIn(seg(p, 0, 0.55)), b = easeOut(seg(p, 0.45, 1));
    if (p < 0.55) zoomBlur(g, g.from, 1 + 7 * expoIn(a * 0.9 + 0.1) * a, a, fx, fy);
    else ctx.drawImage(g.from as CanvasImageSource, 0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = smooth(seg(p, 0.42, 0.58));
    zoomBlur(g, g.to, lerp(0.25, 1, b), 1 - b, fx, fy);
    ctx.restore();
    const flash = numParam(g, 'flash', 0.6) * Math.exp(-Math.pow((p - 0.5) / 0.07, 2));
    if (flash > 0.01) {
      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, Math.max(w, h) * 0.7);
      grad.addColorStop(0, `rgba(255,255,255,${flash})`);
      grad.addColorStop(1, `rgba(255,255,255,${flash * 0.25})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  } },

  // ── Reveal ──
  { id: 'wipe', name: 'Wipe', category: 'Reveal', desc: 'A soft edge sweeps the new slide into view.', directional: true, params: [{ id: 'soft', label: 'Softness', type: 'range', min: 0, max: 0.4, step: 0.01, def: 0.06 }], dur: 800, ease: SMOOTH, draw(g, p) {
    g.ctx.drawImage(g.from as CanvasImageSource, 0, 0, g.w, g.h);
    wipeAlong(g, g.to, p, dirAngle(g.dir === 'left' ? 'left' : g.dir === 'right' ? 'right' : g.dir === 'up' ? 'up' : 'down'), numParam(g, 'soft', 0.06));
  } },
  { id: 'wipe-diagonal', name: 'Diagonal wipe', category: 'Reveal', desc: 'A diagonal edge sweeps across the slide.', params: [{ id: 'angle', label: 'Angle', type: 'range', min: 0, max: 360, step: 5, def: 35 }, { id: 'soft', label: 'Softness', type: 'range', min: 0, max: 0.4, step: 0.01, def: 0.1 }], dur: 900, ease: SMOOTH, draw(g, p) {
    g.ctx.drawImage(g.from as CanvasImageSource, 0, 0, g.w, g.h);
    wipeAlong(g, g.to, p, numParam(g, 'angle', 35), numParam(g, 'soft', 0.1));
  } },
  { id: 'wipe-clock', name: 'Clock wipe', category: 'Reveal', desc: 'A sweeping hand reveals the new slide.', params: [], dur: 1000, ease: preset('sine-in-out'), draw(g, p) {
    const { ctx, w, h } = g;
    ctx.drawImage(g.from as CanvasImageSource, 0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.arc(w / 2, h / 2, Math.hypot(w, h), -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(g.to as CanvasImageSource, 0, 0, w, h);
    ctx.restore();
  } },
  { id: 'split', name: 'Split', category: 'Reveal', desc: 'The slide splits open to reveal the next.', params: [{ id: 'axis', label: 'Opens', type: 'choice', options: [{ value: 'h', label: 'Sideways' }, { value: 'v', label: 'Up & down' }], def: 'h' }], dur: 900, ease: SMOOTH, draw(g, p) {
    const { ctx, w, h } = g;
    ctx.drawImage(g.to as CanvasImageSource, 0, 0, w, h);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - p)})`;
    ctx.fillRect(0, 0, w, h);
    const horiz = strParam(g, 'axis', 'h') === 'h';
    const half = (horiz ? w : h) / 2;
    const d = p * half;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.beginPath();
      if (horiz) ctx.rect(s < 0 ? 0 : half, 0, half, h);
      else ctx.rect(0, s < 0 ? 0 : half, w, half);
      ctx.clip();
      ctx.translate(horiz ? s * d : 0, horiz ? 0 : s * d);
      ctx.drawImage(g.from as CanvasImageSource, 0, 0, w, h);
      ctx.restore();
    }
  } },

  // ── Shape ──
  { id: 'shape', name: 'Shape reveal', category: 'Shape', desc: 'A shape grows from a point to reveal the new slide.', params: [
    { id: 'shape', label: 'Shape', type: 'choice', options: [{ value: 'ellipse', label: 'Circle' }, { value: 'diamond', label: 'Diamond' }, { value: 'rect', label: 'Square' }, { value: 'star', label: 'Star' }, { value: 'hexagon', label: 'Hexagon' }, { value: 'heart', label: 'Heart' }], def: 'ellipse' },
    { id: 'fx', label: 'Origin across', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5 }, { id: 'fy', label: 'Origin down', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5 }, { id: 'ring', label: 'Edge ring', type: 'toggle', def: true }, colorP('Ring colour'),
  ], dur: 1000, ease: preset('quart-in-out'), draw(g, p) {
    const { ctx, w, h } = g;
    ctx.drawImage(g.from as CanvasImageSource, 0, 0, w, h);
    const fx = numParam(g, 'fx', 0.5) * w, fy = numParam(g, 'fy', 0.5) * h;
    const kind = strParam(g, 'shape', 'ellipse') as Parameters<typeof shapePath>[0];
    const R = Math.hypot(Math.max(fx, w - fx), Math.max(fy, h - fy)) * (kind === 'rect' ? 1.0 : kind === 'diamond' ? 1.45 : kind === 'star' ? 1.9 : 1.15);
    const size = Math.max(1, 2 * R * p);
    const path = shapePath(kind, size, size);
    ctx.save();
    ctx.translate(fx - size / 2, fy - size / 2);
    ctx.clip(path);
    ctx.translate(-(fx - size / 2), -(fy - size / 2));
    ctx.drawImage(g.to as CanvasImageSource, 0, 0, w, h);
    ctx.restore();
    if (boolParam(g, 'ring', true) && p > 0.01 && p < 0.99) {
      ctx.save();
      ctx.translate(fx - size / 2, fy - size / 2);
      ctx.strokeStyle = pickColor(g);
      ctx.globalAlpha = 1 - p;
      ctx.lineWidth = 10 * g.k * (1 - p);
      ctx.stroke(path);
      ctx.restore();
    }
  } },

  // ── Object (dynamic) ──
  { id: 'blinds', name: 'Blinds', category: 'Object', desc: 'Slats turn to reveal the next slide.', params: [{ id: 'count', label: 'Slats', type: 'range', min: 3, max: 30, step: 1, def: 10 }, { id: 'axis', label: 'Axis', type: 'choice', options: [{ value: 'v', label: 'Vertical' }, { value: 'h', label: 'Horizontal' }], def: 'v' }], dur: 900, ease: preset('sine-in-out'), draw(g, p) {
    const { ctx, w, h } = g;
    ctx.drawImage(g.from as CanvasImageSource, 0, 0, w, h);
    const n = Math.round(numParam(g, 'count', 10)), vert = strParam(g, 'axis', 'v') === 'v';
    for (let i = 0; i < n; i++) {
      const lp = smooth(seg(p, (i / n) * 0.4, 0.6 + (i / n) * 0.4));
      if (lp <= 0) continue;
      if (vert) {
        const sw = w / n;
        ctx.drawImage(g.to as CanvasImageSource, i * sw, 0, sw * lp, h, i * sw, 0, sw * lp, h);
      } else {
        const sh = h / n;
        ctx.drawImage(g.to as CanvasImageSource, 0, i * sh, w, sh * lp, 0, i * sh, w, sh * lp);
      }
    }
  } },
  { id: 'mosaic', name: 'Mosaic', category: 'Object', desc: 'Tiles of the new slide pop in at random.', params: [{ id: 'cols', label: 'Tiles across', type: 'range', min: 4, max: 40, step: 1, def: 16 }], dur: 1000, ease: preset('linear'), draw(g, p) {
    const { ctx, w, h } = g;
    ctx.drawImage(g.from as CanvasImageSource, 0, 0, w, h);
    const cols = Math.round(numParam(g, 'cols', 16)), tw = w / cols, rows = Math.ceil(h / tw), th = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lp = easeOut(seg(p, rnd(r * cols + c) * 0.6, rnd(r * cols + c) * 0.6 + 0.4));
      if (lp <= 0) continue;
      const cx = c * tw + tw / 2, cy = r * th + th / 2, s = 0.5 + 0.5 * lp;
      ctx.save();
      ctx.globalAlpha = lp;
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
      ctx.drawImage(g.to as CanvasImageSource, c * tw, r * th, tw + 1, th + 1, c * tw, r * th, tw + 1, th + 1);
      ctx.restore();
    }
  } },
  { id: 'cascade', name: 'Cascade', category: 'Object', desc: 'Columns of the old slide fall away in sequence.', params: [{ id: 'count', label: 'Columns', type: 'range', min: 3, max: 24, step: 1, def: 8 }], dur: 1000, ease: preset('linear'), draw(g, p) {
    const { ctx, w, h } = g;
    ctx.drawImage(g.to as CanvasImageSource, 0, 0, w, h);
    const n = Math.round(numParam(g, 'count', 8)), cw = w / n;
    for (let i = 0; i < n; i++) {
      const lp = easeIn(seg(p, (i / n) * 0.45, 0.55 + (i / n) * 0.45));
      ctx.save();
      ctx.beginPath();
      ctx.rect(i * cw, 0, cw + 1, h);
      ctx.clip();
      ctx.translate(0, lp * h * 1.05);
      ctx.drawImage(g.from as CanvasImageSource, 0, 0, w, h);
      ctx.restore();
    }
  } },
  { id: 'morph', name: 'Morph', category: 'Object', desc: 'Matching objects move, resize and recolour into place; the rest cross-fade.', morph: true, params: [], dur: 1000, ease: SMOOTH, draw: (g, p) => drawMorph(g, p, false) },
  { id: 'magic-move', name: 'Magic Move', category: 'Object', desc: 'Objects with the same Magic Move key glide between slides with a springy settle.', morph: true, params: [{ id: 'stagger', label: 'Stagger', type: 'range', min: 0, max: 0.4, step: 0.02, def: 0.12 }], dur: 1200, ease: springEase(120, 18, 1), draw: (g, p) => drawMorph(g, p, true) },

  // ── Broadcast ──
  { id: 'replay-live', name: 'Replay → Live', category: 'Broadcast', desc: 'Broadcast replay window compresses aside, graphics sweep, and live expands to full screen.', params: [{ id: 'a', label: 'Replay label', type: 'text', def: 'REPLAY' }, { id: 'b', label: 'Live label', type: 'text', def: 'LIVE' }, colorP()], dur: 1500, ease: preset('linear'), draw: drawReplayLive },
  { id: 'broadcast-cut', name: 'Broadcast cut', category: 'Broadcast', desc: 'Fast camera move, a graphic overlay wipes through, the new slide resolves underneath.', directional: true, params: [{ id: 'label', label: 'Overlay text', type: 'text', def: '' }, colorP(), { id: 'streak', label: 'Motion blur', type: 'range', min: 0, max: 3, step: 0.1, def: 1.4 }], dur: 800, ease: preset('linear'), draw: drawBroadcastCut },
  { id: 'scoreboard', name: 'Scoreboard', category: 'Broadcast', desc: 'Information panels slide into broadcast positions, then the scene changes behind them.', params: [{ id: 'label', label: 'Panel label', type: 'text', def: 'UP NEXT' }, colorP()], dur: 1500, ease: preset('linear'), draw: drawScoreboard },
  { id: 'signal', name: 'Signal', category: 'Broadcast', desc: 'A brief digital distortion, then a clean cut.', params: [{ id: 'intensity', label: 'Intensity', type: 'range', min: 0.2, max: 2, step: 0.1, def: 1 }, { id: 'scan', label: 'Scanlines', type: 'toggle', def: true }], dur: 700, ease: preset('linear'), draw: drawSignal },
];

export const TRANSITION_MAP = new Map(TRANSITIONS.map((t) => [t.id, t]));
export const TRANSITION_CATEGORIES: TransitionDef['category'][] = ['Basic', 'Cinematic', 'Camera', 'Reveal', 'Shape', 'Object', 'Broadcast'];

export function defaultTransitionParams(def: TransitionDef): Record<string, number | string | boolean> {
  return Object.fromEntries(def.params.map((p) => [p.id, p.def]));
}

// ── Morph / Magic Move ───────────────────────────────────────────────────────

function drawMorph(g: TG, p: number, magic: boolean) {
  const { ctx, w, h } = g;
  if (!g.morph) {
    ctx.drawImage(g.from as CanvasImageSource, 0, 0, w, h);
    ctx.globalAlpha = p;
    ctx.drawImage(g.to as CanvasImageSource, 0, 0, w, h);
    return;
  }
  // Unmatched objects (and the background) cross-fade, matched ones travel.
  ctx.drawImage(g.morph.baseFrom as CanvasImageSource, 0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = smooth(seg(p, 0.05, 0.85));
  ctx.drawImage(g.morph.baseTo as CanvasImageSource, 0, 0, w, h);
  ctx.restore();
  // Magic Move staggers matched objects slightly by index.
  g.morph.draw(ctx, magic ? p : easeInOut(p));
}

// ── Broadcast graphics ───────────────────────────────────────────────────────

function drawReplayLive(g: TG, p: number) {
  const { ctx, w, h, k } = g;
  const accent = pickColor(g);
  const A = easeOut(seg(p, 0, 0.34)), B = easeInOut(seg(p, 0.3, 0.64)), C = easeOut(seg(p, 0.52, 1));
  // Backdrop
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#06080d');
  bg.addColorStop(1, '#10131c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 64 * k) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }

  // Live content: arrives from a small window to full screen
  const liveA = smooth(seg(p, 0.4, 0.55));
  if (liveA > 0) {
    const s = lerp(0.72, 1, C);
    ctx.save();
    ctx.globalAlpha = liveA;
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    roundRectPath(ctx, -w / 2, -h / 2, w, h, lerp(30 * k, 0, C));
    ctx.clip();
    ctx.drawImage(g.to as CanvasImageSource, -w / 2, -h / 2, w, h);
    if (C < 1) {
      ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - C)})`;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
    // LIVE badge
    const badge = liveA * (1 - seg(p, 0.9, 1));
    if (badge > 0.02) {
      ctx.save();
      ctx.globalAlpha = badge;
      const bw = 190 * k, bh = 56 * k, bx = w - bw - 56 * k, by = 52 * k;
      roundRectPath(ctx, bx, by, bw, bh, 10 * k);
      ctx.fillStyle = '#e5173f';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(bx + 30 * k, by + bh / 2, 9 * k * (0.8 + 0.2 * Math.sin(p * 40)), 0, Math.PI * 2);
      ctx.fill();
      text(g, strParam(g, 'b', 'LIVE'), bx + 56 * k, by + bh * 0.72, 38 * k, '#fff', { spacing: 3 * k });
      ctx.restore();
    }
  }

  // Replay window: compresses, then slides aside
  const rs = lerp(1, 0.6, A);
  const rx = lerp(0, -w * 0.72, B), ry = lerp(0, -h * 0.02, A);
  if (B < 1) {
    ctx.save();
    ctx.translate(w / 2 + rx, h / 2 + ry);
    ctx.rotate(lerp(0, -0.035, A) * (1 - B));
    ctx.scale(rs, rs);
    roundRectPath(ctx, -w / 2, -h / 2, w, h, lerp(0, 28 * k, A));
    ctx.save();
    ctx.clip();
    ctx.drawImage(g.from as CanvasImageSource, -w / 2, -h / 2, w, h);
    // slow-motion look: vignette + scanlines
    const vig = ctx.createRadialGradient(0, 0, h * 0.3, 0, 0, h * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${0.55 * A})`);
    ctx.fillStyle = vig;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = `rgba(0,0,0,${0.12 * A})`;
    for (let y = -h / 2; y < h / 2; y += 6 * k) ctx.fillRect(-w / 2, y, w, 2 * k);
    ctx.restore();
    ctx.lineWidth = 6 * k / rs * A;
    ctx.strokeStyle = accent;
    roundRectPath(ctx, -w / 2, -h / 2, w, h, lerp(0, 28 * k, A));
    ctx.stroke();
    if (A > 0.3) {
      ctx.globalAlpha = seg(A, 0.3, 1);
      const lw = 240 * k / rs, lh = 64 * k / rs;
      roundRectPath(ctx, -w / 2 + 40 * k / rs, -h / 2 + 40 * k / rs, lw, lh, 8 * k / rs);
      ctx.fillStyle = accent;
      ctx.fill();
      text(g, strParam(g, 'a', 'REPLAY'), -w / 2 + 70 * k / rs, -h / 2 + 40 * k / rs + lh * 0.72, 44 * k / rs, '#fff', { spacing: 4 * k / rs });
    }
    ctx.restore();
  }

  // UI sweep: diagonal bars race across during B
  const sw = seg(p, 0.28, 0.72);
  if (sw > 0 && sw < 1) {
    const colors = [accent, '#ffffff', g.accent2];
    colors.forEach((c, i) => {
      const t = easeInOut(seg(sw, i * 0.12, 0.7 + i * 0.12));
      const x = lerp(-0.4 * w, 1.4 * w, t);
      band(g, x - (60 - i * 14) * k, x + (60 - i * 14) * k, 140 * k, c);
    });
  }
}

function drawBroadcastCut(g: TG, p: number) {
  const { ctx, w, h, k } = g;
  const accent = pickColor(g);
  const v = VEC[g.dir];
  const sp = Math.sin(p * Math.PI);
  const camA = easeIn(seg(p, 0, 0.5)), camB = easeOut(seg(p, 0.5, 1));
  const kStreak = numParam(g, 'streak', 1.4);
  if (p < 0.5) streak(g, g.from, v.x * camA * w * 0.5, v.y * camA * h * 0.5, sp * kStreak * 22, 1, { blur: sp * 6 * k, scale: 1 + camA * 0.08 });
  else streak(g, g.to, v.x * (camB - 1) * w * 0.5 * -1, v.y * (camB - 1) * h * 0.5 * -1, sp * kStreak * 22, 1, { blur: sp * 6 * k, scale: 1.08 - camB * 0.08 });
  // Overlay panel wipes across along the travel axis
  const t = easeInOut(seg(p, 0.12, 0.88));
  const horizontal = v.x !== 0;
  const L = horizontal ? w : h;
  const lead = lerp(-0.3, 1.3, t) * L;
  const sign = (horizontal ? v.x : v.y) < 0 ? -1 : 1;
  ctx.save();
  if (horizontal) {
    if (sign < 0) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    band(g, lead - 0.46 * L, lead - 0.12 * L, 120 * k, accent);
    band(g, lead - 0.14 * L, lead - 0.02 * L, 120 * k, '#ffffff');
    band(g, lead - 0.04 * L, lead + 0.02 * L, 120 * k, g.accent2);
  } else {
    if (sign < 0) { ctx.translate(0, h); ctx.scale(1, -1); }
    ctx.fillStyle = accent;
    ctx.fillRect(0, lead - 0.46 * L, w, 0.34 * L);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, lead - 0.14 * L, w, 0.12 * L);
    ctx.fillStyle = g.accent2;
    ctx.fillRect(0, lead - 0.02 * L, w, 0.06 * L);
  }
  ctx.restore();
  const label = strParam(g, 'label', '');
  if (label && t > 0.1 && t < 0.9) {
    ctx.save();
    ctx.globalAlpha = Math.sin(seg(t, 0.1, 0.9) * Math.PI);
    text(g, label, w / 2, h / 2 + 40 * k, 120 * k, '#fff', { align: 'center', italic: true, spacing: 6 * k });
    ctx.restore();
  }
}

function drawScoreboard(g: TG, p: number) {
  const { ctx, w, h, k } = g;
  const accent = pickColor(g);
  const inA = easeOut(seg(p, 0, 0.3)), swap = seg(p, 0.42, 0.6), outA = easeIn(seg(p, 0.7, 1));
  ctx.drawImage(g.from as CanvasImageSource, 0, 0, w, h);
  if (swap > 0) {
    // The scene changes behind the panels via a quick vertical wipe
    wipeAlong(g, g.to, smooth(swap), 90, 0.04);
  }
  const panel = (x: number, y: number, pw: number, ph: number, fill: string, slideFrom: { x: number; y: number }) => {
    const t = inA * (1 - outA);
    ctx.save();
    ctx.translate(slideFrom.x * (1 - t), slideFrom.y * (1 - t));
    roundRectPath(ctx, x, y, pw, ph, 10 * k);
    ctx.fillStyle = fill;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 24 * k;
    ctx.shadowOffsetY = 6 * k;
    ctx.fill();
    ctx.restore();
  };
  const t = inA * (1 - outA);
  if (t > 0.001) {
    // Top bar
    panel(0, 0, w, 120 * k, 'rgba(8,10,16,0.92)', { x: 0, y: -140 * k });
    // Accent tag + label
    panel(56 * k, 22 * k, 300 * k, 76 * k, accent, { x: -400 * k, y: 0 });
    text(g, strParam(g, 'label', 'UP NEXT'), 86 * k, 78 * k, 46 * k, '#fff', { spacing: 4 * k });
    // Title strip (next slide title)
    ctx.save();
    ctx.globalAlpha = t;
    text(g, (g.titles.to || '').toUpperCase().slice(0, 42), 400 * k, 78 * k, 50 * k, '#fff', { italic: true, spacing: 2 * k });
    ctx.restore();
    // Bottom lower-third
    panel(56 * k, h - 190 * k, w * 0.46, 120 * k, 'rgba(8,10,16,0.92)', { x: -w * 0.6, y: 0 });
    panel(56 * k, h - 190 * k, 14 * k, 120 * k, g.accent2, { x: -w * 0.6, y: 0 });
    ctx.save();
    ctx.globalAlpha = t;
    text(g, (g.titles.from || '').toUpperCase().slice(0, 36), 96 * k, h - 112 * k, 46 * k, '#fff', { italic: true, spacing: 2 * k });
    ctx.restore();
    // Right stat panel
    panel(w - 330 * k, 180 * k, 274 * k, 320 * k, 'rgba(8,10,16,0.88)', { x: 400 * k, y: 0 });
    ctx.save();
    ctx.globalAlpha = t;
    ctx.fillStyle = accent;
    const bars = [0.8, 0.55, 0.9, 0.4];
    bars.forEach((b, i) => ctx.fillRect(w - 300 * k, 214 * k + i * 68 * k, 214 * k * b * t, 30 * k));
    ctx.restore();
  }
}

function drawSignal(g: TG, p: number) {
  const { ctx, w, h, k } = g;
  const I = numParam(g, 'intensity', 1);
  // Distortion peaks around the cut at p = 0.5.
  const amp = Math.exp(-Math.pow((p - 0.5) / 0.22, 2)) * I;
  const src = p < 0.5 ? g.from : g.to;
  const frame = Math.floor(p * 28);
  const bands = 14;
  const bh = h / bands;
  for (let i = 0; i < bands; i++) {
    const r = rnd(i * 7 + frame, 3);
    const off = (r - 0.5) * 2 * amp * w * 0.09 * (rnd(i + frame * 3, 9) > 0.45 ? 1 : 0.2);
    ctx.drawImage(src as CanvasImageSource, 0, i * bh, w, bh + 1, off, i * bh, w, bh + 1);
  }
  if (amp > 0.05) {
    // RGB split
    const split = amp * 14 * k;
    for (const [col, dx] of [['rgb(255,0,60)', -split], ['rgb(0,220,255)', split]] as const) {
      const tmp = acquire(w, h);
      tmp.ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
      tmp.ctx.globalCompositeOperation = 'multiply';
      tmp.ctx.fillStyle = col;
      tmp.ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * clamp(amp, 0, 1);
      ctx.drawImage(tmp.canvas as CanvasImageSource, dx, 0, w, h);
      ctx.restore();
      release(tmp.canvas);
    }
    // Block glitches
    for (let i = 0; i < 6; i++) {
      if (rnd(i + frame * 5, 21) > 0.5 * clamp(amp, 0, 1) + 0.2) continue;
      const bx = rnd(i, frame) * w, by = rnd(i + 9, frame) * h, bw = (0.1 + rnd(i + 3, frame) * 0.3) * w, bh2 = (0.01 + rnd(i + 6, frame) * 0.04) * h;
      ctx.fillStyle = rnd(i, frame + 2) > 0.5 ? g.accent : g.accent2;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(bx, by, bw, bh2);
      ctx.globalAlpha = 1;
    }
  }
  if (boolParam(g, 'scan', true)) {
    ctx.fillStyle = `rgba(0,0,0,${0.12 * clamp(amp * 1.5, 0, 1)})`;
    for (let y = 0; y < h; y += 4 * k) ctx.fillRect(0, y, w, 1.5 * k);
  }
}

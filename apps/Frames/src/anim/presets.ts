import { uid } from '../model/ids';
import type { AnimKind, Easing, El, SlideAnim, Stagger, Track, Trigger, PathNode, Direction } from '../model/types';
import { bezier, preset, springEase } from './easing';

/**
 * Animation presets. A preset is a recipe: pick one, tune a couple of
 * parameters (direction, distance, amount), and `build` expands it into the
 * keyframe tracks the engine plays. Editing keyframes by hand in the timeline
 * detaches the animation from its preset (`anim.preset` is cleared).
 */

export interface PresetParam {
  id: string;
  label: string;
  type: 'range' | 'choice';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  def: number | string;
}

export interface BuildCtx {
  /** The element being animated (for presets that depend on its size). */
  el?: El | null;
  slide: { w: number; h: number };
  /** The camera's resting pose from earlier camera animations (so "pull back" can undo them). */
  camera?: { x: number; y: number; s: number; rot: number };
}

export interface Built {
  tracks: Track[];
  ease?: Easing;
  dur?: number;
  stagger?: Stagger;
  origin?: [number, number];
  repeat?: number;
  yoyo?: boolean;
  path?: PathNode[];
  orient?: boolean;
}

export interface PresetDef {
  id: string;
  name: string;
  kind: AnimKind;
  category: string;
  /** Applies to these element types only (default: all). */
  only?: El['type'][];
  params: PresetParam[];
  dur: number;
  ease: Easing;
  build(p: Record<string, number | string>, ctx: BuildCtx): Built;
}

const DIRS: PresetParam['options'] = [
  { value: 'left', label: 'From left' },
  { value: 'right', label: 'From right' },
  { value: 'up', label: 'From top' },
  { value: 'down', label: 'From bottom' },
];
const WIPE_DIRS: PresetParam['options'] = [
  { value: 'right', label: 'Left → right' },
  { value: 'left', label: 'Right → left' },
  { value: 'down', label: 'Top → bottom' },
  { value: 'up', label: 'Bottom → top' },
];

const dist = (def = 120): PresetParam => ({ id: 'dist', label: 'Distance', type: 'range', min: 0, max: 800, step: 10, def });
const dir = (def: Direction = 'down'): PresetParam => ({ id: 'dir', label: 'Direction', type: 'choice', options: DIRS, def });
const amount = (label: string, def: number, min: number, max: number, step: number): PresetParam => ({ id: 'amount', label, type: 'range', min, max, step, def });

/** Offset a slide-in starts from, given where it comes *from*. */
function from(d: string, n: number): [number, number] {
  switch (d) {
    case 'left': return [-n, 0];
    case 'right': return [n, 0];
    case 'up': return [0, -n];
    default: return [0, n];
  }
}

const k = (t: number, v: number | string, e?: Easing) => ({ t, v, e });
const tr = (prop: Track['prop'], ...keys: { t: number; v: number | string; e?: Easing }[]): Track => ({ prop, keys });
const num = (v: number | string | undefined, d: number) => (typeof v === 'number' ? v : v !== undefined && !Number.isNaN(Number(v)) ? Number(v) : d);
const str = (v: number | string | undefined, d: string) => (typeof v === 'string' ? v : d);

const SMOOTH = bezier(0.32, 0.72, 0, 1);
const OUT = preset('expo-out');
const IN = preset('quart-in');

function inOut(d: string, n: number, opacity = true): Track[] {
  const [x, y] = from(d, n);
  const t: Track[] = [];
  if (x) t.push(tr('x', k(0, x), k(1, 0)));
  if (y) t.push(tr('y', k(0, y), k(1, 0)));
  if (opacity) t.push(tr('opacity', k(0, 0), k(1, 1)));
  return t;
}
function outOf(d: string, n: number): Track[] {
  const [x, y] = from(d, n);
  const t: Track[] = [];
  if (x) t.push(tr('x', k(0, 0), k(1, x)));
  if (y) t.push(tr('y', k(0, 0), k(1, y)));
  t.push(tr('opacity', k(0, 1), k(1, 0)));
  return t;
}

const WORD: Stagger = { by: 'word', each: 90, from: 'start' };
const CHAR: Stagger = { by: 'char', each: 32, from: 'start' };
const LINE: Stagger = { by: 'line', each: 160, from: 'start' };

export const PRESETS: PresetDef[] = [
  // ── Entrance ──
  { id: 'fade-in', name: 'Fade', kind: 'entrance', category: 'Basic', params: [], dur: 600, ease: preset('quad-out'), build: () => ({ tracks: [tr('opacity', k(0, 0), k(1, 1))] }) },
  { id: 'rise', name: 'Rise', kind: 'entrance', category: 'Basic', params: [dist(80)], dur: 800, ease: OUT, build: (p) => ({ tracks: inOut('down', num(p.dist, 80)) }) },
  { id: 'slide-in', name: 'Slide in', kind: 'entrance', category: 'Basic', params: [dir('left'), dist(260)], dur: 800, ease: OUT, build: (p) => ({ tracks: inOut(str(p.dir, 'left'), num(p.dist, 260)) }) },
  { id: 'zoom-in', name: 'Zoom', kind: 'entrance', category: 'Basic', params: [amount('From scale', 0.6, 0, 1.5, 0.05)], dur: 700, ease: OUT, build: (p) => ({ tracks: [tr('scale', k(0, num(p.amount, 0.6)), k(1, 1)), tr('opacity', k(0, 0), k(0.6, 1))] }) },
  { id: 'wipe-in', name: 'Wipe', kind: 'entrance', category: 'Basic', params: [{ id: 'dir', label: 'Direction', type: 'choice', options: WIPE_DIRS, def: 'right' }], dur: 800, ease: SMOOTH, build: () => ({ tracks: [tr('reveal', k(0, 0), k(1, 1))] }) },
  { id: 'pop', name: 'Pop', kind: 'entrance', category: 'Dynamic', params: [], dur: 900, ease: springEase(260, 14, 1), build: () => ({ tracks: [tr('scale', k(0, 0), k(1, 1)), tr('opacity', k(0, 0), k(0.15, 1))] }) },
  { id: 'drop', name: 'Drop', kind: 'entrance', category: 'Dynamic', params: [dist(500)], dur: 1100, ease: preset('bounce-out'), build: (p) => ({ tracks: [tr('y', k(0, -num(p.dist, 500)), k(1, 0)), tr('opacity', k(0, 0), k(0.15, 1))] }) },
  { id: 'spring-up', name: 'Spring up', kind: 'entrance', category: 'Dynamic', params: [dist(160)], dur: 1100, ease: springEase(180, 13, 1), build: (p) => ({ tracks: [tr('y', k(0, num(p.dist, 160)), k(1, 0)), tr('opacity', k(0, 0), k(0.2, 1))] }) },
  { id: 'blur-in', name: 'Blur in', kind: 'entrance', category: 'Cinematic', params: [amount('Blur', 40, 0, 120, 2)], dur: 1000, ease: SMOOTH, build: (p) => ({ tracks: [tr('blur', k(0, num(p.amount, 40)), k(1, 0)), tr('opacity', k(0, 0), k(0.7, 1)), tr('scale', k(0, 1.06), k(1, 1))] }) },
  { id: 'focus-pull', name: 'Focus pull', kind: 'entrance', category: 'Cinematic', params: [amount('Blur', 60, 0, 120, 2)], dur: 1400, ease: preset('sine-in-out'), build: (p) => ({ tracks: [tr('blur', k(0, num(p.amount, 60)), k(1, 0)), tr('scale', k(0, 1.18), k(1, 1)), tr('opacity', k(0, 0), k(0.4, 1))] }) },
  { id: 'spin-in', name: 'Spin in', kind: 'entrance', category: 'Dynamic', params: [amount('Turn', -180, -720, 720, 15)], dur: 1000, ease: OUT, build: (p) => ({ tracks: [tr('rot', k(0, num(p.amount, -180)), k(1, 0)), tr('scale', k(0, 0.2), k(1, 1)), tr('opacity', k(0, 0), k(0.4, 1))] }) },
  { id: 'flip-in', name: 'Flip in', kind: 'entrance', category: '3D', params: [amount('Angle', 90, 0, 180, 5)], dur: 1000, ease: OUT, build: (p) => ({ tracks: [tr('rotY', k(0, num(p.amount, 90)), k(1, 0)), tr('opacity', k(0, 0), k(0.5, 1))] }) },
  { id: 'tilt-in', name: 'Tilt in', kind: 'entrance', category: '3D', params: [amount('Angle', -70, -180, 180, 5)], dur: 1100, ease: OUT, build: (p) => ({ tracks: [tr('rotX', k(0, num(p.amount, -70)), k(1, 0)), tr('y', k(0, 80), k(1, 0)), tr('opacity', k(0, 0), k(0.5, 1))] }) },
  { id: 'draw-on', name: 'Draw on', kind: 'entrance', category: 'Basic', only: ['chart', 'line'], params: [], dur: 1400, ease: SMOOTH, build: () => ({ tracks: [tr('progress', k(0, 0), k(1, 1))] }) },
  { id: 'typewriter', name: 'Typewriter', kind: 'entrance', category: 'Text', only: ['text', 'shape'], params: [{ id: 'each', label: 'Speed (ms/letter)', type: 'range', min: 8, max: 120, step: 2, def: 32 }], dur: 1, ease: preset('linear'), build: (p) => ({ tracks: [tr('opacity', k(0, 0), k(1, 1))], stagger: { ...CHAR, each: num(p.each, 32) } }) },
  { id: 'cascade-words', name: 'Cascade words', kind: 'entrance', category: 'Text', only: ['text'], params: [{ id: 'each', label: 'Stagger (ms)', type: 'range', min: 20, max: 400, step: 5, def: 90 }, dist(36)], dur: 700, ease: OUT, build: (p) => ({ tracks: [tr('y', k(0, num(p.dist, 36)), k(1, 0)), tr('opacity', k(0, 0), k(1, 1))], stagger: { ...WORD, each: num(p.each, 90) } }) },
  { id: 'cascade-letters', name: 'Cascade letters', kind: 'entrance', category: 'Text', only: ['text'], params: [{ id: 'each', label: 'Stagger (ms)', type: 'range', min: 6, max: 120, step: 2, def: 28 }], dur: 600, ease: springEase(260, 18, 1), build: (p) => ({ tracks: [tr('y', k(0, 40), k(1, 0)), tr('scale', k(0, 0.4), k(1, 1)), tr('opacity', k(0, 0), k(0.4, 1))], stagger: { ...CHAR, each: num(p.each, 28) } }) },
  { id: 'blur-letters', name: 'Blur letters', kind: 'entrance', category: 'Text', only: ['text'], params: [], dur: 800, ease: SMOOTH, build: () => ({ tracks: [tr('blur', k(0, 18), k(1, 0)), tr('opacity', k(0, 0), k(1, 1))], stagger: { ...CHAR, each: 24 } }) },
  { id: 'line-by-line', name: 'Line by line', kind: 'entrance', category: 'Text', only: ['text'], params: [], dur: 800, ease: OUT, build: () => ({ tracks: [tr('x', k(0, -60), k(1, 0)), tr('opacity', k(0, 0), k(1, 1))], stagger: LINE }) },

  // ── Exit ──
  { id: 'fade-out', name: 'Fade out', kind: 'exit', category: 'Basic', params: [], dur: 500, ease: preset('quad-in'), build: () => ({ tracks: [tr('opacity', k(0, 1), k(1, 0))] }) },
  { id: 'sink', name: 'Sink', kind: 'exit', category: 'Basic', params: [dist(80)], dur: 600, ease: IN, build: (p) => ({ tracks: outOf('down', num(p.dist, 80)) }) },
  { id: 'slide-out', name: 'Slide out', kind: 'exit', category: 'Basic', params: [{ ...dir('left'), options: DIRS!.map((o) => ({ value: o.value, label: o.label.replace('From', 'To') })) }, dist(300)], dur: 600, ease: IN, build: (p) => ({ tracks: outOf(str(p.dir, 'left'), num(p.dist, 300)) }) },
  { id: 'zoom-out', name: 'Zoom out', kind: 'exit', category: 'Basic', params: [amount('To scale', 0.5, 0, 1.5, 0.05)], dur: 500, ease: IN, build: (p) => ({ tracks: [tr('scale', k(0, 1), k(1, num(p.amount, 0.5))), tr('opacity', k(0, 1), k(1, 0))] }) },
  { id: 'wipe-out', name: 'Wipe out', kind: 'exit', category: 'Basic', params: [{ id: 'dir', label: 'Direction', type: 'choice', options: WIPE_DIRS, def: 'right' }], dur: 700, ease: SMOOTH, build: () => ({ tracks: [tr('reveal', k(0, 1), k(1, 0))] }) },
  { id: 'blur-out', name: 'Blur out', kind: 'exit', category: 'Cinematic', params: [amount('Blur', 40, 0, 120, 2)], dur: 800, ease: SMOOTH, build: (p) => ({ tracks: [tr('blur', k(0, 0), k(1, num(p.amount, 40))), tr('opacity', k(0.3, 1), k(1, 0)), tr('scale', k(0, 1), k(1, 1.08))] }) },
  { id: 'spin-out', name: 'Spin out', kind: 'exit', category: 'Dynamic', params: [], dur: 800, ease: IN, build: () => ({ tracks: [tr('rot', k(0, 0), k(1, 180)), tr('scale', k(0, 1), k(1, 0.2)), tr('opacity', k(0.5, 1), k(1, 0))] }) },
  { id: 'flip-out', name: 'Flip out', kind: 'exit', category: '3D', params: [], dur: 800, ease: IN, build: () => ({ tracks: [tr('rotY', k(0, 0), k(1, -90)), tr('opacity', k(0.5, 1), k(1, 0))] }) },
  { id: 'collapse', name: 'Collapse', kind: 'exit', category: 'Dynamic', params: [], dur: 600, ease: IN, build: () => ({ tracks: [tr('scaleY', k(0, 1), k(1, 0)), tr('opacity', k(0.6, 1), k(1, 0))] }) },
  { id: 'words-out', name: 'Words out', kind: 'exit', category: 'Text', only: ['text'], params: [], dur: 500, ease: IN, build: () => ({ tracks: [tr('y', k(0, 0), k(1, -30)), tr('opacity', k(0, 1), k(1, 0))], stagger: { ...WORD, each: 60 } }) },

  // ── Emphasis ──
  { id: 'pulse', name: 'Pulse', kind: 'emphasis', category: 'Emphasis', params: [amount('Scale', 1.1, 1, 1.6, 0.01)], dur: 700, ease: preset('sine-in-out'), build: (p) => ({ tracks: [tr('scale', k(0, 1), k(0.5, num(p.amount, 1.1)), k(1, 1))] }) },
  { id: 'heartbeat', name: 'Heartbeat', kind: 'emphasis', category: 'Emphasis', params: [], dur: 900, ease: preset('linear'), build: () => ({ tracks: [tr('scale', k(0, 1), k(0.14, 1.12, preset('sine-in-out')), k(0.28, 1), k(0.42, 1.08), k(0.7, 1))] }) },
  { id: 'wobble', name: 'Wobble', kind: 'emphasis', category: 'Emphasis', params: [amount('Angle', 6, 0, 30, 1)], dur: 700, ease: preset('linear'), build: (p) => ({ tracks: [tr('rot', k(0, 0), k(0.2, -num(p.amount, 6)), k(0.4, num(p.amount, 6) * 0.8), k(0.6, -num(p.amount, 6) * 0.5), k(0.8, num(p.amount, 6) * 0.25), k(1, 0))] }) },
  { id: 'shake', name: 'Shake', kind: 'emphasis', category: 'Emphasis', params: [amount('Distance', 16, 0, 80, 1)], dur: 500, ease: preset('linear'), build: (p) => ({ tracks: [tr('x', k(0, 0), k(0.1, -num(p.amount, 16)), k(0.3, num(p.amount, 16)), k(0.5, -num(p.amount, 16) * 0.6), k(0.7, num(p.amount, 16) * 0.6), k(0.9, -num(p.amount, 16) * 0.2), k(1, 0))] }) },
  { id: 'flash', name: 'Flash', kind: 'emphasis', category: 'Emphasis', params: [], dur: 600, ease: preset('linear'), build: () => ({ tracks: [tr('opacity', k(0, 1), k(0.25, 0.1), k(0.5, 1), k(0.75, 0.1), k(1, 1))] }) },
  { id: 'float', name: 'Float', kind: 'emphasis', category: 'Ambient', params: [amount('Distance', 14, 0, 80, 1)], dur: 2400, ease: preset('sine-in-out'), build: (p) => ({ tracks: [tr('y', k(0, 0), k(1, -num(p.amount, 14)))], repeat: 0, yoyo: true }) },
  { id: 'breathe', name: 'Breathe', kind: 'emphasis', category: 'Ambient', params: [amount('Scale', 1.04, 1, 1.3, 0.01)], dur: 2600, ease: preset('sine-in-out'), build: (p) => ({ tracks: [tr('scale', k(0, 1), k(1, num(p.amount, 1.04)))], repeat: 0, yoyo: true }) },
  { id: 'spin', name: 'Spin', kind: 'emphasis', category: 'Emphasis', params: [amount('Turn', 360, -1440, 1440, 15)], dur: 1200, ease: preset('quart-in-out'), build: (p) => ({ tracks: [tr('rot', k(0, 0), k(1, num(p.amount, 360)))] }) },
  { id: 'tada', name: 'Tada', kind: 'emphasis', category: 'Emphasis', params: [], dur: 900, ease: preset('linear'), build: () => ({ tracks: [tr('scale', k(0, 1), k(0.1, 0.92), k(0.2, 0.92), k(0.3, 1.1), k(0.5, 1.1), k(0.7, 1.1), k(0.9, 1.1), k(1, 1)), tr('rot', k(0, 0), k(0.1, -3), k(0.2, -3), k(0.3, 3), k(0.4, -3), k(0.5, 3), k(0.6, -3), k(0.7, 3), k(0.8, -3), k(0.9, 3), k(1, 0))] }) },
  { id: 'highlight', name: 'Colour pop', kind: 'emphasis', category: 'Emphasis', params: [], dur: 900, ease: preset('sine-in-out'), build: () => ({ tracks: [tr('fill', k(0, 'base'), k(0.5, '@accent'), k(1, 'base')), tr('color', k(0, 'base'), k(0.5, '@accent'), k(1, 'base'))] }) },

  // ── Motion ──
  { id: 'move', name: 'Move', kind: 'motion', category: 'Motion', params: [{ id: 'dx', label: 'Across', type: 'range', min: -1200, max: 1200, step: 10, def: 300 }, { id: 'dy', label: 'Down', type: 'range', min: -700, max: 700, step: 10, def: 0 }], dur: 1000, ease: SMOOTH, build: (p) => ({ tracks: [tr('x', k(0, 0), k(1, num(p.dx, 300))), tr('y', k(0, 0), k(1, num(p.dy, 0)))] }) },
  { id: 'arc', name: 'Arc', kind: 'motion', category: 'Motion', params: [{ id: 'dx', label: 'Across', type: 'range', min: -1200, max: 1200, step: 10, def: 500 }, { id: 'lift', label: 'Lift', type: 'range', min: -600, max: 600, step: 10, def: -220 }], dur: 1200, ease: SMOOTH, build: (p) => ({ tracks: [{ prop: 'path', keys: [k(0, 0), k(1, 1)] }], path: [{ x: 0, y: 0, ox: num(p.dx, 500) / 3, oy: num(p.lift, -220) }, { x: num(p.dx, 500), y: 0, ix: -num(p.dx, 500) / 3, iy: num(p.lift, -220) }] }) },
  { id: 'path', name: 'Custom path', kind: 'motion', category: 'Motion', params: [], dur: 1600, ease: SMOOTH, build: () => ({ tracks: [{ prop: 'path', keys: [k(0, 0), k(1, 1)] }], path: [{ x: 0, y: 0, ox: 160, oy: 0 }, { x: 320, y: -140, ix: -120, iy: 120, ox: 120, oy: -120 }, { x: 640, y: 0, ix: -160, iy: 0 }] }) },
  { id: 'orbit', name: 'Orbit', kind: 'motion', category: 'Motion', params: [amount('Radius', 160, 20, 600, 10)], dur: 3000, ease: preset('linear'), build: (p) => { const r = num(p.amount, 160), c = 0.5523 * r; return { tracks: [{ prop: 'path', keys: [k(0, 0), k(1, 1)] }], path: [{ x: 0, y: -r, ox: c, oy: 0, ix: -c, iy: 0 }, { x: r, y: 0, ix: 0, iy: -c, ox: 0, oy: c }, { x: 0, y: r, ix: c, iy: 0, ox: -c, oy: 0 }, { x: -r, y: 0, ix: 0, iy: c, ox: 0, oy: -c }, { x: 0, y: -r, ix: -c, iy: 0, ox: c, oy: 0 }], repeat: 0 }; } },
  { id: 'zigzag', name: 'Zig-zag', kind: 'motion', category: 'Motion', params: [], dur: 1600, ease: preset('sine-in-out'), build: () => ({ tracks: [{ prop: 'path', keys: [k(0, 0), k(1, 1)] }], path: [{ x: 0, y: 0 }, { x: 160, y: -120 }, { x: 320, y: 120 }, { x: 480, y: -120 }, { x: 640, y: 0 }] }) },

  // ── Transform (a lasting change) ──
  { id: 'scale-to', name: 'Scale to', kind: 'transform', category: 'Transform', params: [amount('Scale', 1.4, 0.1, 4, 0.05)], dur: 900, ease: SMOOTH, build: (p) => ({ tracks: [tr('scale', k(0, 1), k(1, num(p.amount, 1.4)))] }) },
  { id: 'rotate-to', name: 'Rotate to', kind: 'transform', category: 'Transform', params: [amount('Angle', 90, -720, 720, 5)], dur: 900, ease: SMOOTH, build: (p) => ({ tracks: [tr('rot', k(0, 0), k(1, num(p.amount, 90)))] }) },
  { id: 'resize', name: 'Resize', kind: 'transform', category: 'Transform', params: [{ id: 'dw', label: 'Width +', type: 'range', min: -1200, max: 1200, step: 10, def: 200 }, { id: 'dh', label: 'Height +', type: 'range', min: -700, max: 700, step: 10, def: 0 }], dur: 900, ease: SMOOTH, build: (p) => ({ tracks: [tr('w', k(0, 0), k(1, num(p.dw, 200))), tr('h', k(0, 0), k(1, num(p.dh, 0)))] }) },
  { id: 'recolor', name: 'Recolour', kind: 'transform', category: 'Transform', params: [], dur: 800, ease: SMOOTH, build: () => ({ tracks: [tr('fill', k(0, 'base'), k(1, '@accent')), tr('color', k(0, 'base'), k(1, '@accent'))] }) },
  { id: 'crop-reveal', name: 'Crop reveal', kind: 'transform', category: 'Transform', only: ['image', 'video'], params: [], dur: 1000, ease: SMOOTH, build: () => ({ tracks: [tr('reveal', k(0, 0), k(1, 1))] }) },

  // ── Camera ──
  { id: 'camera-zoom-to', name: 'Zoom to element', kind: 'camera', category: 'Camera', params: [amount('Fill', 0.8, 0.3, 1, 0.05)], dur: 1400, ease: preset('quart-in-out'), build: (p, ctx) => {
    const e = ctx.el, W = ctx.slide.w, H = ctx.slide.h;
    if (!e) return { tracks: [tr('scale', k(0, 1), k(1, 1.5))] };
    const s = Math.max(1, Math.min(6, Math.min((W * num(p.amount, 0.8)) / Math.max(1, e.w), (H * num(p.amount, 0.8)) / Math.max(1, e.h))));
    return { tracks: [tr('x', k(0, 0), k(1, e.x + e.w / 2 - W / 2)), tr('y', k(0, 0), k(1, e.y + e.h / 2 - H / 2)), tr('scale', k(0, 1), k(1, s))] };
  } },
  { id: 'camera-push', name: 'Push in', kind: 'camera', category: 'Camera', params: [amount('Scale', 1.15, 1, 2, 0.01)], dur: 4000, ease: preset('sine-in-out'), build: (p) => ({ tracks: [tr('scale', k(0, 1), k(1, num(p.amount, 1.15)))] }) },
  { id: 'camera-pan', name: 'Pan', kind: 'camera', category: 'Camera', params: [{ id: 'dx', label: 'Across', type: 'range', min: -1200, max: 1200, step: 10, def: 400 }, { id: 'dy', label: 'Down', type: 'range', min: -700, max: 700, step: 10, def: 0 }], dur: 1800, ease: preset('quart-in-out'), build: (p) => ({ tracks: [tr('x', k(0, 0), k(1, num(p.dx, 400))), tr('y', k(0, 0), k(1, num(p.dy, 0)))] }) },
  { id: 'camera-tilt', name: 'Dutch tilt', kind: 'camera', category: 'Camera', params: [amount('Angle', 6, -30, 30, 1)], dur: 1400, ease: SMOOTH, build: (p) => ({ tracks: [tr('rot', k(0, 0), k(1, num(p.amount, 6))), tr('scale', k(0, 1), k(1, 1.08))] }) },
  { id: 'camera-rush', name: 'Rush', kind: 'camera', category: 'Camera', params: [amount('Scale', 3, 1.5, 8, 0.1)], dur: 700, ease: preset('expo-in'), build: (p) => ({ tracks: [tr('scale', k(0, 1), k(1, num(p.amount, 3))), tr('blur', k(0, 0), k(1, 24))] }) },
  { id: 'camera-reset', name: 'Pull back', kind: 'camera', category: 'Camera', params: [], dur: 1200, ease: preset('quart-in-out'), build: (_p, ctx) => {
    const c = ctx.camera ?? { x: 0, y: 0, s: 1, rot: 0 };
    return { tracks: [tr('x', k(0, 0), k(1, -c.x)), tr('y', k(0, 0), k(1, -c.y)), tr('scale', k(0, 1), k(1, 1 / (c.s || 1))), tr('rot', k(0, 0), k(1, -c.rot))] };
  } },
];

export const PRESET_MAP = new Map(PRESETS.map((p) => [p.id, p]));
export const PRESET_KINDS: { kind: AnimKind; label: string }[] = [
  { kind: 'entrance', label: 'Entrance' },
  { kind: 'exit', label: 'Exit' },
  { kind: 'emphasis', label: 'Emphasis' },
  { kind: 'motion', label: 'Motion' },
  { kind: 'transform', label: 'Transform' },
  { kind: 'camera', label: 'Camera' },
];

export function presetsFor(kind: AnimKind, elType?: El['type']): PresetDef[] {
  return PRESETS.filter((p) => p.kind === kind && (!p.only || !elType || p.only.includes(elType)));
}

export function defaultParams(def: PresetDef): Record<string, number | string> {
  return Object.fromEntries(def.params.map((p) => [p.id, p.def]));
}

/** Build a `SlideAnim` from a preset. */
export function makeAnim(presetId: string, elId: string, ctx: BuildCtx, over: Partial<SlideAnim> = {}): SlideAnim {
  const def = PRESET_MAP.get(presetId);
  if (!def) throw new Error(`Unknown animation preset: ${presetId}`);
  const params = { ...defaultParams(def), ...(over.params ?? {}) };
  const built = def.build(params, ctx);
  const trigger: Trigger = over.trigger ?? 'click';
  return {
    id: uid('a'),
    el: elId,
    kind: def.kind,
    preset: def.id,
    trigger,
    delay: 0,
    dur: built.dur ?? def.dur,
    ease: built.ease ?? def.ease,
    tracks: built.tracks,
    path: built.path,
    orient: built.orient,
    stagger: built.stagger,
    repeat: built.repeat,
    yoyo: built.yoyo,
    origin: built.origin,
    ...over,
    params,
  };
}

/** Re-expand an animation's tracks after its preset parameters changed. Keeps timing, trigger and easing choices. */
export function rebuildAnim(anim: SlideAnim, ctx: BuildCtx): SlideAnim {
  const def = anim.preset ? PRESET_MAP.get(anim.preset) : null;
  if (!def) return anim;
  const built = def.build({ ...defaultParams(def), ...(anim.params ?? {}) }, ctx);
  return { ...anim, tracks: built.tracks, path: built.path ?? anim.path, stagger: built.stagger ?? anim.stagger, repeat: built.repeat ?? anim.repeat, yoyo: built.yoyo ?? anim.yoyo };
}

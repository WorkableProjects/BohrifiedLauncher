import type { El, ID, Key, Slide, SlideAnim, Track, TrackProp } from '../model/types';
import { docText } from '../model/defaults';
import { mixColors } from '../model/color';
import { clamp, lerp } from '../model/geometry';
import { makeEase } from './easing';
import { samplePath } from './path';
import { identityCamera, identityPose, identityUnit, type CameraPose, type ColorFx, type Pose, type UnitPose } from './pose';

/**
 * The animation engine.
 *
 * A slide's animations are a flat, ordered list. `compileTimeline` turns it
 * into *steps* (a click starts a new step; "with"/"after" chain inside a step)
 * and *clips* (one per animation, with a start relative to its step). At
 * run time each step has a trigger time, and `evalSlide` computes every
 * animated element's `Pose` for any instant — a pure function of the clock,
 * so playback, scrubbing, thumbnails and export all agree.
 */

export const CAMERA = '$camera';

export interface Clip {
  anim: SlideAnim;
  step: number;
  /** ms after the step is triggered. */
  rel: number;
  /** Nominal start/end on the auto-played timeline (all clicks fire as soon as the previous step ends). */
  start: number;
  end: number;
  /** Stagger units (words/letters/lines) the animation spreads across; 1 for plain animations. */
  units: number;
  /** dur + stagger spread: how long the clip occupies the timeline. */
  span: number;
}

export interface Step {
  index: number;
  /** Length of the step: when its last clip ends, relative to the step trigger. */
  len: number;
  /** When the step begins on the auto-played timeline. */
  nominalStart: number;
  /** True for every step but 0, which plays by itself when the slide appears. */
  click: boolean;
}

export interface Timeline {
  clips: Clip[];
  steps: Step[];
  /** Length of the auto-played timeline in ms. */
  total: number;
  byEl: Map<ID, Clip[]>;
}

function unitCount(slide: Slide, a: SlideAnim): number {
  if (!a.stagger || a.el === CAMERA) return 1;
  const el = findEl(slide.elements, a.el);
  if (!el) return 1;
  if (a.stagger.by === 'child') return el.type === 'group' ? Math.max(1, el.children.length) : 1;
  if (el.type !== 'text') return 1;
  const text = docText(el.doc);
  if (a.stagger.by === 'char') return Math.max(1, text.replace(/\s/g, '').length);
  if (a.stagger.by === 'word') return Math.max(1, text.split(/\s+/).filter(Boolean).length);
  return Math.max(1, Math.min(12, text.split('\n').length + Math.floor(text.length / 60)));
}

export function findEl(els: readonly El[], id: ID): El | null {
  for (const e of els) {
    if (e.id === id) return e;
    if (e.type === 'group') {
      const hit = findEl(e.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

const cycles = (a: SlideAnim) => (a.repeat === 0 ? Infinity : Math.max(1, a.repeat ?? 1));

export function compileTimeline(slide: Slide): Timeline {
  const clips: Clip[] = [];
  let step = 0;
  let prevStart = 0;
  let prevEnd = 0;
  const stepLen: number[] = [0];

  for (const anim of slide.anims) {
    if (anim.trigger === 'click') {
      // A click opens a new step; step 0 (anything before the first click) plays by itself.
      step++;
      stepLen[step] = 0;
      prevStart = 0;
      prevEnd = 0;
    }
    const units = unitCount(slide, anim);
    const spread = anim.stagger ? anim.stagger.each * (units - 1) : 0;
    const rel = (anim.trigger === 'after' ? prevEnd : anim.trigger === 'with' ? prevStart : 0) + Math.max(0, anim.delay);
    const finiteCycles = Number.isFinite(cycles(anim)) ? cycles(anim) : 1;
    const span = anim.dur * finiteCycles + spread;
    const end = rel + span;
    clips.push({ anim, step, rel, start: 0, end: 0, units, span });
    prevStart = rel;
    prevEnd = end;
    stepLen[step] = Math.max(stepLen[step] ?? 0, end);
  }

  const steps: Step[] = [];
  let t = 0;
  for (let i = 0; i < stepLen.length; i++) {
    steps.push({ index: i, len: stepLen[i] ?? 0, nominalStart: t, click: i > 0 });
    t += stepLen[i] ?? 0;
  }
  const byEl = new Map<ID, Clip[]>();
  for (const c of clips) {
    c.start = steps[c.step]!.nominalStart + c.rel;
    c.end = c.start + c.span;
    const list = byEl.get(c.anim.el);
    if (list) list.push(c);
    else byEl.set(c.anim.el, [c]);
  }
  return { clips, steps, total: t, byEl };
}

/** Number of clicks the slide waits for. */
export const clickCount = (tl: Timeline) => Math.max(0, tl.steps.length - 1);

export const nominalStarts = (tl: Timeline): number[] => tl.steps.map((s) => s.nominalStart);

// ── Keyframe sampling ────────────────────────────────────────────────────────

const ADD: ReadonlySet<TrackProp> = new Set(['x', 'y', 'rot', 'rotX', 'rotY', 'blur', 'w', 'h', 'cropX', 'cropY', 'cropW', 'cropH']);
const MUL: ReadonlySet<TrackProp> = new Set(['scale', 'scaleX', 'scaleY', 'opacity']);

export function trackMode(t: Track): 'add' | 'mul' | 'set' {
  if (t.mode) return t.mode;
  return ADD.has(t.prop) ? 'add' : MUL.has(t.prop) ? 'mul' : 'set';
}

/** The neutral value of a property: what it contributes when the animation isn't affecting it. */
export const identityValue = (prop: TrackProp): number => (MUL.has(prop) || prop === 'reveal' || prop === 'progress' ? 1 : 0);

const eased = new WeakMap<Track, Key[]>();
function sortedKeys(tr: Track): Key[] {
  let ks = eased.get(tr);
  if (!ks) {
    ks = [...tr.keys].sort((a, b) => a.t - b.t);
    eased.set(tr, ks);
  }
  return ks;
}

function segment(keys: Key[], u: number): { a: Key; b: Key; f: number } | null {
  if (!keys.length) return null;
  if (u <= keys[0]!.t) return { a: keys[0]!, b: keys[0]!, f: 0 };
  const last = keys[keys.length - 1]!;
  if (u >= last.t) return { a: last, b: last, f: 0 };
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i]!, b = keys[i + 1]!;
    if (u >= a.t && u <= b.t) {
      const span = b.t - a.t;
      const raw = span > 1e-9 ? (u - a.t) / span : 1;
      return { a, b, f: a.e ? makeEase(a.e)(raw) : raw };
    }
  }
  return { a: last, b: last, f: 0 };
}

export function sampleNumber(tr: Track, u: number): number {
  const s = segment(sortedKeys(tr), u);
  if (!s) return identityValue(tr.prop);
  const av = Number(s.a.v), bv = Number(s.b.v);
  return lerp(Number.isFinite(av) ? av : 0, Number.isFinite(bv) ? bv : 0, s.f);
}

export function sampleColor(tr: Track, u: number): ColorFx | null {
  const s = segment(sortedKeys(tr), u);
  if (!s) return null;
  const av = String(s.a.v), bv = String(s.b.v);
  const aBase = av === 'base' || av === '', bBase = bv === 'base' || bv === '';
  if (aBase && bBase) return null;
  if (aBase) return { c: bv, t: s.f };
  if (bBase) return { c: av, t: 1 - s.f };
  return { c: mixColors(av, bv, s.f), t: 1 };
}

// ── Applying animations to poses ─────────────────────────────────────────────

function applyNumber(p: Pose, prop: TrackProp, mode: 'add' | 'mul' | 'set', v: number, anim: SlideAnim) {
  const set = (cur: number) => (mode === 'add' ? cur + v : mode === 'mul' ? cur * v : v);
  switch (prop) {
    case 'x': p.x = set(p.x); break;
    case 'y': p.y = set(p.y); break;
    case 'rot': p.rot = set(p.rot); break;
    case 'rotX': p.rotX = set(p.rotX); break;
    case 'rotY': p.rotY = set(p.rotY); break;
    case 'opacity': p.opacity = set(p.opacity); break;
    case 'blur': p.blur = set(p.blur); break;
    case 'scale': p.sx = set(p.sx); p.sy = set(p.sy); break;
    case 'scaleX': p.sx = set(p.sx); break;
    case 'scaleY': p.sy = set(p.sy); break;
    case 'w': p.dw = set(p.dw); break;
    case 'h': p.dh = set(p.dh); break;
    case 'cropX': p.cropX = set(p.cropX); break;
    case 'cropY': p.cropY = set(p.cropY); break;
    case 'cropW': p.cropW = set(p.cropW); break;
    case 'cropH': p.cropH = set(p.cropH); break;
    case 'reveal': {
      p.reveal = set(p.reveal);
      const d = anim.params?.dir;
      if (d === 'left' || d === 'right' || d === 'up' || d === 'down') p.revealDir = d;
      break;
    }
    case 'progress': p.progress = set(p.progress); break;
    default:
  }
}

/** Applies one animation at normalised (already eased) progress `u` to a pose. */
function applyAnim(pose: Pose, anim: SlideAnim, u: number) {
  if (anim.origin) {
    pose.ox = anim.origin[0];
    pose.oy = anim.origin[1];
  }
  for (const tr of anim.tracks) {
    if (tr.prop === 'color' || tr.prop === 'fill') {
      const fx = sampleColor(tr, u);
      if (fx) pose[tr.prop] = fx;
    } else if (tr.prop === 'path') {
      const s = samplePath(anim.path, sampleNumber(tr, u));
      pose.x += s.x;
      pose.y += s.y;
      if (anim.orient) pose.rot += (s.angle * 180) / Math.PI;
    } else {
      applyNumber(pose, tr.prop, trackMode(tr), sampleNumber(tr, u), anim);
    }
  }
}

function applyCamera(cam: CameraPose, anim: SlideAnim, u: number) {
  for (const tr of anim.tracks) {
    if (tr.prop === 'color' || tr.prop === 'fill' || tr.prop === 'path') continue;
    const v = sampleNumber(tr, u);
    const mode = trackMode(tr);
    const set = (cur: number) => (mode === 'add' ? cur + v : mode === 'mul' ? cur * v : v);
    switch (tr.prop) {
      case 'x': cam.x = set(cam.x); break;
      case 'y': cam.y = set(cam.y); break;
      case 'scale': cam.s = set(cam.s); break;
      case 'rot': cam.rot = set(cam.rot); break;
      case 'blur': cam.blur = set(cam.blur); break;
      case 'rotX': cam.rotX = set(cam.rotX); break;
      case 'rotY': cam.rotY = set(cam.rotY); break;
      default:
    }
  }
}

function applyUnit(up: UnitPose, anim: SlideAnim, u: number) {
  for (const tr of anim.tracks) {
    if (tr.prop === 'color' || tr.prop === 'fill' || tr.prop === 'path') continue;
    const v = sampleNumber(tr, u);
    const mode = trackMode(tr);
    const set = (cur: number) => (mode === 'add' ? cur + v : mode === 'mul' ? cur * v : v);
    switch (tr.prop) {
      case 'x': up.dx = set(up.dx); break;
      case 'y': up.dy = set(up.dy); break;
      case 'scale': up.sx = set(up.sx); up.sy = set(up.sy); break;
      case 'scaleX': up.sx = set(up.sx); break;
      case 'scaleY': up.sy = set(up.sy); break;
      case 'rot': up.rot = set(up.rot); break;
      case 'opacity': up.opacity = set(up.opacity); break;
      case 'blur': up.blur = set(up.blur); break;
      default:
    }
  }
}

/** Where along an animation we are, as eased progress, honouring repeat and yoyo. `null` = hasn't started. */
export function animProgress(anim: SlideAnim, elapsed: number): { u: number; state: 'before' | 'running' | 'done' } {
  if (elapsed < 0) return { u: 0, state: 'before' };
  const dur = Math.max(1, anim.dur);
  const n = cycles(anim);
  const total = dur * n;
  if (elapsed >= total && Number.isFinite(total)) {
    const odd = anim.yoyo && Math.round(n) % 2 === 0;
    return { u: odd ? 0 : 1, state: 'done' };
  }
  const cyc = Math.floor(elapsed / dur);
  let frac = (elapsed - cyc * dur) / dur;
  if (anim.yoyo && cyc % 2 === 1) frac = 1 - frac;
  return { u: makeEase(anim.ease)(clamp(frac, 0, 1)), state: 'running' };
}

function unitOrder(i: number, n: number, from: 'start' | 'end' | 'center' | 'edges'): number {
  switch (from) {
    case 'end': return n - 1 - i;
    case 'center': return Math.abs(i - (n - 1) / 2);
    case 'edges': return (n - 1) / 2 - Math.abs(i - (n - 1) / 2);
    default: return i;
  }
}

export interface SlideState {
  poses: Map<ID, Pose>;
  camera: CameraPose | null;
}

/**
 * Every animated element's pose at `now` (ms on the same clock as `stepStarts`).
 * `stepStarts[i]` is when step i was triggered, or null if it hasn't been yet.
 */
export function evalSlide(tl: Timeline, stepStarts: readonly (number | null)[], now: number): SlideState {
  const poses = new Map<ID, Pose>();
  let camera: CameraPose | null = null;

  for (const clip of tl.clips) {
    const { anim } = clip;
    const t0 = stepStarts[clip.step];
    const started = t0 !== null && t0 !== undefined;
    const kind = anim.kind;
    const isCamera = anim.el === CAMERA;

    // Not yet triggered: only entrances have a visible effect (they hold their first frame).
    let elapsed = started ? now - (t0 as number) - clip.rel : -1;
    if (!started && kind !== 'entrance') continue;
    if (elapsed === Infinity || Number.isNaN(elapsed)) elapsed = Infinity;

    if (isCamera) {
      const { u, state } = animProgress(anim, elapsed);
      if (state === 'before' && kind !== 'entrance') continue;
      if (state === 'done' && Number.isFinite(cycles(anim)) === false) continue;
      camera ??= identityCamera();
      applyCamera(camera, anim, u);
      continue;
    }

    const poseFor = (): Pose => {
      let p = poses.get(anim.el);
      if (!p) {
        p = identityPose();
        poses.set(anim.el, p);
      }
      return p;
    };

    if (anim.stagger && anim.stagger.by !== 'child') {
      // Staggered text: the pose carries a per-unit function the painter calls for each letter/word/line.
      const pose = poseFor();
      const prev = pose.unit;
      const st = anim.stagger;
      const entranceHold = !started && kind === 'entrance';
      pose.unitBy = st.by;
      pose.unit = (i, count) => {
        const base = prev ? prev(i, count) : identityUnit();
        const order = unitOrder(i, count, st.from);
        const e = entranceHold ? -1 : elapsed - order * st.each;
        const { u, state } = animProgress(anim, e);
        if (state === 'before' && kind !== 'entrance') return base;
        if (state === 'done' && (kind === 'emphasis')) return base;
        applyUnit(base, anim, u);
        return base;
      };
      continue;
    }

    const { u, state } = animProgress(anim, elapsed);
    if (state === 'before' && kind !== 'entrance') continue;
    if (state === 'done' && kind === 'emphasis' && !anim.params?.hold) continue;
    const pose = poseFor();
    applyAnim(pose, anim, u);
    if (state === 'done' && kind === 'exit') pose.visible = false;
  }
  return { poses, camera };
}

/** Is anything still moving at `now`? (Lets the player stop its frame loop when everything has settled.) */
export function isAnimating(tl: Timeline, stepStarts: readonly (number | null)[], now: number): boolean {
  for (const clip of tl.clips) {
    const t0 = stepStarts[clip.step];
    if (t0 === null || t0 === undefined) continue;
    if (now < t0 + clip.rel + clip.span) return true;
    if (clip.anim.repeat === 0) return true;
  }
  return false;
}

/** When a step finishes, relative to its trigger. */
export const stepLength = (tl: Timeline, step: number) => tl.steps[step]?.len ?? 0;

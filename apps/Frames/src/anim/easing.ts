import type { Easing } from '../model/types';

export type EaseFn = (t: number) => number;

const c1 = 1.70158, c3 = c1 + 1;
const bounceOut: EaseFn = (t) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
const elasticOut: EaseFn = (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1);

const out = (inFn: EaseFn): EaseFn => (t) => 1 - inFn(1 - t);

const quadIn: EaseFn = (t) => t * t;
const cubicIn: EaseFn = (t) => t * t * t;
const quartIn: EaseFn = (t) => t ** 4;
const quintIn: EaseFn = (t) => t ** 5;
const sineIn: EaseFn = (t) => 1 - Math.cos((t * Math.PI) / 2);
const expoIn: EaseFn = (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));
const circIn: EaseFn = (t) => 1 - Math.sqrt(1 - t * t);
const backIn: EaseFn = (t) => c3 * t * t * t - c1 * t * t;

/** Symmetric in-out built from an "in" curve: first half eases in, second half is its mirror. */
const sym = (inFn: EaseFn): EaseFn => (t) => (t < 0.5 ? inFn(t * 2) / 2 : 1 - inFn((1 - t) * 2) / 2);

export const EASE_PRESETS: Record<string, EaseFn> = {
  linear: (t) => t,
  'ease-in': cubicIn,
  'ease-out': out(cubicIn),
  'ease-in-out': sym(cubicIn),
  'sine-in': sineIn,
  'sine-out': out(sineIn),
  'sine-in-out': sym(sineIn),
  'quad-in': quadIn,
  'quad-out': out(quadIn),
  'quad-in-out': sym(quadIn),
  'quart-in': quartIn,
  'quart-out': out(quartIn),
  'quart-in-out': sym(quartIn),
  'quint-in': quintIn,
  'quint-out': out(quintIn),
  'quint-in-out': sym(quintIn),
  'expo-in': expoIn,
  'expo-out': out(expoIn),
  'expo-in-out': sym(expoIn),
  'circ-in': circIn,
  'circ-out': out(circIn),
  'circ-in-out': sym(circIn),
  'back-in': backIn,
  'back-out': out(backIn),
  'back-in-out': sym(backIn),
  'elastic-out': elasticOut,
  'bounce-out': bounceOut,
  'bounce-in': (t) => 1 - bounceOut(1 - t),
};

export const EASE_NAMES = Object.keys(EASE_PRESETS);

// ── Cubic bezier (CSS-style) ─────────────────────────────────────────────────

export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  if (x1 === y1 && x2 === y2) return (t) => t;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const e = sx(t);
      if (Math.abs(e - x) < 1e-6) break;
      if (e < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

// ── Spring physics ───────────────────────────────────────────────────────────

export interface SpringParams { stiffness: number; damping: number; mass: number }

/** Unit step response of a damped spring at physical time `tau` seconds. */
export function springResponse({ stiffness, damping, mass }: SpringParams, tau: number): number {
  const m = Math.max(mass, 1e-3), k = Math.max(stiffness, 1e-3);
  const wn = Math.sqrt(k / m);
  const zeta = damping / (2 * Math.sqrt(k * m));
  if (zeta < 1) {
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * wn * tau) * (Math.cos(wd * tau) + ((zeta * wn) / wd) * Math.sin(wd * tau));
  }
  if (zeta === 1) return 1 - Math.exp(-wn * tau) * (1 + wn * tau);
  const s = Math.sqrt(zeta * zeta - 1);
  const s1 = -wn * (zeta - s), s2 = -wn * (zeta + s);
  return 1 - (s2 * Math.exp(s1 * tau) - s1 * Math.exp(s2 * tau)) / (s2 - s1);
}

/** Seconds until the spring stays within 0.2% of its target (capped at 8 s). */
export function springSettleTime(p: SpringParams): number {
  const dt = 1 / 120;
  let last = 0;
  for (let tau = 0; tau < 8; tau += dt) if (Math.abs(springResponse(p, tau) - 1) > 0.002) last = tau;
  return Math.max(last + dt, 0.1);
}

/** A spring as an easing curve: time 0…1 spans the settle time, so `duration` stretches the whole motion. */
export function spring(p: SpringParams): EaseFn {
  const T = springSettleTime(p);
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : springResponse(p, t * T));
}

// ── Public API ───────────────────────────────────────────────────────────────

const cache = new Map<string, EaseFn>();

export function makeEase(e: Easing | undefined): EaseFn {
  if (!e) return EASE_PRESETS.linear!;
  const key = JSON.stringify(e);
  let fn = cache.get(key);
  if (fn) return fn;
  switch (e.k) {
    case 'preset':
      fn = EASE_PRESETS[e.name] ?? EASE_PRESETS.linear!;
      break;
    case 'bezier':
      fn = cubicBezier(...e.p);
      break;
    case 'spring':
      fn = spring(e);
      break;
    case 'steps': {
      const n = Math.max(1, Math.round(e.n));
      fn = (t) => (t >= 1 ? 1 : Math.floor(t * n) / n);
      break;
    }
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, fn);
  return fn;
}

export const ease = (e: Easing | undefined, t: number): number => makeEase(e)(t);

export const preset = (name: string): Easing => ({ k: 'preset', name });
export const bezier = (a: number, b: number, c: number, d: number): Easing => ({ k: 'bezier', p: [a, b, c, d] });
export const springEase = (stiffness = 170, damping = 16, mass = 1): Easing => ({ k: 'spring', stiffness, damping, mass });

/** Human names for the easing picker. */
export const EASE_CHOICES: { label: string; value: Easing }[] = [
  { label: 'Linear', value: preset('linear') },
  { label: 'Smooth', value: bezier(0.32, 0.72, 0, 1) },
  { label: 'Ease in', value: preset('ease-in') },
  { label: 'Ease out', value: preset('ease-out') },
  { label: 'Ease in-out', value: preset('ease-in-out') },
  { label: 'Snappy', value: bezier(0.2, 0.9, 0.1, 1) },
  { label: 'Anticipate', value: preset('back-in-out') },
  { label: 'Overshoot', value: preset('back-out') },
  { label: 'Expo out', value: preset('expo-out') },
  { label: 'Circ in-out', value: preset('circ-in-out') },
  { label: 'Elastic', value: preset('elastic-out') },
  { label: 'Bounce', value: preset('bounce-out') },
  { label: 'Spring · soft', value: springEase(120, 18, 1) },
  { label: 'Spring · bouncy', value: springEase(220, 12, 1) },
  { label: 'Spring · stiff', value: springEase(400, 30, 1) },
  { label: 'Steps', value: { k: 'steps', n: 6 } },
];

export function easeLabel(e: Easing | undefined): string {
  if (!e) return 'Linear';
  const key = JSON.stringify(e);
  const hit = EASE_CHOICES.find((c) => JSON.stringify(c.value) === key);
  if (hit) return hit.label;
  if (e.k === 'bezier') return 'Custom curve';
  if (e.k === 'spring') return 'Custom spring';
  if (e.k === 'preset') return e.name;
  return 'Steps';
}

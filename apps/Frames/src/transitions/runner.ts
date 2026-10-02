import { makeEase } from '../anim/easing';
import { evalSlide, compileTimeline, nominalStarts, type SlideState } from '../anim/engine';
import { resolveColor } from '../model/theme';
import { docText } from '../model/defaults';
import { lerp } from '../model/geometry';
import type { Deck, El, Slide, Transition } from '../model/types';
import type { AssetStore } from '../render/assets';
import { createCanvas, ctx2d, type AnyCanvas } from '../render/canvas';
import { paintLoose, paintSlide, type RenderEnv } from '../render/paint';
import { TRANSITION_MAP, defaultTransitionParams } from './registry';
import type { TG, TransitionDef } from './types';

/** First text on a slide, for broadcast graphics. */
export function slideTitle(s: Slide): string {
  if (s.name) return s.name;
  const t = s.elements.find((e) => e.type === 'text' && e.ph === 'title') ?? s.elements.find((e) => e.type === 'text');
  return t && t.type === 'text' ? docText(t.doc).split('\n')[0]!.trim() : '';
}

/** State at which a slide ends up when all its animations have played. */
export function finalState(slide: Slide): SlideState {
  const tl = compileTimeline(slide);
  return evalSlide(tl, nominalStarts(tl), Infinity);
}

/** State of a slide at the moment it appears (auto step started, nothing else). */
export function firstState(slide: Slide): SlideState {
  const tl = compileTimeline(slide);
  return evalSlide(tl, [0, ...tl.steps.slice(1).map(() => null)], 0);
}

interface MorphPair { a: El; b: El }

function matchMorph(from: Slide, to: Slide, loose: boolean): MorphPair[] {
  const pairs: MorphPair[] = [];
  const used = new Set<string>();
  for (const a of from.elements) {
    if (a.hidden) continue;
    const b = to.elements.find((x) => {
      if (used.has(x.id) || x.hidden || x.type !== a.type) return false;
      if (a.morph && x.morph) return a.morph === x.morph;
      if (!loose) return false;
      if (a.name && x.name) return a.name === x.name;
      if (a.type === 'text' && x.type === 'text') return docText(a.doc) !== '' && docText(a.doc) === docText(x.doc);
      if (a.type === 'image' && x.type === 'image') return !!a.asset && a.asset === x.asset;
      return false;
    });
    if (b) {
      used.add(b.id);
      pairs.push({ a, b });
    }
  }
  return pairs;
}

export interface RunOpts {
  deck: Deck;
  assets: AssetStore;
  from: Slide;
  to: Slide;
  transition: Transition;
  /** Output size in device pixels. */
  w: number;
  h: number;
  /** Use plain fades instead of cinematic transitions. */
  simple?: boolean;
}

/**
 * Plays one slide→slide transition. `prepare()` rasterises both slides once;
 * `draw()` is then pure compositing, which is why it holds frame rate.
 */
export class TransitionRun {
  private from: AnyCanvas;
  private to: AnyCanvas;
  private baseFrom: AnyCanvas | null = null;
  private baseTo: AnyCanvas | null = null;
  private pairs: MorphPair[] = [];
  readonly def: TransitionDef;
  private ease: (t: number) => number;
  readonly duration: number;
  private k: number;
  private env: RenderEnv;

  constructor(private o: RunOpts) {
    const t = o.transition;
    this.def = (o.simple ? TRANSITION_MAP.get('dissolve') : TRANSITION_MAP.get(t.type)) ?? TRANSITION_MAP.get('dissolve')!;
    this.ease = makeEase(o.simple ? undefined : t.ease ?? this.def.ease);
    this.duration = o.simple ? Math.min(450, t.dur || 450) : t.dur || this.def.dur;
    this.k = o.w / o.deck.size.w;
    this.from = createCanvas(o.w, o.h);
    this.to = createCanvas(o.w, o.h);
    this.env = { deck: o.deck, assets: o.assets, mode: 'present', px: this.k };
  }

  private raster(c: AnyCanvas, slide: Slide, state: SlideState, except?: Set<string>) {
    const ctx = ctx2d(c);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    paintSlide(ctx, this.env, slide, state, { except });
  }

  async prepare() {
    const { from, to, deck, assets } = this.o;
    const ids = new Set<string>();
    for (const s of [from, to]) for (const e of s.elements) if ((e.type === 'image' || e.type === 'video') && e.asset) ids.add(e.asset);
    await assets.ready(ids, 4000);
    const fs = finalState(from), ts = firstState(to);
    this.raster(this.from, from, fs);
    this.raster(this.to, to, ts);
    void deck;
    if (this.def.morph) {
      this.pairs = matchMorph(from, to, this.def.id === 'morph');
      if (this.pairs.length) {
        this.baseFrom = createCanvas(this.o.w, this.o.h);
        this.baseTo = createCanvas(this.o.w, this.o.h);
        this.raster(this.baseFrom, from, fs, new Set(this.pairs.map((p) => p.a.id)));
        this.raster(this.baseTo, to, ts, new Set(this.pairs.map((p) => p.b.id)));
      }
    }
  }

  /** Draw the frame at raw progress `t` (0…1 over the duration). */
  draw(ctx: CanvasRenderingContext2D, t: number, time = 0) {
    const { w, h, deck, transition } = this.o;
    const p = t <= 0 ? 0 : t >= 1 ? 1 : this.ease(t);
    const theme = deck.theme;
    const g: TG = {
      ctx, w, h, k: this.k,
      from: this.from, to: this.to,
      dir: transition.dir ?? 'left',
      params: { ...defaultTransitionParams(this.def), ...(transition.params ?? {}) },
      accent: resolveColor(theme, theme.colors.primary),
      accent2: resolveColor(theme, theme.colors.secondary),
      ink: resolveColor(theme, theme.colors.text),
      bg: resolveColor(theme, theme.colors.bg),
      titles: { from: slideTitle(this.o.from), to: slideTitle(this.o.to) },
      time,
    };
    if (this.baseFrom && this.baseTo) {
      g.morph = {
        baseFrom: this.baseFrom,
        baseTo: this.baseTo,
        matched: this.pairs.length,
        draw: (c, q) => {
          this.pairs.forEach((pair, i) => {
            const stagger = this.def.id === 'magic-move' ? Number(g.params.stagger ?? 0.12) : 0;
            const lp = Math.max(0, Math.min(1, (q - (stagger * i) / Math.max(1, this.pairs.length)) / (1 - stagger)));
            const { a, b } = pair;
            const mix = <K extends 'x' | 'y' | 'w' | 'h' | 'rot' | 'opacity'>(key: K) => lerp(a[key], b[key], lp);
            const geo = { x: mix('x'), y: mix('y'), w: mix('w'), h: mix('h'), rot: mix('rot'), opacity: mix('opacity') };
            c.save();
            c.scale(this.k, this.k);
            const same = JSON.stringify(a) === JSON.stringify({ ...b, id: a.id, ...{ x: a.x, y: a.y, w: a.w, h: a.h, rot: a.rot, opacity: a.opacity } });
            const env = this.env;
            paintLoose(c, env, { ...a, ...geo, opacity: geo.opacity * (same ? 1 : 1 - lp) } as El);
            if (!same) paintLoose(c, env, { ...b, ...geo, opacity: geo.opacity * lp } as El);
            c.restore();
          });
        },
      };
    }
    // Draw in the caller's space (the player translates to the letterbox) and stay inside the slide.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.globalAlpha = 1;
    ctx.fillStyle = g.bg;
    ctx.fillRect(0, 0, w, h);
    this.def.draw(g, p);
    ctx.restore();
  }

  dispose() {
    for (const c of [this.from, this.to, this.baseFrom, this.baseTo]) if (c) { c.width = 1; c.height = 1; }
  }
}

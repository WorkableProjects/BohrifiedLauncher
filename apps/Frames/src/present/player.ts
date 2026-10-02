import { clickCount, compileTimeline, evalSlide, isAnimating, type SlideState, type Timeline } from '../anim/engine';
import { hitBox } from '../model/geometry';
import type { Deck, El, Slide } from '../model/types';
import { AssetStore } from '../render/assets';
import { createCanvas, ctx2d, type AnyCanvas } from '../render/canvas';
import { paintSlide, type RenderEnv } from '../render/paint';
import { TransitionRun } from '../transitions/runner';

/**
 * The slide-show runtime, framework-free so the editor's presenter, the
 * second-window audience view, video export and the exported HTML player all
 * share it. It owns the frame loop (running only while something moves),
 * click/step sequencing, transitions, media and blank screens.
 */

export interface PlayerOptions {
  canvas: HTMLCanvasElement;
  deck: Deck;
  assets: AssetStore;
  /** Plain fades instead of cinematic transitions. */
  simpleTransitions?: boolean;
  onChange?: (s: PlayerState) => void;
  onEnd?: () => void;
  /** Open a link clicked in a slide. */
  onLink?: (url: string) => void;
  /** Don't start video or audio (a presenter-view mirror). */
  silent?: boolean;
}

export interface PlayerState {
  /** Index among shown (non-hidden) slides. */
  index: number;
  count: number;
  slideId: string;
  /** Click steps already fired / available on the current slide. */
  step: number;
  steps: number;
  blank: 'none' | 'black' | 'white';
  transitioning: boolean;
}

export class Player {
  private opts: PlayerOptions;
  private ctx: CanvasRenderingContext2D;
  private slides: Slide[] = [];
  private index = 0;
  private tl!: Timeline;
  private stepStarts: (number | null)[] = [];
  private run: TransitionRun | null = null;
  private runStart = 0;
  private runDone: (() => void) | null = null;
  private raf = 0;
  private blank: PlayerState['blank'] = 'none';
  private k = 1;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  private autoTimer: number | null = null;
  private playing = new Set<HTMLMediaElement>();
  private disposed = false;
  private frameTimes: number[] = [];
  frames = 0;

  constructor(opts: PlayerOptions) {
    this.opts = opts;
    this.ctx = opts.canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    this.slides = opts.deck.slides.filter((s) => !s.hidden);
    opts.assets.setReadyHandler(() => this.invalidate());
  }

  get deck() {
    return this.opts.deck;
  }

  get state(): PlayerState {
    const s = this.slides[this.index];
    return {
      index: this.index,
      count: this.slides.length,
      slideId: s?.id ?? '',
      step: this.stepStarts.slice(1).filter((x) => x !== null).length,
      steps: this.tl ? clickCount(this.tl) : 0,
      blank: this.blank,
      transitioning: !!this.run,
    };
  }

  get slide(): Slide | undefined {
    return this.slides[this.index];
  }

  private emit() {
    this.opts.onChange?.(this.state);
  }

  /** Size of the display area in CSS px. */
  resize(cssW: number, cssH: number, dpr = window.devicePixelRatio || 1) {
    this.dpr = dpr;
    const c = this.opts.canvas;
    c.width = Math.max(1, Math.round(cssW * dpr));
    c.height = Math.max(1, Math.round(cssH * dpr));
    const { w, h } = this.opts.deck.size;
    this.k = Math.min(c.width / w, c.height / h);
    this.ox = (c.width - w * this.k) / 2;
    this.oy = (c.height - h * this.k) / 2;
    this.invalidate();
  }

  /** Begin at slide `i` (no transition). */
  start(i = 0) {
    this.enter(Math.max(0, Math.min(i, this.slides.length - 1)), performance.now());
    this.emit();
    this.invalidate();
  }

  private enter(i: number, now: number) {
    this.index = i;
    const s = this.slides[i]!;
    this.tl = compileTimeline(s);
    this.stepStarts = this.tl.steps.map((_, n) => (n === 0 ? now : null));
    this.stopMedia();
    this.startMedia(s);
    this.scheduleAuto();
  }

  // ── Navigation ──

  /** Advance one click: the next build step, or the next slide. */
  next() {
    if (this.run) return this.finishTransition();
    if (this.blank !== 'none') return this.setBlank('none');
    const now = performance.now();
    const pending = this.stepStarts.findIndex((t, n) => n > 0 && t === null);
    if (pending > 0) {
      this.stepStarts[pending] = now;
      this.scheduleAuto();
      this.emit();
      return this.invalidate();
    }
    if (this.index < this.slides.length - 1) return void this.goto(this.index + 1);
    this.opts.onEnd?.();
  }

  /** Go back: undo the last build step, or return to the previous slide. */
  prev() {
    if (this.run) return this.finishTransition();
    if (this.blank !== 'none') return this.setBlank('none');
    let last = -1;
    this.stepStarts.forEach((t, n) => { if (n > 0 && t !== null) last = n; });
    if (last > 0) {
      this.stepStarts[last] = null;
      this.emit();
      return this.invalidate();
    }
    if (this.index > 0) void this.goto(this.index - 1, true);
  }

  /** Jump to a slide, with its transition (or none when `instant`). */
  async goto(i: number, reverse = false, instant = false): Promise<void> {
    i = Math.max(0, Math.min(i, this.slides.length - 1));
    if (i === this.index && !this.run) return;
    if (this.run) this.finishTransition();
    const from = this.slides[this.index]!, to = this.slides[i]!;
    const t = !instant && (reverse ? from.transition : to.transition);
    this.clearAuto();
    if (!t || t.type === 'none') {
      this.enter(i, performance.now());
      this.emit();
      return this.invalidate();
    }
    const dirMap = { left: 'right', right: 'left', up: 'down', down: 'up' } as const;
    const tr = reverse ? { ...t, dir: dirMap[t.dir ?? 'left'] } : t;
    const run = new TransitionRun({
      deck: this.opts.deck, assets: this.opts.assets, from, to, transition: tr,
      w: this.opts.canvas.width, h: this.opts.canvas.height, simple: this.opts.simpleTransitions,
    });
    this.stopMedia();
    await run.prepare();
    if (this.disposed) return;
    this.run = run;
    this.pendingIndex = i;
    this.runStart = performance.now();
    this.emit();
    await new Promise<void>((resolve) => {
      this.runDone = resolve;
      this.invalidate();
    });
  }

  private pendingIndex = 0;

  private finishTransition() {
    const run = this.run;
    if (!run) return;
    this.run = null;
    run.dispose();
    this.enter(this.pendingIndex, performance.now());
    const done = this.runDone;
    this.runDone = null;
    this.emit();
    this.invalidate();
    done?.();
  }

  setBlank(b: PlayerState['blank']) {
    this.blank = b === this.blank ? 'none' : b;
    this.emit();
    this.invalidate();
  }

  // ── Auto-advance ──

  private clearAuto() {
    if (this.autoTimer !== null) clearTimeout(this.autoTimer);
    this.autoTimer = null;
  }

  private scheduleAuto() {
    this.clearAuto();
    const s = this.slides[this.index];
    if (!s?.auto || s.auto <= 0) return;
    // After the last build step finishes, wait `auto` ms; auto-fire click steps too.
    const pending = this.stepStarts.findIndex((t, n) => n > 0 && t === null);
    const lastStart = Math.max(...this.stepStarts.map((t) => t ?? 0));
    const lastStep = pending > 0 ? pending - 1 : this.tl.steps.length - 1;
    const wait = Math.max(0, lastStart + (this.tl.steps[lastStep]?.len ?? 0) - performance.now()) + s.auto;
    this.autoTimer = window.setTimeout(() => this.next(), wait);
  }

  // ── Media ──

  private startMedia(s: Slide) {
    if (this.opts.silent) return;
    const walk = (els: El[]) => {
      for (const e of els) {
        if (e.type === 'group') walk(e.children);
        if ((e.type === 'video' || e.type === 'audio') && e.autoplay && e.asset) {
          const m = e.type === 'video' ? this.opts.assets.video(e.asset) : this.opts.assets.audio(e.asset);
          if (!m) {
            // Not decoded yet: try again shortly.
            setTimeout(() => !this.disposed && this.slides[this.index] === s && this.startMedia(s), 250);
            continue;
          }
          m.loop = e.loop;
          m.muted = e.type === 'video' ? e.muted : false;
          m.volume = Math.max(0, Math.min(1, e.volume));
          m.currentTime = 0;
          void m.play().then(() => { this.playing.add(m); this.invalidate(); }).catch(() => {});
        }
      }
    };
    walk(s.elements);
  }

  private stopMedia() {
    this.opts.assets.stopMedia();
    this.playing.clear();
  }

  /** Click on a video toggles it; returns true if handled. */
  private toggleMediaAt(x: number, y: number): boolean {
    const s = this.slides[this.index];
    if (!s) return false;
    for (const e of [...s.elements].reverse()) {
      if (e.type !== 'video' || !e.asset || !hitBox(e, { x, y })) continue;
      const v = this.opts.assets.video(e.asset);
      if (!v) return false;
      if (v.paused) { v.muted = false; void v.play().then(() => { this.playing.add(v); this.invalidate(); }); }
      else v.pause();
      this.invalidate();
      return true;
    }
    return false;
  }

  /** A click/tap at CSS coordinates in the canvas: follow a link, toggle a video, or advance. */
  click(cssX: number, cssY: number) {
    if (this.run || this.blank !== 'none') return this.next();
    const x = (cssX * this.dpr - this.ox) / this.k, y = (cssY * this.dpr - this.oy) / this.k;
    const s = this.slides[this.index];
    if (s) {
      for (const e of [...s.elements].reverse()) {
        if (e.link && !e.hidden && hitBox(e, { x, y })) return this.opts.onLink?.(e.link);
      }
      if (this.toggleMediaAt(x, y)) return;
    }
    this.next();
  }

  // ── Frame loop ──

  invalidate() {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0;
      this.frame(t);
    });
  }

  private frame(rafTime: number) {
    const t0 = performance.now();
    const c = this.opts.canvas;
    const ctx = this.ctx;
    let again = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.blank !== 'none') {
      ctx.fillStyle = this.blank === 'black' ? '#000' : '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
    } else if (this.run) {
      const t = (t0 - this.runStart) / this.run.duration;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.save();
      ctx.translate(this.ox, this.oy);
      this.run.draw(ctx, Math.min(1, t), t0);
      ctx.restore();
      if (t >= 1) this.finishTransition();
      again = true;
    } else {
      const s = this.slides[this.index];
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, c.width, c.height);
      if (s) {
        const state: SlideState = evalSlide(this.tl, this.stepStarts, t0);
        const env: RenderEnv = { deck: this.opts.deck, assets: this.opts.assets, mode: 'present', px: this.k, now: t0 };
        ctx.save();
        ctx.translate(this.ox, this.oy);
        ctx.scale(this.k, this.k);
        paintSlide(ctx, env, s, state);
        ctx.restore();
        again = isAnimating(this.tl, this.stepStarts, t0) || this.hasPlayingMedia();
      }
    }
    this.frames++;
    const dt = performance.now() - t0;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    void rafTime;
    if (again) this.invalidate();
  }

  private hasPlayingMedia() {
    for (const m of this.playing) if (!m.paused && !m.ended) return true;
    return false;
  }

  /** Resolves when the current slide has no running build or transition. */
  settled(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.disposed) return resolve();
        const busy = this.run || isAnimating(this.tl, this.stepStarts, performance.now());
        if (!busy) resolve();
        else setTimeout(check, 40);
      };
      check();
    });
  }

  /** p95 CPU time to produce a frame, ms (a rough health check). */
  frameP95() {
    if (!this.frameTimes.length) return 0;
    const a = [...this.frameTimes].sort((x, y) => x - y);
    return a[Math.floor(a.length * 0.95)] ?? 0;
  }

  /** Release everything (the canvas stays). */
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clearAuto();
    this.stopMedia();
    this.run?.dispose();
    this.run = null;
  }

  /** A copy of the current frame (for the audience mirror and thumbnails). */
  snapshot(): AnyCanvas {
    const c = createCanvas(this.opts.canvas.width, this.opts.canvas.height);
    ctx2d(c).drawImage(this.opts.canvas, 0, 0);
    return c;
  }
}

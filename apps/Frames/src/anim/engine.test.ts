import { describe, expect, it } from 'vitest';
import { newShape, newSlide, newText, solid } from '../model/defaults';
import { THEME_FRAMES } from '../model/theme';
import { cubicBezier, ease, preset, spring, springEase, springSettleTime } from './easing';
import { CAMERA, clickCount, compileTimeline, evalSlide, nominalStarts } from './engine';
import { PRESETS, makeAnim } from './presets';
import { samplePath } from './path';

const ctx = { slide: { w: 1920, h: 1080 } };

describe('easing', () => {
  it('hits its endpoints', () => {
    for (const name of ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'expo-out', 'back-out', 'elastic-out', 'bounce-out', 'circ-in-out']) {
      expect(ease(preset(name), 0)).toBeCloseTo(0, 5);
      expect(ease(preset(name), 1)).toBeCloseTo(1, 5);
    }
  });
  it('matches CSS ease-in-out at the midpoint', () => {
    expect(cubicBezier(0.42, 0, 0.58, 1)(0.5)).toBeCloseTo(0.5, 3);
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 2);
  });
  it('springs overshoot when underdamped and settle at 1', () => {
    const bouncy = spring({ stiffness: 220, damping: 8, mass: 1 });
    const peak = Math.max(...Array.from({ length: 200 }, (_, i) => bouncy(i / 199)));
    expect(peak).toBeGreaterThan(1.05);
    expect(bouncy(1)).toBe(1);
    expect(Math.abs(bouncy(0.999) - 1)).toBeLessThan(0.01);
    const critical = spring({ stiffness: 170, damping: 2 * Math.sqrt(170), mass: 1 });
    expect(Math.max(...Array.from({ length: 100 }, (_, i) => critical(i / 99)))).toBeLessThanOrEqual(1.001);
    expect(springSettleTime({ stiffness: 400, damping: 30, mass: 1 })).toBeLessThan(springSettleTime({ stiffness: 40, damping: 5, mass: 1 }));
  });
  it('steps', () => {
    expect(ease({ k: 'steps', n: 4 }, 0.51)).toBe(0.5);
  });
});

describe('timeline', () => {
  const box = newShape('rect', 0, 0, 100, 100, solid('#f00'));
  const box2 = newShape('rect', 200, 0, 100, 100, solid('#0f0'));
  const make = () => {
    const a = makeAnim('fade-in', box.id, ctx, { trigger: 'click' });
    const b = makeAnim('rise', box2.id, ctx, { trigger: 'with', delay: 100 });
    const c = makeAnim('pulse', box.id, ctx, { trigger: 'after' });
    const d = makeAnim('fade-in', box2.id, ctx, { trigger: 'click' });
    return newSlide({ elements: [box, box2], anims: [a, b, c, d] });
  };

  it('chains click / with / after into steps', () => {
    const tl = compileTimeline(make());
    expect(clickCount(tl)).toBe(2);
    expect(tl.clips.map((c) => [c.step, c.rel])).toEqual([[1, 0], [1, 100], [1, 900], [2, 0]]);
    expect(tl.steps[1]!.len).toBe(900 + 700);
    expect(tl.steps[2]!.nominalStart).toBe(1600);
    expect(tl.total).toBe(1600 + 600);
  });

  it('holds entrances hidden until their step is triggered, then plays them', () => {
    const slide = make();
    const tl = compileTimeline(slide);
    let s = evalSlide(tl, [0, null, null], 0);
    expect(s.poses.get(box.id)!.opacity).toBe(0);
    s = evalSlide(tl, [0, 1000, null], 1000 + 300);
    const mid = s.poses.get(box.id)!.opacity;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    s = evalSlide(tl, [0, 1000, 5000], 99999);
    expect(s.poses.get(box.id)!.opacity).toBe(1);
    expect(s.poses.get(box2.id)!.opacity).toBe(1);
  });

  it('the end state is the fully built slide', () => {
    const tl = compileTimeline(make());
    const s = evalSlide(tl, nominalStarts(tl), Infinity);
    for (const p of s.poses.values()) {
      expect(p.opacity).toBe(1);
      expect(p.x).toBeCloseTo(0);
      expect(p.sx).toBeCloseTo(1);
    }
  });

  it('exit hides the element and emphasis returns to rest', () => {
    const slide = newSlide({ elements: [box], anims: [makeAnim('fade-out', box.id, ctx, { trigger: 'with' }), makeAnim('pulse', box.id, ctx, { trigger: 'after' })] });
    const tl = compileTimeline(slide);
    const done = evalSlide(tl, [0], 5000).poses.get(box.id)!;
    expect(done.visible).toBe(false);
    const only = newSlide({ elements: [box], anims: [makeAnim('pulse', box.id, ctx, { trigger: 'with' })] });
    const t2 = compileTimeline(only);
    expect(evalSlide(t2, [0], 350).poses.get(box.id)!.sx).toBeGreaterThan(1.05);
    expect(evalSlide(t2, [0], 5000).poses.get(box.id)).toBeUndefined();
  });

  it('every preset builds sensible tracks', () => {
    const el = newText(THEME_FRAMES, 'Hello brave new world', 100, 100, 600);
    for (const def of PRESETS) {
      const anim = makeAnim(def.id, def.kind === 'camera' ? CAMERA : el.id, { ...ctx, el }, { trigger: 'with' });
      expect(anim.dur).toBeGreaterThan(0);
      expect(anim.tracks.length).toBeGreaterThan(0);
      const slide = newSlide({ elements: [el], anims: [anim] });
      const tl = compileTimeline(slide);
      for (const t of [0, 100, 400, 2000, 60000, Infinity]) {
        const st = evalSlide(tl, [0], t);
        for (const p of st.poses.values()) {
          for (const v of [p.x, p.y, p.sx, p.sy, p.opacity, p.blur, p.rot]) expect(Number.isFinite(v)).toBe(true);
        }
        if (st.camera) for (const v of Object.values(st.camera)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('staggered text animates per unit', () => {
    const el = newText(THEME_FRAMES, 'one two three', 0, 0, 600);
    const anim = makeAnim('cascade-words', el.id, ctx, { trigger: 'with' });
    const tl = compileTimeline(newSlide({ elements: [el], anims: [anim] }));
    expect(tl.clips[0]!.units).toBe(3);
    const pose = evalSlide(tl, [0], 100).poses.get(el.id)!;
    expect(pose.unit).toBeTypeOf('function');
    const first = pose.unit!(0, 3), last = pose.unit!(2, 3);
    expect(first.opacity).toBeGreaterThan(last.opacity);
    expect(evalSlide(tl, [0], Infinity).poses.get(el.id)!.unit!(2, 3).opacity).toBe(1);
  });

  it('camera animations land on the slide camera', () => {
    const slide = newSlide({ elements: [box], anims: [makeAnim('camera-pan', CAMERA, ctx, { trigger: 'with' })] });
    const tl = compileTimeline(slide);
    expect(evalSlide(tl, [0], Infinity).camera!.x).toBe(400);
  });
});

describe('motion paths', () => {
  it('samples along the arc length', () => {
    const nodes = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(samplePath(nodes, 0)).toMatchObject({ x: 0, y: 0 });
    const end = samplePath(nodes, 1);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(100);
    const mid = samplePath(nodes, 0.5);
    expect(mid.x).toBeCloseTo(100, 0);
    expect(mid.y).toBeCloseTo(0, 0);
  });
  it('spring ease helper builds a valid easing', () => {
    expect(springEase().k).toBe('spring');
  });
});

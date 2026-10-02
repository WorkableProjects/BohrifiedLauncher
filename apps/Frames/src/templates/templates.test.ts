import { describe, expect, it } from 'vitest';
import { PRESET_MAP } from '../anim/presets';
import { THEME_FRAMES } from '../model/theme';
import { allIds } from '../model/ops';
import type { Slide } from '../model/types';
import { TRANSITION_MAP } from '../transitions/registry';
import { BUILTIN_TEMPLATES } from './builtin';
import { SLIDE_RECIPES } from './slides';

function checkSlide(s: Slide) {
  const ids = allIds(s.elements);
  let count = 0;
  const walk = (els: Slide['elements']) => els.forEach((e) => { count++; if (e.type === 'group') walk(e.children); });
  walk(s.elements);
  expect(ids.size).toBe(count);
  for (const a of s.anims) {
    expect(a.el === '$camera' || ids.has(a.el)).toBe(true);
    if (a.preset) expect(PRESET_MAP.has(a.preset)).toBe(true);
  }
  if (s.transition) expect(TRANSITION_MAP.has(s.transition.type)).toBe(true);
}

describe('templates', () => {
  it.each(BUILTIN_TEMPLATES.map((t) => [t.id, t] as const))('%s builds a valid deck', (_id, t) => {
    const d = t.make();
    expect(d.slides.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    for (const s of d.slides) {
      checkSlide(s);
      if (s.layout) expect(d.layouts.some((l) => l.id === s.layout)).toBe(true);
    }
  });
  it.each(SLIDE_RECIPES.map((r) => [r.id, r] as const))('recipe %s is valid', (_id, r) => {
    checkSlide(r.make(THEME_FRAMES, { w: 1920, h: 1080 }));
  });
});

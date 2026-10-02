import { makeAnim } from '../anim/presets';
import { newChart, newIcon, newShape, newSlide, newText, para, solid, textBase } from '../model/defaults';
import type { DesignSystem, El, Slide } from '../model/types';

/** Reusable single-slide designs. They use theme tokens only, so they match whatever deck they're added to. */
export interface SlideRecipe {
  id: string;
  name: string;
  category: string;
  make(theme: DesignSystem, size: { w: number; h: number }): Slide;
}

const M = 128;

function withRise(s: Slide, ids: string[], size: { w: number; h: number }): Slide {
  s.anims = ids.map((id, i) => makeAnim('rise', id, { slide: size }, { trigger: i === 0 ? 'after' : 'after', delay: i ? 60 : 0 }));
  return s;
}

const title = (th: DesignSystem, text: string, w: number) => newText(th, text, M, 96, w - M * 2, 'title', { base: textBase(th, 'title', { size: 84 }) });

export const SLIDE_RECIPES: SlideRecipe[] = [
  {
    id: 'agenda', name: 'Agenda', category: 'Structure',
    make: (th, sz) => {
      const items = ['Where we are', 'What we learned', 'What comes next', 'Questions'];
      const els: El[] = [title(th, 'Agenda', sz.w)];
      items.forEach((t, i) => {
        els.push(newText(th, String(i + 1).padStart(2, '0'), M, 300 + i * 160, 160, 'heading', { base: textBase(th, 'heading', { color: '@primary', size: 64 }) }));
        els.push(newText(th, t, M + 180, 310 + i * 160, sz.w - M * 2 - 180, 'body', { base: textBase(th, 'body', { size: 48 }) }));
      });
      return withRise(newSlide({ elements: els }), els.slice(1).map((e) => e.id), sz);
    },
  },
  {
    id: 'section', name: 'Section divider', category: 'Structure',
    make: (th, sz) => newSlide({ background: { t: 'linear', angle: 135, stops: [{ o: 0, c: '@primary' }, { o: 1, c: '@secondary' }] }, elements: [newText(th, 'Chapter two', M, sz.h / 2 - 110, sz.w - M * 2, 'display', { base: textBase(th, 'display', { color: '#ffffff', size: 140 }) })] }),
  },
  {
    id: 'big-number', name: 'Big number', category: 'Data',
    make: (th, sz) => {
      const n = newText(th, '87%', M, sz.h / 2 - 260, sz.w - M * 2, 'display', { base: textBase(th, 'display', { size: 300, color: '@primary', align: 'center' }) });
      const c = newText(th, 'of customers came back within a month', M, sz.h / 2 + 110, sz.w - M * 2, 'heading', { base: textBase(th, 'heading', { weight: 400, align: 'center', color: '@muted' }) });
      const s = newSlide({ elements: [n, c] });
      s.anims = [makeAnim('pop', n.id, { slide: sz }, { trigger: 'after' }), makeAnim('fade-in', c.id, { slide: sz }, { trigger: 'after' })];
      return s;
    },
  },
  {
    id: 'three-stats', name: 'Three stats', category: 'Data',
    make: (th, sz) => {
      const els: El[] = [title(th, 'By the numbers', sz.w)];
      const cw = (sz.w - M * 2 - 80) / 3;
      [['3×', 'faster setup'], ['12k', 'active teams'], ['99.9%', 'uptime']].forEach(([v, l], i) => {
        const x = M + i * (cw + 40);
        els.push(newShape('round-rect', x, 320, cw, 520, solid('@surface'), { radius: 32 }));
        els.push(newText(th, v!, x + 40, 400, cw - 80, 'display', { base: textBase(th, 'display', { size: 140, color: '@primary' }) }));
        els.push(newText(th, l!, x + 40, 640, cw - 80, 'body', { base: textBase(th, 'body', { size: 40, color: '@muted' }) }));
      });
      return withRise(newSlide({ elements: els }), els.filter((e) => e.type === 'shape').map((e) => e.id), sz);
    },
  },
  {
    id: 'quote', name: 'Quote', category: 'Story',
    make: (th, sz) => newSlide({ elements: [
      newText(th, '“', M, 120, 300, 'display', { base: textBase(th, 'display', { size: 300, color: '@primary' }) }),
      newText(th, 'Simplicity is the ultimate sophistication.', M + 80, 360, sz.w - M * 2 - 160, 'heading', { base: textBase(th, 'heading', { size: 88, weight: 500, lh: 1.15 }) }),
      newText(th, '— Leonardo da Vinci', M + 80, 760, sz.w - M * 2 - 160, 'caption', { base: textBase(th, 'caption', { size: 40 }) }),
    ] }),
  },
  {
    id: 'process', name: 'Process steps', category: 'Story',
    make: (th, sz) => {
      const els: El[] = [title(th, 'How it works', sz.w)];
      const w = (sz.w - M * 2 + 60) / 4;
      ['Plan', 'Build', 'Test', 'Ship'].forEach((t, i) => {
        const sh = newShape('chevron', M + i * (w - 20), 420, w, 240, solid(i % 2 ? '@secondary' : '@primary'));
        sh.doc = [para(t)];
        sh.base = textBase(th, 'heading', { color: '#ffffff', align: 'center', size: 48 });
        sh.vAlign = 'middle';
        els.push(sh);
      });
      return withRise(newSlide({ elements: els }), els.slice(1).map((e) => e.id), sz);
    },
  },
  {
    id: 'features', name: 'Feature grid', category: 'Product',
    make: (th, sz) => {
      const els: El[] = [title(th, 'Everything you need', sz.w)];
      const feats: [string, string][] = [['bolt', 'Fast'], ['shield', 'Secure'], ['users', 'Collaborative'], ['globe', 'Everywhere']];
      const cw = (sz.w - M * 2) / 4;
      feats.forEach(([ic, t], i) => {
        els.push(newIcon(ic, M + i * cw + cw / 2 - 80, 360, 160));
        els.push(newText(th, t, M + i * cw, 560, cw, 'heading', { base: textBase(th, 'heading', { size: 48, align: 'center' }) }));
      });
      return withRise(newSlide({ elements: els }), els.filter((e) => e.type === 'icon').map((e) => e.id), sz);
    },
  },
  {
    id: 'chart', name: 'Chart + takeaway', category: 'Data',
    make: (th, sz) => {
      const ch = newChart(th, 'column', M, 280, sz.w * 0.58, 660);
      const s = newSlide({ elements: [
        title(th, 'Growth this year', sz.w), ch,
        newText(th, 'Revenue grew every quarter, with Q4 up 49% on Q1.', M + sz.w * 0.62, 400, sz.w - (M + sz.w * 0.62) - M, 'body', { base: textBase(th, 'body', { size: 44 }) }),
      ] });
      s.anims = [makeAnim('draw-on', ch.id, { slide: sz }, { trigger: 'after' })];
      return s;
    },
  },
  {
    id: 'thanks', name: 'Thank you', category: 'Structure',
    make: (th, sz) => newSlide({ elements: [
      newText(th, 'Thank you', M, sz.h / 2 - 170, sz.w - M * 2, 'display', { base: textBase(th, 'display', { size: 160, align: 'center' }) }),
      newText(th, 'hello@example.com', M, sz.h / 2 + 60, sz.w - M * 2, 'heading', { base: textBase(th, 'heading', { weight: 400, align: 'center', color: '@muted' }) }),
    ] }),
  },
];

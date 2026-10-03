import { newDeck } from '../model/defaults';
import { THEME_FRAMES } from '../model/theme';
import type { Deck, Slide } from '../model/types';
import { preset } from '../anim/easing';
import { H, I, L, R, SB, T, W, C, decorate, glow, layoutNamed, lin, setPh, trn, P } from './kit';

/** Frames Light: clean, Keynote-minimal. White, generous space, one pink accent. */
export function makeLight(): Deck {
  const th = structuredClone(THEME_FRAMES);
  th.name = 'Frames Light';
  const deck = newDeck('Product update', { theme: th });
  deck.margin = 128;

  deck.master.elements = [
    R('ellipse', 128, 1008, 14, 14, '@primary', { name: 'Brand dot' }),
    T(th, 'Northwind  ·  Product update', 156, 1000, 600, { s: 22, c: '@muted', w: 500, name: 'Footer' }),
  ];

  // Layouts
  const ls = deck.layouts;
  const lt = layoutNamed(ls, 'Title');
  setPh(lt, 'title', { x: 128, y: 380, w: 1500, h: 290, vAlign: 'top', base: { size: 132, weight: 700, ls: -4, lh: 1.04 } });
  setPh(lt, 'subtitle', { x: 128, y: 700, w: 1100, h: 110, base: { size: 44, weight: 400, color: '@muted' } });
  setPh(layoutNamed(ls, 'Title and content'), 'title', { y: 88, base: { size: 80, ls: -2 } });
  setPh(layoutNamed(ls, 'Title only'), 'title', { y: 88, base: { size: 80, ls: -2 } });
  const sec = layoutNamed(ls, 'Section');
  sec.elements = sec.elements.filter((e) => e.ph);
  sec.background = lin(135, ['@primary', 0], ['@secondary', 1]);
  setPh(sec, 'title', { x: 128, y: 400, w: 1400, h: 260, vAlign: 'top', base: { size: 140, ls: -4, color: '#ffffff' } });
  for (const name of ['Title and content', 'Title only', 'Two columns', 'Comparison']) setPh(layoutNamed(ls, name), 'title', { y: 88, base: { size: 80, ls: -2 } });
  decorate(layoutNamed(ls, 'Quote'));

  const m = 128;
  const title = (sb: SB, text: string) => sb.t(text, m, 88, 1664, { s: 80, w: 700, ls: -2, lh: 1.08, f: '@heading', ph: 'title', name: 'Title' });
  const lay = (name: string) => layoutNamed(ls, name).id;
  const slides: Slide[] = [];

  // 1 ── Title
  {
    const sb = new SB(th, deck.size, { layout: lay('Title'), name: 'Title', notes: 'Welcome everyone. Keep this one short: three launches, one metric that matters, and what we are doing next.' });
    sb.add(glow(th, '@primary', 1500, 280, 1500, 0.3, { morph: 'glow-a', name: 'Glow' }));
    sb.add(glow(th, '@secondary', 1800, 840, 1000, 0.2, { name: 'Glow 2' }));
    const bar = sb.r('rect', 128, 316, 96, 10, '@primary', { name: 'Accent bar', morph: 'accent-bar' });
    const eyebrow = sb.t('PRODUCT UPDATE  ·  Q3 2026', 128, 340, 900, { s: 26, w: 600, ls: 4, c: '@primary', name: 'Eyebrow' });
    const ttl = sb.t('Make something\npeople remember.', 128, 396, 1500, { s: 132, w: 700, ls: -4, lh: 1.04, f: '@heading', ph: 'title', name: 'Title', h: 290 });
    const sub = sb.t('What shipped, what we learned, and where we go next.', 128, 716, 1100, { s: 44, c: '@muted', ph: 'subtitle', name: 'Subtitle', h: 70 });
    const av = sb.r('ellipse', 128, 856, 76, 76, lin(135, ['@primary', 0], ['@secondary', 1]), { name: 'Avatar' });
    const who = sb.t([P([{ t: 'Ava Lindqvist', w: 600, size: 30 }]), P([{ t: 'Head of Product', c: '@muted', size: 26 }])], 228, 854, 600, { name: 'Presenter', lh: 1.3 });
    sb.fx('fade-in', bar, { trigger: 'after', dur: 500 });
    sb.fx('fade-in', eyebrow, { delay: 100, dur: 500 });
    sb.fx('cascade-words', ttl, { delay: 150, params: { each: 110, dist: 44 } });
    sb.fx('rise', sub, { delay: 700 });
    sb.fx('fade-in', [av, who], { delay: 400, each: 120 });
    slides.push(sb.done());
  }

  // 2 ── Agenda
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Agenda', transition: trn('morph') });
    sb.add(glow(th, '@primary', 1500, 280, 1500, 0.12, { morph: 'glow-a', name: 'Glow' }));
    sb.r('rect', 128, 64, 96, 10, '@primary', { name: 'Accent bar', morph: 'accent-bar' });
    title(sb, 'Today');
    const rows = [
      ['01', 'What we shipped', 'Three launches from the last quarter'],
      ['02', 'What the numbers say', 'Growth, usage and revenue'],
      ['03', 'What customers told us', 'Before and after, in their words'],
      ['04', 'What is next', 'The roadmap for the next two quarters'],
    ];
    const items = rows.map(([n, h, d], i) => {
      const y = 290 + i * 170;
      const num = T(th, n, m, y + 8, 120, { s: 44, w: 600, c: '@primary', name: `Num ${n}` });
      const head = T(th, h!, 280, y, 1300, { s: 54, w: 600, name: `Item ${n}` });
      const desc = T(th, d!, 280, y + 74, 1300, { s: 30, c: '@muted', name: `Desc ${n}` });
      sb.addAll(num, head, desc);
      if (i < rows.length - 1) sb.l(m, y + 142, 1792, y + 142, '@surface', 3, { name: `Rule ${n}` });
      return [num, head, desc];
    });
    items.forEach((g, i) => sb.fx('rise', g, { trigger: i === 0 ? 'after' : 'with', delay: i === 0 ? 0 : 160, each: 0, params: { dist: 40 } }));
    slides.push(sb.done());
  }

  // 3 ── Section
  {
    const sb = new SB(th, deck.size, { layout: lay('Section'), name: 'Section: shipped', section: 'What we shipped', transition: trn('cover', { dir: 'left' }) });
    const big = sb.t('01', 840, 90, 1100, { s: 700, w: 800, c: '#ffffff', op: 0.12, ls: -20, lh: 1, a: 'right', name: 'Section number', h: 760, fit: 'none' });
    const eb = sb.t('PART ONE', 128, 340, 600, { s: 28, w: 600, ls: 5, c: '#ffffff', op: 0.8, name: 'Eyebrow' });
    const ttl = sb.t('What we shipped', 128, 400, 1400, { s: 140, w: 700, ls: -4, lh: 1.04, c: '#ffffff', f: '@heading', ph: 'title', name: 'Title', h: 160 });
    const sub = sb.t('Three launches that changed how teams present.', 128, 600, 1100, { s: 44, c: '#ffffff', op: 0.85, name: 'Subtitle' });
    sb.fx('fade-in', big, { trigger: 'after', dur: 900 });
    sb.fx('fade-in', eb, { delay: 100 });
    sb.fx('cascade-words', ttl, { delay: 200, params: { each: 120 } });
    sb.fx('rise', sub, { delay: 600 });
    slides.push(sb.done());
  }

  // 4 ── Bullets + visual card
  {
    const sb = new SB(th, deck.size, { layout: lay('Title and content'), name: 'Three bets', transition: trn('dissolve'), notes: 'Click once per bullet. Spend most of the time on the middle one: instant themes changed how people start.' });
    const ttl = title(sb, 'Three bets that paid off');
    const body = sb.bl(['One-click themes', 'Cinematic transitions', 'Notes that stay in sync'], m, 320, 880, 150, { s: 56, w: 500, lh: 1.2 });
    sb.t('Each one started as a customer request.', m, 790, 880, { s: 34, c: '@muted', name: 'Footnote' });
    const card = sb.r('round-rect', 1096, 300, 696, 600, lin(145, ['@primary', 0], ['@secondary', 1]), { radius: 44, name: 'Feature card', fx: { shadow: 'lg' } });
    const ic = sb.i('rocket', 1096 + 64, 300 + 64, 120, '#ffffff', { name: 'Card icon', sw: 1.5 });
    const num = sb.t('4.2×', 1096 + 64, 300 + 270, 560, { s: 160, w: 700, c: '#ffffff', ls: -5, lh: 1, name: 'Card number', h: 170 });
    const cap = sb.t('faster from blank page to finished deck', 1096 + 64, 300 + 450, 560, { s: 34, c: '#ffffff', op: 0.9, name: 'Card caption', h: 100 });
    sb.fx('cascade-words', ttl, { trigger: 'after', params: { each: 70, dist: 30 } });
    body.forEach((b) => sb.fx('rise', b, { trigger: 'click', params: { dist: 40 } }));
    sb.fx('pop', card, { trigger: 'with', delay: 200 });
    sb.fx('fade-in', [ic, num, cap], { trigger: 'with', delay: 350, each: 100 });
    slides.push(sb.done());
  }

  // 5 ── Big numbers
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'By the numbers', transition: trn('push', { dir: 'left' }) });
    const ttl = title(sb, 'The quarter in numbers');
    const stats: [string, string, string, string][] = [
      ['$5.1M', 'Annual recurring revenue', '@primary', 'Up from $1.2M in January'],
      ['2.4M', 'Decks created', '@secondary', 'Across 61 countries'],
      ['98%', 'Customer satisfaction', '@accent', 'Our best score to date'],
    ];
    const cols = stats.map(([n, label, c, sub], i) => {
      const x = m + i * 576;
      const rule = R('rect', x, 400, 512, 8, c, { name: `Rule ${i + 1}` });
      const num = T(th, n, x, 460, 512, { s: 160, w: 700, c, ls: -6, lh: 1, h: 180, name: i === 0 ? 'Hero stat' : `Stat ${i + 1}`, morph: i === 0 ? 'hero-stat' : undefined });
      const lab = T(th, label, x, 690, 512, { s: 44, w: 600, name: `Label ${i + 1}`, h: 60 });
      const s2 = T(th, sub, x, 760, 512, { s: 30, c: '@muted', name: `Note ${i + 1}`, h: 50 });
      sb.addAll(rule, num, lab, s2);
      return { rule, num, lab, s2 };
    });
    sb.fx('fade-in', ttl, { trigger: 'after', dur: 500 });
    cols.forEach((c, i) => {
      sb.fx('pop', c.num, { trigger: 'with', delay: i === 0 ? 150 : 250 });
      sb.fx('wipe-in', c.rule, { trigger: 'with', delay: 0 });
      sb.fx('fade-in', [c.lab, c.s2], { trigger: 'with', delay: 150, each: 80 });
    });
    slides.push(sb.done());
  }

  // 6 ── Chart + takeaway
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Revenue', transition: trn('magic-move'), notes: 'The curve bends in April, right after the themes launch.' });
    const ttl = title(sb, 'Revenue is compounding');
    const chart = sb.add(C(th, m, 280, 1060, 660, { kind: 'column', categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], series: [{ name: 'ARR ($M)', values: [1.2, 1.6, 2.1, 2.9, 3.8, 5.1], color: '@primary' }], labels: true, size: 28, name: 'ARR chart' }));
    const kpi = sb.t('$5.1M', 1300, 330, 560, { s: 150, w: 700, c: '@primary', ls: -5, lh: 1, h: 170, name: 'Hero stat', morph: 'hero-stat' });
    const kcap = sb.t('annual recurring revenue, up 325% since January', 1300, 520, 500, { s: 38, w: 500, name: 'KPI caption', h: 140 });
    sb.r('pill', 1300, 700, 330, 60, '@surface', { name: 'Chip' });
    const chip = sb.t('Best quarter yet', 1300, 700, 330, { s: 28, w: 600, c: '@primary', a: 'center', v: 'middle', h: 60, name: 'Chip label' });
    sb.fx('fade-in', ttl, { trigger: 'after', dur: 500 });
    sb.fx('draw-on', chart, { trigger: 'with', delay: 150 });
    sb.fx('fade-in', [kcap, chip], { trigger: 'with', delay: 700, each: 120 });
    slides.push(sb.done());
    void kpi;
  }

  // 7 ── Comparison
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Before and after', transition: trn('wipe', { dir: 'right' }) });
    const ttl = title(sb, 'Before and after');
    const cardW = 808;
    const left = sb.r('round-rect', m, 280, cardW, 650, '@surface', { radius: 36, name: 'Before card' });
    const right = sb.r('round-rect', m + cardW + 48, 280, cardW, 650, '@bg', { radius: 36, stroke: { c: '@primary', w: 4 }, name: 'After card', fx: { shadow: 'md' } });
    const h1 = sb.t('BEFORE', m + 56, 330, 600, { s: 28, w: 700, ls: 4, c: '@muted', name: 'Before label' });
    const h2 = sb.t('WITH FRAMES', m + cardW + 48 + 56, 330, 600, { s: 28, w: 700, ls: 4, c: '@primary', name: 'After label' });
    const before = ['Slides rebuilt for every audience', 'Animations bolted on at the last minute', 'Feedback lost across five email threads'];
    const after = ['One deck, instantly re-themed', 'Cinematic motion built in', 'Comments and notes live on the slide'];
    const rows: unknown[] = [];
    before.forEach((t, i) => {
      const y = 410 + i * 160;
      sb.i('x', m + 56, y + 6, 52, '@danger', { name: `Cross ${i + 1}` });
      sb.t(t, m + 140, y, 600, { s: 38, w: 500, c: '@text', h: 110, name: `Before ${i + 1}` });
      sb.i('check', m + cardW + 48 + 56, y + 6, 52, '@success', { name: `Check ${i + 1}`, sw: 2.25 });
      sb.t(after[i]!, m + cardW + 48 + 140, y, 600, { s: 38, w: 600, h: 110, name: `After ${i + 1}` });
      rows.push(i);
    });
    sb.fx('fade-in', ttl, { trigger: 'after', dur: 500 });
    sb.fx('rise', left, { trigger: 'with', delay: 100 });
    sb.fx('rise', right, { trigger: 'with', delay: 200 });
    sb.fx('fade-in', [h1, h2], { trigger: 'with', delay: 200, each: 60 });
    slides.push(sb.done());
  }

  // 8 ── Quote
  {
    const sb = new SB(th, deck.size, { layout: lay('Quote'), name: 'Quote', transition: trn('blur') });
    sb.add(glow(th, '@primary', 500, 560, 1400, 0.22, { morph: 'glow-a', name: 'Glow' }));
    const mark = sb.t('“', m, 150, 300, { s: 420, w: 700, c: '@primary', f: 'Georgia', lh: 1, name: 'Quote mark', h: 400, fit: 'none' });
    const q = sb.t('The first deck I made with Frames got a round of applause. I had never heard that in a Monday meeting.', m + 200, 330, 1380, { s: 76, w: 500, lh: 1.18, ls: -1.5, f: '@heading', ph: 'body', name: 'Quote', h: 380 });
    const bar = sb.r('rect', m + 200, 790, 72, 8, '@primary', { name: 'Rule' });
    const who = sb.t([P([{ t: 'Priya Raman', w: 600, size: 34 }]), P([{ t: 'VP Sales, Meridian Health', c: '@muted', size: 28 }])], m + 200, 824, 900, { lh: 1.35, name: 'Attribution' });
    sb.fx('fade-in', mark, { trigger: 'after', dur: 800 });
    sb.fx('blur-in', q, { delay: 200 });
    sb.fx('wipe-in', bar, { delay: 800 });
    sb.fx('fade-in', who, { delay: 900 });
    slides.push(sb.done());
  }

  // 9 ── Closing
  {
    const sb = new SB(th, deck.size, { layout: lay('Title'), name: 'Thank you', transition: trn('morph', { ease: preset('quart-in-out') }), notes: 'Leave this up during Q&A.' });
    sb.add(glow(th, '@primary', 1500, 380, 1500, 0.3, { morph: 'glow-a', name: 'Glow' }));
    sb.add(glow(th, '@secondary', 1700, 860, 1000, 0.2, { name: 'Glow 2' }));
    const ttl = sb.t('Thank you.', 128, 360, 1400, { s: 176, w: 700, ls: -6, lh: 1.02, f: '@heading', ph: 'title', name: 'Title', h: 200 });
    const sub = sb.t('Questions, ideas, wild feature requests: we want all of them.', 128, 600, 1200, { s: 44, c: '@muted', ph: 'subtitle', name: 'Subtitle', h: 70 });
    sb.l(128, 740, 1792, 740, '@surface', 3, { name: 'Rule' });
    const c1 = sb.t([P([{ t: 'ava@northwind.example', w: 600, size: 34 }]), P([{ t: 'Email', c: '@muted', size: 24 }])], 128, 780, 640, { lh: 1.35, name: 'Contact email' });
    const c2 = sb.t([P([{ t: 'northwind.example/frames', w: 600, size: 34 }]), P([{ t: 'Web', c: '@muted', size: 24 }])], 800, 780, 640, { lh: 1.35, name: 'Contact web' });
    const c3 = sb.t([P([{ t: '@northwind', w: 600, size: 34 }]), P([{ t: 'Social', c: '@muted', size: 24 }])], 1472, 780, 320, { lh: 1.35, name: 'Contact social' });
    sb.fx('cascade-letters', ttl, { trigger: 'after' });
    sb.fx('rise', sub, { delay: 500 });
    sb.fx('fade-in', [c1, c2, c3], { delay: 700, each: 120 });
    slides.push(sb.done());
  }

  deck.slides = slides;
  void H; void W; void I; void L;
  return deck;
}

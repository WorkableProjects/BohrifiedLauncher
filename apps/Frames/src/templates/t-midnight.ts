import { newDeck } from '../model/defaults';
import { THEME_MIDNIGHT } from '../model/theme';
import type { Deck, Slide } from '../model/types';
import { C, G, H, I, P, R, SB, T, TB, alpha, decorate, glow, layoutNamed, lin, rdl, setPh, trn } from './kit';

/** Midnight Pitch: dark investor deck with gradient orbs and glass cards. */
export function makeMidnight(): Deck {
  const th = structuredClone(THEME_MIDNIGHT);
  th.name = 'Midnight Pitch';
  const deck = newDeck('Lumen · Series A', { theme: th });
  deck.margin = 128;
  const m = 128;
  deck.master.background = lin(160, ['@bg', 0], ['#101630', 1]);
  const mark = (x: number, y: number) => [
    R('round-rect', x, y, 40, 40, lin(135, ['@primary', 0], ['@secondary', 1]), { radius: 12, name: 'Logo mark' }),
    T(th, 'lumen', x + 56, y - 2, 240, { s: 36, w: 700, ls: -1, f: '@heading', name: 'Wordmark', h: 44 }),
  ];
  deck.master.elements = [
    ...mark(m, 64),
    T(th, 'SERIES A  ·  CONFIDENTIAL', 1792 - 600, 1002, 600, { s: 20, w: 600, ls: 3, c: '@muted', a: 'right', name: 'Footer' }),
  ];

  const ls = deck.layouts;
  for (const l of ls) for (const e of l.elements) if (e.type === 'text' && e.ph === 'title') e.base = { ...e.base, weight: 700, ls: -2 };
  setPh(layoutNamed(ls, 'Title'), 'title', { x: 128, y: 330, w: 1000, h: 260, base: { size: 104, ls: -3 } });
  setPh(layoutNamed(ls, 'Title'), 'subtitle', { x: 128, y: 640, w: 880, h: 110, base: { size: 40, color: '@muted' } });
  for (const n of ['Title and content', 'Title only', 'Two columns', 'Comparison']) setPh(layoutNamed(ls, n), 'title', { y: 150, base: { size: 76, ls: -2 } });
  const sec = layoutNamed(ls, 'Section');
  sec.elements = sec.elements.filter((e) => e.ph);
  sec.background = rdl(0.85, 0.15, ['#34449e', 0], ['#0b0d14', 0.8]);
  setPh(sec, 'title', { x: 128, y: 420, w: 1400, h: 220, base: { size: 150, ls: -5 } });
  decorate(layoutNamed(ls, 'Blank'));
  const lay = (n: string) => layoutNamed(ls, n).id;
  const title = (sb: SB, text: string, extra: Partial<{ w: number }> = {}) => sb.t(text, m, 150, extra.w ?? 1664, { s: 76, w: 700, ls: -2, lh: 1.08, f: '@heading', ph: 'title', name: 'Title', h: 100 });
  const card = (sb: SB, x: number, y: number, w: number, h: number, name = 'Card') =>
    sb.r('round-rect', x, y, w, h, '@surface', { radius: 32, stroke: { c: 'rgba(255,255,255,0.09)', w: 2 }, name });
  const orb = (cx: number, cy: number, size: number, o: { morph?: string; rings?: boolean } = {}) => {
    const els = [];
    if (o.rings) {
      els.push(R('ellipse', cx - size * 0.78, cy - size * 0.78, size * 1.56, size * 1.56, null, { stroke: { c: 'rgba(110,168,255,0.18)', w: 2 }, name: 'Ring 1' }));
      els.push(R('ellipse', cx - size * 1.0, cy - size * 1.0, size * 2, size * 2, null, { stroke: { c: 'rgba(177,140,255,0.12)', w: 2 }, name: 'Ring 2' }));
    }
    els.push(R('ellipse', cx - size / 2, cy - size / 2, size, size, rdl(0.35, 0.3, ['@accent', 0], ['@primary', 0.4], ['@secondary', 0.8], ['#1a1450', 1]), { name: 'Orb', morph: o.morph, fx: { glow: { c: alpha(th, '@primary', 0.5), blur: size * 0.18 } } }));
    return els;
  };
  const slides: Slide[] = [];

  // 1 ── Title
  {
    const sb = new SB(th, deck.size, { layout: lay('Title'), name: 'Title', notes: 'Open with the one-line pitch, then go straight to the numbers.' });
    sb.add(glow(th, '@primary', 1560, 520, 1500, 0.28, { name: 'Glow' }));
    const rings = orb(1560, 520, 620, { morph: 'orb', rings: true });
    sb.addAll(...rings);
    const sat = sb.r('ellipse', 1560 + 620 * 0.78 * 0.7 - 14, 520 - 620 * 0.78 * 0.7 - 14, 28, 28, '@accent', { name: 'Satellite', fx: { glow: { c: alpha(th, '@accent', 0.8), blur: 24 } } });
    const eb = sb.t('SERIES A  ·  INVESTOR UPDATE', m, 270, 900, { s: 24, w: 700, ls: 5, c: '@accent', name: 'Eyebrow' });
    const ttl = sb.t('Software for the\nclean-energy grid.', m, 330, 1000, { s: 104, w: 700, ls: -3, lh: 1.06, f: '@heading', ph: 'title', name: 'Title', h: 250 });
    const sub = sb.t('Lumen forecasts, dispatches and settles renewable power for utilities, in one platform.', m, 640, 880, { s: 40, c: '@muted', ph: 'subtitle', name: 'Subtitle', h: 110 });
    const facts = [['$5.1M', 'ARR'], ['142%', 'Net revenue retention'], ['31', 'Utilities live']].map(([n, l], i) => {
      const x = m + i * 330;
      return [sb.t(n!, x, 850, 300, { s: 64, w: 700, ls: -2, h: 80, name: `Fact ${i + 1}` }), sb.t(l!, x, 930, 300, { s: 24, c: '@muted', h: 36, name: `Fact label ${i + 1}` })];
    });
    sb.fx('fade-in', rings, { trigger: 'after', dur: 1200, each: 100 });
    sb.fx('float', sat, { trigger: 'with', params: { amount: 20 } });
    sb.fx('fade-in', eb, { delay: 200 });
    sb.fx('cascade-words', ttl, { delay: 300, params: { each: 110, dist: 40 } });
    sb.fx('rise', sub, { delay: 700 });
    facts.forEach((f, i) => sb.fx('rise', f, { delay: i === 0 ? 400 : 140, each: 40 }));
    slides.push(sb.done());
  }

  // 2 ── Problem
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Problem', transition: trn('magic-move'), section: 'Problem' });
    sb.addAll(...orb(1740, 112, 72, { morph: 'orb' }));
    const ttl = title(sb, 'Grid operators are flying blind');
    const items = [
      ['alert', '68%', 'of renewable forecasts are still built by hand in spreadsheets', '@danger'],
      ['clock', '4 hrs', 'average delay before operators can rebalance after a forecast miss', '@accent'],
      ['dollar', '$2.3B', 'of clean energy curtailed every year because nobody saw it coming', '@secondary'],
    ] as const;
    const cs = items.map(([ic, n, t, c], i) => {
      const x = m + i * 576;
      const bg = card(sb, x, 320, 512, 600);
      const iw = sb.r('round-rect', x + 48, 368, 96, 96, alpha(th, c, 0.16), { radius: 28, name: `Icon bg ${i + 1}` });
      const icn = sb.i(ic, x + 48 + 20, 368 + 20, 56, c, { name: `Icon ${i + 1}` });
      const num = sb.t(n, x + 48, 510, 420, { s: 110, w: 700, ls: -4, c, h: 130, name: `Stat ${i + 1}` });
      const tx = sb.t(t, x + 48, 670, 416, { s: 34, c: '@muted', lh: 1.3, h: 200, name: `Text ${i + 1}` });
      return [bg, iw, icn, num, tx];
    });
    sb.fx('fade-in', ttl, { trigger: 'after', dur: 500 });
    cs.forEach((g, i) => sb.fx('rise', g, { delay: i === 0 ? 200 : 180, each: 40, params: { dist: 50 } }));
    slides.push(sb.done());
  }

  // 3 ── Section
  {
    const sb = new SB(th, deck.size, { layout: lay('Section'), name: 'Section: solution', section: 'Solution', transition: trn('depth') });
    const num = sb.t('02', m, 340, 400, { s: 28, w: 700, ls: 6, c: '@accent', name: 'Eyebrow' });
    const ttl = sb.t('Meet Lumen.', m, 400, 1400, { s: 160, w: 700, ls: -6, lh: 1.02, f: '@heading', ph: 'title', name: 'Title', h: 200 });
    const sub = sb.t('One platform that sees the grid before it happens.', m, 620, 1200, { s: 46, c: '@muted', name: 'Subtitle' });
    sb.fx('fade-in', num, { trigger: 'after' });
    sb.fx('blur-in', ttl, { delay: 150 });
    sb.fx('rise', sub, { delay: 700 });
    slides.push(sb.done());
  }

  // 4 ── Product
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Product', transition: trn('dissolve') });
    const ttl = title(sb, 'One platform, three jobs');
    const feats = [
      ['trending-up', 'Forecast', 'Probabilistic wind and solar forecasts, refreshed every five minutes.', '@primary'],
      ['bolt', 'Dispatch', 'Automatic rebalancing across storage, demand response and the market.', '@secondary'],
      ['shield', 'Settle', 'Audit-ready settlement and reporting, with no month-end scramble.', '@accent'],
    ] as const;
    const gs = feats.map(([ic, h, t, c], i) => {
      const x = m + i * 576;
      const bg = card(sb, x, 320, 512, 560);
      const top = sb.r('rect', x + 48, 320, 120, 6, c, { name: `Accent ${i + 1}` });
      const iw = sb.r('round-rect', x + 48, 380, 112, 112, lin(135, [c, 0], ['#1a1450', 1]), { radius: 32, name: `Icon bg ${i + 1}` });
      const icn = sb.i(ic, x + 48 + 24, 380 + 24, 64, '#ffffff', { name: `Icon ${i + 1}`, sw: 1.75 });
      const hh = sb.t(h, x + 48, 540, 416, { s: 56, w: 700, ls: -1, h: 70, name: `Heading ${i + 1}` });
      const tx = sb.t(t, x + 48, 630, 416, { s: 32, c: '@muted', lh: 1.35, h: 200, name: `Text ${i + 1}` });
      return [bg, top, iw, icn, hh, tx];
    });
    sb.fx('fade-in', ttl, { trigger: 'after', dur: 500 });
    gs.forEach((g, i) => sb.fx('rise', g, { delay: i === 0 ? 200 : 200, each: 50, params: { dist: 60 } }));
    slides.push(sb.done());
  }

  // 5 ── Market
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Market', transition: trn('camera-zoom', { params: { fx: 0.75, fy: 0.7 } }), notes: 'Bottom-up: 1,800 utilities and independent power producers in our target regions.' });
    const ttl = title(sb, 'A $48B market, wide open', { w: 1000 });
    const cx = 1400, base = 960;
    const specs: [number, string, string, string, number][] = [[780, 'TAM', '$48B', '@primary', 0.12], [540, 'SAM', '$9B', '@secondary', 0.22], [300, 'SOM', '$1.2B', '@accent', 0.9]];
    const circles = specs.map(([sz, , , c, a], i) => sb.r('ellipse', cx - sz / 2, base - sz, sz, sz, i === 2 ? c : alpha(th, c, a), { stroke: { c, w: 3 }, name: `Circle ${i + 1}` }));
    const labels = specs.map(([sz, k, v, c], i) => {
      const y = base - sz + (i === 2 ? sz / 2 - 56 : 44);
      return sb.t([P([{ t: k, size: 24, w: 700, ls: 4, c: i === 2 ? '#0b0d14' : c }]), P([{ t: v, size: i === 2 ? 52 : 60, w: 700, c: i === 2 ? '#0b0d14' : '@text' }])], cx - 150, y, 300, { a: 'center', lh: 1.15, name: `Label ${k}` });
    });
    const rows = [['Total market', 'Every utility and IPP worldwide', '@primary'], ['Serviceable', '1,800 operators in our target regions', '@secondary'], ['Obtainable', '30% of them within five years', '@accent']];
    const legend = rows.map(([h, t, c], i) => {
      const y = 330 + i * 190;
      return [sb.r('round-rect', m, y + 6, 10, 120, c, { radius: 5, name: `Key ${i + 1}` }), sb.t(h!, m + 40, y, 700, { s: 48, w: 700, name: `Key head ${i + 1}`, h: 60 }), sb.t(t!, m + 40, y + 68, 640, { s: 32, c: '@muted', name: `Key text ${i + 1}`, h: 50 })];
    });
    sb.fx('fade-in', ttl, { trigger: 'after', dur: 500 });
    sb.fx('zoom-in', circles, { delay: 100, each: 250, params: { amount: 0.85 } });
    sb.fx('fade-in', labels, { delay: 400, each: 250 });
    legend.forEach((g, i) => sb.fx('rise', g, { delay: i === 0 ? 200 : 250, each: 30, params: { dist: 36 } }));
    slides.push(sb.done());
  }

  // 6 ── Traction
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Traction', transition: trn('blur'), section: 'Traction', notes: 'ARR has grown 12x in two years with no paid acquisition.' });
    const ttl = title(sb, 'Revenue is accelerating');
    const bg = card(sb, m, 300, 1100, 660, 'Chart card');
    const chart = sb.add(C(th, m + 24, 330, 1052, 600, { kind: 'area', categories: ['Q1 24', 'Q2', 'Q3', 'Q4', 'Q1 25', 'Q2', 'Q3', 'Q4'], series: [{ name: 'ARR ($M)', values: [0.4, 0.7, 1.1, 1.7, 2.6, 3.4, 4.3, 5.1], color: '@primary' }], smooth: true, size: 24, name: 'ARR chart' }));
    const kp = [['142%', 'Net revenue retention', '@accent'], ['31', 'Utilities live', '@primary'], ['<2%', 'Annual logo churn', '@secondary']].map(([n, l, c], i) => {
      const y = 300 + i * 232;
      return [card(sb, 1288, y, 504, 200, `KPI card ${i + 1}`), sb.t(n!, 1288 + 40, y + 24, 424, { s: 88, w: 700, ls: -3, c, h: 100, name: `KPI ${i + 1}` }), sb.t(l!, 1288 + 40, y + 132, 424, { s: 30, c: '@muted', h: 40, name: `KPI label ${i + 1}` })];
    });
    sb.fx('fade-in', ttl, { trigger: 'after', dur: 500 });
    sb.fx('fade-in', bg, { delay: 100 });
    sb.fx('draw-on', chart, { delay: 250, dur: 1800 });
    kp.forEach((g, i) => sb.fx('pop', g[1]!, { delay: i === 0 ? 500 : 300 }));
    sb.fx('fade-in', kp.flatMap((g) => [g[0]!, g[2]!]), { delay: 500, each: 100 });
    slides.push(sb.done());
  }

  // 7 ── Competition
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Competition', transition: trn('push', { dir: 'left' }) });
    const ttl = title(sb, 'Why Lumen wins');
    const yes = { t: 'Yes', c: '@success', b: true }, no = { t: 'No', c: '@danger' }, part = { t: 'Partial', c: '@accent' };
    const lc = (x: { t: string; c: string; b?: boolean }) => ({ ...x, fill: 'rgba(110,168,255,0.12)' });
    const tbl = TB(th, m, 300, {
      widths: [520, 380, 380, 384], rowH: [96, 108, 108, 108, 108, 108], size: 32, header: true, banded: false, headerFill: '@surface', pad: 28,
      border: { c: 'rgba(255,255,255,0.1)', w: 2 }, name: 'Comparison table',
      rows: [
        [{ t: '' }, { t: 'Lumen', b: true, c: '#0b0d14', fill: '#6ea8ff' }, { t: 'Legacy EMS', c: '@muted' }, { t: 'Spreadsheets', c: '@muted' }],
        [{ t: 'Real-time dispatch', c: '@text' }, lc(yes), part, no],
        [{ t: 'Probabilistic forecasts', c: '@text' }, lc(yes), no, no],
        [{ t: 'Live in under 30 days', c: '@text' }, lc(yes), no, yes],
        [{ t: 'Audit-ready settlement', c: '@text' }, lc(yes), yes, no],
        [{ t: 'Cost per MW', c: '@text' }, lc({ t: '$0.8k', c: '@success', b: true }), { t: '$6k', c: '@muted' }, { t: '$2k', c: '@muted' }],
      ],
    });
    tbl.cells.forEach((row) => row.forEach((c, ci) => { if (ci > 0) c.align = 'center'; }));
    sb.add(tbl);
    sb.fx('fade-in', ttl, { trigger: 'after', dur: 500 });
    sb.fx('rise', tbl, { delay: 200, params: { dist: 50 } });
    slides.push(sb.done());
    void G;
  }

  // 8 ── The ask
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'The ask', section: 'The ask', transition: trn('dissolve') });
    sb.add(glow(th, '@secondary', 1480, 560, 1300, 0.22, { morph: 'glow-b', name: 'Glow' }));
    sb.t('THE ASK', m, 150, 600, { s: 26, w: 700, ls: 6, c: '@accent', name: 'Eyebrow' });
    const big = sb.t('$18M', m, 230, 900, { s: 280, w: 700, ls: -10, lh: 1, c: '@text', f: '@heading', ph: 'title', name: 'Title', h: 300 });
    const sub = sb.t('Series A to take Lumen from 31 to 100 utilities in 24 months.', m, 590, 760, { s: 44, c: '@muted', lh: 1.3, name: 'Subtitle', h: 140 });
    const pills = ['18-month runway to $20M ARR', 'Led by existing investors + one new lead'].map((t, i) => {
      const y = 790 + i * 96;
      return [sb.r('pill', m, y, 720, 72, 'rgba(255,255,255,0.06)', { stroke: { c: 'rgba(255,255,255,0.1)', w: 2 }, name: `Pill ${i + 1}` }), sb.i('check', m + 24, y + 16, 40, '@accent', { name: `Pill icon ${i + 1}`, sw: 2.25 }), sb.t(t, m + 84, y, 620, { s: 30, w: 500, v: 'middle', h: 72, name: `Pill text ${i + 1}` })];
    });
    const chart = sb.add(C(th, 1000, 190, 800, 760, { kind: 'donut', categories: ['Engineering', 'Go-to-market', 'Operations', 'Reserve'], series: [{ name: 'Use of funds', values: [45, 35, 12, 8] }], legend: 'bottom', labels: true, size: 28, name: 'Use of funds' }));
    sb.fx('pop', big, { trigger: 'after' });
    sb.fx('fade-in', sub, { delay: 400 });
    pills.forEach((g, i) => sb.fx('rise', g, { delay: i === 0 ? 300 : 200, each: 40, params: { dist: 30 } }));
    sb.fx('draw-on', chart, { delay: 300 });
    slides.push(sb.done());
  }

  // 9 ── Closing
  {
    const sb = new SB(th, deck.size, { layout: lay('Title'), name: 'Thank you', transition: trn('morph') });
    sb.add(glow(th, '@primary', 1500, 420, 1700, 0.3, { morph: 'glow-b', name: 'Glow' }));
    sb.addAll(...orb(1500, 480, 360, { rings: true }));
    const ttl = sb.t('Let us light up\nthe grid together.', m, 340, 1100, { s: 100, w: 700, ls: -3, lh: 1.06, f: '@heading', ph: 'title', name: 'Title', h: 240 });
    const sub = sb.t('Thank you.', m, 270, 600, { s: 28, w: 700, ls: 6, c: '@accent', name: 'Eyebrow', h: 40, up: true });
    const rows = [['mail', 'maya@lumen.example'], ['globe', 'lumen.example'], ['phone', '+1 (415) 555-0142']].map(([ic, t], i) => {
      const y = 700 + i * 80;
      return [sb.i(ic!, m, y + 4, 44, '@primary', { name: `Contact icon ${i + 1}` }), sb.t(t!, m + 72, y, 700, { s: 36, w: 500, h: 52, name: `Contact ${i + 1}` })];
    });
    sb.fx('fade-in', sub, { trigger: 'after' });
    sb.fx('cascade-words', ttl, { delay: 150, params: { each: 120 } });
    rows.forEach((g, i) => sb.fx('rise', g, { delay: i === 0 ? 700 : 140, each: 20, params: { dist: 30 } }));
    slides.push(sb.done());
  }

  deck.slides = slides;
  void H; void I;
  return deck;
}

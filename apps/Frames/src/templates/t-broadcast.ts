import { preset } from '../anim/easing';
import { newDeck } from '../model/defaults';
import { THEME_BROADCAST } from '../model/theme';
import type { Deck, Slide } from '../model/types';
import { C, P, R, SB, T, TB, decorate, layoutNamed, lin, setPh, trn } from './kit';

/** Broadcast: esports / sports-network graphics. Hard diagonals, scoreboard panels, Impact headlines. */
export function makeBroadcast(): Deck {
  const th = structuredClone(THEME_BROADCAST);
  th.name = 'Broadcast';
  const deck = newDeck('Grand Finals · Season Review', { theme: th });
  deck.margin = 128;
  const m = 128;
  const RED = th.colors.primary, CYAN = th.colors.secondary;
  deck.master.elements = [
    R('rect', 0, 0, 1920, 8, lin(90, ['@primary', 0], ['@accent', 1]), { name: 'Top bar' }),
    R('parallelogram', m, 1030, 56, 16, '@primary', { name: 'Footer tick' }),
    T(th, 'FRAMES SPORTS NETWORK', m + 76, 1022, 700, { s: 20, w: 700, ls: 4, c: '@muted', h: 30, name: 'Footer' }),
  ];

  const ls = deck.layouts;
  for (const l of ls) for (const e of l.elements) if (e.type === 'text' && e.ph === 'title') e.base = { ...e.base, font: 'Impact', weight: 400, ls: 1 };
  setPh(layoutNamed(ls, 'Title'), 'title', { x: 128, y: 280, w: 1100, h: 480, base: { size: 230, lh: 0.92, ls: 2 } });
  setPh(layoutNamed(ls, 'Title'), 'subtitle', { x: 128, y: 790, w: 1000, h: 60, base: { size: 36, weight: 600, ls: 6, color: '@secondary' } });
  for (const n of ['Title and content', 'Title only', 'Two columns', 'Comparison']) setPh(layoutNamed(ls, n), 'title', { x: 128, y: 70, w: 1400, h: 140, base: { size: 120, ls: 2 } });
  const sec = layoutNamed(ls, 'Section');
  sec.elements = sec.elements.filter((e) => e.ph);
  sec.background = lin(115, ['@primary', 0], ['#7a0f2e', 1]);
  setPh(sec, 'title', { x: 128, y: 420, w: 1200, h: 340, base: { size: 170, lh: 0.95, ls: 2 } });
  decorate(layoutNamed(ls, 'Blank'));
  const lay = (n: string) => layoutNamed(ls, n).id;

  const title = (sb: SB, text: string, color = '@text') => {
    sb.r('parallelogram', m, 96, 44, 96, '@primary', { name: 'Title tick' });
    return sb.t(text, m + 84, 70, 1500, { s: 120, f: '@heading', w: 400, ls: 2, lh: 1, c: color, ph: 'title', name: 'Title', h: 140, up: true });
  };
  /** A slanted label with text centred in it. */
  const tag = (sb: SB, text: string, x: number, y: number, w: number, h: number, fill: string, ink: string, size = 26) => {
    const shape = sb.r('parallelogram', x, y, w, h, fill, { name: 'Tag' });
    const label = sb.t(text, x, y, w, { s: size, w: 800, ls: 3, c: ink, a: 'center', v: 'middle', h, up: true, name: 'Tag label' });
    return [shape, label];
  };
  const slides: Slide[] = [];

  // 1 ── Title
  {
    const sb = new SB(th, deck.size, { layout: lay('Title'), name: 'Title', notes: 'Cold open. Hold on this slide until the director calls the stinger.' });
    const back = sb.r('parallelogram', 1010, -20, 1100, 1120, lin(160, ['@primary', 0], ['#6b0b2a', 1]), { name: 'Power slab' });
    const edge = sb.r('parallelogram', 960, -20, 1100, 1120, null, { stroke: { c: CYAN, w: 4 }, name: 'Slab outline' });
    const stripe = sb.r('parallelogram', 1480, -20, 120, 1120, '@accent', { name: 'Yellow stripe', opacity: 0.95 });
    const season = tag(sb, 'Season 07', m, 190, 250, 58, '@accent', '#07090d', 26);
    const ttl = sb.t('GRAND\nFINALS', m, 280, 1100, { s: 230, f: '@heading', w: 400, lh: 0.92, ls: 2, ph: 'title', name: 'Title', h: 480 });
    const sub = sb.t('SEASON REVIEW  ·  BROADCAST PACKAGE', m, 790, 1100, { s: 30, w: 700, ls: 5, c: '@secondary', ph: 'subtitle', name: 'Subtitle', h: 60 });
    sb.fx('slide-in', [back, edge], { trigger: 'after', each: 120, params: { dir: 'right', dist: 600 }, dur: 900 });
    sb.fx('slide-in', stripe, { delay: 250, params: { dir: 'right', dist: 900 }, dur: 700 });
    sb.fx('slide-in', season, { delay: 300, each: 40, params: { dir: 'left', dist: 200 } });
    sb.fx('cascade-words', ttl, { delay: 250, params: { each: 150, dist: 80 } });
    sb.fx('fade-in', sub, { delay: 500 });
    slides.push(sb.done());
  }

  // 2 ── Rundown
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Show rundown', transition: trn('scoreboard', { params: { label: 'UP NEXT', color: RED } }), section: 'Show' });
    const ttl = title(sb, 'Show rundown');
    const rows = [['PRE-SHOW', 'Desk analysis and player cams', '19:00'], ['OPENING CEREMONY', 'Teams walk out, anthem, intro film', '19:30'], ['MATCH ONE', 'Nova vs Eclipse, best of five', '20:00'], ['MATCH TWO', 'Winner bracket final', '21:00'], ['GRAND FINAL', 'Trophy lift and post-match', '22:00']];
    const groups = rows.map(([n, d, t], i) => {
      const y = 250 + i * 150, last = i === rows.length - 1;
      const panel = R('rect', m, y, 1664, 120, last ? lin(90, ['@primary', 0], ['#8c1237', 1]) : '@surface', { name: `Row ${i + 1}` });
      const num = R('parallelogram', m, y, 170, 120, last ? '@accent' : '@primary', { name: `Num block ${i + 1}` });
      const nt = T(th, String(i + 1).padStart(2, '0'), m, y, 170, { s: 72, f: '@heading', w: 400, c: last ? '#07090d' : '#ffffff', a: 'center', v: 'middle', h: 120, name: `Num ${i + 1}` });
      const name = T(th, n!, m + 230, y + 10, 900, { s: 58, f: '@heading', w: 400, ls: 2, h: 70, name: `Segment ${i + 1}` });
      const desc = T(th, d!, m + 230, y + 74, 900, { s: 26, c: last ? '#ffffff' : '@muted', h: 36, name: `Detail ${i + 1}` });
      const time = T(th, t!, 1792 - 360, y, 320, { s: 68, f: '@heading', w: 400, c: last ? '#ffffff' : '@secondary', a: 'right', v: 'middle', h: 120, name: `Time ${i + 1}` });
      sb.addAll(panel, num, nt, name, desc, time);
      return [panel, num, nt, name, desc, time];
    });
    sb.fx('slide-in', ttl, { trigger: 'after', dur: 600, params: { dist: 120 } });
    groups.forEach((g, i) => sb.fx('slide-in', g, { delay: i === 0 ? 150 : 110, each: 25, params: { dir: 'left', dist: 300 }, dur: 650 }));
    slides.push(sb.done());
  }

  // 3 ── Section
  {
    const sb = new SB(th, deck.size, { layout: lay('Section'), name: 'Section: round one', section: 'Round one', transition: trn('camera-rush', { params: { flash: 0.7 } }) });
    const big = sb.t('1', 1240, 40, 560, { s: 880, f: '@heading', w: 400, c: '#07090d', op: 0.22, lh: 1, a: 'center', ls: 0, h: 1000, fit: 'none', name: 'Round number' });
    const band = sb.r('parallelogram', -260, -20, 1800, 1120, '#07090d', { name: 'Dark band', opacity: 0.94 });
    const stripe = sb.r('parallelogram', 1780, -20, 90, 1120, '@accent', { name: 'Yellow stripe' });
    const t1 = tag(sb, 'Round one', m, 300, 270, 58, '@primary', '#ffffff');
    const ttl = sb.t('THE GROUP\nSTAGE', m, 400, 1300, { s: 170, f: '@heading', w: 400, lh: 0.95, ls: 2, ph: 'title', name: 'Title', h: 340 });
    const sub = sb.t('16 teams. Four groups. Eight survive.', m, 780, 1100, { s: 40, w: 600, c: '@secondary', name: 'Subtitle', h: 60 });
    sb.addAll();
    sb.fx('fade-in', big, { trigger: 'after', dur: 600 });
    sb.fx('slide-in', band, { delay: 0, params: { dir: 'left', dist: 900 }, dur: 700 });
    sb.fx('slide-in', stripe, { delay: 120, params: { dir: 'right', dist: 600 }, dur: 600 });
    sb.fx('slide-in', t1, { delay: 300, each: 30, params: { dir: 'left', dist: 160 } });
    sb.fx('cascade-words', ttl, { delay: 150, params: { each: 140, dist: 70 } });
    sb.fx('fade-in', sub, { delay: 500 });
    slides.push(sb.done());
  }

  // 4 ── Match result
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Final result', transition: trn('replay-live', { params: { a: 'REPLAY', b: 'LIVE', color: RED } }), notes: 'Read the series score first, then walk through each map. Pause on map two.' });
    const ttl = title(sb, 'Final result');
    const y = 250, hh = 210;
    const nameA = sb.r('rect', m, y, 594, hh, '@surface', { name: 'Team A panel' });
    const stripA = sb.r('rect', m, y, 14, hh, '@primary', { name: 'Team A colour' });
    const tA = sb.t('NOVA', m + 56, y, 520, { s: 108, f: '@heading', w: 400, ls: 2, v: 'middle', h: hh, name: 'Team A' });
    const scA = sb.r('rect', 734, y, 220, hh, '@primary', { name: 'Score A box' });
    const sA = sb.t('3', 734, y, 220, { s: 170, f: '@heading', w: 400, a: 'center', v: 'middle', h: hh, name: 'Score A' });
    const scB = sb.r('rect', 966, y, 220, hh, '#1c2330', { name: 'Score B box' });
    const sB = sb.t('1', 966, y, 220, { s: 170, f: '@heading', w: 400, a: 'center', v: 'middle', h: hh, c: '@muted', name: 'Score B' });
    const nameB = sb.r('rect', 1198, y, 594, hh, '@surface', { name: 'Team B panel' });
    const tB = sb.t('ECLIPSE', 1198 + 56, y, 520, { s: 108, f: '@heading', w: 400, ls: 2, v: 'middle', h: hh, c: '@muted', name: 'Team B' });
    const win = tag(sb, 'Winner', 734, y - 34, 220, 44, '@accent', '#07090d', 22);
    const maps = [['MAP 1', 'HAVEN', '13 – 9', true], ['MAP 2', 'ASCENT', '10 – 13', false], ['MAP 3', 'LOTUS', '13 – 7', true], ['MAP 4', 'SUNSET', '13 – 11', true]] as const;
    const mapEls = maps.map(([k, name, score, won], i) => {
      const x = m + i * 421;
      const bg = R('rect', x, 520, 401, 250, '@surface', { name: `Map card ${i + 1}` });
      const bar = R('rect', x, 520, 401, 8, won ? '@primary' : '#3a4356', { name: `Map bar ${i + 1}` });
      const kk = T(th, k, x + 32, 560, 340, { s: 24, w: 700, ls: 4, c: '@secondary', h: 34, name: `Map label ${i + 1}` });
      const nn = T(th, name, x + 32, 604, 340, { s: 64, f: '@heading', w: 400, ls: 2, h: 80, name: `Map ${i + 1}` });
      const ss = T(th, score, x + 32, 690, 340, { s: 56, f: '@heading', w: 400, c: won ? '#ffffff' : '@muted', h: 70, name: `Map score ${i + 1}` });
      sb.addAll(bg, bar, kk, nn, ss);
      return [bg, bar, kk, nn, ss];
    });
    const mvpBand = sb.r('parallelogram', m, 830, 1664, 120, '@accent', { name: 'MVP band' });
    const mvp = sb.t([P([{ t: 'MVP  ', size: 34, w: 800, ls: 4 }, { t: 'KAI “NOVA” TANAKA', size: 64, font: 'Impact', ls: 2 }, { t: '   29 KILLS  ·  2 ACES', size: 30, w: 700, ls: 3 }])], m + 80, 830, 1500, { c: '#07090d', v: 'middle', h: 120, name: 'MVP line' });
    sb.fx('slide-in', ttl, { trigger: 'after', params: { dist: 100 } });
    sb.fx('slide-in', [nameA, stripA, tA], { delay: 100, params: { dir: 'left', dist: 500 }, dur: 700 });
    sb.fx('slide-in', [nameB, tB], { trigger: 'with', delay: 100, params: { dir: 'right', dist: 500 }, dur: 700 });
    sb.fx('pop', [scA, sA], { delay: 400 });
    sb.fx('pop', [scB, sB], { delay: 100 });
    sb.fx('fade-in', win, { delay: 150, each: 50 });
    mapEls.forEach((g, i) => sb.fx('rise', g, { delay: i === 0 ? 150 : 120, each: 20, params: { dist: 50 } }));
    sb.fx('slide-in', [mvpBand, mvp], { delay: 200, each: 40, params: { dir: 'left', dist: 400 } });
    slides.push(sb.done());
  }

  // 5 ── Stat panels
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Top performers', transition: trn('broadcast-cut', { dir: 'left', params: { label: 'STATS', color: RED, streak: 1.4 } }) });
    const ttl = title(sb, 'Top performers');
    const stats = [['4.8M', 'Peak viewers', 'Most-watched match in league history'], ['2.41', 'K/D ratio', 'Kai “Nova” Tanaka'], ['287', 'Combat score', 'Highest across the playoffs'], ['61%', 'Headshot rate', 'Up 7 points on last season']];
    const panels = stats.map(([n, label, sub], i) => {
      const x = m + i * 424, hero = i === 0;
      const strip = R('rect', x, 290, 392, 64, hero ? '@accent' : '@secondary', { name: `Label strip ${i + 1}` });
      const lt = T(th, label!, x + 28, 290, 340, { s: 26, w: 800, ls: 3, c: '#07090d', v: 'middle', h: 64, up: true, name: `Label ${i + 1}` });
      const body = R('rect', x, 354, 392, 480, hero ? lin(160, ['@primary', 0], ['#8c1237', 1]) : '@surface', { name: `Panel ${i + 1}` });
      const num = T(th, n!, x + 28, 430, 340, { s: 150, f: '@heading', w: 400, ls: 0, lh: 1, h: 190, name: i === 0 ? 'Peak viewers' : `Stat ${i + 1}`, morph: hero ? 'peak' : undefined });
      const cut = R('parallelogram', x + 28, 660, 100, 14, hero ? '@accent' : '@primary', { name: `Divider ${i + 1}` });
      const st = T(th, sub!, x + 28, 700, 336, { s: 30, c: hero ? '#ffffff' : '@muted', lh: 1.3, h: 120, name: `Note ${i + 1}` });
      sb.addAll(strip, lt, body, num, cut, st);
      return { strip, lt, body, num, cut, st };
    });
    sb.t('SOURCE: LEAGUE DATA  ·  SEASON 07 PLAYOFFS', m, 890, 900, { s: 22, w: 700, ls: 4, c: '@muted', h: 30, name: 'Source' });
    sb.fx('slide-in', ttl, { trigger: 'after', params: { dist: 100 } });
    panels.forEach((p, i) => {
      sb.fx('slide-in', [p.strip, p.lt], { delay: i === 0 ? 100 : 140, each: 0, params: { dir: 'down', dist: 100 }, dur: 600 });
      sb.fx('rise', p.body, { delay: 80, params: { dist: 80 } });
      sb.fx('pop', p.num, { delay: 200 });
      sb.fx('fade-in', [p.cut, p.st], { delay: 150, each: 60 });
    });
    slides.push(sb.done());
  }

  // 6 ── Chart
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Viewership', transition: trn('magic-move') });
    const ttl = title(sb, 'Viewership by round');
    const bg = sb.r('rect', m, 250, 1100, 700, '@surface', { name: 'Chart panel' });
    sb.r('rect', m, 250, 1100, 8, '@secondary', { name: 'Chart bar' });
    const chart = sb.add(C(th, m + 30, 290, 1040, 640, { kind: 'column', categories: ['R1', 'R2', 'R3', 'QF', 'SF', 'FINAL'], series: [{ name: 'Peak viewers (M)', values: [1.1, 1.4, 1.9, 2.6, 3.5, 4.8], color: '@primary' }], labels: true, size: 28, color: '#c7cddb', name: 'Viewers chart' }));
    const lab = sb.t('PEAK CONCURRENT', 1340, 250, 450, { s: 28, w: 800, ls: 4, c: '@secondary', h: 40, name: 'Callout label' });
    const kpi = sb.t('4.8M', 1340, 300, 460, { s: 190, f: '@heading', w: 400, lh: 1, h: 230, name: 'Peak viewers', morph: 'peak' });
    const note = sb.t('viewers watching the grand final at the same moment, up 71% on last season.', 1340, 560, 450, { s: 32, c: '@muted', lh: 1.35, h: 200, name: 'Callout text' });
    const tg = tag(sb, '+71% vs S06', 1340, 810, 330, 64, '@accent', '#07090d', 26);
    sb.fx('slide-in', ttl, { trigger: 'after', params: { dist: 100 } });
    sb.fx('fade-in', bg, { delay: 100 });
    sb.fx('draw-on', chart, { delay: 250, dur: 1600 });
    sb.fx('fade-in', lab, { delay: 400 });
    sb.fx('fade-in', note, { delay: 600 });
    sb.fx('slide-in', tg, { delay: 800, each: 30, params: { dir: 'left', dist: 200 } });
    void kpi;
    slides.push(sb.done());
  }

  // 7 ── Quote
  {
    const sb = new SB(th, deck.size, { layout: lay('Quote'), name: 'MVP speaks', transition: trn('signal', { params: { intensity: 1.2, scan: true } }) });
    const slash = sb.r('parallelogram', 1440, -20, 420, 1120, lin(160, ['@primary', 0], ['#6b0b2a', 1]), { name: 'Slash', morph: 'slash' });
    const outline = sb.r('parallelogram', 1380, -20, 420, 1120, null, { stroke: { c: CYAN, w: 4 }, name: 'Slash outline' });
    const tg = tag(sb, 'MVP speaks', m, 170, 300, 58, '@secondary', '#07090d');
    const q = sb.t([['WE PLAYED LIKE', '@text'], ['IT WAS ROUND ONE.', '@text'], ['SAME NERVES.', '@accent'], ['SAME HUNGER.', '@accent']].map(([t, c]) => P([{ t: t!, c }])), m, 280, 1260, { s: 100, f: '@heading', w: 400, lh: 1.04, ls: 1, ph: 'body', name: 'Quote', h: 430 });
    const bar = sb.r('parallelogram', m, 780, 80, 14, '@accent', { name: 'Rule' });
    const who = sb.t([P([{ t: 'KAI “NOVA” TANAKA', size: 54, font: 'Impact', ls: 2 }]), P([{ t: 'Nova  ·  Series MVP', size: 28, c: '@muted' }])], m, 816, 1000, { lh: 1.25, name: 'Attribution' });
    sb.fx('slide-in', [slash, outline], { trigger: 'after', each: 100, params: { dir: 'right', dist: 500 } });
    sb.fx('slide-in', tg, { delay: 200, each: 30, params: { dir: 'left', dist: 200 } });
    sb.fx('cascade-words', q, { delay: 300, params: { each: 90, dist: 50 } });
    sb.fx('fade-in', [bar, who], { delay: 900, each: 100 });
    slides.push(sb.done());
  }

  // 8 ── Standings
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Standings', transition: trn('morph') });
    sb.r('parallelogram', 1700, -20, 120, 1120, lin(160, ['@primary', 0], ['#6b0b2a', 1]), { name: 'Slash', morph: 'slash' });
    const ttl = title(sb, 'Final standings');
    const head = ['#', 'TEAM', 'W', 'L', 'MAPS', 'PTS'].map((t, i) => ({ t, b: true, c: '#07090d', fill: '#08d9d6', align: (i === 1 ? 'left' : 'center') as 'left' | 'center' }));
    const rowsData = [['1', 'NOVA', '11', '2', '+19', '33'], ['2', 'ECLIPSE', '10', '3', '+14', '30'], ['3', 'VANTA', '8', '5', '+7', '24'], ['4', 'PULSE', '7', '6', '+3', '21'], ['5', 'KRAKEN', '5', '8', '-6', '15'], ['6', 'ORBIT', '3', '10', '-12', '9']];
    const rows = rowsData.map((r, ri) => r.map((t, ci) => ({ t, b: ri === 0 || ci === 5, c: ri === 0 ? '#ffffff' : ci === 0 ? '@secondary' : '@text', align: (ci === 1 ? 'left' : 'center') as 'left' | 'center', fill: ri === 0 ? '#8c1237' : undefined })));
    const tbl = TB(th, m, 250, { widths: [120, 560, 180, 180, 220, 200], rowH: [76, 100, 100, 100, 100, 100, 100], rows: [head, ...rows], size: 38, header: true, banded: true, headerFill: '@secondary', bandFill: '#0b0f16', border: { c: '#1c2330', w: 2 }, pad: 28, font: 'Impact', name: 'Standings table' });
    sb.add(tbl);
    sb.fx('slide-in', ttl, { trigger: 'after', params: { dist: 100 } });
    sb.fx('slide-in', tbl, { delay: 150, params: { dir: 'left', dist: 300 }, dur: 800 });
    slides.push(sb.done());
  }

  // 9 ── Closing
  {
    const sb = new SB(th, deck.size, { layout: lay('Title'), name: 'See you next season', transition: trn('broadcast-cut', { dir: 'right', params: { label: 'NEXT SEASON', color: RED } }), notes: 'Roll the sponsor loop under this slide.' });
    const slab = sb.r('parallelogram', 1180, -20, 900, 1120, lin(160, ['@primary', 0], ['#6b0b2a', 1]), { name: 'Power slab' });
    const edge = sb.r('parallelogram', 1130, -20, 900, 1120, null, { stroke: { c: CYAN, w: 4 }, name: 'Slab outline' });
    const date = sb.t([P([{ t: 'SEASON 08', size: 40, w: 800, ls: 6 }]), P([{ t: 'MARCH 2027', size: 68, font: 'Impact', ls: 2 }])], 1390, 640, 500, { lh: 1.05, name: 'Next season date' });
    const ttl = sb.t('SEE YOU\nNEXT SEASON', m, 250, 1200, { s: 150, f: '@heading', w: 400, lh: 0.95, ls: 2, ph: 'title', name: 'Title', h: 340 });
    const presented = sb.t('PRESENTED BY', m, 690, 600, { s: 24, w: 800, ls: 6, c: '@muted', h: 34, name: 'Presented by' });
    const sponsors = ['VOLTA', 'ARCLIGHT', 'NORTHSTAR', 'PIXELFORGE'].map((n, i) => {
      const x = m + i * 250;
      return [sb.r('parallelogram', x, 750, 230, 100, '@surface', { stroke: { c: '#2a3344', w: 2 }, name: `Sponsor ${i + 1}` }), sb.t(n, x, 750, 230, { s: 24, w: 800, ls: 2, a: 'center', v: 'middle', h: 100, name: `Sponsor name ${i + 1}` })];
    });
    sb.fx('slide-in', [slab, edge], { trigger: 'after', each: 100, params: { dir: 'right', dist: 700 }, dur: 900 });
    sb.fx('fade-in', date, { delay: 400 });
    sb.fx('cascade-words', ttl, { delay: 200, params: { each: 160, dist: 80 } });
    sb.fx('fade-in', presented, { delay: 500 });
    sponsors.forEach((g, i) => sb.fx('rise', g, { delay: i === 0 ? 250 : 120, each: 20, params: { dist: 30 } }));
    slides.push(sb.done());
  }

  deck.slides = slides;
  void preset;
  return deck;
}

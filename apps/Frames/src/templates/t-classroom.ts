import { newDeck } from '../model/defaults';
import { THEME_PAPER } from '../model/theme';
import type { Deck, Slide } from '../model/types';
import { C, P, R, SB, TB, layoutNamed, numbered, setPh, trn } from './kit';

/** Classroom: a friendly lesson deck. Bright paper, rounded cards, clear steps and a quick check at the end. */
export function makeClassroom(): Deck {
  const th = structuredClone(THEME_PAPER);
  th.name = 'Classroom';
  th.fonts = { ...th.fonts, heading: 'Avenir', body: 'Avenir' };
  const deck = newDeck('Lesson: The water cycle', { theme: th });
  deck.margin = 112;
  const m = 112;

  deck.master.elements = [
    R('rect', 0, 1064, 1920, 16, '@primary', { name: 'Bottom band' }),
  ];

  const ls = deck.layouts;
  for (const name of ['Title and content', 'Title only', 'Two columns', 'Comparison']) setPh(layoutNamed(ls, name), 'title', { y: 80, base: { size: 76, weight: 800 } });
  setPh(layoutNamed(ls, 'Title'), 'title', { x: m, y: 360, w: 1300, h: 260, base: { size: 120, weight: 800, lh: 1.05 } });
  const lay = (name: string) => layoutNamed(ls, name).id;
  const title = (sb: SB, text: string) => sb.t(text, m, 80, 1696, { s: 76, w: 800, lh: 1.1, f: '@heading', ph: 'title', name: 'Title' });
  const slides: Slide[] = [];

  // 1 ── Title
  {
    const sb = new SB(th, deck.size, { layout: lay('Title'), name: 'Title', notes: 'Ask the class: where does rain come from? Collect two or three answers before moving on.' });
    const sun = sb.r('ellipse', 1420, 140, 360, 360, '@accent', { name: 'Sun', morph: 'sun' });
    const cloud = sb.r('round-rect', 1260, 420, 520, 180, '@surface', { radius: 90, name: 'Cloud', morph: 'cloud' });
    const chip = sb.r('pill', m, 290, 300, 60, '@primary', { name: 'Subject chip' });
    const chipT = sb.t('SCIENCE · GRADE 5', m, 290, 300, { s: 24, w: 700, ls: 2, c: '#ffffff', a: 'center', v: 'middle', h: 60, name: 'Subject' });
    const ttl = sb.t('The water cycle', m, 380, 1200, { s: 120, w: 800, lh: 1.05, f: '@heading', ph: 'title', name: 'Title', h: 150 });
    const sub = sb.t('How the same water keeps moving between sky, land and sea.', m, 560, 1000, { s: 42, c: '@muted', ph: 'subtitle', name: 'Subtitle', h: 120 });
    const who = sb.t([P([{ t: 'Ms. Rivera', w: 700, size: 32 }]), P([{ t: 'Room 12 · 25 minutes', c: '@muted', size: 26 }])], m, 820, 700, { lh: 1.35, name: 'Teacher' });
    sb.fx('drop', sun, { trigger: 'after' });
    sb.fx('slide-in', cloud, { delay: 200 });
    sb.fx('pop', [chip, chipT], { delay: 100 });
    sb.fx('cascade-words', ttl, { delay: 250, params: { each: 120 } });
    sb.fx('rise', [sub, who], { delay: 600, each: 150 });
    slides.push(sb.done());
  }

  // 2 ── Learning goals
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Goals', transition: trn('push', { dir: 'left' }) });
    const ttl = title(sb, 'Today you will be able to…');
    const goals: [string, string, string][] = [
      ['book', 'Name', 'the four stages of the water cycle'],
      ['bulb', 'Explain', 'what makes water change state'],
      ['pen', 'Draw', 'a labelled diagram of the cycle'],
    ];
    const cards = goals.map(([icon, verb, rest], i) => {
      const x = m + i * 576;
      const card = sb.r('round-rect', x, 300, 528, 560, i === 1 ? '@primary' : '@surface', { radius: 40, name: `Goal card ${i + 1}` });
      const c = i === 1 ? '#ffffff' : '@text';
      const ic = sb.i(icon, x + 56, 356, 110, i === 1 ? '#ffffff' : '@primary', { name: `Goal icon ${i + 1}` });
      const v = sb.t(verb, x + 56, 520, 420, { s: 64, w: 800, c, name: `Goal verb ${i + 1}` });
      const r = sb.t(rest, x + 56, 610, 420, { s: 36, c, op: 0.85, name: `Goal ${i + 1}`, h: 160 });
      return [card, ic, v, r];
    });
    sb.fx('fade-in', ttl, { trigger: 'after' });
    cards.forEach((g) => sb.fx('spring-up', g, { trigger: 'click', each: 60 }));
    slides.push(sb.done());
  }

  // 3 ── Section
  {
    const sb = new SB(th, deck.size, { name: 'Section: stages', section: 'The four stages', background: { t: 'solid', c: '@primary' }, transition: trn('zoom') });
    const n = sb.t('4', 1260, 40, 560, { s: 900, w: 800, c: '#ffffff', op: 0.15, a: 'right', lh: 1, h: 1000, fit: 'none', name: 'Big number' });
    const ttl = sb.t('Four stages,\none loop', m, 360, 1200, { s: 130, w: 800, lh: 1.05, c: '#ffffff', f: '@heading', name: 'Title', h: 300 });
    sb.fx('zoom-in', n, { trigger: 'after', dur: 900 });
    sb.fx('cascade-words', ttl, { delay: 200 });
    slides.push(sb.done());
  }

  // 4 ── Cycle diagram (steps around a loop)
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'The cycle', transition: trn('magic-move'), notes: 'Click once per stage. Point at the arrow each time: the water does not disappear, it moves.' });
    const ttl = title(sb, 'Around and around');
    const cx = 960, cy = 610, rad = 300;
    const ring = sb.r('ellipse', cx - rad, cy - rad, rad * 2, rad * 2, null, { stroke: { c: '@surface', w: 18 }, name: 'Loop' });
    const stages: [string, string, string][] = [
      ['Evaporation', 'The sun warms water into vapour.', '@accent'],
      ['Condensation', 'Vapour cools into cloud droplets.', '@primary'],
      ['Precipitation', 'Droplets fall as rain or snow.', '@secondary'],
      ['Collection', 'Water gathers in rivers and seas.', '@muted'],
    ];
    const pos: [number, number][] = [[cx - 160, cy + rad - 120], [cx - rad - 120, cy - 160], [cx - 160, cy - rad - 100], [cx + rad - 200, cy - 160]];
    const text: [number, number, 'left' | 'right'][] = [[cx + 200, cy + rad - 90, 'left'], [m, cy + 20, 'left'], [cx + 200, cy - rad - 70, 'left'], [cx + rad + 160, cy - 140, 'left']];
    sb.fx('fade-in', ttl, { trigger: 'after' });
    sb.fx('draw-on', ring, { trigger: 'with', dur: 1200 });
    stages.forEach(([name, desc, col], i) => {
      const [x, y] = pos[i]!;
      const dot = sb.r('ellipse', x + 120, y + 120, 80, 80, col, { name: `${name} dot` });
      const [tx, ty, a] = text[i]!;
      const t = sb.t([P([{ t: `${i + 1}. ${name}`, w: 800, size: 40 }]), P([{ t: desc, c: '@muted', size: 28 }])], tx, ty, 440, { a, lh: 1.3, name: name });
      sb.fx('pop', dot, { trigger: 'click' });
      sb.fx('rise', t, { delay: 120, params: { dist: 30 } });
    });
    slides.push(sb.done());
  }

  // 5 ── Data
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Where the water is', transition: trn('wipe', { dir: 'right' }) });
    const ttl = title(sb, 'Where is Earth\'s water?');
    const chart = sb.add(C(th, m, 260, 1000, 700, { kind: 'donut', categories: ['Oceans', 'Ice', 'Ground', 'Lakes & rivers'], series: [{ name: 'Share %', values: [96.5, 1.7, 1.7, 0.1] }], legend: 'right', labels: true, size: 28, name: 'Water chart' }));
    const fact = sb.r('round-rect', 1240, 330, 568, 460, '@surface', { radius: 36, name: 'Fact card' });
    const ft = sb.t([P([{ t: 'Did you know?', w: 800, size: 40, c: '@primary' }], { after: 16 }), P([{ t: 'Less than 1% of all water is fresh water we can easily use.', size: 36 }])], 1290, 380, 470, { lh: 1.3, name: 'Fact' });
    sb.fx('fade-in', ttl, { trigger: 'after' });
    sb.fx('draw-on', chart, { delay: 150 });
    sb.fx('spring-up', [fact, ft], { trigger: 'click', each: 80 });
    slides.push(sb.done());
  }

  // 6 ── Vocabulary table
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Vocabulary', transition: trn('cover', { dir: 'up' }) });
    const ttl = title(sb, 'Key words');
    const table = sb.add(TB(th, m, 260, {
      widths: [420, 1276], rowH: 120, size: 34, banded: true,
      rows: [
        [{ t: 'Word', b: true }, { t: 'Meaning', b: true }],
        ['Evaporate', 'To change from a liquid into a gas'],
        ['Condense', 'To change from a gas into a liquid'],
        ['Precipitation', 'Water falling from clouds: rain, snow, sleet or hail'],
        ['Runoff', 'Water flowing over land into rivers and seas'],
      ],
      name: 'Vocabulary table',
    }));
    sb.fx('fade-in', ttl, { trigger: 'after' });
    sb.fx('wipe-in', table, { delay: 150 });
    slides.push(sb.done());
  }

  // 7 ── Quick check
  {
    const sb = new SB(th, deck.size, { layout: lay('Title and content'), name: 'Quick check', transition: trn('flip'), notes: 'Give 60 seconds of think time, then cold-call. Answers: condensation; the sun; collection.' });
    const ttl = title(sb, 'Quick check');
    const qs = sb.t(numbered(['What happens when water vapour cools?', 'What gives the cycle its energy?', 'Where does rain go after it lands?'], 36), m, 280, 1100, { s: 50, w: 600, lh: 1.25, name: 'Questions' });
    const timer = sb.r('ellipse', 1420, 330, 360, 360, null, { stroke: { c: '@accent', w: 20 }, name: 'Timer ring' });
    const tt = sb.t('60s', 1420, 330, 360, { s: 110, w: 800, a: 'center', v: 'middle', h: 360, name: 'Timer' });
    sb.fx('fade-in', ttl, { trigger: 'after' });
    sb.fx('line-by-line', qs, { delay: 100 });
    sb.fx('draw-on', timer, { trigger: 'click', dur: 1200 });
    sb.fx('pulse', tt, { trigger: 'with', delay: 600 });
    slides.push(sb.done());
  }

  // 8 ── Wrap-up
  {
    const sb = new SB(th, deck.size, { layout: lay('Title'), name: 'Great work', transition: trn('morph') });
    sb.r('ellipse', 1420, 140, 360, 360, '@accent', { name: 'Sun', morph: 'sun' });
    sb.r('round-rect', 1260, 420, 520, 180, '@surface', { radius: 90, name: 'Cloud', morph: 'cloud' });
    const ttl = sb.t('Great work!', m, 380, 1200, { s: 140, w: 800, f: '@heading', ph: 'title', name: 'Title', h: 170 });
    const hw = sb.t('Homework: draw the cycle at home and label all four stages.', m, 590, 1000, { s: 42, c: '@muted', name: 'Homework', h: 120 });
    sb.fx('tada', ttl, { trigger: 'after' });
    sb.fx('rise', hw, { delay: 400 });
    slides.push(sb.done());
  }

  deck.slides = slides;
  return deck;
}

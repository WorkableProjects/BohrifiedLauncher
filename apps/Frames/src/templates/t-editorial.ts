import { newDeck, solid } from '../model/defaults';
import { THEME_EDITORIAL } from '../model/theme';
import type { Deck, Slide } from '../model/types';
import { C, G, L, P, R, SB, T, layoutNamed, setPh, trn } from './kit';

/** Editorial: warm paper, Didot headlines, thin rules and magazine pacing. */
export function makeEditorial(): Deck {
  const th = structuredClone(THEME_EDITORIAL);
  th.name = 'Editorial';
  const deck = newDeck('Field Notes: The Quiet City', { theme: th });
  deck.margin = 128;
  const m = 128;
  deck.master.elements = [
    L(m, 64, 1792, 64, '@text', 2, { name: 'Top rule' }),
    L(m, 70, 1792, 70, '@text', 1, { name: 'Top rule 2' }),
    T(th, 'FIELD NOTES  ·  AUTUMN 2026', m, 1000, 700, { s: 20, w: 700, ls: 5, c: '@muted', f: '@body', h: 28, name: 'Footer' }),
    T(th, 'No. 07', 1792 - 300, 1000, 300, { s: 22, i: true, c: '@muted', f: '@body', a: 'right', h: 28, name: 'Folio' }),
  ];

  const ls = deck.layouts;
  for (const l of ls) for (const e of l.elements) if (e.type === 'text' && e.ph === 'title') e.base = { ...e.base, weight: 400, ls: -1 };
  setPh(layoutNamed(ls, 'Title'), 'title', { x: 128, y: 220, w: 1100, h: 480, base: { size: 190, lh: 0.95, ls: -4 } });
  setPh(layoutNamed(ls, 'Title'), 'subtitle', { x: 128, y: 740, w: 900, h: 110, base: { size: 40, italic: true, weight: 400, color: '@muted', font: '@body' } });
  for (const n of ['Title and content', 'Title only', 'Two columns', 'Comparison']) setPh(layoutNamed(ls, n), 'title', { y: 120, base: { size: 88, ls: -1 } });
  const sec = layoutNamed(ls, 'Section');
  sec.elements = sec.elements.filter((e) => e.ph);
  sec.background = solid('@surface');
  setPh(sec, 'title', { x: 760, y: 420, w: 1030, h: 200, base: { size: 120, ls: -2 } });
  setPh(layoutNamed(ls, 'Quote'), 'body', { base: { font: '@heading', italic: true, weight: 400 } });
  const lay = (n: string) => layoutNamed(ls, n).id;
  const caps = (sb: SB, text: string, x: number, y: number, w: number, c = '@muted', s = 22, a: 'left' | 'center' | 'right' = 'left') => sb.t(text, x, y, w, { s, w: 700, ls: 5, c, up: true, a, h: s + 10, name: 'Label' });
  const title = (sb: SB, text: string) => sb.t(text, m, 120, 1664, { s: 88, w: 400, ls: -1, lh: 1.05, f: '@heading', ph: 'title', name: 'Title', h: 110 });
  const slides: Slide[] = [];

  // 1 ── Cover
  {
    const sb = new SB(th, deck.size, { layout: lay('Title'), name: 'Cover', notes: 'Open slowly. This deck is meant to be read aloud, like an essay.' });
    const eyebrow = caps(sb, 'Issue Nº 07  ·  Autumn 2026', m, 130, 800);
    const ttl = sb.t([P([{ t: 'The Quiet' }]), P([{ t: 'City' }, { t: '.', c: '@primary' }])], m, 220, 1100, { s: 190, w: 400, ls: -4, lh: 0.95, f: '@heading', ph: 'title', name: 'Title', h: 400 });
    const rule = sb.l(m, 700, m + 160, 700, '@primary', 4, { name: 'Accent rule' });
    const sub = sb.t('A year of field notes on how cities learn to slow down.', m, 740, 900, { s: 40, i: true, c: '@muted', ph: 'subtitle', name: 'Subtitle', h: 110 });
    const by = caps(sb, 'Words by Hana Okafor', m, 900, 900, '@text', 22);
    // Arch illustration
    const aw = 560, ax = 1232, ay = 150;
    const arch = sb.add(G([
      R('ellipse', 0, 0, aw, aw, '@secondary', { name: 'Arch top' }),
      R('rect', 0, aw / 2, aw, 780 - aw / 2, '@secondary', { name: 'Arch body' }),
      R('rect', 0, 540, aw, 240, '#254a40', { name: 'Water' }),
      R('rect', 70, 430, 90, 110, '#254a40', { name: 'Building 1' }),
      R('rect', 160, 380, 70, 160, '#1d3b33', { name: 'Building 2' }),
      R('rect', 230, 450, 110, 90, '#254a40', { name: 'Building 3' }),
      L(60, 600, 500, 600, '#f6f1e9', 2, { opacity: 0.5, name: 'Ripple 1' }),
      L(120, 650, 440, 650, '#f6f1e9', 2, { opacity: 0.4, name: 'Ripple 2' }),
      L(180, 700, 380, 700, '#f6f1e9', 2, { opacity: 0.3, name: 'Ripple 3' }),
    ], ax, ay, aw, 780, 'Arch illustration'));
    const sun = sb.r('ellipse', ax + 330, ay + 130, 190, 190, '@accent', { name: 'Sun', morph: 'sun' });
    sb.fx('fade-in', eyebrow, { trigger: 'after', dur: 700 });
    sb.fx('cascade-words', ttl, { delay: 150, params: { each: 200, dist: 50 } });
    sb.fx('wipe-in', rule, { delay: 700 });
    sb.fx('fade-in', [sub, by], { delay: 800, each: 150 });
    sb.fx('rise', arch, { delay: 200, params: { dist: 70 }, dur: 1100 });
    sb.fx('zoom-in', sun, { delay: 900, params: { amount: 0.4 } });
    slides.push(sb.done());
  }

  // 2 ── Contents
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Contents', transition: trn('morph') });
    sb.r('ellipse', 1700, 108, 72, 72, '@accent', { name: 'Sun', morph: 'sun' });
    const ttl = title(sb, 'In this issue');
    const rows = [['I', 'The Commons', 'Where the city meets itself', '04'], ['II', 'Streets built for staying', 'Benches, shade and the long lunch', '12'], ['III', 'The numbers', 'What measured quiet looks like', '20'], ['IV', 'Slow transit', 'Trams, ferries and the case for waiting', '28'], ['V', 'What comes next', 'Five proposals for 2027', '36']];
    const groups = rows.map(([n, h, d, p], i) => {
      const y = 320 + i * 124;
      const num = T(th, n!, m, y + 6, 120, { s: 44, i: true, c: '@primary', f: '@heading', h: 60, name: `Numeral ${n}` });
      const hh = T(th, h!, m + 140, y, 1100, { s: 54, f: '@heading', h: 66, name: `Entry ${n}` });
      const dd = T(th, d!, m + 140, y + 66, 1100, { s: 26, i: true, c: '@muted', h: 36, name: `Standfirst ${n}` });
      const pg = T(th, p!, 1792 - 160, y + 6, 160, { s: 44, c: '@muted', a: 'right', f: '@heading', h: 60, name: `Page ${n}` });
      const rule = L(m, y + 108, 1792, y + 108, '@text', 1, { opacity: 0.35, name: `Rule ${n}` });
      sb.addAll(num, hh, dd, pg, rule);
      return [num, hh, dd, pg, rule];
    });
    sb.fx('fade-in', ttl, { trigger: 'after', dur: 600 });
    groups.forEach((g, i) => sb.fx('rise', g, { delay: i === 0 ? 150 : 130, each: 0, params: { dist: 30 } }));
    slides.push(sb.done());
  }

  // 3 ── Section
  {
    const sb = new SB(th, deck.size, { layout: lay('Section'), name: 'Part one', section: 'I. The Commons', transition: trn('uncover', { dir: 'left' }) });
    const num = sb.t('I.', m, 120, 700, { s: 640, i: true, w: 400, c: '@primary', f: '@heading', ls: -10, lh: 1, h: 760, fit: 'none', name: 'Numeral', morph: 'folio' });
    sb.l(760, 400, 1792, 400, '@text', 2, { name: 'Rule' });
    const eb = caps(sb, 'Part one', 760, 340, 600, '@muted', 24);
    const ttl = sb.t('The Commons', 760, 440, 1030, { s: 120, w: 400, ls: -2, f: '@heading', ph: 'title', name: 'Title', h: 160 });
    const sub = sb.t('Where the city meets itself, and decides to stay a while.', 760, 620, 900, { s: 40, i: true, c: '@muted', lh: 1.3, name: 'Subtitle', h: 120 });
    sb.fx('fade-in', num, { trigger: 'after', dur: 900 });
    sb.fx('fade-in', eb, { delay: 300 });
    sb.fx('cascade-words', ttl, { delay: 400, params: { each: 150, dist: 30 } });
    sb.fx('fade-in', sub, { delay: 900 });
    slides.push(sb.done());
  }

  // 4 ── Article
  {
    const sb = new SB(th, deck.size, { layout: lay('Two columns'), name: 'Article', transition: trn('dissolve'), notes: 'Read the lead-in aloud. The pull-quote on the right is the line people remember.' });
    sb.t('I.', m, 118, 100, { s: 44, i: true, w: 400, c: '@primary', f: '@heading', h: 60, name: 'Numeral', morph: 'folio' });
    const ttl = sb.t('Streets built for staying', 240, 120, 1500, { s: 88, w: 400, ls: -1, f: '@heading', ph: 'title', name: 'Title', h: 110 });
    const col = (x: number, lead: string, text: string, name: string) => sb.t([P([{ t: lead, w: 700, ls: 3, size: 22, c: '@primary' }, { t: '  ' + text }], { lh: 1.5 })], x, 320, 500, { s: 33, c: '@text', h: 640, name });
    const c1 = col(m, 'THE STREET', 'used to be a place you passed through. Over the past three years the harbour district has quietly reversed that idea, narrowing roads, widening pavements and planting trees where the loading bays once stood. Nobody announced it. People simply began to linger.', 'Column 1');
    const c2 = col(m + 580, 'AND THEN', 'the cafés followed, then the readers, then the children. By spring the average visit had grown from eleven minutes to nearly half an hour, and the shopkeepers who had objected loudest were asking for more benches outside their own doors.', 'Column 2');
    const vr = sb.l(1310, 330, 1310, 900, '@text', 1, { opacity: 0.4, name: 'Column rule' });
    const q = sb.t('“A bench is the cheapest public infrastructure we have.”', 1360, 330, 432, { s: 54, i: true, c: '@primary', f: '@heading', lh: 1.15, h: 420, name: 'Pull quote' });
    const who = caps(sb, 'Marta Silva, city planner', 1360, 790, 432, '@muted', 20);
    sb.fx('fade-in', ttl, { trigger: 'after', dur: 700 });
    sb.fx('fade-in', [c1, c2], { delay: 200, each: 200 });
    sb.fx('wipe-in', vr, { delay: 300 });
    sb.fx('blur-in', q, { trigger: 'click' });
    sb.fx('fade-in', who, { delay: 400 });
    slides.push(sb.done());
  }

  // 5 ── Big number
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'The numbers', transition: trn('wipe', { dir: 'right' }), section: 'III. The numbers' });
    caps(sb, 'III.  The numbers', m, 118, 900);
    const big = sb.t('73%', m, 190, 900, { s: 400, i: true, w: 400, c: '@primary', f: '@heading', ls: -10, lh: 1, h: 440, name: 'Hero number' });
    const stmt = sb.t('of residents now choose to walk for any trip under a kilometre, up from 41% in 2022.', 1040, 270, 752, { s: 56, f: '@heading', lh: 1.15, h: 320, name: 'Statement' });
    const stats = [['2.1×', 'more time spent on the street'], ['−18%', 'measured traffic noise'], ['412', 'new trees along the harbour']].map(([n, l], i) => {
      const x = m + i * 576;
      const rule = L(x, 700, x + 512, 700, '@text', 2, { name: `Rule ${i + 1}` });
      const num = T(th, n!, x, 730, 512, { s: 96, f: '@heading', h: 110, name: `Stat ${i + 1}` });
      const lab = T(th, l!, x, 850, 512, { s: 30, i: true, c: '@muted', h: 44, name: `Stat label ${i + 1}` });
      sb.addAll(rule, num, lab);
      return [rule, num, lab];
    });
    sb.fx('zoom-in', big, { trigger: 'after', params: { amount: 0.9 }, dur: 1100 });
    sb.fx('fade-in', stmt, { delay: 400 });
    stats.forEach((g, i) => sb.fx('rise', g, { delay: i === 0 ? 400 : 160, each: 0, params: { dist: 30 } }));
    slides.push(sb.done());
  }

  // 6 ── Chart
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Footfall', transition: trn('dissolve') });
    const ttl = title(sb, 'Footfall, week by week');
    const chart = sb.add(C(th, m, 290, 1130, 640, {
      kind: 'line', categories: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7', 'Wk 8'],
      series: [{ name: 'High Street', values: [310, 340, 330, 410, 520, 610, 640, 720], color: '@primary' }, { name: 'Riverside', values: [180, 200, 260, 300, 310, 420, 480, 560], color: '@secondary' }],
      legend: 'top', size: 26, font: '@body', color: '@muted', smooth: true, name: 'Footfall chart',
    }));
    const fig = caps(sb, 'Fig. 1', 1330, 300, 400, '@primary', 22);
    const cap = sb.t('Pedestrians per hour at noon, before and after the pavements were widened in week four.', 1330, 350, 462, { s: 34, i: true, f: '@heading', lh: 1.3, h: 240, name: 'Caption' });
    sb.l(1330, 640, 1792, 640, '@text', 1, { opacity: 0.4, name: 'Rule' });
    const note = sb.t([P([{ t: '+132%', size: 72, font: '@heading', c: '@primary' }]), P([{ t: 'High Street, eight-week change', size: 26, c: '@muted', i: true }])], 1330, 670, 462, { lh: 1.2, name: 'Callout' });
    sb.fx('fade-in', ttl, { trigger: 'after', dur: 600 });
    sb.fx('draw-on', chart, { delay: 200, dur: 2000 });
    sb.fx('fade-in', [fig, cap, note], { delay: 500, each: 200 });
    slides.push(sb.done());
  }

  // 7 ── Then / now
  {
    const sb = new SB(th, deck.size, { layout: lay('Title only'), name: 'Then and now', transition: trn('blur') });
    const ttl = title(sb, 'Then and now');
    const vr = sb.l(960, 290, 960, 930, '@text', 1, { opacity: 0.4, name: 'Centre rule' });
    const hd = (t: string, x: number, c: string) => sb.t(t, x, 280, 700, { s: 96, i: true, c, f: '@heading', h: 110, name: `Heading ${t}` });
    const h1 = hd('2019', m, '@muted'), h2 = hd('2026', 1032, '@primary');
    const then = ['Four lanes of through traffic', 'Pavements two people wide', 'Loading bays, no trees', 'Ten-minute average visit'];
    const now = ['One lane, a tram and a cycle path', 'Pavements for conversation', 'Plane trees and long benches', 'Half-hour average visit'];
    const rows = then.map((t, i) => {
      const y = 440 + i * 130;
      const a = T(th, t, m, y, 740, { s: 38, c: '@muted', f: '@heading', h: 100, name: `Then ${i + 1}` });
      const b = T(th, now[i]!, 1032, y, 740, { s: 38, f: '@heading', h: 100, name: `Now ${i + 1}` });
      const r1 = L(m, y - 16, 860, y - 16, '@text', 1, { opacity: 0.35, name: `Rule L${i + 1}` });
      const r2 = L(1032, y - 16, 1792, y - 16, '@text', 1, { opacity: 0.35, name: `Rule R${i + 1}` });
      sb.addAll(a, b, r1, r2);
      return [a, b, r1, r2];
    });
    sb.fx('fade-in', ttl, { trigger: 'after' });
    sb.fx('wipe-in', vr, { delay: 100, dur: 1000 });
    sb.fx('fade-in', [h1, h2], { delay: 200, each: 250 });
    rows.forEach((g, i) => sb.fx('fade-in', g, { delay: i === 0 ? 300 : 200, each: 0 }));
    slides.push(sb.done());
  }

  // 8 ── Quote
  {
    const sb = new SB(th, deck.size, { layout: lay('Quote'), name: 'Quote', transition: trn('dissolve') });
    const sun = sb.r('ellipse', 610, 190, 700, 700, '@accent', { opacity: 0.22, name: 'Sun', morph: 'sun' });
    const mark = sb.t('“', 880, 150, 160, { s: 260, c: '@primary', f: '@heading', a: 'center', lh: 1, h: 220, fit: 'none', name: 'Quote mark' });
    const q = sb.t('We did not build a quieter city. We simply gave people a reason to sit down.', 260, 340, 1400, { s: 84, i: true, f: '@heading', a: 'center', lh: 1.15, ls: -1, ph: 'body', name: 'Quote', h: 340 });
    sb.l(880, 760, 1040, 760, '@primary', 3, { name: 'Rule' });
    const who = caps(sb, 'Marta Silva  ·  Harbour district planner', 360, 790, 1200, '@text', 24, 'center');
    sb.fx('fade-in', sun, { trigger: 'after', dur: 1500 });
    sb.fx('fade-in', mark, { delay: 200 });
    sb.fx('cascade-words', q, { delay: 300, params: { each: 100, dist: 24 } });
    sb.fx('fade-in', who, { delay: 700 });
    slides.push(sb.done());
  }

  // 9 ── Closing
  {
    const sb = new SB(th, deck.size, { layout: lay('Title'), name: 'Thank you', transition: trn('morph') });
    const sun = sb.r('ellipse', 1180, 150, 380, 380, '@accent', { name: 'Sun', morph: 'sun' });
    sb.l(1100, 600, 1640, 600, '@text', 2, { name: 'Horizon' });
    sb.l(1190, 650, 1550, 650, '@text', 1, { opacity: 0.5, name: 'Horizon 2' });
    sb.l(1270, 700, 1470, 700, '@text', 1, { opacity: 0.3, name: 'Horizon 3' });
    const ttl = sb.t([P([{ t: 'Thank you' }]), P([{ t: 'for reading' }, { t: '.', c: '@primary' }])], m, 220, 1000, { s: 150, w: 400, ls: -3, lh: 1, f: '@heading', ph: 'title', name: 'Title', h: 340 });
    const sub = sb.t('Next issue: the night city, and why it deserves better lighting.', m, 600, 800, { s: 36, i: true, c: '@muted', lh: 1.3, ph: 'subtitle', name: 'Subtitle', h: 110 });
    const cols = [['Write to us', 'notes@fieldnotes.example'], ['Read online', 'fieldnotes.example/quiet-city'], ['Follow', '@fieldnotes']].map(([k, v], i) => {
      const x = m + i * 576;
      return [sb.l(x, 800, x + 512, 800, '@text', 1, { name: `Rule ${i + 1}` }), caps(sb, k!, x, 820, 512, '@primary', 20), sb.t(v!, x, 860, 512, { s: 34, f: '@heading', h: 48, name: `Contact ${i + 1}` })];
    });
    sb.fx('zoom-in', sun, { trigger: 'after', params: { amount: 0.8 }, dur: 1200 });
    sb.fx('cascade-words', ttl, { delay: 200, params: { each: 150, dist: 30 } });
    sb.fx('fade-in', sub, { delay: 800 });
    cols.forEach((g, i) => sb.fx('fade-in', g, { delay: i === 0 ? 500 : 150, each: 0 }));
    slides.push(sb.done());
  }

  deck.slides = slides;
  return deck;
}

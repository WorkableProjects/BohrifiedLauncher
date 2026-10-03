import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The page is one HTML file: its pure logic sits between marker comments.
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/\/\/ ---- rubric-core:start ----([\s\S]*?)\/\/ ---- rubric-core:end ----/);
if (!m) throw new Error('rubric-core markers not found in index.html');
const core = vm.runInNewContext(`${m[1]}
({VERSION, DEFAULT_LEVELS, TYPES, MAX_POINTS, MAX_RUBRICS, roundPts, fmt, parsePoints, parseTotal, levelIssues, typeTotal, typeForTotal,
  distribute, uniquePts, compute, DECIMAL_MODES, snapPts, decimalMode, buildCsv, buildGrid, xlsxPointFormula, defaultState, sanitizeState, isEmptyState, rubricName,
  parseLibrary, upsertRubric, removeRubric, serializeLibrary, makeCriterion, csvCell})`);
// vm objects have a foreign prototype; round-trip for deep equality.
const plain = (x) => JSON.parse(JSON.stringify(x));

const stateWith = (total, crit) => {
  const st = core.defaultState();
  st.S.total = total;
  st.S.criteria = crit.map((c, i) => ({ ...core.makeCriterion(i + 1), ...c }));
  return st.S;
};

describe('version', () => {
  it('is 1.2.1 everywhere in the page', () => {
    expect(core.VERSION).toBe('1.2.1');
    expect(html).toContain('<title>Rubricable 1.2.1</title>');
    expect(html).not.toMatch(/Rubricable 1\.1|VERSION = '1\.1'/);
  });
});

describe('rounding and formatting', () => {
  it('removes float artifacts', () => {
    expect(core.fmt(0.1 + 0.2)).toBe('0.3');
    expect(core.fmt(2.25)).toBe('2.25');
    expect(core.fmt(1.005)).toBe('1.01');
    expect(core.fmt(3)).toBe('3');
    expect(core.fmt(0.5)).toBe('0.5');
    expect(core.fmt(NaN)).toBe('0');
    expect(core.fmt(-0.001)).toBe('0');
  });
  it('parses point input defensively', () => {
    expect(core.parsePoints('').blank).toBe(true);
    expect(core.parsePoints('  ').blank).toBe(true);
    expect(core.parsePoints('2.5').value).toBe(2.5);
    expect(core.parsePoints('abc').value).toBeNull();
    expect(core.parsePoints('-3').value).toBeNull();
    expect(core.parsePoints('-3').issue).toMatch(/negative/);
    expect(core.parsePoints('1e12').value).toBe(core.MAX_POINTS);
    expect(core.parsePoints('Infinity').value).toBeNull();
    expect(core.parsePoints('1.234').value).toBe(1.23);
    expect(core.parsePoints('1.234').issue).toMatch(/Rounded/);
  });
  it('validates the total', () => {
    expect(core.parseTotal('').issue).toMatch(/Enter/);
    expect(core.parseTotal('-1')).toMatchObject({ value: 0 });
    expect(core.parseTotal('22.5')).toMatchObject({ value: 22.5, issue: '' });
    expect(core.parseTotal(NaN).value).toBe(0);
  });
  it('flags bad level percentages', () => {
    const lv = plain(core.DEFAULT_LEVELS);
    expect(core.levelIssues(lv)).toEqual([]);
    lv[2].pct = '150'; lv[3].pct = '';
    expect(core.levelIssues(lv)).toHaveLength(2);
  });
});

describe('assignment types', () => {
  it('quiz and test set presets, assignment/custom keep the total', () => {
    expect(core.typeTotal('quiz', 12)).toBe(30);
    expect(core.typeTotal('test', 12)).toBe(75);
    expect(core.typeTotal('assignment', 12)).toBe(12);
    expect(core.typeTotal('custom', 12)).toBe(12);
  });
  it('editing the total away from a preset switches to custom', () => {
    expect(core.typeForTotal('quiz', 30)).toBe('quiz');
    expect(core.typeForTotal('quiz', 25)).toBe('custom');
    expect(core.typeForTotal('test', 75.001)).toBe('test');
    expect(core.typeForTotal('assignment', 7)).toBe('assignment');
  });
});

describe('scoring', () => {
  it('splits decimal totals exactly (no integer rounding)', () => {
    const d = core.distribute(10, 3);
    expect(d).toEqual([3.34, 3.33, 3.33]);
    expect(core.roundPts(d.reduce((a, b) => a + b, 0))).toBe(10);
    expect(core.distribute(22.5, 2)).toEqual([11.25, 11.25]);
    expect(core.distribute(0, 3)).toEqual([0, 0, 0]);
    expect(core.distribute(5, 0)).toEqual([]);
  });
  it('keeps fixed criterion points and shares the rest', () => {
    const v = core.compute(stateWith('10', [{ name: 'A', pts: '2.5' }, { name: 'B' }, { name: 'C' }]));
    expect(v.rows.map(r => r.max)).toEqual([2.5, 3.75, 3.75]);
    expect(v.sum).toBe(10);
  });
  it('keeps 0.5 and 2.25 level points', () => {
    const v = core.compute(stateWith(2.25, [{ name: 'A' }]));
    expect(v.rows[0].pts[0]).toBe(2.25);
    expect(v.rows[0].pts[1]).toBe(2.03); // 90% of 2.25 = 2.025
    const h = core.compute(stateWith('0.5', [{ name: 'A' }]));
    expect(h.rows[0].pts[0]).toBe(0.5);
  });
  it('level points are strictly descending and never artifact-y', () => {
    const v = core.compute(stateWith(30, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]));
    v.rows.forEach(r => {
      for (let j = 1; j < r.pts.length; j++) expect(r.pts[j]).toBeLessThan(r.pts[j - 1]);
      r.pts.forEach(p => expect(core.fmt(p)).toBe(String(p)));
    });
  });
  it('handles empty, negative, NaN and huge values', () => {
    expect(core.compute(stateWith('', [{ name: 'A' }])).rows[0].max).toBe(0);
    expect(core.compute(stateWith('-5', [{ name: 'A' }])).total).toBe(0);
    expect(core.compute(stateWith('abc', [{ name: 'A' }])).total).toBe(0);
    expect(core.compute(stateWith('1e30', [{ name: 'A' }])).total).toBe(core.MAX_POINTS);
    // bad per-criterion points fall back to auto
    const v = core.compute(stateWith('10', [{ name: 'A', pts: '-4' }, { name: 'B', pts: 'x' }]));
    expect(v.rows.map(r => r.max)).toEqual([5, 5]);
    // fixed points beyond the total leave nothing for auto rows
    const o = core.compute(stateWith('5', [{ name: 'A', pts: '9' }, { name: 'B' }]));
    expect(o.rows.map(r => r.max)).toEqual([9, 0]);
    expect(o.sum).toBe(9);
  });
  it('ignores criteria without a name', () => {
    expect(core.compute(stateWith(10, [{ name: '  ' }])).rows).toHaveLength(0);
  });
  it('tiny totals never go negative and produce ties the UI can flag', () => {
    const v = core.compute(stateWith(0.02, [{ name: 'A' }]));
    expect(v.rows[0].pts.every(p => p >= 0)).toBe(true);
    expect(new Set(v.rows[0].pts).size).toBeLessThan(v.rows[0].pts.length);
  });
});

describe('decimal modes', () => {
  const fracs = (xs) => xs.map(x => Math.round((x - Math.floor(x)) * 100));
  const allowed = { full: null, short: [0,10,20,30,40,50,60,70,80,90], logical: [0,25,33,50,66,75], 'logical-short': [0,25,50,75], halves: [0,50], none: [0] };
  it('has the six modes and falls back to full', () => {
    expect(Object.keys(core.DECIMAL_MODES)).toEqual(['full', 'short', 'logical', 'logical-short', 'halves', 'none']);
    expect(core.decimalMode('nope')).toBe('full');
    expect(core.decimalMode('__proto__')).toBe('full');
  });
  it('snaps to the nearest allowed value', () => {
    expect(core.snapPts(2.37, 'full')).toBe(2.37);
    expect(core.snapPts(2.37, 'short')).toBe(2.4);
    expect(core.snapPts(2.37, 'logical')).toBe(2.33);
    expect(core.snapPts(2.42, 'logical')).toBe(2.5);
    expect(core.snapPts(2.7, 'logical')).toBe(2.66);
    expect(core.snapPts(2.71, 'logical')).toBe(2.75);
    expect(core.snapPts(2.9, 'logical')).toBe(3);
    expect(core.snapPts(2.37, 'logical-short')).toBe(2.25);
    expect(core.snapPts(2.375, 'logical-short')).toBe(2.5);
    expect(core.snapPts(2.2, 'halves')).toBe(2);
    expect(core.snapPts(2.25, 'halves')).toBe(2.5);
    expect(core.snapPts(2.5, 'none')).toBe(3);
    expect(core.snapPts(2.49, 'none')).toBe(2);
  });
  it('rounds typed points to the mode and says so', () => {
    expect(core.parsePoints('2.37', 'none')).toMatchObject({ value: 2, issue: expect.stringMatching(/whole points/) });
    expect(core.parsePoints('2.5', 'halves').issue).toBe('');
    expect(core.parseTotal('22.5', 'none').value).toBe(23);
  });
  it('splits totals exactly when the mode allows it', () => {
    expect(core.distribute(10, 3, 'full')).toEqual([3.34, 3.33, 3.33]);
    expect(core.distribute(10, 3, 'short')).toEqual([3.4, 3.3, 3.3]);
    expect(core.distribute(10, 3, 'logical-short')).toEqual([3.5, 3.25, 3.25]);
    expect(core.distribute(10, 3, 'halves')).toEqual([3.5, 3.5, 3]);
    expect(core.distribute(10, 3, 'none')).toEqual([4, 3, 3]);
    for (const mode of Object.keys(allowed)) for (const [t, n] of [[30, 7], [75, 4], [10, 3], [22.5, 2], [5, 8]]) {
      const d = core.distribute(t, n, mode);
      expect(d).toHaveLength(n);
      const sum = core.roundPts(d.reduce((a, b) => a + b, 0));
      expect(sum).toBeLessThanOrEqual(t);
      if (allowed[mode]) expect(fracs(d).every(f => allowed[mode].includes(f))).toBe(true);
      expect(Math.max(...d) - Math.min(...d)).toBeLessThanOrEqual(1);
    }
  });
  it('logical decimals split exactly when possible and never go over', () => {
    const d = core.distribute(10, 3, 'logical');
    expect(core.roundPts(d.reduce((a, b) => a + b, 0))).toBe(10);
    expect(fracs(d).every(f => allowed.logical.includes(f))).toBe(true);
    expect(core.distribute(1, 3, 'logical')).toEqual([0.5, 0.25, 0.25]);
    const e = core.distribute(6.67, 2, 'logical'); // no two logical values add up to x.67
    expect(core.roundPts(e.reduce((a, b) => a + b, 0))).toBeLessThan(6.67);
    expect(fracs(e).every(f => allowed.logical.includes(f))).toBe(true);
  });
  it('level points follow the mode and stay strictly descending', () => {
    for (const mode of Object.keys(allowed)) {
      const v = core.compute(stateWith(30, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]), mode);
      expect(v.mode).toBe(mode);
      v.rows.forEach(r => {
        if (allowed[mode]) expect(fracs(r.pts).every(f => allowed[mode].includes(f))).toBe(true);
        for (let j = 1; j < r.pts.length; j++) if (r.pts[j - 1] > 0) expect(r.pts[j]).toBeLessThan(r.pts[j - 1]);
      });
      expect(v.sum).toBe(30);
    }
  });
  it('flags an uneven split', () => {
    // 10 - 3.33 leaves 6.67 for two criteria: not possible with logical decimals.
    expect(core.compute(stateWith(10, [{ name: 'A', pts: '3.33' }, { name: 'B' }, { name: 'C' }]), 'logical').uneven).toBe(true);
    expect(core.compute(stateWith(10, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]), 'none').uneven).toBe(false);
  });
  it('spreadsheet formulas round like the mode', () => {
    expect(core.xlsxPointFormula('A', 'B', 'short')).toBe('ROUND(A*B,1)');
    expect(core.xlsxPointFormula('A', 'B', 'none')).toBe('ROUND(A*B,0)');
    expect(core.xlsxPointFormula('A', 'B', 'halves')).toBe('ROUND(A*B*2,0)/2');
    expect(core.xlsxPointFormula('A', 'B', 'logical-short')).toBe('ROUND(A*B*4,0)/4');
    expect(core.xlsxPointFormula('A', 'B', 'logical')).toMatch(/^INT\(A\*B\)\+LOOKUP/);
  });
});

describe('export formatting', () => {
  const S = stateWith('7.5', [{ name: 'Acc, "quoted"', desc: 'line\nbreak' }, { name: 'B' }]);
  const v = core.compute(S);
  it('CSV keeps decimals and matches on-screen formatting', () => {
    const csv = core.buildCsv(v, S.levels);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Criterion Name,Description,Level Title,Description,Points');
    expect(csv).toContain('"Acc, ""quoted"""');
    expect(csv).toMatch(/Perfection \(A\+\),[^\r]*,3\.75\r?\n?/);
    expect(csv).not.toMatch(/\d\.\d{3,}/);
  });
  it('clipboard grid uses the same numbers', () => {
    const grid = core.buildGrid(v, S.levels);
    const row = grid.split('\n').find(l => l.startsWith('\t3.75\t'));
    expect(row).toBeTruthy();
    expect(row.split('\t').slice(1)).toEqual(v.rows[0].pts.map(core.fmt));
    expect(grid).not.toMatch(/\d\.\d{3,}/);
  });
  it('spreadsheet formula rounds to 2 decimals instead of whole points', () => {
    expect(core.xlsxPointFormula('$H5', 'B$6')).toBe('ROUND($H5*B$6,2)');
  });
  it('csvCell escapes', () => {
    expect(core.csvCell('a,b')).toBe('"a,b"');
    expect(core.csvCell(1.5)).toBe('1.5');
  });
});

describe('persistence', () => {
  it('sanitizes corrupt state', () => {
    expect(core.sanitizeState(null)).toBeNull();
    expect(core.sanitizeState('x')).toBeNull();
    expect(core.sanitizeState({})).toBeNull();
    const st = core.sanitizeState({
      S: { total: 'nope-but-string', levels: [{ name: 5, pct: 500, color: 'url(javascript:1)' }, null, 'x'], criteria: [null, { id: 3, name: 7, pts: 4, ld: ['a'] }, { id: 3, name: 'dup' }] },
      nid: 'bad', atype: 'weird',
    });
    expect(st.atype).toBe('assignment');
    expect(st.S.levels).toHaveLength(7);
    expect(st.S.levels[0].pct).toBe(100);
    expect(st.S.levels[0].color).toBe(core.DEFAULT_LEVELS[0].color);
    expect(st.S.levels[0].name).toBe('Perfection');
    const ids = st.S.criteria.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(st.S.criteria.every(c => c.ld.length === 7)).toBe(true);
    expect(st.S.criteria.find(c => c.pts === '4')).toBeTruthy();
    expect(st.S.criteria.at(-2).name).toBe('dup');
    expect(st.S.criteria.at(-1).name).toBe('');
    expect(st.nid).toBeGreaterThan(Math.max(...ids));
  });
  it('accepts the old 1.1 session shape', () => {
    const old = { S: { total: 30, levels: plain(core.DEFAULT_LEVELS), criteria: [{ id: 1, name: 'Accuracy', desc: '', pts: '', ld: plain(core.DEFAULT_LEVELS).map(l => l.desc) }] }, nid: 2, atype: 'quiz' };
    const st = core.sanitizeState(old);
    expect(st.atype).toBe('quiz');
    expect(st.S.criteria[0].name).toBe('Accuracy');
    expect(st.S.criteria.at(-1).name).toBe(''); // trailing blank criterion restored
  });
  it('clamps absurd numbers', () => {
    expect(core.sanitizeState({ S: { total: 1e99 } }).S.total).toBe(core.MAX_POINTS);
    expect(core.sanitizeState({ S: { total: -4 } }).S.total).toBe(0);
  });
  it('library parse tolerates garbage', () => {
    for (const bad of [null, '', 'not json', '[]', '42', '{"items":5}', '{"items":[null,{"id":1}]}']) {
      const lib = core.parseLibrary(bad);
      expect(lib.items).toEqual([]);
      expect(lib.currentId).toBeNull();
    }
  });
  it('round-trips and upserts rubrics, newest first, capped', () => {
    let lib = core.parseLibrary(null);
    const s1 = core.defaultState(); s1.S.criteria[0].name = 'Essay';
    lib = core.upsertRubric(lib, 'a', s1, 1);
    const s2 = core.defaultState(); s2.S.criteria[0].name = 'Lab';
    lib = core.upsertRubric(lib, 'b', s2, 2);
    lib = core.upsertRubric(lib, 'a', s1, 3);
    const back = core.parseLibrary(core.serializeLibrary(lib));
    expect(back.items.map(i => i.id)).toEqual(['a', 'b']);
    expect(back.currentId).toBe('a');
    expect(back.items[0].name).toBe('Essay');
    for (let i = 0; i < 30; i++) lib = core.upsertRubric(lib, 'x' + i, s2, 10 + i);
    expect(lib.items.length).toBe(core.MAX_RUBRICS);
    expect(lib.currentId).toBe('x29');
    const after = core.removeRubric(lib, 'x29');
    expect(after.currentId).toBe('x28');
  });
  it('migrates a bare legacy state stored under the library key', () => {
    const bare = JSON.stringify({ S: core.defaultState().S, nid: 2, atype: 'test' });
    const lib = core.parseLibrary(bare);
    expect(lib.items).toHaveLength(1);
    expect(lib.items[0].state.atype).toBe('test');
  });
  it('detects empty rubrics and names them', () => {
    const d = core.defaultState();
    expect(core.isEmptyState(d)).toBe(true);
    expect(core.rubricName(d)).toBe('Untitled rubric');
    d.S.criteria[0].name = 'Thesis';
    expect(core.isEmptyState(d)).toBe(false);
    expect(core.rubricName(d)).toBe('Thesis');
  });
});

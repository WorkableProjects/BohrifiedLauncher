import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';
import vm from 'node:vm';

// The page is one HTML file: its pure logic sits between marker comments.
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/\/\/ ---- oasis-core:start ----([\s\S]*?)\/\/ ---- oasis-core:end ----/);
if (!m) throw new Error('oasis-core markers not found in index.html');
const core = vm.runInNewContext(`${m[1]}
({VERSION, defaults, sanitizeDb, letterFor, scaleRange, classGrade, parseScore, trunc2, pct, toMin, fromMin, fmt12, dayType, shiftBell, bellIssues, periodNow,
  parseCSV, csvRecords, buildCsv, csvCell, normDate, importStudents, importAssignments, importGrades, TEMPLATES, MWF, DEFAULT_CATEGORIES, reportData, buildReportDoc, reportCsv, fmtDate, pctShort, esc, deriveVault, sealDb, openDb, VAULT_ITER, b64, unb64})`, { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob });
const plain = (x) => JSON.parse(JSON.stringify(x));

const setup = () => {
  const db = core.defaults();
  core.importStudents(db, core.buildCsv(core.TEMPLATES.students));
  core.importAssignments(db, core.buildCsv(core.TEMPLATES.assignments));
  return db;
};

describe('grade scale', () => {
  const db = core.defaults();
  it.each([[100.01, 'A+'], [100, 'A'], [93, 'A'], [92.99, 'A-'], [90, 'A-'], [89.99, 'B+'], [87, 'B+'], [83, 'B'], [80, 'B-'], [77, 'C+'], [73, 'C'], [70, 'C-'], [67, 'D+'], [63, 'D'], [60, 'D-'], [59.99, 'F'], [0, 'F']])(
    '%s%% is %s', (p, l) => expect(core.letterFor(db, p)).toBe(l));
  it('cuts off (not rounds) at two decimals', () => { expect(core.letterFor(db, 92.999)).toBe('A-'); expect(core.pct(92.999)).toBe('92.99%'); });
  it('prints ranges like the syllabus', () => {
    expect(core.scaleRange(db.scale, 0)).toBe('100.01% or higher');
    expect(core.scaleRange(db.scale, 1)).toBe('93.00% – 100.00%');
    expect(core.scaleRange(db.scale, 2)).toBe('90.00% – 92.99%');
  });
  it('has no letter without a grade', () => expect(core.letterFor(db, null)).toBe('—'));
});

describe('weighted grades', () => {
  it('weights categories and rebalances over what has been graded', () => {
    const db = setup();
    const c = db.classes[0], s = db.students[0];
    const A = (n) => db.assignments.find((a) => a.name === n).id;
    expect(core.classGrade(db, c.id, s.id).overall).toBeNull();
    db.grades[A('Unit 1 Test') + ':' + s.id] = { s: 40 }; // 80% x 35
    expect(core.classGrade(db, c.id, s.id).overall).toBeCloseTo(80);
    db.grades[A('Quiz 1.1') + ':' + s.id] = { s: 10 }; // 100% x 20
    expect(core.classGrade(db, c.id, s.id).overall).toBeCloseTo((80 * 35 + 100 * 20) / 55);
  });
  it('counts missing as zero and skips excused', () => {
    const db = setup(), c = db.classes[0], s = db.students[0];
    const id = (n) => db.assignments.find((a) => a.name === n).id;
    db.grades[id('Quiz 1.1') + ':' + s.id] = { m: 1 };
    expect(core.classGrade(db, c.id, s.id).overall).toBe(0);
    db.grades[id('Quiz 1.1') + ':' + s.id] = { x: 1 };
    expect(core.classGrade(db, c.id, s.id).overall).toBeNull();
  });
  it('allows extra credit above 100', () => {
    const db = setup(), c = db.classes[0], s = db.students[0];
    db.grades[db.assignments.find((a) => a.name === 'Quiz 1.1').id + ':' + s.id] = { s: 11 };
    expect(core.letterFor(db, core.classGrade(db, c.id, s.id).overall)).toBe('A+');
  });
  it('default weights match the syllabus (55 / 30 / 15)', () => {
    const w = core.DEFAULT_CATEGORIES;
    expect(w.reduce((a, c) => a + c.weight, 0)).toBe(100);
    expect(plain(w.map((c) => c.weight))).toEqual([35, 20, 20, 10, 15]);
  });
  it('parses score cells', () => {
    expect(plain(core.parseScore(''))).toEqual({ clear: true });
    expect(plain(core.parseScore(' m '))).toEqual({ g: { m: 1 } });
    expect(plain(core.parseScore('X'))).toEqual({ g: { x: 1 } });
    expect(plain(core.parseScore('9.5'))).toEqual({ g: { s: 9.5 } });
    expect(core.parseScore('abc').error).toBe(true);
    expect(core.parseScore('-1').error).toBe(true);
  });
});

describe('bell schedule', () => {
  it('uses the Mon/Wed/Fri timetable as the base', () => {
    const r = core.defaults().bell.mwf;
    expect(r.map((x) => `${x.name} ${x.start}-${x.end}`)).toEqual(['1 08:30-09:28', '2 09:34-10:32', '3 10:38-11:36', 'Lunch A 11:36-12:18', '4 12:24-13:22', '5 13:28-14:26', '6 14:32-15:30']);
    expect(core.bellIssues(r)).toEqual([]);
  });
  it('picks Tue/Thu by weekday', () => {
    expect(core.dayType(new Date(2026, 9, 6))).toBe('tth'); // Tue
    expect(core.dayType(new Date(2026, 9, 7))).toBe('mwf'); // Wed
    expect(core.dayType(new Date(2026, 9, 8))).toBe('tth'); // Thu
  });
  it('shifts and formats times', () => {
    const s = core.shiftBell(core.MWF, 5);
    expect(s[0].start).toBe('08:35'); expect(s[6].end).toBe('15:35');
    expect(core.fmt12('15:30')).toBe('3:30 PM'); expect(core.fmt12('00:05')).toBe('12:05 AM');
  });
  it('finds the current period', () => {
    expect(core.periodNow(core.MWF, new Date(2026, 9, 7, 9, 0))).toBe(0);
    expect(core.periodNow(core.MWF, new Date(2026, 9, 7, 9, 30))).toBe(-1);
    expect(core.periodNow(core.MWF, new Date(2026, 9, 7, 11, 40))).toBe(3);
  });
  it('flags overlapping or backwards times', () => {
    const r = core.shiftBell(core.MWF, 0); r[1].start = '09:00';
    expect(core.bellIssues(r).length).toBe(1);
    r[1].start = '10:40'; expect(core.bellIssues(r).length).toBeGreaterThan(0);
  });
});

describe('csv', () => {
  it('parses quotes, commas, newlines, BOM and CRLF', () => {
    expect(plain(core.parseCSV('﻿a,b\r\n"x, y","he said ""hi"""\r\n"l1\nl2",z'))).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['l1\nl2', 'z']]);
  });
  it('round-trips and neutralises spreadsheet formulas', () => {
    expect(core.csvCell('=1+1')).toBe("'=1+1");
    expect(core.csvCell('-5')).toBe('-5');
    const rows = [['a', 'b,c'], ['"q"', 'x']];
    expect(plain(core.parseCSV(core.buildCsv(rows)))).toEqual(rows);
  });
  it('normalises headers and dates', () => {
    expect(plain(core.csvRecords('First Name,Last-Name\nA,B').records[0])).toEqual({ _line: 2, first_name: 'A', last_name: 'B' });
    expect(core.normDate('2026-10-5')).toBe('2026-10-05'); expect(core.normDate('10/5/26')).toBe('2026-10-05');
    expect(core.normDate('2026-02-30')).toBeNull(); expect(core.normDate('')).toBe('');
  });
});

describe('imports', () => {
  it('imports the templates in order and is repeatable', () => {
    const db = core.defaults();
    let r = core.importStudents(db, core.buildCsv(core.TEMPLATES.students));
    expect([r.added, r.errors.length]).toEqual([2, 0]);
    expect(db.classes.map((c) => [c.name, c.period, c.studentIds.length])).toEqual([['Chemistry', 3, 2], ['Physics', 3, 1]]);
    r = core.importAssignments(db, core.buildCsv(core.TEMPLATES.assignments));
    expect([r.added, r.errors.length]).toEqual([3, 0]);
    r = core.importGrades(db, core.buildCsv(core.TEMPLATES.grades));
    expect([r.added, r.errors.length]).toEqual([4, 0]);
    const again = core.importStudents(db, core.buildCsv(core.TEMPLATES.students));
    expect([again.added, again.updated, db.students.length]).toEqual([0, 2, 2]);
    expect(core.importAssignments(db, core.buildCsv(core.TEMPLATES.assignments)).updated).toBe(3);
  });
  it('reports bad rows without stopping', () => {
    const db = setup();
    const r = core.importAssignments(db, 'class,name,category,points,due_date\nNope,A,Quizzes,5,\nChemistry,B,Quizzes,0,\nChemistry,C,Quizzes,5,notadate\nChemistry,D,Mystery,5,');
    expect(r.added).toBe(1); expect(r.errors.length).toBe(4);
    expect(db.categories.some((c) => c.name === 'Mystery' && c.weight === 0)).toBe(true);
  });
  it('rejects files missing required columns', () => {
    const db = core.defaults();
    expect(core.importStudents(db, 'name\nBob').errors[0]).toMatch(/first_name/);
    expect(core.importGrades(db, 'class,assignment\nx,y').errors[0]).toMatch(/score/);
    expect(core.importStudents(db, '').errors.length).toBe(1);
  });
});

describe('sanitizeDb', () => {
  it('falls back to defaults on junk', () => {
    expect(plain(core.sanitizeDb(null))).toEqual(plain(core.defaults()));
    expect(core.sanitizeDb({ scale: [], grades: [] }).scale.length).toBe(13);
  });
});

describe('student reports', () => {
  const full = () => {
    const db = setup(), s = db.students[0], c = db.classes[0];
    const id = (n) => db.assignments.find((a) => a.name === n).id;
    db.grades[id('Unit 1 Test') + ':' + s.id] = { s: 46 }; db.grades[id('Quiz 1.1') + ':' + s.id] = { m: 1 }; db.grades[id('Density Lab') + ':' + s.id] = { x: 1 };
    return { db, s, c };
  };
  it('lists each assignment with status, percent and whether it counts', () => {
    const { db, s, c } = full(), d = core.reportData(db, c.id, s.id);
    expect(d.items.map((i) => [i.name, i.status, i.earned, i.counts])).toEqual([['Quiz 1.1', 'Missing', 0, true], ['Density Lab', 'Excused', null, false], ['Unit 1 Test', 'Graded', 46, true]]);
    expect(d.items[2].percent).toBeCloseTo(92); expect(core.pctShort(93.333)).toBe('93.3%'); expect(core.pctShort(100)).toBe('100%');
    expect(d.cat.map((k) => k.name)).toEqual(['Unit Tests', 'Quizzes']);
    expect(d.letter).toBe(core.letterFor(db, d.overall));
  });
  it('can hide pending work', () => {
    const { db, s, c } = full(); db.students.push({ id: 'z', first: 'Z', last: 'Z', email: '' }); db.classes[0].studentIds.push('z');
    expect(core.reportData(db, c.id, 'z').items.length).toBe(3);
    expect(core.reportData(db, c.id, 'z', true).items.length).toBe(0);
    expect(core.reportData(db, c.id, s.id, true).items.length).toBe(3);
  });
  it('builds one page per student/class with only name and email', () => {
    const { db, c } = full();
    const doc = core.buildReportDoc(db, { pairs: db.students.map((s) => ({ classId: c.id, studentId: s.id })), tutor: 'Caden Erwin', note: 'Nice work', now: new Date(2026, 1, 13, 13, 1) });
    expect(doc.match(/<section class="page">/g).length).toBe(2);
    expect(doc).toContain('Lovelace, Ada'); expect(doc).toContain('ada@example.com'); expect(doc).toContain('02/13/2026 1:01 PM');
    expect(doc).toContain('Nice work'); expect(doc).toContain('Caden Erwin'); expect(doc).toContain('Unit 1 Test');
  });
  it('escapes everything it prints', () => {
    const { db, c } = full(); db.students[0].first = '<img src=x onerror=1>'; db.assignments[0].name = '<script>1</script>';
    const doc = core.buildReportDoc(db, { pairs: [{ classId: c.id, studentId: db.students[0].id }], note: '<b>x</b>', tutor: '<i>' });
    expect(doc).not.toMatch(/<img src=x|<script>1|<b>x<\/b>|<i>/);
  });
  it('exports a CSV of the same data', () => {
    const { db, s, c } = full(), rows = core.parseCSV(core.reportCsv(db, [{ classId: c.id, studentId: s.id }]));
    expect(rows[0].slice(0, 3)).toEqual(['first_name', 'last_name', 'email']); expect(rows.length).toBe(4);
    expect(rows.map((r) => r[12]).slice(1)).toEqual(['Missing', 'Excused', 'Graded']);
  });
  it('formats dates the way Aeries does', () => { expect(core.fmtDate('2026-01-05')).toBe('01/05/26'); expect(core.fmtDate('')).toBe(''); });
});

describe('student information is name + email only', () => {
  it('ignores other columns on import', () => {
    const db = core.defaults();
    core.importStudents(db, 'first_name,last_name,email,student_id,parent_phone\nA,B,a@b.c,99,555');
    expect(plain(db.students[0])).toEqual({ id: db.students[0].id, first: 'A', last: 'B', email: 'a@b.c' });
  });
  it('matches students by email, then by name', () => {
    const db = core.defaults();
    core.importStudents(db, 'first_name,last_name,email\nA,B,a@b.c'); core.importStudents(db, 'first_name,last_name,email\nAl,Bee,A@B.C');
    expect(db.students.length).toBe(1); expect(db.students[0].first).toBe('Al');
  });
  it('templates have no extra fields', () => expect(core.TEMPLATES.students[0]).toEqual(['first_name', 'last_name', 'email', 'class', 'period']));
});

describe('branding and logins', () => {
  it('is called OASIS', () => {
    expect(html).toContain('<title>OASIS 1.1.0</title>'); expect(html).toContain('<h1>OASIS</h1>'); expect(html).not.toMatch(/\bOasis\b/);
  });
  it('keeps no readable credentials in the source', () => {
    expect(html).not.toMatch(/[0-9a-f]{32}/i); // no hex salt or hash
    expect(html).not.toMatch(/Caden|Jayden|McCarthy|Erwin/); expect(html).not.toMatch(/\bAUTH\b/);
    expect(html).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]/i);
    expect(html).toContain('const ITER = 150000'); expect(html).toContain('PBKDF2');
  });
  it('spreads the packed records across the file', () => {
    const at = ['ROW_CACHE_A', 'MOTION_TBL_A', 'GRID_PAD_A', 'ROW_CACHE_B', 'MOTION_TBL_B', 'GRID_PAD_B', 'LAYOUT_SEED'].map((n) => html.indexOf(`${n} = '`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect(Math.max(...at) - Math.min(...at)).toBeGreaterThan(html.length * 0.3);
  });
});

describe('encrypted data file', () => {
  const salt = new Uint8Array(16).fill(7);
  const data = () => { const db = setup(); db.students[0].first = 'Zelda'; return db; };
  it('round-trips a tutor\'s data and hides it from anyone without the password', async () => {
    const v = await core.deriveVault('umber-test-1', salt), db = data();
    const f = await core.sealDb(v, 'caden', db);
    expect(Object.keys(f).sort()).toEqual(['ct', 'iter', 'iv', 'salt', 'v']);
    expect(Buffer.from(f.ct, 'base64').toString('latin1')).not.toContain('Zelda');
    expect(JSON.stringify(f)).not.toContain('Lovelace');
    expect(plain(await core.openDb(v, 'caden', f))).toEqual(plain(core.sanitizeDb(db)));
  });
  it('is not readable with another password, another tutor id, or after tampering', async () => {
    const v = await core.deriveVault('umber-test-1', salt), f = await core.sealDb(v, 'caden', data());
    await expect(core.openDb(await core.deriveVault('wrong', salt), 'caden', f)).rejects.toThrow();
    await expect(core.openDb(v, 'jayden', f)).rejects.toThrow();
    const bytes = core.unb64(f.ct); bytes[3] ^= 1;
    await expect(core.openDb(v, 'caden', { ...f, ct: core.b64(bytes) })).rejects.toThrow();
  });
  it('uses a fresh IV every save and derives a separate write token', async () => {
    const v = await core.deriveVault('umber-test-1', salt), a = await core.sealDb(v, 'caden', data()), b = await core.sealDb(v, 'caden', data());
    expect(a.iv).not.toBe(b.iv); expect(a.ct).not.toBe(b.ct);
    expect(v.token).toMatch(/^[0-9a-f]{64}$/);
    expect((await core.deriveVault('umber-test-2', salt)).token).not.toBe(v.token);
  });
  it('handles large data (base64 in chunks)', async () => {
    const v = await core.deriveVault('pw', salt), db = data();
    for (let i = 0; i < 4000; i++) db.students.push({ id: 's' + i, first: 'S' + i, last: 'L' + i, email: `s${i}@example.com` });
    expect((await core.openDb(v, 'caden', await core.sealDb(v, 'caden', db))).students.length).toBe(4002);
  });
});

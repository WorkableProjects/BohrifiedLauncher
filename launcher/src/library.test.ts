import { describe, expect, it } from 'vitest';
import { ago, continueTarget, recentApps, score, searchApps, togglePin, touchRecent } from './library';
import { rank, type QuickItem } from './quick';

const apps = [
  { id: 'flow', name: 'Flow', description: 'A fluid whiteboard for online tutoring', keywords: ['draw', 'chemistry'] },
  { id: 'rubricable', name: 'Rubricable', description: 'Build graded rubrics', keywords: ['grading'] },
];

describe('recent apps', () => {
  it('puts the latest first and keeps one entry per app', () => {
    let r = touchRecent([], 'flow', 1);
    r = touchRecent(r, 'rubricable', 2);
    r = touchRecent(r, 'flow', 3);
    expect(r).toEqual([{ id: 'flow', at: 3 }, { id: 'rubricable', at: 2 }]);
  });
  it('caps the list', () => {
    let r = touchRecent([], 'a0', 0);
    for (let i = 1; i < 20; i++) r = touchRecent(r, `a${i}`, i);
    expect(r).toHaveLength(8);
    expect(r[0].id).toBe('a19');
  });
  it('continues with the most recent app that is still registered', () => {
    const r = [{ id: 'gone', at: 5 }, { id: 'rubricable', at: 4 }, { id: 'flow', at: 3 }];
    expect(continueTarget(r, apps)).toEqual({ id: 'rubricable', at: 4 });
    expect(continueTarget([], apps)).toBeNull();
    expect(recentApps(r, apps).map((a) => a.id)).toEqual(['rubricable', 'flow']);
  });
});

describe('pins', () => {
  it('toggles', () => {
    expect(togglePin([], 'flow')).toEqual(['flow']);
    expect(togglePin(['flow', 'rubricable'], 'flow')).toEqual(['rubricable']);
  });
});

describe('search', () => {
  it('ranks prefix > word prefix > substring > scattered letters', () => {
    expect(score('fl', 'Flow')).toBeGreaterThan(score('fl', 'Reflow'));
    expect(score('flo', 'Big Flow')).toBeGreaterThan(score('low', 'Flow'));
    expect(score('low', 'Flow')).toBeGreaterThan(score('fw', 'Flow'));
    expect(score('xyz', 'Flow')).toBe(0);
  });
  it('finds apps by name, keyword and description, best first', () => {
    expect(searchApps('rub', apps).map((a) => a.id)).toEqual(['rubricable']);
    expect(searchApps('chem', apps).map((a) => a.id)).toEqual(['flow']);
    expect(searchApps('tutoring', apps).map((a) => a.id)).toEqual(['flow']);
    expect(searchApps('', apps)).toHaveLength(2);
    expect(searchApps('zzz', apps)).toEqual([]);
  });
});

describe('quick launcher ranking', () => {
  const items: QuickItem[] = [
    { id: 'a', group: 'Apps', label: 'Flow', keywords: 'whiteboard', run() {} },
    { id: 'w', group: 'Windows', label: 'Snap window to the left', keywords: 'tile half', run() {} },
    { id: 'h', group: 'Bohrified', label: 'Show Bohrified home', run() {} },
  ];
  it('keeps order for an empty query and filters otherwise', () => {
    expect(rank('', items)).toHaveLength(3);
    expect(rank('snap', items).map((i) => i.id)).toEqual(['w']);
    expect(rank('tile', items).map((i) => i.id)).toEqual(['w']);
    expect(rank('home', items).map((i) => i.id)).toEqual(['h']);
    expect(rank('nope', items)).toEqual([]);
  });
});

describe('ago', () => {
  const now = 1_000_000_000_000;
  it('formats relative time', () => {
    expect(ago(now - 5_000, now)).toBe('just now');
    expect(ago(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(ago(now - 3 * 3600_000, now)).toBe('3 hours ago');
    expect(ago(now - 86400_000, now)).toBe('yesterday');
  });
});

import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newDeck, newShape, newSlide, newText } from '../model/defaults';
import { isProjectFile, packProject, sanitizeDeck, unpackProject } from './project';

function sample() {
  const deck = newDeck('Test');
  deck.slides.push(newSlide({ elements: [newText(deck.theme, 'Hi'), newShape('rect', 0, 0, 10, 10)] }));
  deck.assets.a1 = { id: 'a1', name: 'pic.png', kind: 'image', mime: 'image/png', bytes: 3 };
  deck.assets.a2 = { id: 'a2', name: 'v.svg', kind: 'svg', mime: 'image/svg+xml', bytes: 5 };
  const blobs = new Map<string, Blob>([
    ['a1', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })],
    ['a2', new Blob(['<svg/>'], { type: 'image/svg+xml' })],
    ['orphan', new Blob(['x'])],
  ]);
  return { deck, blobs };
}

describe('project round trip', () => {
  it('packs and unpacks', async () => {
    const { deck, blobs } = sample();
    const packed = await packProject(deck, blobs);
    const out = await unpackProject(packed);
    expect(out.deck).toEqual(deck);
    expect([...out.blobs.keys()].sort()).toEqual(['a1', 'a2']);
    expect(out.blobs.get('a1')!.type).toBe('image/png');
    expect(Array.from(new Uint8Array(await out.blobs.get('a1')!.arrayBuffer()))).toEqual([1, 2, 3]);
  });

  it('drops asset files not in deck.assets', async () => {
    const { deck } = sample();
    const zip = zipSync({
      'frames.json': strToU8('{"format":"frames-project","version":1,"app":"Frames"}'),
      'deck.json': strToU8(JSON.stringify(deck)),
      'assets/a1': new Uint8Array([9]),
      'assets/zzz': new Uint8Array([9]),
      '../evil': new Uint8Array([9]),
    });
    const out = await unpackProject(zip);
    expect([...out.blobs.keys()]).toEqual(['a1']);
  });

  it('rejects non-projects with friendly errors', async () => {
    await expect(unpackProject(strToU8('hello'))).rejects.toThrow("This isn't a Frames project.");
    await expect(unpackProject(zipSync({ 'a.txt': strToU8('x') }))).rejects.toThrow("This isn't a Frames project.");
    const newer = zipSync({ 'frames.json': strToU8('{"format":"frames-project","version":2}'), 'deck.json': strToU8('{}') });
    await expect(unpackProject(newer)).rejects.toThrow('newer version');
  });
});

describe('sanitizeDeck', () => {
  it('fills missing fields', () => {
    const d = sanitizeDeck({
      v: 1,
      theme: newDeck().theme,
      size: { w: 100, h: 50 },
      slides: [{ elements: [{ type: 'group', x: 'bad', children: [{ type: 'shape' }, 5] }] }],
    });
    expect(d.styles).toEqual([]);
    expect(d.layouts).toEqual([]);
    expect(d.assets).toEqual({});
    expect(d.master.elements).toEqual([]);
    const s = d.slides[0]!;
    expect(s.id).toBeTruthy();
    expect(s.notes).toBe('');
    expect(s.anims).toEqual([]);
    const g = s.elements[0]!;
    expect(g).toMatchObject({ x: 0, y: 0, w: 0, h: 0, rot: 0, opacity: 1 });
    expect(g.id).toBeTruthy();
    expect(g.type === 'group' && g.children).toHaveLength(1);
  });

  it('throws on junk', () => {
    expect(() => sanitizeDeck(null)).toThrow();
    expect(() => sanitizeDeck({ v: 1 })).toThrow();
    expect(() => sanitizeDeck({ v: 9, slides: [], theme: {}, size: { w: 1, h: 1 } })).toThrow('newer');
  });
});

describe('isProjectFile', () => {
  it('matches by extension or mime', () => {
    expect(isProjectFile('Deck.FRAMES', '')).toBe(true);
    expect(isProjectFile('x', 'application/x-frames-project')).toBe(true);
    expect(isProjectFile('x.pptx', '')).toBe(false);
  });
});

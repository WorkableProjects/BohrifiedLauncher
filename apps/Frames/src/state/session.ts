import { clone } from '../model/clone';
import { newDeck, newSlide, SLIDE_SIZES, slideFromLayout } from '../model/defaults';
import type { Deck, ID, Slide } from '../model/types';
import { AssetStore } from '../render/assets';
import { collectGarbage, getAssetBlob, listDecks, loadDeck, saveDeck } from '../io/library';
import { sanitizeDeck } from '../io/project';
import { assetIdsOf } from '../model/ops';
import { DocStore } from './doc';
import { prefs } from './prefs';
import { toast, ui } from './ui';

/**
 * The editor's singletons: the open document, its media, and autosave. They
 * live outside React so the canvas, the thumbnails and the Bohrified
 * lifecycle can all reach them without prop drilling.
 */

export const doc = new DocStore(newDeck());

const redrawListeners = new Set<() => void>();
export const onRedraw = (fn: () => void) => {
  redrawListeners.add(fn);
  return () => redrawListeners.delete(fn);
};
export const requestRedraw = () => redrawListeners.forEach((fn) => fn());

export const assets = new AssetStore(getAssetBlob, () => doc.deck.assets, () => {
  requestRedraw();
  ui.set((s) => ({ tick: s.tick + 1 }));
});

export const currentSlide = (): Slide | undefined => doc.deck.slides.find((s) => s.id === ui.get().slideId) ?? doc.deck.slides[0];

// ── Open / create ────────────────────────────────────────────────────────────

export function activate(deck: Deck, opts: { screen?: 'editor' } = {}) {
  doc.load(deck);
  const first = deck.slides[0]?.id ?? '';
  ui.set({ screen: opts.screen ?? 'editor', slideId: first, slideSel: first ? [first] : [], sel: [], group: null, editing: null, tool: 'select', zoom: 'fit', pan: { x: 0, y: 0 }, playhead: null, preview: null, animSel: [], presenting: null });
  assets.release();
  requestRedraw();
}

export function createDeck(opts: { template?: Deck; title?: string } = {}): Deck {
  const p = prefs.get();
  const size = SLIDE_SIZES[p.slideSize] ?? SLIDE_SIZES['16:9'];
  let deck: Deck;
  if (opts.template) {
    deck = clone(opts.template);
    deck.id = newDeck().id;
    deck.created = deck.updated = Date.now();
    if (opts.title) deck.title = opts.title;
  } else {
    deck = newDeck(opts.title ?? 'Untitled presentation', { size });
    const title = deck.layouts.find((l) => l.name === 'Title')!;
    const s = slideFromLayout(title);
    deck.slides.push(s);
  }
  if (!deck.slides.length) deck.slides.push(newSlide());
  return deck;
}

export async function openDeck(id: ID): Promise<boolean> {
  ui.set({ loading: true });
  try {
    const raw = await loadDeck(id);
    if (!raw) return false;
    const deck = sanitizeDeck(clone(raw));
    if (!deck.slides.length) deck.slides.push(newSlide());
    activate(deck);
    return true;
  } catch {
    toast('That presentation could not be opened.');
    return false;
  } finally {
    ui.set({ loading: false });
  }
}

export async function recentDecks() {
  return listDecks();
}

// ── Autosave ─────────────────────────────────────────────────────────────────

let saveTimer = 0;
let saving: Promise<void> = Promise.resolve();
let thumbMaker: ((deck: Deck) => Promise<string | undefined>) | null = null;
export const setThumbMaker = (fn: typeof thumbMaker) => (thumbMaker = fn);

export function saveNow(force = false): Promise<void> {
  clearTimeout(saveTimer);
  if (ui.get().screen !== 'editor' || (!force && !doc.dirty)) return saving;
  const deck = doc.deck;
  const version = doc.version;
  saving = saving.then(async () => {
    try {
      const thumb = await thumbMaker?.(deck);
      await saveDeck(deck, thumb);
      if (doc.version === version) doc.markSaved();
    } catch {
      toast('Could not save. Check your storage.');
    }
  });
  return saving;
}

export function startAutosave(): () => void {
  const off = doc.subscribe(() => {
    if (ui.get().screen !== 'editor') return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveNow(), 800);
  });
  return () => {
    off();
    clearTimeout(saveTimer);
  };
}

/** Drop media the deck no longer uses (explicit clean-up; also clears undo history, which could refer to it). */
export async function cleanUpMedia(): Promise<number> {
  const used = assetIdsOf(doc.deck);
  const stale = Object.keys(doc.deck.assets).filter((id) => !used.has(id));
  if (!stale.length) return 0;
  const next = clone(doc.deck);
  for (const id of stale) delete next.assets[id];
  doc.load(next);
  await saveNow();
  await collectGarbage();
  assets.retainOnly(used);
  return stale.length;
}

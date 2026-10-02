import { clone } from '../model/clone';
import { newSlide } from '../model/defaults';
import type { Deck } from '../model/types';
import { listDecks, deleteDeck as dbDelete, getAssetBlob, putAsset, loadDeck, saveDeck } from '../io/library';
import { activate, assets, createDeck, doc, openDeck, saveNow } from '../state/session';
import { toast, ui } from '../state/ui';

/** Top-level flows: home ⇄ editor, presenting, opening and importing files. */

export async function goHome() {
  await saveNow();
  ui.set({ screen: 'home', presenting: null, editing: null, dialog: null });
}

export async function saveAndToast() {
  await saveNow(true);
  toast('Saved');
}

export function startPresenting(here: boolean) {
  const i = here ? Math.max(0, doc.deck.slides.findIndex((s) => s.id === ui.get().slideId)) : 0;
  void saveNow();
  ui.set({ editing: null, presenting: { from: i }, preview: null, playhead: null });
}

export async function newPresentation(template?: Deck) {
  const deck = createDeck({ template });
  activate(deck);
  await saveNow(true);
}

export async function open(id: string) {
  await openDeck(id);
}

export async function removeDeck(id: string) {
  await dbDelete(id);
}

export async function duplicateDeck(id: string) {
  const d = await loadDeck(id);
  if (!d) return;
  const copy = clone(d);
  copy.id = createDeck().id;
  copy.title = `${d.title} copy`;
  copy.created = copy.updated = Date.now();
  await saveDeck(copy);
}

export { listDecks, assets, getAssetBlob, putAsset, newSlide };

import { pageThumbnail } from '../engine/export';
import { deleteLesson, loadLesson, readDocumentFile, saveLesson } from '../engine/persistence';
import { createDocument, createPage } from '../engine/store';
import { boardTheme } from '../engine/theme';
import type { Background, FlowDocument } from '../engine/types';
import { uid } from '../engine/geometry';
import { board } from './board';

/** A lesson nobody has touched yet — not worth a slot in Recents. */
export const isPristine = (doc: FlowDocument) =>
  doc.pages.length === 1 && doc.pages[0].elements.length === 0 && doc.title === createDocument().title;

/** Persist the open lesson (with a fresh first-page thumbnail). */
export async function saveCurrent() {
  const doc = board.doc;
  if (isPristine(doc)) return;
  let thumb: string | undefined;
  try {
    thumb = pageThumbnail(doc.pages[0], boardTheme('light'), 320, 200);
  } catch { /* thumbnail is optional */ }
  await saveLesson(doc, thumb);
}

/** Save and close the open lesson; untouched lessons are discarded. */
export async function closeCurrent() {
  const doc = board.doc;
  if (isPristine(doc)) await deleteLesson(doc.id).catch(() => {});
  else await saveCurrent();
}

export function newLesson(background: Background = 'dots') {
  const doc = createDocument();
  doc.pages = [createPage('Page 1', background)];
  doc.activePage = doc.pages[0].id;
  board.load(doc);
}

export async function openLesson(id: string): Promise<boolean> {
  const doc = await loadLesson(id);
  if (!doc) return false;
  board.load(doc);
  return true;
}

/** Import a .flow file as a lesson (a fresh id if it's already in the library). */
export async function importLesson(file: File, existing: ReadonlySet<string>) {
  const doc = await readDocumentFile(file);
  if (existing.has(doc.id)) doc.id = uid();
  board.load(doc);
  await saveCurrent();
}

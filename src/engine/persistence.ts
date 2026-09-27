import { isFlowDocument } from './store';
import type { FlowDocument } from './types';

/**
 * Lesson library in IndexedDB (documents with images easily exceed the
 * ~5 MB localStorage quota) plus .flow file import/export.
 */

const DB = 'flow';
const DB_VERSION = 2;
/** v1 single-document store, migrated on upgrade. */
const LEGACY = 'documents';
const LESSONS = 'lessons';
const SUMMARIES = 'summaries';

/** Lightweight index entry for the Home screen (no element data). */
export interface LessonSummary {
  id: string;
  title: string;
  updatedAt: number;
  pages: number;
  /** Small PNG data URL of the first page. */
  thumb?: string;
}

export const summarize = (doc: FlowDocument, thumb?: string): LessonSummary => ({
  id: doc.id,
  title: doc.title,
  updatedAt: doc.updatedAt,
  pages: doc.pages.length,
  thumb,
});

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LESSONS)) db.createObjectStore(LESSONS);
      if (!db.objectStoreNames.contains(SUMMARIES)) db.createObjectStore(SUMMARIES);
      // Carry the pre-1.0 autosave over as the first lesson.
      if (db.objectStoreNames.contains(LEGACY)) {
        const tx = req.transaction!;
        const get = tx.objectStore(LEGACY).get('current');
        get.onsuccess = () => {
          const doc = get.result;
          if (isFlowDocument(doc)) {
            tx.objectStore(LESSONS).put(doc, doc.id);
            tx.objectStore(SUMMARIES).put(summarize(doc), doc.id);
          }
          db.deleteObjectStore(LEGACY);
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function request<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Recent lessons, most recently edited first. */
export async function listLessons(): Promise<LessonSummary[]> {
  try {
    const all = await request<LessonSummary[]>(SUMMARIES, 'readonly', (s) => s.getAll());
    return all.filter((x) => x && typeof x.id === 'string').sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function loadLesson(id: string): Promise<FlowDocument | null> {
  try {
    const doc = await request<unknown>(LESSONS, 'readonly', (s) => s.get(id));
    return isFlowDocument(doc) ? doc : null;
  } catch {
    return null;
  }
}

export async function saveLesson(doc: FlowDocument, thumb?: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([LESSONS, SUMMARIES], 'readwrite');
      tx.objectStore(LESSONS).put(doc, doc.id);
      tx.objectStore(SUMMARIES).put(summarize(doc, thumb), doc.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Flow: save failed', err);
  }
}

export async function deleteLesson(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([LESSONS, SUMMARIES], 'readwrite');
    tx.objectStore(LESSONS).delete(id);
    tx.objectStore(SUMMARIES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFilename = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'flow';

export function exportDocument(doc: FlowDocument) {
  downloadBlob(new Blob([JSON.stringify(doc)], { type: 'application/json' }), `${safeFilename(doc.title)}.flow`);
}

export async function readDocumentFile(file: File): Promise<FlowDocument> {
  const parsed = JSON.parse(await file.text());
  if (!isFlowDocument(parsed)) throw new Error('Not a Flow document');
  return parsed;
}

/** Read an image file as a data URL, downscaled so documents stay light. */
export function readImageFile(file: Blob, maxDim = 2048): Promise<{ src: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const type = file.type === 'image/png' || file.type === 'image/svg+xml' ? 'image/png' : 'image/jpeg';
      resolve({ src: c.toDataURL(type, 0.9), w, h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

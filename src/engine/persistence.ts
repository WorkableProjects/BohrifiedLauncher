import { isFlowDocument } from './store';
import type { FlowDocument } from './types';

/**
 * Autosave to IndexedDB (documents with images easily exceed the ~5 MB
 * localStorage quota) plus .flow file import/export.
 */

const DB = 'flow';
const STORE = 'documents';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAutosave(): Promise<FlowDocument | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(isFlowDocument(req.result) ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveAutosave(doc: FlowDocument): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(doc, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Flow: autosave failed', err);
  }
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

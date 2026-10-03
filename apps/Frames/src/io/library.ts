import type { AssetMeta, BrandKit, Deck, ID, SavedComponent, SavedPreset, SavedStyle, SavedTemplate } from '../model/types';
import { assetIdsOf } from '../model/ops';

/**
 * Persistence: decks, their media, and the cross-deck library (styles, brand
 * kits, components, presets, templates) in IndexedDB. When IndexedDB is
 * unavailable (private windows, blocked storage) everything still works for
 * the session from an in-memory backend.
 */

export interface DeckSummary {
  id: ID;
  title: string;
  updated: number;
  created: number;
  slides: number;
  size: { w: number; h: number };
  /** A small JPEG data URL of the first slide. */
  thumb?: string;
  assetIds: ID[];
}

const STORES = ['decks', 'index', 'assets', 'brands', 'styles', 'components', 'presets', 'templates'] as const;
export type StoreName = (typeof STORES)[number];

interface AssetRecord { id: ID; meta: AssetMeta; blob: Blob }

interface Backend {
  get<T>(store: StoreName, key: ID): Promise<T | undefined>;
  put(store: StoreName, value: object & { id: ID }): Promise<void>;
  del(store: StoreName, key: ID): Promise<void>;
  all<T>(store: StoreName): Promise<T[]>;
}

class MemoryBackend implements Backend {
  private data = new Map<StoreName, Map<ID, unknown>>();
  private s(store: StoreName) {
    let m = this.data.get(store);
    if (!m) this.data.set(store, (m = new Map()));
    return m;
  }
  async get<T>(store: StoreName, key: ID) {
    return this.s(store).get(key) as T | undefined;
  }
  async put(store: StoreName, value: object & { id: ID }) {
    this.s(store).set(value.id, value);
  }
  async del(store: StoreName, key: ID) {
    this.s(store).delete(key);
  }
  async all<T>(store: StoreName) {
    return [...this.s(store).values()] as T[];
  }
}

class IdbBackend implements Backend {
  constructor(private db: IDBDatabase) {}
  private run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  get<T>(store: StoreName, key: ID) {
    return this.run<T | undefined>(store, 'readonly', (s) => s.get(key));
  }
  async put(store: StoreName, value: object & { id: ID }) {
    await this.run(store, 'readwrite', (s) => s.put(value));
  }
  async del(store: StoreName, key: ID) {
    await this.run(store, 'readwrite', (s) => s.delete(key));
  }
  all<T>(store: StoreName) {
    return this.run<T[]>(store, 'readonly', (s) => s.getAll());
  }
}

let backend: Promise<Backend> | null = null;
function open(): Promise<Backend> {
  backend ??= new Promise<Backend>((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(new MemoryBackend());
    try {
      const req = indexedDB.open('frames', 1);
      req.onupgradeneeded = () => {
        for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(new IdbBackend(req.result));
      req.onerror = () => resolve(new MemoryBackend());
      req.onblocked = () => resolve(new MemoryBackend());
    } catch {
      resolve(new MemoryBackend());
    }
  });
  return backend;
}

// ── Decks ────────────────────────────────────────────────────────────────────

export async function saveDeck(deck: Deck, thumb?: string): Promise<void> {
  const b = await open();
  const prev = await b.get<DeckSummary>('index', deck.id);
  const summary: DeckSummary = {
    id: deck.id,
    title: deck.title,
    updated: deck.updated,
    created: deck.created,
    slides: deck.slides.length,
    size: deck.size,
    thumb: thumb ?? prev?.thumb,
    assetIds: [...assetIdsOf(deck)],
  };
  await b.put('decks', deck);
  await b.put('index', summary);
}

export async function loadDeck(id: ID): Promise<Deck | undefined> {
  const b = await open();
  return b.get<Deck>('decks', id);
}

export async function listDecks(): Promise<DeckSummary[]> {
  const b = await open();
  return (await b.all<DeckSummary>('index')).sort((a, c) => c.updated - a.updated);
}

export async function deleteDeck(id: ID): Promise<void> {
  const b = await open();
  await b.del('decks', id);
  await b.del('index', id);
  await collectGarbage();
}

/** Remove media no saved deck refers to. */
export async function collectGarbage(): Promise<number> {
  const b = await open();
  const used = new Set<ID>();
  for (const s of await b.all<DeckSummary>('index')) s.assetIds.forEach((a) => used.add(a));
  for (const kind of ['components', 'templates', 'styles'] as const) {
    for (const rec of await b.all<{ assets?: Record<ID, unknown> }>(kind)) Object.keys(rec.assets ?? {}).forEach((a) => used.add(a));
  }
  for (const k of await b.all<BrandKit>('brands')) if (k.logo) used.add(k.logo);
  let removed = 0;
  for (const rec of await b.all<AssetRecord>('assets')) {
    if (!used.has(rec.id)) {
      await b.del('assets', rec.id);
      removed++;
    }
  }
  return removed;
}

// ── Assets ───────────────────────────────────────────────────────────────────

export async function putAsset(meta: AssetMeta, blob: Blob): Promise<void> {
  const b = await open();
  const rec: AssetRecord = { id: meta.id, meta, blob };
  await b.put('assets', rec);
}

export async function getAssetBlob(id: ID): Promise<Blob | undefined> {
  const b = await open();
  return (await b.get<AssetRecord>('assets', id))?.blob;
}

export async function getAssetBlobs(ids: Iterable<ID>): Promise<Map<ID, Blob>> {
  const out = new Map<ID, Blob>();
  for (const id of ids) {
    const blob = await getAssetBlob(id);
    if (blob) out.set(id, blob);
  }
  return out;
}

export async function deleteAsset(id: ID): Promise<void> {
  const b = await open();
  await b.del('assets', id);
}

// ── Library ──────────────────────────────────────────────────────────────────

type LibraryMap = {
  brands: BrandKit;
  styles: SavedStyle;
  components: SavedComponent;
  presets: SavedPreset;
  templates: SavedTemplate;
};

export const library = {
  async all<K extends keyof LibraryMap>(store: K): Promise<LibraryMap[K][]> {
    const b = await open();
    return (await b.all<LibraryMap[K]>(store)).sort((a, c) => ((c as { created?: number }).created ?? 0) - ((a as { created?: number }).created ?? 0));
  },
  async put<K extends keyof LibraryMap>(store: K, value: LibraryMap[K]): Promise<void> {
    const b = await open();
    await b.put(store, value);
  },
  async remove(store: keyof LibraryMap, id: ID): Promise<void> {
    const b = await open();
    await b.del(store, id);
    await collectGarbage();
  },
};

/** A blob as a data URL (library items embed their media so they travel between decks). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

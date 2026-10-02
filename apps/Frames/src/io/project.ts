import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { solid } from '../model/defaults';
import { uid } from '../model/ids';
import type { AssetMeta, Deck, El, Layout, Master, Slide } from '../model/types';

/** The `.frames` project file: a zip with deck.json, frames.json and assets/<id>. */

export const PROJECT_EXT = '.frames';
export const PROJECT_MIME = 'application/x-frames-project';
const FORMAT = 'frames-project';
const VERSION = 1;
/** Refuse archives that would inflate beyond this (zip-bomb guard). */
const MAX_UNCOMPRESSED = 1.5 * 1024 * 1024 * 1024;

export function isProjectFile(name: string, type: string): boolean {
  return name.toLowerCase().endsWith(PROJECT_EXT) || type === PROJECT_MIME;
}

// Svg and json compress well; everything else is already compressed.
const compressible = (meta: AssetMeta | undefined, mime: string) => meta?.kind === 'svg' || mime === 'image/svg+xml';

export async function packProject(deck: Deck, blobs: Map<string, Blob>): Promise<Blob> {
  const files: Zippable = {
    'frames.json': [strToU8(JSON.stringify({ format: FORMAT, version: VERSION, app: 'Frames' })), { level: 6 }],
    'deck.json': [strToU8(JSON.stringify(deck)), { level: 6 }],
  };
  for (const [id, blob] of blobs) {
    if (!deck.assets[id]) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    files[`assets/${id}`] = [bytes, { level: compressible(deck.assets[id], blob.type) ? 6 : 0 }];
  }
  const zipped = zipSync(files);
  return new Blob([zipped as BlobPart], { type: PROJECT_MIME });
}

async function toBytes(file: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (file instanceof Uint8Array) return file;
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  return new Uint8Array(await file.arrayBuffer());
}

const NOT_PROJECT = "This isn't a Frames project.";
const TOO_NEW = 'This project was made with a newer version of Frames.';

export async function unpackProject(file: Blob | ArrayBuffer | Uint8Array): Promise<{ deck: Deck; blobs: Map<string, Blob> }> {
  const bytes = await toBytes(file);
  let total = 0;
  let tooBig = false;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNCOMPRESSED) tooBig = true;
        // Only the files we know about; this also drops traversal names like ../x.
        return !tooBig && (f.name === 'deck.json' || f.name === 'frames.json' || f.name.startsWith('assets/'));
      },
    });
  } catch {
    throw new Error(tooBig ? 'This project is too large to open.' : NOT_PROJECT);
  }
  if (tooBig) throw new Error('This project is too large to open.');

  const rawDeck = entries['deck.json'];
  if (!rawDeck) throw new Error(NOT_PROJECT);
  const marker = entries['frames.json'];
  if (marker) {
    try {
      const m = JSON.parse(strFromU8(marker)) as { format?: unknown; version?: unknown };
      if (m.format !== FORMAT) throw new Error(NOT_PROJECT);
      if (typeof m.version === 'number' && m.version > VERSION) throw new Error(TOO_NEW);
    } catch (e) {
      throw e instanceof Error && (e.message === TOO_NEW || e.message === NOT_PROJECT) ? e : new Error(NOT_PROJECT);
    }
  }

  let json: unknown;
  try {
    json = JSON.parse(strFromU8(rawDeck));
  } catch {
    throw new Error('This project file is damaged.');
  }
  const deck = sanitizeDeck(json);

  const blobs = new Map<string, Blob>();
  for (const [id, meta] of Object.entries(deck.assets)) {
    const data = entries[`assets/${id}`];
    if (data) blobs.set(id, new Blob([data as BlobPart], { type: meta.mime }));
  }
  return { deck, blobs };
}

// ── Sanitising ───────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function sanitizeEl(raw: unknown): El | null {
  if (!isRec(raw) || typeof raw.type !== 'string') return null;
  const el = raw as unknown as El & Rec;
  el.id = typeof el.id === 'string' && el.id ? el.id : uid('e');
  el.x = finite(el.x, 0);
  el.y = finite(el.y, 0);
  el.w = finite(el.w, 0);
  el.h = finite(el.h, 0);
  el.rot = finite(el.rot, 0);
  el.opacity = finite(el.opacity, 1);
  if (el.type === 'group') el.children = sanitizeEls(el.children);
  return el;
}

function sanitizeEls(raw: unknown): El[] {
  return arr(raw).map(sanitizeEl).filter((e): e is El => e !== null);
}

function sanitizeSlide(raw: unknown): Slide {
  if (!isRec(raw)) throw new Error('This project file is damaged.');
  const s = raw as unknown as Slide & Rec;
  s.id = typeof s.id === 'string' && s.id ? s.id : uid('s');
  s.elements = sanitizeEls(s.elements);
  s.notes = typeof s.notes === 'string' ? s.notes : '';
  s.anims = arr(s.anims);
  s.transition = isRec(s.transition) ? s.transition : null;
  return s;
}

/** Normalise a loaded deck (project file or IndexedDB); throws if it isn't plausibly a deck. */
export function sanitizeDeck(raw: unknown): Deck {
  if (!isRec(raw) || !Array.isArray(raw.slides) || !isRec(raw.theme) || !isRec(raw.size)) throw new Error(NOT_PROJECT);
  if (typeof raw.v === 'number' && raw.v > VERSION) throw new Error(TOO_NEW);
  if (raw.v !== VERSION) throw new Error(NOT_PROJECT);
  const size = raw.size;
  if (finite(size.w, 0) <= 0 || finite(size.h, 0) <= 0) throw new Error(NOT_PROJECT);

  const deck = raw as unknown as Deck & Rec;
  const now = Date.now();
  deck.id = typeof deck.id === 'string' && deck.id ? deck.id : uid('d');
  deck.title = typeof deck.title === 'string' ? deck.title : 'Untitled presentation';
  deck.created = finite(deck.created, now);
  deck.updated = finite(deck.updated, deck.created);
  deck.margin = finite(deck.margin, 96);
  deck.styles = arr(deck.styles);
  deck.assets = isRec(deck.assets) ? (deck.assets as Deck['assets']) : {};
  deck.master = (isRec(deck.master) ? deck.master : { background: solid('@bg'), elements: [] }) as unknown as Master;
  deck.master.elements = sanitizeEls(deck.master.elements);
  deck.layouts = arr<Layout>(deck.layouts).filter(isRec).map((l) => ({ ...l, elements: sanitizeEls(l.elements) }));
  deck.slides = deck.slides.map(sanitizeSlide);
  return deck;
}

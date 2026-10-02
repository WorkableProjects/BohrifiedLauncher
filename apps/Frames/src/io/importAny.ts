import { newDeck, newImage, newSlide, SLIDE_SIZES } from '../model/defaults';
import { uid } from '../model/ids';
import type { Deck, Slide } from '../model/types';
import { prefs } from '../state/prefs';
import { putAsset, saveDeck } from './library';
import { isProjectFile, unpackProject } from './project';
import type { ImportResult } from './importPptx';

export type ImportKind = 'project' | 'outline' | 'pptx' | 'pdf' | 'image' | 'unknown';

export function kindOfFile(f: File): ImportKind {
  if (isProjectFile(f.name, f.type)) return 'project';
  if (/\.(json|txt|md)$/i.test(f.name) || f.type === 'application/json') return 'outline';
  if (/\.pptx$/i.test(f.name) || f.type.includes('presentationml')) return 'pptx';
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') return 'pdf';
  if (f.type.startsWith('image/') || /\.(svg|png|jpe?g|gif|webp|avif)$/i.test(f.name)) return 'image';
  return 'unknown';
}

export interface ImportOutcome {
  deck: Deck;
  warnings: string[];
}

/** Turn a dropped/picked file into a saved deck. Heavy parsers load only when needed. */
export async function importDeckFile(file: File, onProgress?: (done: number, total: number) => void): Promise<ImportOutcome> {
  const kind = kindOfFile(file);
  const size: { w: number; h: number } = { ...(SLIDE_SIZES[prefs.get().slideSize] ?? SLIDE_SIZES['16:9']) };
  const base = (title: string, slides: Slide[], theme?: Deck['theme'], sz: { w: number; h: number } = size): Deck => {
    const d = newDeck(title, { size: sz, theme });
    d.slides = slides.length ? slides : [newSlide()];
    return d;
  };

  if (kind === 'project') {
    const { deck, blobs } = await unpackProject(file);
    // A project brings its own ids; give the copy a fresh one so importing twice doesn't overwrite.
    deck.id = uid('d');
    for (const [id, blob] of blobs) {
      const meta = deck.assets[id];
      if (meta) await putAsset(meta, blob);
    }
    deck.updated = Date.now();
    await saveDeck(deck);
    return { deck, warnings: [] };
  }

  if (kind === 'outline') {
    const { extractOutlineJson, importOutline } = await import('./importOutline');
    return importOutline(extractOutlineJson(await file.text()));
  }

  if (kind === 'pptx') {
    const { importPptx } = await import('./importPptx');
    const deck0 = newDeck(file.name.replace(/\.pptx$/i, ''), { size });
    const res = await importPptx(file, deck0.theme, size);
    return await finish(res, base, file.name.replace(/\.pptx$/i, ''), size);
  }

  if (kind === 'pdf') {
    const { importPdf } = await import('./importPdf');
    const res = await importPdf(file, size, { onProgress });
    return await finish(res, base, file.name.replace(/\.pdf$/i, ''), size);
  }

  if (kind === 'image') {
    const bmp = await createImageBitmap(file).catch(() => null);
    const meta = { id: uid('m'), name: file.name, kind: /svg/i.test(file.type + file.name) ? ('svg' as const) : ('image' as const), mime: file.type, bytes: file.size, w: bmp?.width, h: bmp?.height };
    bmp?.close();
    await putAsset(meta, file);
    const k = Math.min(size.w / (meta.w ?? size.w), size.h / (meta.h ?? size.h));
    const w = (meta.w ?? size.w) * k, h = (meta.h ?? size.h) * k;
    const slide = newSlide({ elements: [newImage(meta.id, (size.w - w) / 2, (size.h - h) / 2, w, h)] });
    const deck = base(file.name.replace(/\.[^.]+$/, ''), [slide]);
    deck.assets[meta.id] = meta;
    await saveDeck(deck);
    return { deck, warnings: [] };
  }
  throw new Error("Frames can't open that kind of file. Try a .frames, .pptx, .pdf, a Frames outline (.json) or an image.");
}

async function finish(res: ImportResult, base: (t: string, s: Slide[], th?: Deck['theme'], sz?: { w: number; h: number }) => Deck, title: string, size: { w: number; h: number }): Promise<ImportOutcome> {
  const deck = base(res.title || title, res.slides, undefined, res.size ?? size);
  for (const a of res.assets) {
    deck.assets[a.meta.id] = a.meta;
    await putAsset(a.meta, a.blob);
  }
  await saveDeck(deck);
  return { deck, warnings: res.warnings };
}

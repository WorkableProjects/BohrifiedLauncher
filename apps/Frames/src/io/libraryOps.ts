import { clone } from '../model/clone';
import { cloneEl, cloneSlide } from '../model/defaults';
import { uid } from '../model/ids';
import * as ops from '../model/ops';
import type { AssetMeta, BrandKit, Deck, El, ID, SavedComponent, SavedStyle, SavedTemplate, Slide } from '../model/types';
import { blobToDataUrl, dataUrlToBlob, getAssetBlob, library, putAsset } from './library';

/**
 * Saving and reusing visual styles, templates, brand kits and components
 * across presentations. Library items embed the media they use (as data URLs),
 * so they survive the deck they came from being deleted.
 */

type Bundle = NonNullable<SavedTemplate['assets']>;

async function bundleAssets(deck: Deck, ids: Iterable<ID>): Promise<Bundle> {
  const out: Bundle = {};
  for (const id of ids) {
    const meta = deck.assets[id];
    const blob = await getAssetBlob(id);
    if (meta && blob) out[id] = { meta, data: await blobToDataUrl(blob) };
  }
  return out;
}

/** Restore a bundle's media into the media store; returns their metas for the deck. */
export async function restoreAssets(b: Bundle | undefined): Promise<Record<ID, AssetMeta>> {
  const metas: Record<ID, AssetMeta> = {};
  for (const [id, a] of Object.entries(b ?? {})) {
    await putAsset(a.meta, await dataUrlToBlob(a.data));
    metas[id] = a.meta;
  }
  return metas;
}

const idsIn = (els: readonly El[]) => assetIdsOf(els);
function assetIdsOf(els: readonly El[]): Set<ID> {
  const out = new Set<ID>();
  ops.walk(els, (e) => {
    if ((e.type === 'image' || e.type === 'video' || e.type === 'audio') && e.asset) out.add(e.asset);
    if ((e.type === 'text' || e.type === 'shape') && e.fill?.t === 'image') out.add(e.fill.asset);
  });
  return out;
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function saveDeckTemplate(deck: Deck, name: string): Promise<SavedTemplate> {
  const assets = await bundleAssets(deck, ops.assetIdsOf(deck));
  const t: SavedTemplate = { id: uid('t'), name, created: Date.now(), kind: 'presentation', deck: clone(deck), assets };
  await library.put('templates', t);
  return t;
}

export async function saveSlideTemplate(deck: Deck, slide: Slide, name: string): Promise<SavedTemplate> {
  const assets = await bundleAssets(deck, idsIn(slide.elements));
  const t: SavedTemplate = { id: uid('t'), name, created: Date.now(), kind: 'slide', slide: clone(slide), theme: clone(deck.theme), assets };
  await library.put('templates', t);
  return t;
}

export async function deckFromTemplate(t: SavedTemplate): Promise<Deck | null> {
  if (!t.deck) return null;
  const deck = clone(t.deck);
  deck.id = uid('d');
  deck.created = deck.updated = Date.now();
  Object.assign(deck.assets, await restoreAssets(t.assets));
  return deck;
}

/** A fresh copy of a saved slide, with its media restored; the caller inserts it. */
export async function slideFromTemplate(t: SavedTemplate): Promise<{ slide: Slide; assets: Record<ID, AssetMeta> } | null> {
  if (!t.slide) return null;
  return { slide: cloneSlide(t.slide), assets: await restoreAssets(t.assets) };
}

// ── Visual styles ────────────────────────────────────────────────────────────

export async function saveVisualStyle(deck: Deck, name: string): Promise<SavedStyle> {
  const used = new Set<ID>([...idsIn(deck.master.elements), ...deck.layouts.flatMap((l) => [...idsIn(l.elements)])]);
  if (deck.master.background.t === 'image') used.add(deck.master.background.asset);
  const s: SavedStyle = {
    id: uid('v'), name, created: Date.now(), theme: clone(deck.theme), master: clone(deck.master), layouts: clone(deck.layouts), styles: clone(deck.styles), size: { ...deck.size },
    assets: await bundleAssets(deck, used),
  };
  await library.put('styles', s);
  return s;
}

/** Re-skin a deck: new theme, master and layouts; slides keep their content and move onto matching layouts. */
export async function applyVisualStyle(style: SavedStyle): Promise<Record<ID, AssetMeta>> {
  return restoreAssets(style.assets);
}

export function applyStyleToDraft(d: Deck, style: SavedStyle, metas: Record<ID, AssetMeta>) {
  const oldLayouts = d.layouts;
  d.theme = clone(style.theme);
  d.master = clone(style.master);
  d.layouts = clone(style.layouts);
  d.styles = clone(style.styles);
  Object.assign(d.assets, metas);
  const byName = new Map(d.layouts.map((l) => [l.name, l.id]));
  const fallback = byName.get('Title and content') ?? d.layouts[0]?.id;
  for (const s of d.slides) {
    const oldName = oldLayouts.find((l) => l.id === s.layout)?.name;
    const next = (oldName && byName.get(oldName)) || fallback;
    if (next) ops.applyLayout(d, s.id, next);
  }
}

// ── Brand kits ───────────────────────────────────────────────────────────────

export async function saveBrandKit(deck: Deck, name: string, logo?: ID | null): Promise<BrandKit> {
  const kit: BrandKit = { id: uid('b'), name, colors: [deck.theme.colors.primary, deck.theme.colors.secondary, deck.theme.colors.accent, deck.theme.colors.text, deck.theme.colors.bg], fonts: { heading: deck.theme.fonts.heading, body: deck.theme.fonts.body }, logo: logo ?? null, theme: clone(deck.theme) };
  await library.put('brands', kit);
  return kit;
}

export function applyBrandKit(d: Deck, kit: BrandKit) {
  const [primary, secondary, accent, text, bg] = kit.colors;
  if (primary) d.theme.colors.primary = primary;
  if (secondary) d.theme.colors.secondary = secondary;
  if (accent) d.theme.colors.accent = accent;
  if (text) d.theme.colors.text = text;
  if (bg) d.theme.colors.bg = bg;
  d.theme.fonts.heading = kit.fonts.heading;
  d.theme.fonts.body = kit.fonts.body;
  d.theme.palette = [...new Set([...kit.colors, ...d.theme.palette])].slice(0, 10);
}

// ── Components ───────────────────────────────────────────────────────────────

export async function saveComponent(deck: Deck, el: El, name: string, libraryName = 'My components'): Promise<SavedComponent> {
  const c: SavedComponent = { id: uid('c'), name, library: libraryName, created: Date.now(), el: clone(el), assets: await bundleAssets(deck, idsIn([el])) };
  await library.put('components', c);
  return c;
}

export async function instantiateComponent(c: SavedComponent): Promise<{ el: El; assets: Record<ID, AssetMeta> }> {
  const assets = await restoreAssets(c.assets);
  return { el: cloneEl(clone(c.el)), assets };
}

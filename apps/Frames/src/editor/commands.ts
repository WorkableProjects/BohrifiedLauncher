import { clone } from '../model/clone';
import { makeAnim, rebuildAnim, type BuildCtx } from '../anim/presets';
import { CAMERA, findEl as findAnimEl } from '../anim/engine';
import { cloneEl, docText, newAudio, newChart, newIcon, newImage, newLine, newShape, newTable, newText, newVideo, plain } from '../model/defaults';
import { bounds, unionRects, type Rect } from '../model/geometry';
import { uid } from '../model/ids';
import * as ops from '../model/ops';
import type { AssetMeta, Deck, El, ID, Run, ShapeKind, Slide, SlideAnim, TextBase } from '../model/types';
import { putAsset } from '../io/library';
import { assets, currentSlide, doc, requestRedraw } from '../state/session';
import { toast, ui } from '../state/ui';

/** Everything the toolbar, menus, shortcuts and canvas can do to the document. UI code calls these; they call `doc`. */

// ── Selection ────────────────────────────────────────────────────────────────

export function selectedEls(): El[] {
  const s = currentSlide();
  if (!s) return [];
  const out: El[] = [];
  for (const id of ui.get().sel) {
    const e = ops.findEl(s.elements, id);
    if (e) out.push(e);
  }
  return out;
}

export const select = (ids: ID[], keepGroup = false) => ui.set((u) => ({ sel: ids, group: keepGroup ? u.group : ids.length ? u.group : null, editing: null }));

/** Elements that clicks can target at the current "level" (top level, or inside the entered group). */
export function pickable(s: Slide): El[] {
  const g = ui.get().group;
  if (g) {
    const grp = ops.findEl(s.elements, g);
    if (grp && grp.type === 'group') return grp.children;
  }
  return s.elements;
}

export function selectAll() {
  const s = currentSlide();
  if (s) select(pickable(s).filter((e) => !e.locked && !e.hidden).map((e) => e.id), true);
}

export function selectSlide(id: ID, mode: 'only' | 'toggle' | 'range' = 'only') {
  const { slideSel, slideId } = ui.get();
  const slides = doc.deck.slides;
  let next: ID[];
  if (mode === 'toggle') next = slideSel.includes(id) ? slideSel.filter((x) => x !== id) : [...slideSel, id];
  else if (mode === 'range') {
    const a = slides.findIndex((s) => s.id === slideId), b = slides.findIndex((s) => s.id === id);
    next = slides.slice(Math.min(a, b), Math.max(a, b) + 1).map((s) => s.id);
  } else next = [id];
  if (!next.length) next = [id];
  ui.set({ slideId: id, slideSel: next, sel: [], group: null, editing: null, playhead: null, preview: null, animSel: [] });
}

// ── Insert ───────────────────────────────────────────────────────────────────

function place(el: El, at?: { x: number; y: number }): El {
  const { w, h } = doc.deck.size;
  const n = (currentSlide()?.elements.length ?? 0) % 8;
  el.x = at ? at.x - el.w / 2 : Math.round((w - el.w) / 2) + n * 24;
  el.y = at ? at.y - el.h / 2 : Math.round((h - el.h) / 2) + n * 24;
  return el;
}

export function insert(els: El[], label = 'Insert'): void {
  const s = currentSlide();
  if (!s || !els.length) return;
  const group = ui.get().group;
  doc.commit(label, (d) => {
    if (group) {
      const g = ops.slideById(d, s.id) && ops.findEl(ops.slideById(d, s.id)!.elements, group);
      if (g && g.type === 'group') return void g.children.push(...els);
    }
    ops.addElements(d, s.id, els);
  });
  select(els.map((e) => e.id), true);
}

export function insertText(at?: { x: number; y: number }, kind: 'title' | 'heading' | 'body' | 'caption' = 'body', text = '') {
  const el = newText(doc.deck.theme, text, 0, 0, kind === 'title' ? 1400 : 800, kind);
  place(el, at);
  insert([el], 'Add text');
  ui.set({ editing: { type: 'text', id: el.id }, tool: 'select' });
  return el;
}

export function insertShape(kind: ShapeKind, rect?: Partial<Rect>) {
  const size = kind === 'ellipse' || kind === 'heart' || kind === 'star' ? 360 : 440;
  const el = newShape(kind, 0, 0, rect?.w ?? size, rect?.h ?? (kind === 'ellipse' || kind === 'heart' ? 360 : kind === 'pill' ? 160 : 300));
  if (rect?.x !== undefined && rect.y !== undefined) {
    el.x = rect.x;
    el.y = rect.y;
  } else place(el);
  insert([el], 'Add shape');
  ui.set({ tool: 'select' });
}

export function insertLine(rect?: { x: number; y: number; w: number; h: number; up?: boolean }, arrow = false) {
  const kind = ui.get().lineKind;
  const el = newLine(rect?.x ?? 0, rect?.y ?? 0, rect?.w ?? 520, rect?.h ?? 0, { up: rect?.up, curve: kind, end: arrow ? 'arrow' : 'none' });
  if (!rect) place(el);
  insert([el], 'Add line');
  ui.set({ tool: 'select' });
}

export function insertIcon(name: string) {
  const el = newIcon(name, 0, 0, 200);
  place(el);
  insert([el], 'Add icon');
}

export function insertTable(rows = 4, cols = 3) {
  const el = newTable(doc.deck.theme, rows, cols);
  place(el);
  insert([el], 'Add table');
}

export function insertChart(kind: Parameters<typeof newChart>[1] = 'column') {
  const el = newChart(doc.deck.theme, kind);
  place(el);
  insert([el], 'Add chart');
}

export function insertImagePlaceholder() {
  const el = newImage(null, 0, 0, 640, 420, { radius: 24 });
  place(el);
  insert([el], 'Add frame');
}

// ── Media import ─────────────────────────────────────────────────────────────

export interface Probed { meta: AssetMeta; blob: Blob }

function kindOf(f: File): AssetMeta['kind'] | null {
  if (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)) return 'svg';
  if (f.type.startsWith('image/')) return 'image';
  if (f.type.startsWith('video/')) return 'video';
  if (f.type.startsWith('audio/')) return 'audio';
  return null;
}

async function svgSize(blob: Blob): Promise<{ w: number; h: number }> {
  try {
    const text = await blob.text();
    const vb = /viewBox\s*=\s*["']\s*[\d.+-]+[\s,]+[\d.+-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
    if (vb) return { w: Number(vb[1]), h: Number(vb[2]) };
    const w = /\bwidth\s*=\s*["']([\d.]+)/i.exec(text), h = /\bheight\s*=\s*["']([\d.]+)/i.exec(text);
    if (w && h) return { w: Number(w[1]), h: Number(h[1]) };
  } catch { /* fall through */ }
  return { w: 512, h: 512 };
}

function mediaSize(kind: 'video' | 'audio', url: string): Promise<{ w: number; h: number; dur: number }> {
  return new Promise((resolve) => {
    const m = document.createElement(kind);
    m.preload = 'metadata';
    const done = () => resolve({ w: (m as HTMLVideoElement).videoWidth || 0, h: (m as HTMLVideoElement).videoHeight || 0, dur: Number.isFinite(m.duration) ? m.duration : 0 });
    m.onloadedmetadata = done;
    m.onerror = () => resolve({ w: 0, h: 0, dur: 0 });
    m.src = url;
  });
}

export async function probeFile(f: File): Promise<Probed | null> {
  const kind = kindOf(f);
  if (!kind) return null;
  const meta: AssetMeta = { id: uid('m'), name: f.name.replace(/\.[^.]+$/, ''), kind, mime: f.type || (kind === 'svg' ? 'image/svg+xml' : ''), bytes: f.size };
  if (kind === 'svg') Object.assign(meta, await svgSize(f));
  else if (kind === 'image') {
    try {
      const b = await createImageBitmap(f);
      meta.w = b.width;
      meta.h = b.height;
      b.close();
    } catch {
      return null;
    }
  } else {
    const url = URL.createObjectURL(f);
    const m = await mediaSize(kind, url);
    URL.revokeObjectURL(url);
    meta.w = m.w || undefined;
    meta.h = m.h || undefined;
    meta.dur = m.dur || undefined;
  }
  return { meta, blob: f };
}

/** Store media and register it with the deck. */
export async function registerAssets(list: Probed[]) {
  for (const p of list) await putAsset(p.meta, p.blob);
  doc.commit('Add media', (d) => {
    for (const p of list) d.assets[p.meta.id] = p.meta;
  });
}

function fit(w: number, h: number, maxW: number, maxH: number) {
  const k = Math.min(1, maxW / w, maxH / h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Import dropped/picked/pasted files as elements (or into a selected empty frame / replacing a selected image). */
export async function importFiles(files: File[], at?: { x: number; y: number }, opts: { replace?: boolean } = {}) {
  const probed = (await Promise.all(files.map(probeFile))).filter((p): p is Probed => !!p);
  if (!probed.length) {
    if (files.length) toast("Frames can't use that kind of file.");
    return;
  }
  await registerAssets(probed);
  const s = currentSlide();
  if (!s) return;
  const { w: sw, h: sh } = doc.deck.size;
  const sel = selectedEls();

  // A dropped image fills a selected image/frame (replacing keeps the layout).
  if (opts.replace && sel.length === 1 && (sel[0]!.type === 'image') && probed[0]!.meta.kind !== 'audio' && probed[0]!.meta.kind !== 'video') {
    const p = probed[0]!;
    doc.commit('Replace image', (d) => ops.replaceImageAsset(d, s.id, sel[0]!.id, p.meta.id, p.meta.w && p.meta.h ? { w: p.meta.w, h: p.meta.h } : undefined));
    assets.invalidate(p.meta.id);
    return;
  }

  const els: El[] = [];
  probed.forEach((p, i) => {
    const m = p.meta;
    if (m.kind === 'audio') els.push(newAudio(m.id, 0, 0));
    else {
      const nat = fit(m.w ?? 800, m.h ?? 600, sw * 0.6, sh * 0.6);
      const el = m.kind === 'video' ? newVideo(m.id, 0, 0, nat.w, nat.h) : newImage(m.id, 0, 0, nat.w, nat.h);
      el.name = m.name;
      els.push(el);
    }
    const e = els[els.length - 1]!;
    place(e, at ? { x: at.x + i * 40, y: at.y + i * 40 } : undefined);
    if (!at) {
      e.x += i * 40;
      e.y += i * 40;
    }
  });
  insert(els, els.length > 1 ? 'Add media' : 'Add ' + probed[0]!.meta.kind);
}

// ── Delete / duplicate / clipboard ───────────────────────────────────────────

export function deleteSelection() {
  const s = currentSlide();
  const ids = ui.get().sel;
  if (!s || !ids.length) return;
  doc.commit(ids.length > 1 ? 'Delete elements' : 'Delete', (d) => ops.deleteElements(d, s.id, ids));
  select([], true);
}

export function duplicateSelection(offset = 40) {
  const s = currentSlide();
  const els = selectedEls();
  if (!s || !els.length) return [];
  const idMap = new Map<string, string>();
  const copies = els.map((e) => {
    const c = cloneEl(clone(e), idMap);
    c.x += offset;
    c.y += offset;
    return c;
  });
  doc.commit('Duplicate', (d) => {
    ops.addElements(d, s.id, copies);
    const sl = ops.slideById(d, s.id)!;
    // Animations travel with duplicates.
    for (const a of s.anims) {
      const to = idMap.get(a.el);
      if (to) sl.anims.push({ ...clone(a), id: uid('a'), el: to });
    }
  });
  select(copies.map((c) => c.id), true);
  return copies;
}

interface Clip { els: El[]; anims: SlideAnim[]; text: string }
let clip: Clip | null = null;
try {
  const raw = localStorage.getItem('frames:clip');
  if (raw) clip = JSON.parse(raw) as Clip;
} catch { /* ignore */ }

function elText(els: El[]): string {
  return els.map((e) => ('doc' in e && e.doc ? docText(e.doc) : e.name ?? e.type)).join('\n');
}

export function copySelection(): boolean {
  const s = currentSlide();
  const els = selectedEls();
  if (!s || !els.length) return false;
  const ids = new Set(els.flatMap((e) => [...ops.allIds([e])]));
  clip = { els: clone(els), anims: clone(s.anims.filter((a) => ids.has(a.el))), text: elText(els) };
  try {
    localStorage.setItem('frames:clip', JSON.stringify(clip));
  } catch { /* too big: keep in memory only */ }
  void navigator.clipboard?.writeText(clip.text).catch(() => {});
  return true;
}

export function cutSelection() {
  if (copySelection()) deleteSelection();
}

/** Paste frames elements. Returns false if there's nothing of ours to paste. */
export function pasteElements(clipText?: string): boolean {
  const s = currentSlide();
  if (!s || !clip) return false;
  // Only treat our clip as current when the system clipboard text still matches it.
  if (clipText !== undefined && clipText !== '' && clipText !== clip.text) return false;
  const idMap = new Map<string, string>();
  const bump = 32;
  const copies = clip.els.map((e) => {
    const c = cloneEl(clone(e), idMap);
    c.x += bump;
    c.y += bump;
    return c;
  });
  const anims = clip.anims.map((a) => ({ ...clone(a), id: uid('a'), el: idMap.get(a.el) ?? a.el }));
  doc.commit('Paste', (d) => {
    ops.addElements(d, s.id, copies);
    ops.slideById(d, s.id)!.anims.push(...anims);
  });
  // Next paste lands further along.
  clip.els = clip.els.map((e) => ({ ...e, x: e.x + bump, y: e.y + bump }));
  select(copies.map((c) => c.id), true);
  return true;
}

export function pasteText(text: string) {
  if (!text.trim()) return;
  const el = newText(doc.deck.theme, '', 0, 0, 1000, 'body', { doc: plain(text.trim()) });
  place(el);
  insert([el], 'Paste text');
}

// ── Arrange ──────────────────────────────────────────────────────────────────

export function nudge(dx: number, dy: number) {
  const s = currentSlide();
  const ids = ui.get().sel;
  if (!s || !ids.length) return;
  doc.commit('Move', (d) => ops.moveBy(d, s.id, ids, dx, dy), 'nudge');
}

export function arrange(mode: ops.ArrangeMode) {
  const s = currentSlide();
  const ids = ui.get().sel;
  if (s && ids.length) doc.commit('Arrange', (d) => ops.reorder(d, s.id, ids, mode));
}

export function align(mode: ops.AlignMode, to?: 'selection' | 'slide') {
  const s = currentSlide();
  const ids = ui.get().sel;
  if (s && ids.length) doc.commit('Align', (d) => ops.alignElements(d, s.id, ids, mode, to));
}

export function distribute(axis: 'h' | 'v') {
  const s = currentSlide();
  const ids = ui.get().sel;
  if (s && ids.length > 2) doc.commit('Distribute', (d) => ops.distributeElements(d, s.id, ids, axis));
  else toast('Select three or more objects to distribute.');
}

export function group() {
  const s = currentSlide();
  const ids = ui.get().sel;
  if (!s || ids.length < 2) return toast('Select two or more objects to group.');
  let id = '';
  doc.commit('Group', (d) => {
    id = ops.groupElements(d, s.id, ids)?.id ?? '';
  });
  if (id) select([id]);
}

export function ungroup() {
  const s = currentSlide();
  const ids = selectedEls().filter((e) => e.type === 'group').map((e) => e.id);
  if (!s || !ids.length) return;
  let freed: ID[] = [];
  doc.commit('Ungroup', (d) => {
    freed = ops.ungroupElements(d, s.id, ids);
  });
  select(freed);
}

export function setLocked(locked: boolean, ids = ui.get().sel) {
  const s = currentSlide();
  if (s) doc.commit(locked ? 'Lock' : 'Unlock', (d) => ops.patchElements(d, s.id, ids, { locked: locked || undefined }));
}

export function setHidden(hidden: boolean, ids = ui.get().sel) {
  const s = currentSlide();
  if (s) doc.commit(hidden ? 'Hide' : 'Show', (d) => ops.patchElements(d, s.id, ids, { hidden: hidden || undefined }));
}

export function flip(axis: 'x' | 'y') {
  const s = currentSlide();
  const ids = ui.get().sel;
  if (s && ids.length) doc.commit('Flip', (d) => ops.patchElements(d, s.id, ids, (e) => { if (axis === 'x') e.flipX = !e.flipX; else e.flipY = !e.flipY; }));
}

export function selectionBounds(): Rect | null {
  return unionRects(selectedEls().map((e) => bounds(e)));
}

// ── Property edits ───────────────────────────────────────────────────────────

/** Patch the selected elements; `merge` folds rapid changes (sliders) into one undo step. */
export function setProps(patch: Partial<El> | ((e: El) => void), label = 'Edit', merge?: string, ids = ui.get().sel) {
  const s = currentSlide();
  if (!s || !ids.length) return;
  doc.commit(label, (d) => ops.patchElements(d, s.id, ids, patch), merge ?? label);
}

export function setBase(patch: Partial<TextBase>, label = 'Text style') {
  setProps((e) => {
    if ((e.type === 'text' || e.type === 'table' || e.type === 'chart') && e.base) Object.assign(e.base, patch);
    if (e.type === 'shape') e.base = { ...(e.base ?? defaultBase()), ...patch };
  }, label, label);
}

function defaultBase(): TextBase {
  const t = doc.deck.theme;
  return { font: '@body', size: t.type.body, weight: 400, color: '@text', align: 'center', lh: 1.2, ls: 0 };
}

/** Apply run formatting to every run in the selected text elements (used when not editing inside a box). */
export function setRuns(patch: Partial<Run>, label = 'Format text') {
  setProps((e) => {
    const apply = (docu: { runs: Run[] }[]) => docu.forEach((p) => p.runs.forEach((r) => Object.assign(r, patch)));
    if (e.type === 'text' || (e.type === 'shape' && e.doc)) apply(e.doc!);
  }, label, label);
}

/** Make a shape able to hold text. */
export function ensureShapeText(id: ID) {
  const s = currentSlide();
  if (!s) return;
  doc.commit('Add text', (d) => ops.patchElement(d, s.id, id, (e) => {
    if (e.type === 'shape' && !e.doc) {
      e.doc = plain('');
      e.base = defaultBase();
      e.pad = 16;
      e.vAlign = 'middle';
    }
  }));
}

/** After text edits, grow text boxes to their content. */
export function growToFit(id: ID, height: number) {
  const s = currentSlide();
  if (!s) return;
  const e = ops.findEl(s.elements, id);
  if (e && e.type === 'text' && e.fit === 'grow' && Math.abs(e.h - height) > 0.5) {
    doc.commit('Fit text', (d) => ops.patchElement(d, s.id, id, { h: height }), 'grow:' + id);
  }
}

// ── Slides ───────────────────────────────────────────────────────────────────

export function addSlide(layoutId?: ID) {
  let slide: Slide | undefined;
  const cur = currentSlide();
  doc.commit('New slide', (d) => {
    // A new slide after a title slide is a content slide; otherwise it repeats the current layout.
    const curName = d.layouts.find((l) => l.id === cur?.layout)?.name;
    const content = d.layouts.find((l) => l.name === 'Title and content')?.id;
    slide = ops.addSlideFromLayout(d, layoutId ?? (curName === 'Title' || curName === 'Section' ? content : cur?.layout), cur?.id);
  });
  if (slide) selectSlide(slide.id);
}

export function duplicateSlides() {
  const ids = ui.get().slideSel;
  let copies: Slide[] = [];
  doc.commit('Duplicate slide', (d) => {
    copies = ops.duplicateSlides(d, ids);
  });
  if (copies[0]) selectSlide(copies[0].id);
}

export function deleteSlides() {
  const ids = ui.get().slideSel;
  const slides = doc.deck.slides;
  if (ids.length >= slides.length) return toast("A presentation needs at least one slide.");
  const first = slides.findIndex((s) => ids.includes(s.id));
  doc.commit('Delete slide', (d) => ops.deleteSlides(d, ids));
  const left = doc.deck.slides;
  selectSlide(left[Math.min(first, left.length - 1)]!.id);
}

export function moveSlides(ids: ID[], toIndex: number) {
  doc.commit('Reorder slides', (d) => ops.moveSlides(d, ids, toIndex));
}

export function patchSlide(patch: Partial<Slide>, label = 'Slide', merge?: string) {
  const s = currentSlide();
  if (s) doc.commit(label, (d) => ops.patchSlide(d, s.id, patch), merge);
}

// ── Animation ────────────────────────────────────────────────────────────────

export function animCtx(el?: El | null): BuildCtx {
  const { w, h } = doc.deck.size;
  // Where earlier camera moves leave the camera (so "pull back" can undo them).
  const cam = { x: 0, y: 0, s: 1, rot: 0 };
  for (const a of currentSlide()?.anims ?? []) {
    if (a.el !== CAMERA) continue;
    for (const t of a.tracks) {
      const last = [...t.keys].sort((p, q) => p.t - q.t).pop();
      const v = Number(last?.v ?? 0);
      if (t.prop === 'x') cam.x += v;
      if (t.prop === 'y') cam.y += v;
      if (t.prop === 'scale') cam.s *= v;
      if (t.prop === 'rot') cam.rot += v;
    }
  }
  return { el: el ?? null, slide: { w, h }, camera: cam };
}

/** Add a preset animation to an element ('$camera' for the slide camera). */
export function addAnimation(presetId: string, elId: string, over: Partial<SlideAnim> = {}) {
  const s = currentSlide();
  if (!s) return;
  const el = elId === CAMERA ? null : findAnimEl(s.elements, elId);
  const first = s.anims.length === 0;
  const anim = makeAnim(presetId, elId, animCtx(el), { trigger: first ? 'click' : 'after', ...over });
  doc.commit('Add animation', (d) => ops.addAnim(d, s.id, anim));
  ui.set({ animSel: [anim.id] });
  return anim;
}

export function updateAnim(id: ID, patch: Partial<SlideAnim>, label = 'Edit animation', rebuild = false) {
  const s = currentSlide();
  if (!s) return;
  doc.commit(label, (d) => {
    ops.patchAnim(d, s.id, id, (a) => {
      Object.assign(a, patch);
      if (rebuild) {
        const el = a.el === CAMERA ? null : findAnimEl(ops.slideById(d, s.id)!.elements, a.el);
        Object.assign(a, rebuildAnim(a as SlideAnim, animCtx(el)));
      }
    });
  }, 'anim:' + id + label);
}

export function removeAnimations(ids: ID[]) {
  const s = currentSlide();
  if (s) doc.commit('Remove animation', (d) => ops.removeAnim(d, s.id, ids));
  ui.set({ animSel: [] });
}

// ── History ──────────────────────────────────────────────────────────────────

export function undo() {
  const label = doc.undo();
  if (label) {
    prune();
    toast(`Undid ${label.toLowerCase()}`);
  }
}
export function redo() {
  const label = doc.redo();
  if (label) {
    prune();
    toast(`Redid ${label.toLowerCase()}`);
  }
}

/** After undo/redo, drop selection/slide references that no longer exist. */
export function prune() {
  const deck: Deck = doc.deck;
  const u = ui.get();
  let slideId = u.slideId;
  if (!deck.slides.some((s) => s.id === slideId)) slideId = deck.slides[0]?.id ?? '';
  const s = deck.slides.find((x) => x.id === slideId);
  const all = s ? ops.allIds(s.elements) : new Set<ID>();
  ui.set({
    slideId,
    slideSel: u.slideSel.filter((id) => deck.slides.some((x) => x.id === id)).length ? u.slideSel.filter((id) => deck.slides.some((x) => x.id === id)) : [slideId],
    sel: u.sel.filter((id) => all.has(id)),
    group: u.group && all.has(u.group) ? u.group : null,
    editing: null,
  });
  requestRedraw();
}

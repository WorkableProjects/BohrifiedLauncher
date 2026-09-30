import { getController } from '../canvas/instance';
import { pageToPng } from '../engine/export';
import { elementBounds, translateElement, uid, unionRects } from '../engine/geometry';
import { downloadBlob, exportDocument, listLessons, readImageFile, safeFilename } from '../engine/persistence';
import { boardTheme, type Appearance } from '../engine/theme';
import type { BoardElement } from '../engine/types';
import { board } from './board';
import { closeCurrent, importLesson, newLesson } from './lessons';
import { toast, ui } from './ui';

const selected = () => {
  const sel = ui.get().selection;
  return board.page.elements.filter((e) => sel.has(e.id));
};

export const undo = () => board.undo();
export const redo = () => board.redo();

export function deleteSelection() {
  const sel = ui.get().selection;
  if (!sel.size) return;
  board.removeElements(sel);
  ui.set({ selection: new Set() });
}

function withNewIds(els: BoardElement[], dx: number, dy: number) {
  return els.map((e) => ({ ...translateElement(e, dx, dy), id: uid() }));
}

export function duplicateSelection() {
  const els = selected();
  if (!els.length) return;
  const z = board.page.camera.z;
  const copies = withNewIds(els, 24 / z, 24 / z);
  board.addElements(copies);
  ui.set({ selection: new Set(copies.map((c) => c.id)) });
}

export function reorderSelection(toFront: boolean) {
  const els = selected();
  if (!els.length) return;
  const ids = new Set(els.map((e) => e.id));
  const page = board.page;
  // Remove, then re-add at the end/start: a single undoable op.
  const removed = page.elements.map((el, index) => ({ index, el })).filter((p) => ids.has(p.el.id));
  const remaining = page.elements.length - removed.length;
  const added = els.map((el, i) => ({ index: toFront ? remaining + i : i, el }));
  board.commit({ kind: 'elements', pageId: page.id, removed, added });
}

export function selectAll() {
  ui.set({ tool: 'select', selection: new Set(board.page.elements.map((e) => e.id)) });
}

// ─── Clipboard ────────────────────────────────────────────────────────

const CLIP_MIME = 'flow/elements';
let clipboard: BoardElement[] = [];

export function copySelection(e?: ClipboardEvent) {
  const els = selected();
  if (!els.length) return false;
  clipboard = els;
  e?.clipboardData?.setData('text/plain', JSON.stringify({ [CLIP_MIME]: els }));
  e?.preventDefault();
  return true;
}

export function cutSelection(e?: ClipboardEvent) {
  if (copySelection(e)) deleteSelection();
}

function pasteElements(els: BoardElement[]) {
  const r = unionRects(els.map(elementBounds));
  const c = getController()?.worldCenter();
  if (!r || !c) return;
  const copies = withNewIds(els, c.x - (r.x + r.w / 2), c.y - (r.y + r.h / 2));
  board.addElements(copies);
  ui.set({ tool: 'select', selection: new Set(copies.map((x) => x.id)) });
}

export async function handlePaste(e: ClipboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  const dt = e.clipboardData;
  if (!dt) return;
  const file = [...dt.files].find((f) => f.type.startsWith('image/'));
  if (file) {
    e.preventDefault();
    await insertImage(file);
    return;
  }
  const text = dt.getData('text/plain');
  if (text) {
    e.preventDefault();
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed?.[CLIP_MIME])) return pasteElements(parsed[CLIP_MIME]);
    } catch { /* plain text */ }
    const c = getController()?.worldCenter();
    if (!c) return;
    const z = board.page.camera.z;
    const st = ui.get().text;
    const el: BoardElement = { id: uid(), type: 'text', x: c.x, y: c.y, text: text.slice(0, 5000), color: st.color, fontSize: st.size / z };
    board.addElements([el]);
    ui.set({ tool: 'select', selection: new Set([el.id]) });
    return;
  }
  if (clipboard.length) pasteElements(clipboard);
}

// ─── Images ───────────────────────────────────────────────────────────

export async function insertImage(file: Blob, at?: { x: number; y: number }) {
  try {
    const { src, w, h } = await readImageFile(file);
    const ctrl = getController();
    const c = at ?? ctrl?.worldCenter() ?? { x: 0, y: 0 };
    const z = board.page.camera.z;
    const vp = ctrl?.viewport ?? { width: 1200, height: 800 };
    // Fit comfortably inside ~60% of the viewport.
    const s = Math.min(1 / z, (vp.width * 0.6) / z / w, (vp.height * 0.6) / z / h);
    const el: BoardElement = { id: uid(), type: 'image', x: c.x - (w * s) / 2, y: c.y - (h * s) / 2, w: w * s, h: h * s, src };
    board.addElements([el]);
    ui.set({ tool: 'select', selection: new Set([el.id]) });
  } catch {
    toast('Couldn’t add that image');
  }
}

export function pickImage() {
  pickFile('image/*', (f) => insertImage(f));
}

function pickFile(accept: string, fn: (f: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => input.files?.[0] && fn(input.files[0]);
  input.click();
}

// ─── Files ────────────────────────────────────────────────────────────

export async function exportPng(appearance: Appearance) {
  const ctrl = getController();
  const cam = board.page.camera;
  const vp = ctrl?.viewport ?? { width: 1200, height: 800 };
  const blob = await pageToPng(board.page, boardTheme(appearance), { x: cam.x, y: cam.y, w: vp.width / cam.z, h: vp.height / cam.z });
  downloadBlob(blob, `${safeFilename(board.doc.title)}-${safeFilename(board.page.name)}.png`);
  toast('Exported PNG');
}

export async function copyPng(appearance: Appearance) {
  try {
    const cam = board.page.camera;
    const vp = getController()?.viewport ?? { width: 1200, height: 800 };
    const blob = await pageToPng(board.page, boardTheme(appearance), { x: cam.x, y: cam.y, w: vp.width / cam.z, h: vp.height / cam.z });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Copied page image');
  } catch {
    toast('Clipboard unavailable');
  }
}

export function saveDocument() {
  exportDocument(board.doc);
  toast('Saved .flow file');
}

export function openDocument() {
  pickFile('.flow,application/json', (f) => openFlowFile(f));
}

/** Open a .flow file as a lesson; the current lesson is saved first. */
export async function openFlowFile(f: File) {
  try {
    await closeCurrent();
    const existing = new Set((await listLessons()).map((l) => l.id));
    await importLesson(f, existing);
    toast(`Opened “${board.doc.title}”`);
  } catch {
    toast('That isn’t a Flow file');
  }
}

/** Start a fresh lesson — the current one stays in Recents. */
export async function newDocument() {
  await closeCurrent();
  newLesson(board.page.background);
  toast('New lesson');
}

export function goToPage(delta: number) {
  const pages = board.doc.pages;
  const i = pages.findIndex((p) => p.id === board.doc.activePage);
  const next = pages[Math.max(0, Math.min(pages.length - 1, i + delta))];
  if (next) board.setActivePage(next.id);
}

export function openPresenter() {
  const url = new URL(window.location.href);
  url.searchParams.set('view', 'present');
  const w = window.open(url.toString(), 'flow-present', 'width=1280,height=800');
  if (!w) toast('Allow pop-ups to open the student view');
  else toast('Student view opened — share that window');
}

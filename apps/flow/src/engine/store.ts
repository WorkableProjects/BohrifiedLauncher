import { uid } from './geometry';
import type { Background, BoardElement, Camera, FlowDocument, Page } from './types';

// ─── Operations (the unit of undo/redo and of sync) ──────────────────

interface Placed {
  index: number;
  el: BoardElement;
}

export type Op =
  | { kind: 'elements'; pageId: string; removed: Placed[]; added: Placed[] }
  | { kind: 'page'; action: 'insert' | 'delete'; index: number; page: Page }
  | { kind: 'pageProps'; pageId: string; before: PageProps; after: PageProps }
  | { kind: 'title'; before: string; after: string }
  /** Reordering pages is history like any other edit, so it undoes and syncs. */
  | { kind: 'pageMove'; pageId: string; from: number; to: number };

type PageProps = Partial<Pick<Page, 'name' | 'background'>>;

export type Change =
  | { type: 'op'; op: Op; source: 'local' | 'remote' | 'history'; appendOnly: boolean }
  | { type: 'camera'; pageId: string }
  | { type: 'activePage' }
  | { type: 'replace' };

type Listener = (change: Change) => void;

export function invert(op: Op): Op {
  switch (op.kind) {
    case 'elements':
      return { ...op, removed: op.added, added: op.removed };
    case 'page':
      return { ...op, action: op.action === 'insert' ? 'delete' : 'insert' };
    case 'pageProps':
      return { ...op, before: op.after, after: op.before };
    case 'title':
      return { ...op, before: op.after, after: op.before };
    case 'pageMove':
      return { ...op, from: op.to, to: op.from };
  }
}

/** A short past-tense description for undo / redo feedback, e.g. "Moved 3 items". */
export function describeOp(op: Op): string {
  const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
  switch (op.kind) {
    case 'elements': {
      const { added, removed } = op;
      if (!added.length && !removed.length) return 'Edit';
      if (!removed.length) {
        if (added.length === 1) {
          const t = added[0].el.type;
          return t === 'stroke' ? 'Stroke' : t === 'shape' ? 'Shape' : t === 'text' ? 'Text' : t === 'image' ? 'Image' : t === 'equation' ? 'Equation' : 'Dot';
        }
        return `Added ${items(added.length)}`;
      }
      if (!added.length) return `Deleted ${items(removed.length)}`;
      // Same elements put back in a new state: a move, resize, restyle or reorder.
      return `Changed ${items(Math.max(added.length, removed.length))}`;
    }
    case 'page':
      return op.action === 'insert' ? 'New page' : 'Deleted page';
    case 'pageProps':
      return 'name' in op.after ? 'Renamed page' : 'Changed paper';
    case 'title':
      return 'Renamed lesson';
    case 'pageMove':
      return 'Moved page';
  }
}

// ─── Document factories ───────────────────────────────────────────────

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, z: 1 };

export function createPage(name: string, background: Background = 'dots'): Page {
  return { id: uid(), name, background, elements: [], camera: { ...DEFAULT_CAMERA } };
}

export function createDocument(): FlowDocument {
  const page = createPage('Page 1');
  return { version: 1, id: uid(), title: 'Untitled Lesson', pages: [page], activePage: page.id, updatedAt: Date.now() };
}

/** Structural validation for documents coming from files, storage or peers. */
export function isFlowDocument(v: unknown): v is FlowDocument {
  const d = v as FlowDocument;
  return (
    !!d && d.version === 1 && typeof d.title === 'string' && Array.isArray(d.pages) && d.pages.length > 0 &&
    d.pages.every((p) => typeof p.id === 'string' && Array.isArray(p.elements) && !!p.camera)
  );
}

// ─── Store ────────────────────────────────────────────────────────────

const HISTORY_LIMIT = 200;
/** Nudges closer together than this are one undo step. */
const MERGE_MS = 800;

export class BoardStore {
  doc: FlowDocument;
  /** Bumped on every change; lets React subscribe cheaply. */
  version = 0;
  private undoStack: Op[] = [];
  private redoStack: Op[] = [];
  private lastMerge: { key: string; at: number } | null = null;
  private listeners = new Set<Listener>();

  constructor(doc: FlowDocument = createDocument()) {
    this.doc = doc;
  }

  // Subscription ------------------------------------------------------

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit(change: Change) {
    this.version++;
    if (change.type !== 'camera') this.doc.updatedAt = Date.now();
    for (const fn of this.listeners) fn(change);
  }

  // Accessors ---------------------------------------------------------

  get page(): Page {
    return this.doc.pages.find((p) => p.id === this.doc.activePage) ?? this.doc.pages[0];
  }

  pageById(id: string): Page | undefined {
    return this.doc.pages.find((p) => p.id === id);
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** What Undo / Redo would do next, for tooltips and feedback. */
  get undoLabel(): string | null {
    const op = this.undoStack.at(-1);
    return op ? describeOp(op) : null;
  }

  get redoLabel(): string | null {
    const op = this.redoStack.at(-1);
    return op ? describeOp(op) : null;
  }

  /** How many steps can be undone / redone. */
  get undoDepth() {
    return this.undoStack.length;
  }

  get redoDepth() {
    return this.redoStack.length;
  }

  // Core op application ---------------------------------------------

  private applyOp(op: Op): boolean {
    switch (op.kind) {
      case 'elements': {
        const page = this.pageById(op.pageId);
        if (!page) return false;
        const els = page.elements.slice();
        // Remove from the highest index down so earlier indices stay valid.
        const removed = [...op.removed].sort((a, b) => b.index - a.index);
        for (const r of removed) {
          const at = els[r.index]?.id === r.el.id ? r.index : els.findIndex((e) => e.id === r.el.id);
          if (at >= 0) els.splice(at, 1);
        }
        const added = [...op.added].sort((a, b) => a.index - b.index);
        for (const a of added) els.splice(Math.min(a.index, els.length), 0, a.el);
        page.elements = els;
        return true;
      }
      case 'page': {
        if (op.action === 'insert') {
          this.doc.pages.splice(Math.min(op.index, this.doc.pages.length), 0, op.page);
        } else {
          if (this.doc.pages.length <= 1) return false;
          const at = this.doc.pages.findIndex((p) => p.id === op.page.id);
          if (at < 0) return false;
          this.doc.pages.splice(at, 1);
          if (this.doc.activePage === op.page.id) {
            this.doc.activePage = this.doc.pages[Math.max(0, at - 1)].id;
          }
        }
        this.doc.pages = [...this.doc.pages];
        return true;
      }
      case 'pageProps': {
        const page = this.pageById(op.pageId);
        if (!page) return false;
        Object.assign(page, op.after);
        this.doc.pages = this.doc.pages.map((p) => (p.id === page.id ? { ...page } : p));
        return true;
      }
      case 'title':
        this.doc.title = op.after;
        return true;
      case 'pageMove': {
        const from = this.doc.pages.findIndex((p) => p.id === op.pageId);
        if (from < 0) return false;
        const pages = this.doc.pages.slice();
        const [p] = pages.splice(from, 1);
        pages.splice(Math.max(0, Math.min(op.to, pages.length)), 0, p);
        this.doc.pages = pages;
        return true;
      }
    }
  }

  private static isAppendOnly(op: Op, page?: Page) {
    return (
      op.kind === 'elements' && op.removed.length === 0 && !!page &&
      op.added.every((a) => a.index >= page.elements.length - op.added.length)
    );
  }

  /**
   * Apply an op, record it for undo, and notify listeners. Ops committed
   * with the same `mergeKey` in quick succession on the same elements (arrow
   * key nudges) collapse into one undo step; peers still receive each one.
   */
  commit(op: Op, mergeKey?: string) {
    if (!this.applyOp(op)) return;
    const top = this.undoStack.at(-1);
    const now = Date.now();
    const chained =
      !!mergeKey && this.lastMerge?.key === mergeKey && now - this.lastMerge.at < MERGE_MS && top?.kind === 'elements' && op.kind === 'elements' &&
      top.pageId === op.pageId && top.added.length === op.removed.length && top.added.every((a) => op.removed.some((r) => r.el.id === a.el.id));
    if (chained && top?.kind === 'elements' && op.kind === 'elements') this.undoStack[this.undoStack.length - 1] = { ...top, added: op.added };
    else this.undoStack.push(op);
    this.lastMerge = mergeKey ? { key: mergeKey, at: now } : null;
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    const page = op.kind === 'elements' ? this.pageById(op.pageId) : undefined;
    this.emit({ type: 'op', op, source: 'local', appendOnly: BoardStore.isAppendOnly(op, page) });
  }

  /** Apply an op received from a peer (not recorded in local history). */
  applyRemote(op: Op) {
    if (!this.applyOp(op)) return;
    const page = op.kind === 'elements' ? this.pageById(op.pageId) : undefined;
    this.emit({ type: 'op', op, source: 'remote', appendOnly: BoardStore.isAppendOnly(op, page) });
  }

  undo() {
    const op = this.undoStack.pop();
    if (!op) return;
    const inv = invert(op);
    this.applyOp(inv);
    this.redoStack.push(op);
    this.focusOpPage(op);
    this.emit({ type: 'op', op: inv, source: 'history', appendOnly: false });
  }

  redo() {
    const op = this.redoStack.pop();
    if (!op) return;
    this.applyOp(op);
    this.undoStack.push(op);
    this.focusOpPage(op);
    this.emit({ type: 'op', op, source: 'history', appendOnly: false });
  }

  /** Undoing on another page would be invisible — switch to it first. */
  private focusOpPage(op: Op) {
    const id = op.kind === 'elements' || op.kind === 'pageProps' ? op.pageId : null;
    if (id && id !== this.doc.activePage && this.pageById(id)) {
      this.doc.activePage = id;
      this.emit({ type: 'activePage' });
    }
  }

  // Element helpers ---------------------------------------------------

  addElements(els: BoardElement[], pageId = this.page.id) {
    if (!els.length) return;
    const page = this.pageById(pageId);
    if (!page) return;
    const base = page.elements.length;
    this.commit({ kind: 'elements', pageId, removed: [], added: els.map((el, i) => ({ index: base + i, el })) });
  }

  removeElements(ids: Iterable<string>, pageId = this.page.id) {
    const page = this.pageById(pageId);
    if (!page) return;
    const set = new Set(ids);
    const removed: Placed[] = [];
    page.elements.forEach((el, index) => set.has(el.id) && removed.push({ index, el }));
    if (removed.length) this.commit({ kind: 'elements', pageId, removed, added: [] });
  }

  /** Replace elements in place (same z-order), e.g. after move/resize/edit. */
  replaceElements(next: BoardElement[], pageId = this.page.id, mergeKey?: string) {
    const page = this.pageById(pageId);
    if (!page || !next.length) return;
    const byId = new Map(next.map((e) => [e.id, e]));
    const removed: Placed[] = [];
    const added: Placed[] = [];
    page.elements.forEach((el, index) => {
      const n = byId.get(el.id);
      if (n && n !== el) {
        removed.push({ index, el });
        added.push({ index, el: n });
      }
    });
    if (removed.length) this.commit({ kind: 'elements', pageId, removed, added }, mergeKey);
  }

  // Page helpers --------------------------------------------------------

  setActivePage(id: string) {
    if (id === this.doc.activePage || !this.pageById(id)) return;
    this.doc.activePage = id;
    this.emit({ type: 'activePage' });
  }

  addPage(background?: Background) {
    const index = this.doc.pages.findIndex((p) => p.id === this.doc.activePage) + 1;
    const page = createPage(`Page ${this.doc.pages.length + 1}`, background ?? this.page.background);
    this.commit({ kind: 'page', action: 'insert', index, page });
    this.setActivePage(page.id);
  }

  duplicatePage(id = this.page.id) {
    const src = this.pageById(id);
    if (!src) return;
    const index = this.doc.pages.indexOf(src) + 1;
    const page: Page = {
      ...src,
      id: uid(),
      name: `${src.name} copy`,
      elements: src.elements.map((e) => ({ ...e, id: uid() })),
      camera: { ...src.camera },
    };
    this.commit({ kind: 'page', action: 'insert', index, page });
    this.setActivePage(page.id);
  }

  deletePage(id = this.page.id) {
    const index = this.doc.pages.findIndex((p) => p.id === id);
    if (index < 0 || this.doc.pages.length <= 1) return;
    this.commit({ kind: 'page', action: 'delete', index, page: this.doc.pages[index] });
  }

  /** Move a page to a position (0-based). */
  movePageTo(id: string, to: number) {
    const from = this.doc.pages.findIndex((p) => p.id === id);
    const target = Math.max(0, Math.min(to, this.doc.pages.length - 1));
    if (from < 0 || from === target) return;
    this.commit({ kind: 'pageMove', pageId: id, from, to: target });
  }

  movePage(id: string, delta: number) {
    const from = this.doc.pages.findIndex((p) => p.id === id);
    if (from >= 0) this.movePageTo(id, from + delta);
  }

  setPageProps(props: PageProps, pageId = this.page.id) {
    const page = this.pageById(pageId);
    if (!page) return;
    const before: PageProps = {};
    for (const k of Object.keys(props) as (keyof PageProps)[]) (before as Record<string, unknown>)[k] = page[k];
    this.commit({ kind: 'pageProps', pageId, before, after: props });
  }

  setTitle(title: string) {
    if (title === this.doc.title) return;
    this.commit({ kind: 'title', before: this.doc.title, after: title });
  }

  // Camera (not part of history) ------------------------------------

  setCamera(cam: Camera, pageId = this.page.id) {
    const page = this.pageById(pageId);
    if (!page) return;
    page.camera = cam;
    this.emit({ type: 'camera', pageId });
  }

  // Whole-document replacement --------------------------------------

  load(doc: FlowDocument) {
    this.doc = doc;
    if (!this.pageById(doc.activePage)) doc.activePage = doc.pages[0].id;
    this.undoStack = [];
    this.redoStack = [];
    this.emit({ type: 'replace' });
  }
}

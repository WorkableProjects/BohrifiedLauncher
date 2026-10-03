import { applyPatches, enablePatches, produceWithPatches, setAutoFreeze, type Draft, type Patch } from 'immer';
import type { Deck } from '../model/types';

enablePatches();
// Freezing every object on every edit costs more than it protects on large decks.
setAutoFreeze(false);

interface Entry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  /** Entries with the same key made close together fold into one (typing in a field, nudging a slider). */
  merge?: string;
  at: number;
}

const MAX_HISTORY = 300;
const MERGE_WINDOW = 900;

export interface Gesture {
  /** Replace the live state with `recipe` applied to the state at gesture start (cheap to call every frame). */
  update(recipe: (d: Draft<Deck>) => void): void;
  /** Commit the gesture as one undo step. */
  end(): void;
  /** Throw the gesture away. */
  cancel(): void;
}

export type Recipe = (d: Draft<Deck>) => void;

/**
 * The document: an immutable `Deck` plus undo/redo. Edits are immer recipes;
 * history keeps only patches, so undo steps stay tiny even on large decks and
 * unchanged slides keep their identity (which the thumbnail and text-layout
 * caches rely on).
 */
export class DocStore {
  deck: Deck;
  private past: Entry[] = [];
  private future: Entry[] = [];
  private listeners = new Set<() => void>();
  private gestureBase: Deck | null = null;
  /** Bumped on every change; cheap "did anything change" check. */
  version = 0;
  /** Set when the document changed since the last save. */
  dirty = false;
  private savedVersion = 0;

  constructor(deck: Deck) {
    this.deck = deck;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    this.version++;
    this.dirty = this.version !== this.savedVersion;
    this.listeners.forEach((fn) => fn());
  }

  markSaved() {
    this.savedVersion = this.version;
    this.dirty = false;
  }

  /** Swap in another deck (open, import). Clears history. */
  load(deck: Deck) {
    this.deck = deck;
    this.past = [];
    this.future = [];
    this.gestureBase = null;
    this.emit();
    this.markSaved();
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  get undoLabel() {
    return this.past[this.past.length - 1]?.label ?? null;
  }
  get redoLabel() {
    return this.future[this.future.length - 1]?.label ?? null;
  }

  /** Apply an edit as one undo step. Returns false if the recipe changed nothing. */
  commit(label: string, recipe: Recipe, merge?: string): boolean {
    if (this.gestureBase) this.cancelGesture();
    const [next, patches, inverse] = produceWithPatches(this.deck, recipe);
    if (patches.length === 0) return false;
    const now = Date.now();
    this.deck = { ...next, updated: now };
    const last = this.past[this.past.length - 1];
    if (merge && last && last.merge === merge && now - last.at < MERGE_WINDOW) {
      last.patches = [...last.patches, ...patches];
      last.inverse = [...inverse, ...last.inverse];
      last.at = now;
    } else {
      this.past.push({ label, patches, inverse, merge, at: now });
      if (this.past.length > MAX_HISTORY) this.past.shift();
    }
    this.future = [];
    this.emit();
    return true;
  }

  /** Begin a continuous edit (drag, resize, scrub). Nothing enters history until `end()`. */
  begin(label: string): Gesture {
    if (this.gestureBase) this.cancelGesture();
    const base = this.deck;
    this.gestureBase = base;
    let patches: Patch[] = [];
    let inverse: Patch[] = [];
    let done = false;
    return {
      update: (recipe) => {
        if (done) return;
        const [next, p, inv] = produceWithPatches(base, recipe);
        this.deck = next;
        patches = p;
        inverse = inv;
        this.emit();
      },
      end: () => {
        if (done) return;
        done = true;
        this.gestureBase = null;
        if (!patches.length) return;
        // The gesture's `updated` stamp.
        this.deck = { ...this.deck, updated: Date.now() };
        this.past.push({ label, patches, inverse, at: Date.now() });
        if (this.past.length > MAX_HISTORY) this.past.shift();
        this.future = [];
        this.emit();
      },
      cancel: () => {
        if (done) return;
        done = true;
        this.gestureBase = null;
        this.deck = base;
        this.emit();
      },
    };
  }

  private cancelGesture() {
    if (this.gestureBase) {
      this.deck = this.gestureBase;
      this.gestureBase = null;
      this.emit();
    }
  }

  undo(): string | null {
    const e = this.past.pop();
    if (!e) return null;
    this.deck = applyPatches(this.deck, e.inverse);
    this.future.push(e);
    this.emit();
    return e.label;
  }

  redo(): string | null {
    const e = this.future.pop();
    if (!e) return null;
    this.deck = applyPatches(this.deck, e.patches);
    this.past.push(e);
    this.emit();
    return e.label;
  }

  /** Forget history (after cleanup operations that can't be undone). */
  clearHistory() {
    this.past = [];
    this.future = [];
    this.emit();
  }

  get historySize() {
    return this.past.length;
  }
}

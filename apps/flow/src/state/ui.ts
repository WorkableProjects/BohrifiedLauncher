import { useSyncExternalStore } from 'react';
import type { ColorToken, ShapeKind, Tool } from '../engine/types';

export interface ToolStyle {
  color: ColorToken;
  size: number;
}

export type AppearancePref = 'system' | 'light' | 'dark';

/** Accent color: a hex value, or 'mono' for black (light) / white (dark). */
export type Accent = string;
export const DEFAULT_ACCENT = '#ff6083';
export const ACCENTS: { value: Accent; label: string }[] = [
  { value: DEFAULT_ACCENT, label: 'Flow' },
  { value: '#0a84ff', label: 'Blue' },
  { value: '#8e5cf7', label: 'Purple' },
  { value: '#22b357', label: 'Green' },
  { value: '#ff9500', label: 'Orange' },
  { value: 'mono', label: 'Mono' },
];
export const isAccent = (v: unknown): v is Accent => v === 'mono' || (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v));

/**
 * Chosen at first launch. 'mobile' = touch-first (tablets & phones):
 * finger/Pencil drawing, pinch to zoom, no hover-only controls.
 * 'desktop' = mouse, trackpad & keyboard: zoom bar, shortcut hints.
 */
export type DevicePref = 'mobile' | 'desktop';

export interface UIState {
  tool: Tool;
  shapeKind: Exclude<ShapeKind, 'polygon'>;
  pen: ToolStyle;
  highlighter: ToolStyle;
  shape: ToolStyle & { fill: boolean };
  text: ToolStyle;
  noteTint: ColorToken;
  /** Dot tool: color and diameter in screen px. */
  dot: ToolStyle;
  /** Dots dropped near a circle land exactly on it (Bohr model orbits). */
  snapDots: boolean;
  /** Which kind the Text tool places: a free text box or a sticky note. */
  textKind: 'text' | 'note';
  eraserSize: number;
  /** Hold the pen still at the end of a stroke to snap it into a shape. */
  snapShapes: boolean;
  /** Snap moving objects to the edges and centres of their neighbours. */
  snapObjects: boolean;
  /** Spotlight: dim everything but the selection (or the area under the pointer). Not persisted. */
  spotlight: boolean;
  appearance: AppearancePref;
  accent: Accent;
  /** null until the first-run question is answered. */
  device: DevicePref | null;
  /** First name for the Home welcome; null until asked, '' if skipped. */
  name: string | null;
  /** WebGL Liquid Glass on toolbars (falls back to CSS blur when off). */
  liquidGlass: boolean;
  selection: ReadonlySet<string>;
  pagesOpen: boolean;
  timerOpen: boolean;
  curtain: { on: boolean; y: number };
  /** LaTeX equation sheet; `editId` re-edits an existing equation. */
  equation: { open: boolean; editId: string | null };
  /** Chemistry Tools (periodic table, Bohr model, orbital diagram, Lewis dot, configuration). */
  chemistryOpen: boolean;
  shortcutsOpen: boolean;
  /** Student view / live session sheet. */
  sharingOpen: boolean;
  /** Transient HUD message (e.g. "Shape snapped"). */
  toast: string | null;
}

const PREFS_KEY = 'flow:prefs:v1';
const PERSISTED: (keyof UIState)[] = ['pen', 'highlighter', 'shape', 'text', 'noteTint', 'dot', 'snapDots', 'snapObjects', 'textKind', 'eraserSize', 'snapShapes', 'appearance', 'accent', 'liquidGlass', 'shapeKind', 'device', 'name'];

const initial: UIState = {
  tool: 'pen',
  shapeKind: 'rect',
  pen: { color: 'label', size: 4 },
  highlighter: { color: 'yellow', size: 22 },
  shape: { color: 'blue', size: 4, fill: false },
  text: { color: 'label', size: 28 },
  noteTint: 'yellow',
  dot: { color: 'label', size: 12 },
  snapDots: true,
  textKind: 'text',
  eraserSize: 16,
  snapShapes: true,
  snapObjects: true,
  spotlight: false,
  appearance: 'system',
  accent: DEFAULT_ACCENT,
  device: null,
  name: null,
  liquidGlass: true,
  selection: new Set(),
  pagesOpen: false,
  timerOpen: false,
  curtain: { on: false, y: 0.45 },
  equation: { open: false, editId: null },
  chemistryOpen: false,
  shortcutsOpen: false,
  sharingOpen: false,
  toast: null,
};

function loadPrefs(): Partial<UIState> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

let state: UIState = { ...initial, ...(typeof localStorage !== 'undefined' ? loadPrefs() : {}) };
if (!isAccent(state.accent)) state = { ...state, accent: DEFAULT_ACCENT };
const listeners = new Set<() => void>();
let saveTimer = 0;

export const ui = {
  get: () => state,
  set(patch: Partial<UIState> | ((s: UIState) => Partial<UIState>)) {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
    listeners.forEach((fn) => fn());
    if (PERSISTED.some((k) => k in next)) {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem(PREFS_KEY, JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, state[k]]))));
        } catch { /* storage unavailable */ }
      }, 300);
    }
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// Another same-origin document (Bohrified's settings sheet, or Flow in
// another tab) changed the prefs: take the persisted fields it wrote.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key !== PREFS_KEY || e.newValue === null) return;
    const next = loadPrefs();
    const changed = PERSISTED.filter((k) => k in next && JSON.stringify(next[k]) !== JSON.stringify(state[k]));
    if (!changed.length) return;
    state = { ...state, ...Object.fromEntries(changed.map((k) => [k, next[k]])) };
    listeners.forEach((fn) => fn());
  });

export function useUI<T>(selector: (s: UIState) => T): T {
  return useSyncExternalStore(ui.subscribe, () => selector(state), () => selector(initial));
}

/**
 * Mobile favors performance: decorative motion (Home ⇄ Board reveal, canvas
 * page transitions, Home glitter) and WebGL glass are skipped. Toolbars stay.
 */
export const lightweight = () => state.device === 'mobile';

let toastTimer = 0;
export function toast(message: string) {
  ui.set({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.set({ toast: null }), 1600);
}

export const setTool = (tool: Tool) =>
  ui.set({
    tool,
    selection: tool === 'select' ? state.selection : new Set(),
    ...(tool === 'text' || tool === 'note' ? { textKind: tool } : {}),
  });

// The two app sheets share a spot at the top right, so opening one closes the other.
export const openEquation = (editId: string | null = null) => ui.set({ equation: { open: true, editId }, chemistryOpen: false, sharingOpen: false });
export const openChemistry = () => ui.set({ chemistryOpen: true, sharingOpen: false, equation: { open: false, editId: null } });
export const openSharing = () => ui.set({ sharingOpen: true, chemistryOpen: false, equation: { open: false, editId: null } });

/** Forget the user profile so the first-launch welcome runs again. Lessons are kept. */
export const resetProfile = () => ui.set({ name: null, device: null });

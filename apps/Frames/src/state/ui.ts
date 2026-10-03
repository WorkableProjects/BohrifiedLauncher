import type { ID, ShapeKind } from '../model/types';
import { createStore } from './store';

export type Tool = 'select' | 'text' | 'shape' | 'line' | 'hand';
export type InspectorTab = 'design' | 'arrange' | 'animate' | 'slide';

export type Editing =
  | { type: 'text'; id: ID }
  | { type: 'cell'; id: ID; r: number; c: number }
  | { type: 'crop'; id: ID }
  | { type: 'path'; anim: ID }
  | null;

export type DialogName = 'templates' | 'export' | 'prefs' | 'shortcuts' | 'icons' | 'shapes' | 'import' | 'brand' | 'transition' | 'deck' | null;

export interface UIState {
  screen: 'home' | 'editor';
  slideId: ID;
  /** Multi-selected slides in the sidebar (always includes `slideId`). */
  slideSel: ID[];
  sel: ID[];
  /** The group the user has entered (double-click), whose children are directly selectable. */
  group: ID | null;
  tool: Tool;
  shapeKind: ShapeKind;
  lineKind: 'straight' | 'curve' | 'elbow';
  /** 'fit' follows the window; a number is a fixed zoom. */
  zoom: number | 'fit';
  pan: { x: number; y: number };
  inspector: InspectorTab;
  /** Advanced controls revealed in the inspector. */
  advanced: boolean;
  timeline: boolean;
  /** ms into the timeline while scrubbing/previewing, or null when the slide shows its built state. */
  playhead: number | null;
  /** A running animation preview. */
  preview: { startedAt: number; solo?: ID } | null;
  animSel: ID[];
  editing: Editing;
  presenting: { from: number } | null;
  dialog: DialogName;
  toast: { text: string; id: number } | null;
  /** Bumped when something outside the document changes what's on screen (an image finished decoding). */
  tick: number;
  /** Format painter. */
  painter: unknown | null;
  sidebar: boolean;
  inspectorOpen: boolean;
  /** Loaded deck is being opened. */
  loading: boolean;
}

export const ui = createStore<UIState>({
  screen: 'home',
  slideId: '',
  slideSel: [],
  sel: [],
  group: null,
  tool: 'select',
  shapeKind: 'rect',
  lineKind: 'straight',
  zoom: 'fit',
  pan: { x: 0, y: 0 },
  inspector: 'design',
  advanced: false,
  timeline: false,
  playhead: null,
  preview: null,
  animSel: [],
  editing: null,
  presenting: null,
  dialog: null,
  toast: null,
  tick: 0,
  painter: null,
  sidebar: true,
  inspectorOpen: true,
  loading: false,
});

let toastId = 0;
let toastTimer = 0;
export function toast(text: string, ms = 2200) {
  ui.set({ toast: { text, id: ++toastId } });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.set({ toast: null }), ms);
}

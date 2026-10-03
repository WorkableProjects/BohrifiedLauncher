import { prefs } from '../state/prefs';
import { doc, currentSlide } from '../state/session';
import { toast, ui } from '../state/ui';
import { goHome, startPresenting, saveAndToast } from '../app/flow';
import * as cmd from './commands';
import * as fmt from './textfmt';
import { activeEditor } from './textfmt';
import { copyStyle, pasteStyle } from './style';

/**
 * Keyboard. One table maps actions to key combos per scheme (Frames,
 * Keynote-like, Google-Slides-like); the Preferences choice picks the scheme,
 * and the shortcut sheet is generated from the same table.
 */

export type Action =
  | 'undo' | 'redo' | 'copy' | 'cut' | 'paste' | 'duplicate' | 'selectAll' | 'delete' | 'group' | 'ungroup'
  | 'front' | 'forward' | 'backward' | 'back' | 'present' | 'presentHere' | 'newSlide' | 'duplicateSlide' | 'text' | 'rect' | 'line' | 'select' | 'hand'
  | 'bold' | 'italic' | 'underline' | 'copyStyle' | 'pasteStyle' | 'fit' | 'zoomIn' | 'zoomOut' | 'grid' | 'rulers' | 'save' | 'export' | 'shortcuts' | 'timeline' | 'lock' | 'hide' | 'image' | 'prefs';

type Scheme = 'frames' | 'keynote' | 'slides';

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// "Mod" is Cmd on Mac and Ctrl elsewhere.
const BASE: Record<Action, string> = {
  undo: 'Mod+Z', redo: 'Mod+Shift+Z', copy: 'Mod+C', cut: 'Mod+X', paste: 'Mod+V', duplicate: 'Mod+D', selectAll: 'Mod+A', delete: 'Delete',
  group: 'Mod+G', ungroup: 'Mod+Shift+G', front: 'Mod+Shift+]', forward: 'Mod+]', backward: 'Mod+[', back: 'Mod+Shift+[',
  present: 'Mod+Enter', presentHere: 'Mod+Shift+Enter', newSlide: 'Mod+Shift+N', duplicateSlide: 'Mod+Shift+D',
  text: 'T', rect: 'R', line: 'L', select: 'V', hand: 'H',
  bold: 'Mod+B', italic: 'Mod+I', underline: 'Mod+U', copyStyle: 'Mod+Alt+C', pasteStyle: 'Mod+Alt+V',
  fit: 'Mod+0', zoomIn: 'Mod+=', zoomOut: 'Mod+-', grid: "Mod+'", rulers: 'Mod+Shift+R', save: 'Mod+S', export: 'Mod+E', shortcuts: '?', timeline: 'Mod+Shift+T', lock: 'Mod+L', hide: 'Mod+Shift+H', image: 'Mod+Shift+I', prefs: 'Mod+,',
};
const OVERRIDES: Record<Scheme, Partial<Record<Action, string>>> = {
  frames: {},
  keynote: { present: 'Mod+Alt+P', presentHere: 'Mod+Alt+Shift+P', newSlide: 'Mod+Shift+N', duplicateSlide: 'Mod+Shift+D', front: 'Mod+Shift+F', back: 'Mod+Shift+B', forward: 'Mod+Alt+Shift+F', backward: 'Mod+Alt+Shift+B', lock: 'Mod+L', hide: 'Mod+Alt+H' },
  slides: { present: 'Mod+Enter', presentHere: 'Mod+Shift+Enter', newSlide: 'Mod+M', duplicateSlide: 'Mod+Shift+D', front: 'Mod+Shift+Up', back: 'Mod+Shift+Down', forward: 'Mod+Up', backward: 'Mod+Down' },
};

export const keyFor = (a: Action): string => OVERRIDES[prefs.get().shortcuts as Scheme]?.[a] ?? BASE[a];

const PRETTY: Record<string, string> = { Mod: mac ? '⌘' : 'Ctrl', Shift: mac ? '⇧' : 'Shift', Alt: mac ? '⌥' : 'Alt', Enter: mac ? '↩' : 'Enter', Delete: mac ? '⌫' : 'Del', Up: '↑', Down: '↓' };
export function shortcutLabel(a: Action): string {
  return keyFor(a).split('+').map((p) => PRETTY[p] ?? p).join(mac ? '' : '+');
}

function matches(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split('+');
  const key = parts[parts.length - 1]!;
  const want = { mod: parts.includes('Mod'), shift: parts.includes('Shift'), alt: parts.includes('Alt') };
  const mod = e.metaKey || e.ctrlKey;
  if (want.mod !== mod || want.alt !== e.altKey) return false;
  // Shift only matters if the combo names it (symbols like '?' and ']' carry their own shift).
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const alt = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : '';
  const named: Record<string, string> = { Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight' };
  const target = named[key] ?? key;
  const keyOk = k === target.toUpperCase() || alt === target.toUpperCase() || (target === ']' && e.code === 'BracketRight') || (target === '[' && e.code === 'BracketLeft') || (target === '=' && (e.code === 'Equal' || e.key === '+')) || (target === '-' && e.code === 'Minus');
  if (!keyOk) return false;
  if (want.shift && !e.shiftKey) return false;
  if (!want.shift && e.shiftKey && /^[A-Z0-9]$/i.test(target) && target.length === 1 && key !== '?') return false;
  return true;
}

const ACTIONS: Partial<Record<Action, () => void>> = {
  undo: cmd.undo,
  redo: cmd.redo,
  copy: () => void cmd.copySelection(),
  cut: cmd.cutSelection,
  duplicate: () => void cmd.duplicateSelection(),
  selectAll: cmd.selectAll,
  group: cmd.group,
  ungroup: cmd.ungroup,
  front: () => cmd.arrange('front'),
  forward: () => cmd.arrange('forward'),
  backward: () => cmd.arrange('backward'),
  back: () => cmd.arrange('back'),
  present: () => startPresenting(false),
  presentHere: () => startPresenting(true),
  newSlide: () => cmd.addSlide(),
  duplicateSlide: cmd.duplicateSlides,
  text: () => ui.set({ tool: 'text' }),
  rect: () => ui.set({ tool: 'shape', shapeKind: 'rect' }),
  line: () => ui.set({ tool: 'line' }),
  select: () => ui.set({ tool: 'select' }),
  hand: () => ui.set({ tool: 'hand' }),
  bold: () => fmt.formatInline({ b: !(fmt.activeEditor.root ? document.queryCommandState('bold') : cmd.selectedEls().some((e) => e.type === 'text' && e.base.weight >= 600)) }),
  italic: () => fmt.formatInline({ i: !document.queryCommandState('italic') }),
  underline: () => fmt.formatInline({ u: !document.queryCommandState('underline') }),
  copyStyle,
  pasteStyle,
  fit: () => ui.set({ zoom: 'fit', pan: { x: 0, y: 0 } }),
  zoomIn: () => zoomBy(1.25),
  zoomOut: () => zoomBy(0.8),
  grid: () => import('../state/prefs').then((m) => m.setPrefs({ showGrid: !m.prefs.get().showGrid })).then(() => undefined),
  rulers: () => import('../state/prefs').then((m) => m.setPrefs({ showRulers: !m.prefs.get().showRulers })).then(() => undefined),
  save: saveAndToast,
  export: () => ui.set({ dialog: 'export' }),
  shortcuts: () => ui.set({ dialog: 'shortcuts' }),
  timeline: () => ui.set({ timeline: !ui.get().timeline }),
  lock: () => cmd.setLocked(!cmd.selectedEls().every((e) => e.locked)),
  hide: () => cmd.setHidden(true),
  prefs: () => ui.set({ dialog: 'prefs' }),
};

function zoomBy(k: number) {
  const z = ui.get().zoom;
  const cur = typeof z === 'number' ? z : 0.5;
  ui.set({ zoom: Math.min(8, Math.max(0.05, cur * k)) });
}

const inField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');

export function installShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (ui.get().screen !== 'editor' || ui.get().presenting || ui.get().dialog) return;
    const typing = inField(e.target);
    const mod = e.metaKey || e.ctrlKey;

    // While typing in a field, only Mod combos for formatting/undo inside the field itself apply.
    if (typing) {
      if (activeEditor.root && mod && (e.key === 'b' || e.key === 'i' || e.key === 'u')) return; // native
      return;
    }
    if (e.key === 'Escape') {
      const u = ui.get();
      if (u.editing) return void ui.set({ editing: null });
      if (u.tool !== 'select') return void ui.set({ tool: 'select' });
      if (u.preview || u.playhead !== null) return void ui.set({ preview: null, playhead: null });
      if (u.group) return void ui.set({ group: null, sel: [u.group] });
      if (u.sel.length) return cmd.select([]);
      return;
    }
    // Navigation and nudging.
    if (e.key.startsWith('Arrow') && !mod) {
      const u = ui.get();
      if (u.sel.length) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        cmd.nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0);
      } else {
        const i = doc.deck.slides.findIndex((s) => s.id === u.slideId);
        const n = doc.deck.slides[i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0)];
        if (n) {
          e.preventDefault();
          cmd.selectSlide(n.id);
        }
      }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (ui.get().sel.length) {
        e.preventDefault();
        cmd.deleteSelection();
      }
      return;
    }
    if (e.key === 'Enter' && !mod) {
      const el = cmd.selectedEls()[0];
      if (el && ui.get().sel.length === 1) {
        e.preventDefault();
        if (el.type === 'text') ui.set({ editing: { type: 'text', id: el.id } });
        else if (el.type === 'shape') {
          cmd.ensureShapeText(el.id);
          ui.set({ editing: { type: 'text', id: el.id } });
        } else if (el.type === 'group') ui.set({ group: el.id, sel: [] });
      }
      return;
    }
    if (e.key === 'Tab') {
      const s = currentSlide();
      if (!s) return;
      e.preventDefault();
      const list = s.elements.filter((x) => !x.hidden && !x.locked);
      const cur = list.findIndex((x) => x.id === ui.get().sel[0]);
      const next = list[(cur + (e.shiftKey ? -1 : 1) + list.length) % list.length];
      if (next) cmd.select([next.id]);
      return;
    }
    for (const a of Object.keys(BASE) as Action[]) {
      if (!ACTIONS[a] || a === 'delete') continue;
      if (matches(e, keyFor(a))) {
        // Single-letter tool keys only when no modifier is held.
        e.preventDefault();
        ACTIONS[a]!();
        return;
      }
    }
    if (mod && e.key === ',') {
      e.preventDefault();
      ACTIONS.prefs!();
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    if (ui.get().screen !== 'editor' || ui.get().dialog || inField(e.target)) return;
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length) {
      e.preventDefault();
      void cmd.importFiles(files);
      return;
    }
    const text = e.clipboardData?.getData('text/plain') ?? '';
    e.preventDefault();
    if (!cmd.pasteElements(text)) cmd.pasteText(text);
  };
  const onCopy = (e: ClipboardEvent) => {
    if (ui.get().screen !== 'editor' || inField(e.target) || !ui.get().sel.length) return;
    e.preventDefault();
    cmd.copySelection();
  };
  const onCut = (e: ClipboardEvent) => {
    if (ui.get().screen !== 'editor' || inField(e.target) || !ui.get().sel.length) return;
    e.preventDefault();
    cmd.cutSelection();
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('paste', onPaste);
  window.addEventListener('copy', onCopy);
  window.addEventListener('cut', onCut);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('paste', onPaste);
    window.removeEventListener('copy', onCopy);
    window.removeEventListener('cut', onCut);
  };
}

export const SHORTCUT_GROUPS: { name: string; items: { label: string; action?: Action; keys?: string }[] }[] = [
  { name: 'Slides', items: [
    { label: 'New slide', action: 'newSlide' }, { label: 'Duplicate slide', action: 'duplicateSlide' }, { label: 'Present from start', action: 'present' }, { label: 'Present from this slide', action: 'presentHere' }, { label: 'Previous / next slide', keys: '↑ ↓' },
  ] },
  { name: 'Edit', items: [
    { label: 'Undo', action: 'undo' }, { label: 'Redo', action: 'redo' }, { label: 'Copy', action: 'copy' }, { label: 'Cut', action: 'cut' }, { label: 'Paste', action: 'paste' }, { label: 'Duplicate', action: 'duplicate' }, { label: 'Select all', action: 'selectAll' }, { label: 'Delete', keys: '⌫' }, { label: 'Copy style', action: 'copyStyle' }, { label: 'Paste style', action: 'pasteStyle' },
  ] },
  { name: 'Objects', items: [
    { label: 'Group', action: 'group' }, { label: 'Ungroup', action: 'ungroup' }, { label: 'Bring to front', action: 'front' }, { label: 'Send to back', action: 'back' }, { label: 'Lock / unlock', action: 'lock' }, { label: 'Nudge (×10 with Shift)', keys: '← ↑ → ↓' }, { label: 'Edit text', keys: '↩' }, { label: 'Next object', keys: 'Tab' },
  ] },
  { name: 'Tools', items: [
    { label: 'Select', action: 'select' }, { label: 'Text box', action: 'text' }, { label: 'Rectangle', action: 'rect' }, { label: 'Line', action: 'line' }, { label: 'Hand (or hold Space)', action: 'hand' },
  ] },
  { name: 'Text', items: [{ label: 'Bold', action: 'bold' }, { label: 'Italic', action: 'italic' }, { label: 'Underline', action: 'underline' }] },
  { name: 'View', items: [
    { label: 'Fit to window', action: 'fit' }, { label: 'Zoom in', action: 'zoomIn' }, { label: 'Zoom out', action: 'zoomOut' }, { label: 'Grid', action: 'grid' }, { label: 'Rulers', action: 'rulers' }, { label: 'Timeline', action: 'timeline' },
  ] },
  { name: 'App', items: [{ label: 'Save', action: 'save' }, { label: 'Export', action: 'export' }, { label: 'Preferences', action: 'prefs' }, { label: 'This sheet', action: 'shortcuts' }] },
  { name: 'Presenting', items: [
    { label: 'Next', keys: '→ ↓ Space PgDn' }, { label: 'Previous', keys: '← ↑ PgUp' }, { label: 'Black / white screen', keys: 'B / W  or  .' }, { label: 'Jump to slide', keys: 'type a number, ↩' }, { label: 'Slide overview', keys: 'G' }, { label: 'Notes', keys: 'N' }, { label: 'Exit', keys: 'Esc' },
  ] },
];

void goHome;
void toast;

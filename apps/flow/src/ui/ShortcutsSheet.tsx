import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../hooks/usePresence';
import { ui, useUI } from '../state/ui';
import { ToolButton } from './controls';

const SHORTCUTS: [string, string][] = [
  ['V · H', 'Select · Pan'],
  ['P · M · E', 'Pen · Highlighter · Eraser'],
  ['L', 'Laser pointer'],
  ['D', 'Dot (snaps to rings)'],
  ['S · R · O · A', 'Shapes · Rect · Ellipse · Arrow'],
  ['T · N · I', 'Text · Sticky note · Image'],
  ['⌘B · ⌘I · ⌘U', 'Bold · Italic · Underline'],
  ['Space + drag', 'Pan'],
  ['⌘ + scroll / pinch', 'Zoom'],
  ['⌘0 · ⌘1', 'Actual size · Fit'],
  ['⌘D · ⌫', 'Duplicate · Delete'],
  ['← ↑ → ↓', 'Nudge selection (⇧ for 10 px)'],
  ['Alt + drag', 'Move without snapping'],
  ['F', 'Spotlight (Esc ends it)'],
  ['⌘Z · ⇧⌘Z', 'Undo · Redo (shows what changed)'],
  ['C', 'Screen Hider'],
  ['PgUp · PgDn', 'Previous · Next page'],
  ['Home · End', 'First · Last page'],
  ['⌥P', 'Pages (drag, or Alt + ↑↓, to reorder)'],
  ['?', 'This list'],
];

/** Keyboard shortcuts, kept out of Settings so that menu stays short. */
export function ShortcutsSheet() {
  const open = useUI((s) => s.shortcutsOpen);
  const { mounted, leaving } = usePresence(open);
  const sheet = useRef<HTMLElement>(null);
  const close = () => ui.set({ shortcutsOpen: false });
  useEffect(() => {
    if (open) requestAnimationFrame(() => sheet.current?.focus());
  }, [open]);
  if (!mounted) return null;
  return createPortal(
    <section
      ref={sheet}
      tabIndex={-1}
      role="dialog"
      aria-label="Keyboard shortcuts"
      className={`sheet ${leaving ? 'pop-out' : 'pop-in'} fixed top-1/2 left-1/2 z-40 max-h-[calc(100dvh-48px)] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-4 outline-none`}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || e.key === '?') close();
      }}
    >
      <header className="mb-3 flex items-center gap-3">
        <h2 className="flex-1 text-headline font-semibold tracking-title">Keyboard shortcuts</h2>
        <ToolButton icon="close" label="Close" iconSize={12} onClick={close} />
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-subhead">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-label tabular-nums">{k}</dt>
            <dd className="text-label-2">{v}</dd>
          </div>
        ))}
      </dl>
    </section>,
    document.getElementById('overlay') ?? document.body,
  );
}

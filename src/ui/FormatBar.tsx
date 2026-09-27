import type { IconName } from '../icons/Icon';
import type { MarkKey } from '../engine/richtext';
import { ToolButton } from './controls';

export interface FormatSpec {
  mark: MarkKey;
  icon: IconName;
  label: string;
  shortcut: string;
  /** document.execCommand name used while editing on the canvas. */
  command: string;
}

/**
 * Text formats offered in the editor and on selected text. New formats
 * (strikethrough, code, …) are an entry here plus a mark in engine/richtext.
 */
export const FORMATS: FormatSpec[] = [
  { mark: 'bold', icon: 'bold', label: 'Bold', shortcut: '⌘B', command: 'bold' },
  { mark: 'italic', icon: 'italic', label: 'Italic', shortcut: '⌘I', command: 'italic' },
  { mark: 'underline', icon: 'underline', label: 'Underline', shortcut: '⌘U', command: 'underline' },
];

export type MarkState = Partial<Record<MarkKey, boolean>>;

/** Keep focus (and the text selection) in the editor when pressing a format button. */
const keepFocus = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();

export function FormatButtons({ state, onToggle, tabIndex }: { state: MarkState; onToggle: (f: FormatSpec) => void; tabIndex?: number }) {
  return (
    <>
      {FORMATS.map((f) => (
        <ToolButton
          key={f.mark}
          icon={f.icon}
          iconSize={17}
          label={f.label}
          shortcut={f.shortcut}
          active={!!state[f.mark]}
          tabIndex={tabIndex}
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          onClick={() => onToggle(f)}
        />
      ))}
    </>
  );
}

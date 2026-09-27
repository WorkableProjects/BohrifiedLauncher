import { useLayoutEffect, useRef, useState } from 'react';
import { worldToScreen } from '../engine/geometry';
import { NOTE_PAD } from '../engine/renderer';
import { boardTheme, type Appearance } from '../engine/theme';
import type { TextElement } from '../engine/types';
import { board, useBoard } from '../state/board';
import { getController } from './instance';

export interface EditRequest {
  element: TextElement;
  isNew: boolean;
}

/**
 * Inline editor overlaid exactly where the text renders on canvas, so
 * editing feels like typing on the board itself.
 */
export function TextEditor({ request, onDone, appearance }: { request: EditRequest; onDone: () => void; appearance: Appearance }) {
  const { element, isNew } = request;
  const [text, setText] = useState(element.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  // Re-render on camera moves so the editor tracks the board.
  useBoard((b) => b.page.camera);
  const cam = board.page.camera;
  const theme = boardTheme(appearance);

  useLayoutEffect(() => {
    getController()?.setHidden(isNew ? [] : [element.id]);
    const t = ref.current;
    if (t) {
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    }
    return () => getController()?.setHidden([]);
  }, [element.id, isNew]);

  // Auto-size plain text to its content.
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t || element.note) return;
    t.style.width = '0px';
    t.style.height = '0px';
    t.style.width = `${t.scrollWidth + 4}px`;
    t.style.height = `${t.scrollHeight}px`;
  }, [text, cam.z, element.note]);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const value = text.replace(/\s+$/, '');
    if (!value) {
      if (!isNew) board.removeElements([element.id]);
    } else if (isNew) {
      board.addElements([{ ...element, text: value }]);
    } else if (value !== element.text) {
      board.replaceElements([{ ...element, text: value }]);
    }
    onDone();
  };

  const p = worldToScreen(cam, element.x, element.y);
  const fontPx = element.fontSize * cam.z;
  const color = theme.resolve(element.color);

  if (element.note) {
    const scale = element.note.w / 220;
    const pad = NOTE_PAD * scale * cam.z;
    return (
      <div
        className="pop-in absolute z-10 overflow-hidden"
        style={{
          left: p.x,
          top: p.y,
          width: element.note.w * cam.z,
          height: element.note.h * cam.z,
          background: theme.noteFill(element.note.tint),
          borderRadius: Math.min(14, element.note.w * 0.06) * cam.z,
          boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
          ['--origin' as string]: '50% 50%',
        }}
      >
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) ref.current?.blur();
          }}
          placeholder="Note"
          aria-label="Sticky note text"
          className="board-editor h-full w-full placeholder:text-label-3"
          style={{ fontSize: fontPx, color, padding: pad, whiteSpace: 'pre-wrap' }}
        />
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      value={text}
      rows={1}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) ref.current?.blur();
      }}
      placeholder="Type"
      aria-label="Text"
      className="board-editor absolute z-10 placeholder:text-label-3"
      style={{ left: p.x, top: p.y, fontSize: fontPx, color, minWidth: fontPx * 2 }}
    />
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { worldToScreen } from '../engine/geometry';
import { NOTE_PAD } from '../engine/renderer';
import { spansFromDOM, spansOf, spansToHTML, trimEndSpans, withSpans } from '../engine/richtext';
import { boardTheme, type Appearance } from '../engine/theme';
import type { TextElement } from '../engine/types';
import { board, useBoard } from '../state/board';
import { FORMATS, FormatButtons, type MarkState } from '../ui/FormatBar';
import { getController } from './instance';

export interface EditRequest {
  element: TextElement;
  isNew: boolean;
}

const BAR_H = 52;
const BAR_GAP = 10;
/** Keep the format bar clear of the top toolbars. */
const TOP_CLEAR = 76;

function readMarks(): MarkState {
  const out: MarkState = {};
  for (const f of FORMATS) {
    try {
      out[f.mark] = document.queryCommandState(f.command);
    } catch {
      out[f.mark] = false;
    }
  }
  return out;
}

/**
 * Rich text editor overlaid exactly where the text renders on canvas, so
 * editing feels like typing on the board itself. A compact format bar
 * floats above it; ⌘B / ⌘I / ⌘U work too.
 */
export function TextEditor({ request, onDone, appearance }: { request: EditRequest; onDone: () => void; appearance: Appearance }) {
  const { element, isNew } = request;
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [empty, setEmpty] = useState(!element.text);
  const [marks, setMarks] = useState<MarkState>({});
  const [box, setBox] = useState({ w: 0, h: 0 });
  // Re-render on camera moves so the editor tracks the board.
  useBoard((b) => b.page.camera);
  const cam = board.page.camera;
  const theme = boardTheme(appearance);

  useLayoutEffect(() => {
    getController()?.setHidden(isNew ? [] : [element.id]);
    const el = ref.current;
    if (el) {
      el.innerHTML = spansToHTML(spansOf(element));
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      try {
        // Formats as <b>/<i>/<u> tags rather than inline styles.
        document.execCommand('styleWithCSS', false, 'false');
      } catch { /* not supported */ }
    }
    return () => getController()?.setHidden([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id, isNew]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onSel = () => document.activeElement === el && setMarks(readMarks());
    document.addEventListener('selectionchange', onSel);
    const ro = new ResizeObserver(() => setBox({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => {
      document.removeEventListener('selectionchange', onSel);
      ro.disconnect();
    };
  }, []);

  const commit = () => {
    if (done.current || !ref.current) return;
    done.current = true;
    const next = withSpans(element, trimEndSpans(spansFromDOM(ref.current)));
    if (!next.text.trim()) {
      if (!isNew) board.removeElements([element.id]);
    } else if (isNew) {
      board.addElements([next]);
    } else if (next.text !== element.text || JSON.stringify(next.spans) !== JSON.stringify(element.spans)) {
      board.replaceElements([next]);
    }
    onDone();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      ref.current?.blur();
    } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      // Plain line breaks keep the editor DOM flat (no nested <div>s).
      e.preventDefault();
      document.execCommand('insertLineBreak');
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  };

  const onInput = () => {
    const el = ref.current;
    if (el) setEmpty(!el.textContent);
  };

  const p = worldToScreen(cam, element.x, element.y);
  const fontPx = element.fontSize * cam.z;
  const color = theme.resolve(element.color);
  const note = element.note;
  const boxW = note ? note.w * cam.z : box.w;
  const boxH = note ? note.h * cam.z : box.h;

  // Format bar: above the text, or below it when there's no room.
  const above = p.y - BAR_H - BAR_GAP >= TOP_CLEAR;
  const barTop = above ? p.y - BAR_H - BAR_GAP : p.y + boxH + BAR_GAP;
  const barLeft = Math.max(12, Math.min(p.x, window.innerWidth - 12 - 160));

  const editor = (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={note ? 'Sticky note text' : 'Text'}
      data-placeholder={note ? 'Note' : 'Type'}
      data-empty={empty}
      spellCheck
      onBlur={commit}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onInput={onInput}
      className={`board-editor ${note ? 'h-full w-full' : 'absolute z-10'}`}
      style={
        note
          ? { fontSize: fontPx, color, padding: NOTE_PAD * (note.w / 220) * cam.z, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }
          : { left: p.x, top: p.y, fontSize: fontPx, color, minWidth: fontPx * 2 }
      }
    />
  );

  const bar = createPortal(
    <div
      className="sheet pop-in fixed z-40 flex items-center gap-0.5 rounded-full! p-1"
      style={{ left: barLeft, top: barTop, ['--origin' as string]: above ? '0% 100%' : '0% 0%' }}
      role="toolbar"
      aria-label="Text format"
    >
      <FormatButtons
        state={marks}
        onToggle={(f) => {
          document.execCommand(f.command);
          setMarks(readMarks());
        }}
      />
    </div>,
    document.getElementById('overlay') ?? document.body,
  );

  if (note) {
    return (
      <>
        <div
          className="pop-in absolute z-10 overflow-hidden"
          style={{
            left: p.x,
            top: p.y,
            width: boxW,
            height: boxH,
            background: theme.noteFill(note.tint),
            borderRadius: Math.min(14, note.w * 0.06) * cam.z,
            boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
            ['--origin' as string]: '50% 50%',
          }}
        >
          {editor}
        </div>
        {bar}
      </>
    );
  }

  return (
    <>
      {editor}
      {bar}
    </>
  );
}

import { useEffect, useLayoutEffect, useRef } from 'react';
import { resolveColor, resolveFont } from '../model/theme';
import * as ops from '../model/ops';
import type { El, ShapeEl, TextEl } from '../model/types';
import { SHAPE_INFO } from '../render/shapes';
import { cellDoc } from '../render/table';
import { doc } from '../state/session';
import { ui } from '../state/ui';
import { docToHtml, htmlToDoc, renumber, trackSelection } from './richedit';
import { activeEditor } from './textfmt';
import { frameOf, centerOf } from './frames';
import { rectPlacement } from './placement';
import type { View } from './viewport';

/** The contenteditable overlay for a text box or the text inside a shape. */
export function TextEditor({ el, slideId, view, onDone }: { el: TextEl | ShapeEl; slideId: string; view: View; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const theme = doc.deck.theme;
  const gesture = useRef<ReturnType<typeof doc.begin> | null>(null);
  const base = el.base!;
  const slide = doc.deck.slides.find((s) => s.id === slideId);
  const frame = slide ? frameOf(slide.elements, el) : { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot };
  const c = centerOf(frame);

  useLayoutEffect(() => {
    const root = editor.current!;
    root.innerHTML = docToHtml(el.doc ?? [{ runs: [{ t: '' }] }], theme, base);
    renumber(root);
    activeEditor.root = root;
    root.focus();
    // Caret to the end.
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    const stop = trackSelection(root);
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch { /* ignore */ }
    gesture.current = doc.begin('Edit text');

    const sync = () => {
      const parsed = htmlToDoc(root, base, theme);
      const h = el.type === 'text' && el.fit === 'grow' ? Math.max(24, Math.ceil(root.scrollHeight)) : null;
      gesture.current?.update((d) => {
        ops.patchElement(d, slideId, el.id, (e: El) => {
          if (e.type === 'text' || e.type === 'shape') e.doc = parsed;
          if (h !== null && e.type === 'text') e.h = h;
        });
      });
    };
    let raf = 0;
    const onInput = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };
    root.addEventListener('input', onInput);
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        onDone();
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') onDone();
      if (e.key === 'Tab') {
        e.preventDefault();
        const p = (window.getSelection()?.anchorNode as Node | null);
        let blk: HTMLElement | null = p instanceof HTMLElement ? p : p?.parentElement ?? null;
        while (blk && blk.parentElement !== root) blk = blk.parentElement;
        if (blk?.dataset.list) {
          blk.dataset.level = String(Math.max(0, Math.min(4, Number(blk.dataset.level ?? 0) + (e.shiftKey ? -1 : 1))));
          renumber(root);
          onInput();
        } else document.execCommand('insertText', false, '    ');
      }
    };
    root.addEventListener('keydown', onKey);
    const paste = (e: ClipboardEvent) => {
      // Paste as plain text: formatting from elsewhere would fight the deck's styles.
      e.preventDefault();
      const t = e.clipboardData?.getData('text/plain') ?? '';
      document.execCommand('insertText', false, t);
    };
    root.addEventListener('paste', paste);
    return () => {
      cancelAnimationFrame(raf);
      sync();
      root.removeEventListener('input', onInput);
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('paste', paste);
      stop();
      activeEditor.root = null;
      gesture.current?.end();
      gesture.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.id]);

  const inset = el.type === 'shape' ? (SHAPE_INFO[el.shape]?.textInset ?? 0) * Math.min(el.w, el.h) : 0;
  const pad = (el.type === 'text' ? el.pad : el.pad ?? 16) + inset;
  const vAlign = el.type === 'text' ? el.vAlign : el.vAlign ?? 'middle';
  const place = rectPlacement(view, c, frame.w, frame.h, frame.rot);
  const style: React.CSSProperties = {
    ...place,
    display: 'flex',
    alignItems: vAlign === 'middle' ? 'center' : vAlign === 'bottom' ? 'flex-end' : 'flex-start',
    ['--te-color' as string]: resolveColor(theme, base.color),
  };
  return (
    <div ref={box} className="te-box" style={style} data-testid="text-editor">
      <div
        ref={editor}
        className="te"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        style={{
          width: '100%',
          padding: pad,
          boxSizing: 'border-box',
          fontFamily: resolveFont(theme, base.font),
          fontSize: base.size,
          fontWeight: base.weight,
          fontStyle: base.italic ? 'italic' : 'normal',
          lineHeight: base.lh,
          letterSpacing: base.ls,
          textAlign: base.align === 'justify' ? 'justify' : base.align,
          color: resolveColor(theme, base.color),
          minHeight: base.size * base.lh,
        }}
      />
    </div>
  );
}

/** Editing one table cell. */
export function CellEditor({ el, r, c, slideId, view, onDone, onMove }: { el: Extract<El, { type: 'table' }>; r: number; c: number; slideId: string; view: View; onDone: () => void; onMove: (r: number, c: number) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const theme = doc.deck.theme;
  const slide = doc.deck.slides.find((s) => s.id === slideId);
  const frame = slide ? frameOf(slide.elements, el) : { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot };
  let x = 0, y = 0;
  for (let i = 0; i < c; i++) x += el.cols[i]!;
  for (let i = 0; i < r; i++) y += el.rows[i]!;
  const cw = el.cols[c]!, rh = el.rows[r]!;
  const cell = el.cells[r]?.[c] ?? { t: '' };
  useEffect(() => {
    const t = ref.current!;
    t.focus();
    t.select();
  }, [r, c]);
  void cellDoc;
  const commit = (v: string) => {
    if (v === cell.t) return;
    doc.commit('Edit cell', (d) => ops.patchElement(d, slideId, el.id, (e) => {
      if (e.type !== 'table') return;
      while (e.cells.length <= r) e.cells.push(e.cols.map(() => ({ t: '' })));
      e.cells[r]![c] = { ...(e.cells[r]![c] ?? {}), t: v };
    }));
  };
  const f = { x: frame.x + x, y: frame.y + y };
  const cc = { x: f.x + cw / 2, y: f.y + rh / 2 };
  const rotated = frame.rot ? rotAround(cc, centerOf(frame), frame.rot) : cc;
  return (
    <div className="te-box" style={rectPlacement(view, rotated, cw, rh, frame.rot)}>
      <textarea
        ref={ref}
        className="cell-ed"
        defaultValue={cell.t}
        style={{ fontFamily: resolveFont(theme, el.base.font), fontSize: el.base.size, color: resolveColor(theme, el.base.color), padding: el.pad, textAlign: cell.align ?? el.base.align }}
        onKeyDown={(e) => {
          e.stopPropagation();
          const v = (e.target as HTMLTextAreaElement).value;
          if (e.key === 'Escape') onDone();
          else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit(v);
            if (r + 1 < el.rows.length) onMove(r + 1, c);
            else onDone();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            commit(v);
            const nc = e.shiftKey ? c - 1 : c + 1;
            if (nc >= 0 && nc < el.cols.length) onMove(r, nc);
            else if (!e.shiftKey && r + 1 < el.rows.length) onMove(r + 1, 0);
            else onDone();
          }
        }}
        onBlur={(e) => {
          commit(e.target.value);
          onDone();
        }}
      />
    </div>
  );
}

function rotAround(p: { x: number; y: number }, c: { x: number; y: number }, deg: number) {
  const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

void ui;

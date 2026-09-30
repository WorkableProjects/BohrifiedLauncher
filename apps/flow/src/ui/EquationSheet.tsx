import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getController } from '../canvas/instance';
import { uid } from '../engine/geometry';
import { EM_PX, loadTex, typeset, type TypesetResult } from '../engine/latex';
import { equationDataUrl } from '../engine/renderer';
import { swatch, type Appearance } from '../engine/theme';
import type { EquationElement } from '../engine/types';
import { usePresence } from '../hooks/usePresence';
import { Icon } from '../icons/Icon';
import { board } from '../state/board';
import { ui, useUI } from '../state/ui';
import { ToolButton } from './controls';

const EXAMPLE = String.raw`\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`;

/** Quick inserts; `|` marks where the caret lands. */
const SNIPPETS: { label: string; tex: string }[] = [
  { label: 'a⁄b', tex: String.raw`\frac{|}{}` },
  { label: '√x', tex: String.raw`\sqrt{|}` },
  { label: 'xⁿ', tex: '^{|}' },
  { label: 'xₙ', tex: '_{|}' },
  { label: '∑', tex: String.raw`\sum_{i=1}^{n} |` },
  { label: '∫', tex: String.raw`\int_{a}^{b} | \,dx` },
  { label: 'lim', tex: String.raw`\lim_{x \to |}` },
  { label: '( )', tex: String.raw`\left( | \right)` },
  { label: 'Matrix', tex: String.raw`\begin{pmatrix} | & b \\ c & d \end{pmatrix}` },
  { label: 'π', tex: String.raw`\pi ` },
  { label: 'θ', tex: String.raw`\theta ` },
  { label: '≤', tex: String.raw`\le ` },
  { label: '≠', tex: String.raw`\ne ` },
  { label: '±', tex: String.raw`\pm ` },
];

/** Board units per em for an equation already on the board (keeps its size when re-edited). */
function emSizeOf(el: EquationElement) {
  const wPx = parseFloat(el.svg.match(/\swidth="([\d.]+)px"/)?.[1] ?? '');
  return wPx ? el.w / (wPx / EM_PX) : el.h;
}

/**
 * LaTeX Equation app: type TeX, see it typeset live, and place it on the
 * board as a vector object you can move, resize and re-edit.
 */
export function EquationSheet({ appearance }: { appearance: Appearance }) {
  const { open, editId } = useUI((s) => s.equation);
  const timerOpen = useUI((s) => s.timerOpen);
  const { mounted, leaving } = usePresence(open);
  const editing = useMemo(() => (editId ? (board.page.elements.find((e) => e.id === editId && e.type === 'equation') as EquationElement | undefined) : undefined), [editId]);
  const [source, setSource] = useState('');
  const [result, setResult] = useState<TypesetResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const sheet = useRef<HTMLElement>(null);

  // Fresh state each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setSource(editing?.latex ?? '');
    setResult(null);
    setError('');
    setLoading(true);
    loadTex()
      .catch(() => setError('The equation typesetter couldn’t load. Check your connection.'))
      .finally(() => setLoading(false));
    requestAnimationFrame(() => {
      const t = input.current;
      if (t) {
        t.focus();
        t.setSelectionRange(t.value.length, t.value.length);
      }
    });
  }, [open, editing]);

  // Live preview, lightly debounced.
  useEffect(() => {
    if (!open) return;
    let stale = false;
    const t = window.setTimeout(async () => {
      const r = await typeset(source);
      if (stale) return;
      if ('error' in r) {
        setResult(null);
        setError(r.error);
      } else {
        setResult(r);
        setError('');
      }
    }, 120);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [source, open, loading]);

  const close = () => {
    // Hand the keyboard back to the board while the sheet animates out.
    const active = document.activeElement;
    if (active instanceof HTMLElement && sheet.current?.contains(active)) active.blur();
    ui.set({ equation: { open: false, editId: null } });
  };

  const insertSnippet = (tex: string) => {
    const t = input.current;
    if (!t) return;
    const caret = tex.indexOf('|');
    const clean = tex.replace('|', '');
    const start = t.selectionStart, end = t.selectionEnd;
    const next = source.slice(0, start) + clean + source.slice(end);
    setSource(next);
    requestAnimationFrame(() => {
      t.focus();
      const at = start + (caret >= 0 ? caret : clean.length);
      t.setSelectionRange(at, at);
    });
  };

  const place = () => {
    if (!result) return;
    const color = editing?.color ?? ui.get().text.color;
    if (editing) {
      const em = emSizeOf(editing);
      const next: EquationElement = { ...editing, latex: source.trim(), svg: result.svg, w: result.wEm * em, h: result.hEm * em, color };
      board.replaceElements([next]);
      ui.set({ tool: 'select', selection: new Set([next.id]) });
    } else {
      const z = board.page.camera.z;
      const em = (Math.max(22, ui.get().text.size) * 1.2) / z;
      const c = getController()?.worldCenter() ?? { x: 0, y: 0 };
      const w = result.wEm * em, h = result.hEm * em;
      const el: EquationElement = { id: uid(), type: 'equation', x: c.x - w / 2, y: c.y - h / 2, w, h, latex: source.trim(), svg: result.svg, color };
      board.addElements([el]);
      ui.set({ tool: 'select', selection: new Set([el.id]) });
    }
    close();
  };

  if (!mounted) return null;
  const previewColor = swatch('label', appearance);

  return createPortal(
    <section
      ref={sheet}
      role="dialog"
      aria-label="LaTeX equation"
      className={`sheet ${leaving ? 'pop-out' : 'pop-in'} fixed right-4 z-40 flex w-[440px] max-w-[calc(100vw-32px)] flex-col p-4 max-sm:right-3 max-sm:max-w-[calc(100vw-24px)]`}
      style={{ top: `calc(max(16px, env(safe-area-inset-top)) + ${timerOpen ? 136 : 72}px)`, ['--origin' as string]: '100% 0%' }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          place();
        }
      }}
    >
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-tint text-white">
          <Icon name="equation" size={19} />
        </span>
        <h2 className="flex-1 text-headline font-semibold tracking-title">{editing ? 'Edit Equation' : 'LaTeX Equation'}</h2>
        <ToolButton icon="close" label="Close" iconSize={12} onClick={close} />
      </header>

      <label className="mt-3 block">
        <span className="sr-only">LaTeX source</span>
        <textarea
          ref={input}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={EXAMPLE}
          rows={3}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="LaTeX source"
          className="block w-full resize-none rounded-[14px] bg-fill px-3.5 py-3 font-mono text-[15px] leading-snug text-label outline-none placeholder:text-label-3 focus:shadow-[0_0_0_2px_var(--tint)]"
        />
      </label>

      <div className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="toolbar" aria-label="Insert symbol">
        {SNIPPETS.map((s) => (
          <button
            key={s.label}
            type="button"
            title={s.tex.replace('|', '')}
            onClick={() => insertSnippet(s.tex)}
            className="spring h-9 shrink-0 rounded-full bg-fill px-3 text-footnote font-semibold text-label hover:bg-fill-2 active:scale-[0.94]"
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        className="mt-2 flex min-h-[112px] items-center justify-center overflow-auto rounded-[18px] bg-bg p-4 shadow-[inset_0_0_0_0.5px_var(--hairline)]"
        aria-live="polite"
      >
        {result ? (
          <img
            key={result.svg}
            src={equationDataUrl(result.svg, previewColor)}
            alt={source}
            className="fade-in max-w-full"
            style={{ width: Math.min(result.wEm, 180 / 30 * (result.wEm / result.hEm)) * 30, height: 'auto' }}
            draggable={false}
          />
        ) : error ? (
          <p className="text-center text-footnote font-medium text-danger">{error}</p>
        ) : (
          <p className="text-center text-footnote text-label-2">{loading ? 'Loading typesetter…' : 'Your equation appears here as you type.'}</p>
        )}
      </div>

      <footer className="mt-3 flex items-center justify-between gap-3">
        <p className="text-footnote text-label-2 mobile:hidden">⌘↩ to {editing ? 'update' : 'insert'}</p>
        <button
          type="button"
          disabled={!result}
          onClick={place}
          className="spring ml-auto flex h-11 items-center gap-2 rounded-full bg-tint px-5 text-headline font-semibold text-white shadow-[0_4px_14px_var(--tint-glow)] hover:brightness-105 active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
        >
          {editing ? 'Update' : 'Insert'}
        </button>
      </footer>
    </section>,
    document.getElementById('overlay') ?? document.body,
  );
}

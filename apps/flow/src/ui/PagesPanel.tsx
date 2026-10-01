import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pageThumbnail } from '../engine/export';
import { boardTheme, type Appearance } from '../engine/theme';
import { board, useBoard } from '../state/board';
import { ui, useUI } from '../state/ui';
import { Icon } from '../icons/Icon';
import { ToolButton } from './controls';
import { usePresence } from '../hooks/usePresence';

/**
 * Lesson pages sidebar: thumbnails, reorder, duplicate, delete.
 * A sheet in the overlay layer — it slides over the board like an iPad sidebar.
 */
export function PagesPanel({ appearance }: { appearance: Appearance }) {
  const open = useUI((s) => s.pagesOpen);
  const pages = useBoard((b) => b.doc.pages);
  const active = useBoard((b) => b.doc.activePage);
  const version = useBoard((b) => b.version);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const { mounted, leaving } = usePresence(open);
  // Drag-to-reorder: which page is held, and the slot it would land in (0..pages.length).
  const [drag, setDrag] = useState<{ id: string; slot: number } | null>(null);
  const list = useRef<HTMLOListElement>(null);

  // Keep the current page in view as the lesson grows.
  useEffect(() => {
    if (open) list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const drop = () => {
    if (!drag) return;
    const from = pages.findIndex((p) => p.id === drag.id);
    // Removing the page shifts every later slot up by one.
    board.movePageTo(drag.id, drag.slot > from ? drag.slot - 1 : drag.slot);
    setDrag(null);
  };

  /** Arrow keys walk the list; Alt + arrow moves the page. */
  const onThumbKey = (e: React.KeyboardEvent, id: string, i: number) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const d = e.key === 'ArrowUp' ? -1 : 1;
    if (e.altKey) {
      board.movePage(id, d);
      requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-page="${id}"]`)?.focus());
    } else {
      const next = pages[i + d];
      if (next) list.current?.querySelector<HTMLElement>(`[data-page="${next.id}"]`)?.focus();
    }
  };

  // Thumbnails regenerate lazily while the panel is open (debounced).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const theme = boardTheme(appearance);
      const next: Record<string, string> = {};
      for (const p of board.doc.pages) next[p.id] = pageThumbnail(p, theme);
      setThumbs(next);
    }, 180);
    return () => clearTimeout(t);
  }, [open, version, appearance]);

  if (!mounted) return null;
  return createPortal(
    <aside
      className={`sheet ${leaving ? 'pop-out' : 'pop-in'} fixed top-[calc(max(16px,env(safe-area-inset-top))+64px)] bottom-[calc(max(16px,env(safe-area-inset-bottom))+72px)] left-4 z-40 flex w-[228px] flex-col`}
      style={{ ['--origin' as string]: '0% 0%' }}
      aria-label="Pages"
    >
      <header className="flex items-center justify-between px-4 pt-3 pb-1">
        <h2 className="text-headline font-semibold tracking-title">Pages</h2>
        <ToolButton icon="close" label="Close pages" iconSize={13} onClick={() => ui.set({ pagesOpen: false })} />
      </header>
      <ol ref={list} className="flex-1 space-y-3 overflow-y-auto px-3 pb-3" onDragEnd={() => setDrag(null)}>
        {pages.map((p, i) => (
          <li
            key={p.id}
            className={`group relative rounded-[14px] ${drag?.id === p.id ? 'opacity-40' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', p.id);
              setDrag({ id: p.id, slot: i });
            }}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              const slot = e.clientY < r.top + r.height / 2 ? i : i + 1;
              if (slot !== drag.slot) setDrag({ ...drag, slot });
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop();
            }}
          >
            {drag && drag.slot === i && drag.id !== p.id && <span aria-hidden className="absolute -top-2 right-0 left-0 h-1 rounded-full bg-tint" />}
            {drag && drag.slot === pages.length && i === pages.length - 1 && <span aria-hidden className="absolute right-0 -bottom-2 left-0 h-1 rounded-full bg-tint" />}
            <button
              type="button"
              data-page={p.id}
              onKeyDown={(e) => onThumbKey(e, p.id, i)}
              onClick={() => board.setActivePage(p.id)}
              aria-current={p.id === active}
              className={`spring block w-full overflow-hidden rounded-[14px] bg-bg p-0 ${p.id === active ? 'shadow-[0_0_0_3px_var(--tint)]' : 'shadow-[0_0_0_1px_var(--hairline)] hover:shadow-[0_0_0_2px_var(--separator)]'}`}
            >
              {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" className="block h-[110px] w-full object-cover" draggable={false} /> : <div className="h-[110px]" />}
            </button>
            <div className="mt-1 flex items-center gap-1 px-1">
              <span className="sr-only">Drag to reorder, or press Alt with the arrow keys.</span>
              <span className="w-5 text-footnote font-semibold text-label-2 tabular-nums">{i + 1}</span>
              <input
                value={p.name}
                onChange={(e) => board.setPageProps({ name: e.target.value }, p.id)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                aria-label={`Page ${i + 1} name`}
                className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1 text-footnote font-medium text-label outline-none focus:bg-fill"
              />
              <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 mobile:opacity-100">
                <button type="button" title="Move up" aria-label="Move page up" disabled={i === 0} onClick={() => board.movePage(p.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-full text-label-2 hover:bg-fill disabled:opacity-30">
                  <Icon name="chevronLeft" size={10} className="rotate-90" />
                </button>
                <button type="button" title="Move down" aria-label="Move page down" disabled={i === pages.length - 1} onClick={() => board.movePage(p.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-full text-label-2 hover:bg-fill disabled:opacity-30">
                  <Icon name="chevronRight" size={10} className="rotate-90" />
                </button>
                <button type="button" title="Duplicate" aria-label="Duplicate page" onClick={() => board.duplicatePage(p.id)} className="flex h-7 w-7 items-center justify-center rounded-full text-label-2 hover:bg-fill">
                  <Icon name="duplicate" size={13} />
                </button>
                <button type="button" title="Delete" aria-label="Delete page" disabled={pages.length <= 1} onClick={() => board.deletePage(p.id)} className="flex h-7 w-7 items-center justify-center rounded-full text-danger hover:bg-fill disabled:opacity-30">
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <footer className="border-t border-hairline p-2">
        <button type="button" onClick={() => board.addPage()} className="spring flex h-11 w-full items-center justify-center gap-2 rounded-full bg-tint-soft text-subhead font-semibold text-on-tint-soft active:scale-[0.97]">
          <Icon name="plus" size={14} /> Add Page
        </button>
      </footer>
    </aside>,
    document.getElementById('overlay') ?? document.body,
  );
}

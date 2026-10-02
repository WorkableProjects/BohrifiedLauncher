import { useRef, useState, useSyncExternalStore } from 'react';
import { docText } from '../model/defaults';
import { Icon } from '../ui/Icon';
import { Btn } from '../ui/controls';
import { doc } from '../state/session';
import { useStore } from '../state/store';
import { ui } from '../state/ui';
import * as cmd from './commands';
import { Thumb } from './Thumb';
import * as ops from '../model/ops';

/** The slide strip: thumbnails, drag to reorder, sections, notes marker. */
export function SlidesPanel() {
  const deck = useSyncExternalStore(doc.subscribe, () => doc.deck);
  const slideId = useStore(ui, (s) => s.slideId);
  const sel = useStore(ui, (s) => s.slideSel);
  const [drop, setDrop] = useState<number | null>(null);
  const dragIds = useRef<string[]>([]);
  const list = useRef<HTMLDivElement>(null);

  const onKey = (e: React.KeyboardEvent) => {
    const i = deck.slides.findIndex((s) => s.id === slideId);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = deck.slides[Math.max(0, Math.min(deck.slides.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) cmd.selectSlide(n.id, e.shiftKey ? 'range' : 'only');
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      cmd.deleteSlides();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      cmd.addSlide();
    }
  };

  return (
    <aside className="slides-panel" aria-label="Slides">
      <div className="slides-list" ref={list} tabIndex={0} onKeyDown={onKey} role="listbox" aria-label="Slide list" aria-multiselectable>
        {deck.slides.map((s, i) => {
          const title = s.name || firstText(s) || `Slide ${i + 1}`;
          return (
            <div key={s.id}>
              {s.section !== undefined && <SectionRow id={s.id} title={s.section} />}
              {drop === i && <div className="drop-line" />}
              <div
                role="option"
                aria-selected={sel.includes(s.id)}
                className={`slide-item ${sel.includes(s.id) ? 'sel' : ''} ${s.id === slideId ? 'cur' : ''} ${s.hidden ? 'skipped' : ''}`}
                draggable
                data-testid="slide-item"
                onClick={(e) => cmd.selectSlide(s.id, e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'only')}
                onContextMenu={(e) => {
                  if (!sel.includes(s.id)) cmd.selectSlide(s.id);
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent('frames:slidemenu', { detail: { x: e.clientX, y: e.clientY } }));
                }}
                onDragStart={(e) => {
                  dragIds.current = sel.includes(s.id) ? sel : [s.id];
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/x-frames-slides', dragIds.current.join(','));
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('text/x-frames-slides')) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setDrop(e.clientY < r.top + r.height / 2 ? i : i + 1);
                }}
                onDragEnd={() => setDrop(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const ids = dragIds.current;
                  const at = drop ?? i;
                  setDrop(null);
                  if (!ids.length) return;
                  const before = deck.slides.slice(0, at).filter((x) => !ids.includes(x.id)).length;
                  cmd.moveSlides(ids, before);
                }}
              >
                <span className="slide-n">{i + 1}</span>
                <Thumb deck={deck} slide={s} width={168} />
                <div className="slide-badges">
                  {s.notes.trim() && <span title="Has speaker notes"><Icon name="notes" size={12} /></span>}
                  {s.anims.length > 0 && <span title="Has animations"><Icon name="sparkles" size={12} /></span>}
                  {s.transition && s.transition.type !== 'none' && <span title="Has a transition"><Icon name="film" size={12} /></span>}
                  {s.hidden && <span title="Skipped in the presentation"><Icon name="eye-off" size={12} /></span>}
                </div>
                <span className="sr-only">{title}</span>
              </div>
            </div>
          );
        })}
        {drop === deck.slides.length && <div className="drop-line" />}
        <div
          className="drop-tail"
          onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-frames-slides')) { e.preventDefault(); setDrop(deck.slides.length); } }}
          onDrop={(e) => { e.preventDefault(); const ids = dragIds.current; setDrop(null); if (ids.length) cmd.moveSlides(ids, deck.slides.filter((x) => !ids.includes(x.id)).length); }}
        />
      </div>
      <div className="slides-foot">
        <Btn icon="plus" label="New slide" variant="tint" onClick={() => cmd.addSlide()} />
      </div>
    </aside>
  );
}

function firstText(s: { elements: import('../model/types').El[] }) {
  const t = s.elements.find((e) => e.type === 'text' && e.ph === 'title') ?? s.elements.find((e) => e.type === 'text');
  return t && t.type === 'text' ? docText(t.doc).split('\n')[0]!.trim().slice(0, 60) : '';
}

function SectionRow({ id, title }: { id: string; title: string }) {
  const [text, setText] = useState(title);
  return (
    <div className="section-row">
      <Icon name="section" size={13} />
      <input
        aria-label="Section name"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => doc.commit('Rename section', (d) => ops.patchSlide(d, id, { section: text.trim() || 'Section' }))}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <button type="button" aria-label="Remove section" onClick={() => doc.commit('Remove section', (d) => ops.patchSlide(d, id, { section: undefined }))}><Icon name="x" size={12} /></button>
    </div>
  );
}

import { useState } from 'react';
import { docText } from '../../model/defaults';
import * as ops from '../../model/ops';
import type { El } from '../../model/types';
import { Btn, Empty, Section } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { doc } from '../../state/session';
import { ui } from '../../state/ui';
import { useStore } from '../../state/store';
import * as cmd from '../commands';
import { useSel } from './common';

const TYPE_ICON: Record<El['type'], string> = { text: 'type', shape: 'shapes', line: 'line', image: 'image', icon: 'star', video: 'film', audio: 'music', table: 'table', chart: 'chart', group: 'group' };

function labelOf(e: El): string {
  if (e.name) return e.name;
  if (e.type === 'text') return docText(e.doc).split('\n')[0]!.slice(0, 40) || 'Text';
  if (e.type === 'shape' && e.doc) return docText(e.doc).split('\n')[0]!.slice(0, 40) || e.shape;
  return e.type === 'shape' ? e.shape.replace(/-/g, ' ') : e.type[0]!.toUpperCase() + e.type.slice(1);
}

export function ArrangeTab() {
  const { slide, ids } = useSel();
  const sel = useStore(ui, (s) => s.sel);
  const multi = ids.length > 1;
  const A = (icon: string, title: string, fn: () => void, disabled = false) => <Btn key={title} size="sm" icon={icon} title={title} disabled={disabled} onClick={fn} />;
  const none = ids.length === 0;
  return (
    <div>
      <Section title="Align" id="al">
        <div className="row wrap" style={{ gap: 2 }}>
          {A('align-left', 'Align left', () => cmd.align('left'), none)}{A('align-center', 'Align centre', () => cmd.align('center'), none)}{A('align-right', 'Align right', () => cmd.align('right'), none)}
          {A('align-top', 'Align top', () => cmd.align('top'), none)}{A('align-middle', 'Align middle', () => cmd.align('middle'), none)}{A('align-bottom', 'Align bottom', () => cmd.align('bottom'), none)}
        </div>
        <div className="row wrap" style={{ gap: 2 }}>
          {A('distribute-h', 'Distribute horizontally', () => cmd.distribute('h'), ids.length < 3)}{A('distribute-v', 'Distribute vertically', () => cmd.distribute('v'), ids.length < 3)}
          <span className="mono" style={{ marginLeft: 6 }}>{multi ? 'Relative to each other' : 'Relative to the slide'}</span>
        </div>
        <div className="row wrap">
          <Btn size="sm" label="Centre on slide" disabled={none} onClick={() => { cmd.align('center', 'slide'); cmd.align('middle', 'slide'); }} />
        </div>
      </Section>
      <Section title="Order & group" id="ord">
        <div className="row wrap" style={{ gap: 2 }}>
          {A('bring-front', 'Bring to front', () => cmd.arrange('front'), none)}{A('bring-forward', 'Bring forward', () => cmd.arrange('forward'), none)}{A('send-backward', 'Send backward', () => cmd.arrange('backward'), none)}{A('send-back', 'Send to back', () => cmd.arrange('back'), none)}
          <span className="sep" />
          {A('group', 'Group', cmd.group, !multi)}{A('ungroup', 'Ungroup', cmd.ungroup, none)}
          <span className="sep" />
          {A('lock', 'Lock', () => cmd.setLocked(true), none)}{A('unlock', 'Unlock', () => cmd.setLocked(false), none)}
        </div>
      </Section>
      <Section title="Layers" id="layers">
        {!slide || slide.elements.length === 0 ? <Empty icon="layers" title="Nothing on this slide yet">Add text, a shape or an image from the toolbar.</Empty> : (
          <div className="list" role="list">
            {[...slide.elements].reverse().map((e) => <LayerRow key={e.id} el={e} depth={0} sel={sel} slideId={slide.id} />)}
          </div>
        )}
      </Section>
    </div>
  );
}

function LayerRow({ el, depth, sel, slideId }: { el: El; depth: number; sel: string[]; slideId: string }) {
  const [open, setOpen] = useState(true);
  const [over, setOver] = useState(false);
  const selected = sel.includes(el.id);
  return (
    <>
      <div
        role="listitem"
        className={`layer ${selected ? 'sel' : ''} ${el.hidden ? 'off' : ''}`}
        style={{ paddingLeft: 6 + depth * 14, outline: over ? '2px solid var(--tint)' : undefined }}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/x-frames-layer', el.id)}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-frames-layer')) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const id = e.dataTransfer.getData('text/x-frames-layer');
          const s = doc.deck.slides.find((x) => x.id === slideId);
          const box = s && ops.containerOf(s.elements, el.id);
          if (!id || id === el.id || !box) return;
          // Dropping onto a row puts the dragged layer just above it.
          const target = box.findIndex((x) => x.id === el.id);
          doc.commit('Reorder layers', (d) => ops.moveToIndex(d, slideId, id, target + 1));
        }}
        onClick={(e) => cmd.select(e.shiftKey ? (selected ? sel.filter((x) => x !== el.id) : [...sel, el.id]) : [el.id], true)}
      >
        {el.type === 'group' ? <button type="button" aria-label={open ? 'Collapse' : 'Expand'} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}><Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} /></button> : <span style={{ width: 12 }} />}
        <Icon name={TYPE_ICON[el.type]} size={15} />
        <span className="name">{labelOf(el)}</span>
        <button type="button" aria-label={el.hidden ? 'Show' : 'Hide'} title={el.hidden ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); cmd.setHidden(!el.hidden, [el.id]); }}><Icon name={el.hidden ? 'eye-off' : 'eye'} size={14} /></button>
        <button type="button" aria-label={el.locked ? 'Unlock' : 'Lock'} title={el.locked ? 'Unlock' : 'Lock'} onClick={(e) => { e.stopPropagation(); cmd.setLocked(!el.locked, [el.id]); }}><Icon name={el.locked ? 'lock' : 'unlock'} size={14} /></button>
      </div>
      {el.type === 'group' && open && [...el.children].reverse().map((c) => <LayerRow key={c.id} el={c} depth={depth + 1} sel={sel} slideId={slideId} />)}
    </>
  );
}

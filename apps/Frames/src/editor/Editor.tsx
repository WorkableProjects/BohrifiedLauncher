import { useEffect, useState, useSyncExternalStore } from 'react';
import { Btn } from '../ui/controls';
import { ContextMenu, type MenuItem } from '../ui/Menu';
import { currentSlide, doc } from '../state/session';
import { usePrefs, setPrefs } from '../state/prefs';
import { useStore } from '../state/store';
import { ui } from '../state/ui';
import * as cmd from './commands';
import { Inspector } from './inspector/Inspector';
import { SlidesPanel } from './SlidesPanel';
import { Stage } from './Stage';
import { Timeline } from './timeline/Timeline';
import { Toolbar } from './Toolbar';
import { copyStyle, pasteStyle } from './style';
import { shortcutLabel } from './shortcuts';
import { FormatBar } from './FormatBar';

export function Editor() {
  const inspectorOpen = useStore(ui, (s) => s.inspectorOpen);
  const timeline = useStore(ui, (s) => s.timeline);
  const [notes, setNotes] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: 'el' | 'slide' } | null>(null);

  useEffect(() => {
    const el = (e: Event) => setMenu({ ...(e as CustomEvent).detail, kind: 'el' });
    const sl = (e: Event) => setMenu({ ...(e as CustomEvent).detail, kind: 'slide' });
    window.addEventListener('frames:contextmenu', el);
    window.addEventListener('frames:slidemenu', sl);
    return () => {
      window.removeEventListener('frames:contextmenu', el);
      window.removeEventListener('frames:slidemenu', sl);
    };
  }, []);

  const hasSel = ui.get().sel.length > 0;
  const elItems: MenuItem[] = [
    { label: 'Cut', kbd: shortcutLabel('cut'), disabled: !hasSel, onClick: cmd.cutSelection },
    { label: 'Copy', kbd: shortcutLabel('copy'), disabled: !hasSel, onClick: () => void cmd.copySelection() },
    { label: 'Paste', kbd: shortcutLabel('paste'), onClick: () => { if (!cmd.pasteElements()) void navigator.clipboard?.readText().then(cmd.pasteText).catch(() => {}); } },
    { label: 'Duplicate', kbd: shortcutLabel('duplicate'), disabled: !hasSel, onClick: () => void cmd.duplicateSelection() },
    { label: 'Delete', disabled: !hasSel, danger: true, onClick: cmd.deleteSelection },
    { divider: true },
    { label: 'Copy style', disabled: !hasSel, onClick: copyStyle },
    { label: 'Paste style', disabled: !hasSel, onClick: pasteStyle },
    { divider: true },
    { label: 'Bring to front', disabled: !hasSel, onClick: () => cmd.arrange('front') },
    { label: 'Send to back', disabled: !hasSel, onClick: () => cmd.arrange('back') },
    { label: 'Group', kbd: shortcutLabel('group'), disabled: ui.get().sel.length < 2, onClick: cmd.group },
    { label: 'Ungroup', disabled: !hasSel, onClick: cmd.ungroup },
    { label: 'Lock', disabled: !hasSel, onClick: () => cmd.setLocked(true) },
    { divider: true },
    { label: 'Animate…', disabled: !hasSel, onClick: () => ui.set({ inspectorOpen: true, inspector: 'animate' }) },
  ];
  const s = currentSlide();
  const slideItems: MenuItem[] = [
    { label: 'New slide', onClick: () => cmd.addSlide() },
    { label: 'Duplicate', onClick: cmd.duplicateSlides },
    { label: s?.hidden ? 'Show in presentation' : 'Skip in presentation', onClick: () => s && doc.commit('Skip slide', (d) => { const x = d.slides.find((q) => q.id === s.id); if (x) x.hidden = !x.hidden || undefined; }) },
    { label: s?.section !== undefined ? 'Remove section' : 'Start a section here', onClick: () => s && doc.commit('Section', (d) => { const x = d.slides.find((q) => q.id === s.id); if (x) x.section = x.section === undefined ? 'New section' : undefined; }) },
    { divider: true },
    { label: 'Delete', danger: true, onClick: cmd.deleteSlides },
  ];

  return (
    <div className="app" data-testid="editor">
      <Toolbar />
      <div className={`workspace ${inspectorOpen ? '' : 'no-inspector'}`}>
        <SlidesPanel />
        <div className="center">
          <div className="stage-wrap">
            <FormatBar />
            <Stage />
          </div>
          {timeline ? <Timeline /> : <span />}
          <StatusBar notes={notes} onNotes={() => setNotes(!notes)} />
          {notes && <NotesBar />}
        </div>
        {inspectorOpen && <Inspector />}
      </div>
      <ContextMenu at={menu} items={menu?.kind === 'slide' ? slideItems : elItems} onClose={() => setMenu(null)} />
    </div>
  );
}

function StatusBar({ notes, onNotes }: { notes: boolean; onNotes: () => void }) {
  const deck = useSyncExternalStore(doc.subscribe, () => doc.deck);
  const slideId = useStore(ui, (s) => s.slideId);
  const timeline = useStore(ui, (s) => s.timeline);
  const grid = usePrefs((p) => p.showGrid);
  const rulers = usePrefs((p) => p.showRulers);
  const idx = deck.slides.findIndex((s) => s.id === slideId);
  return (
    <div className="statusbar">
      <span>Slide {idx + 1} of {deck.slides.length}</span>
      <span className="grow" />
      <Btn size="sm" icon="notes" label="Notes" active={notes} onClick={onNotes} />
      <Btn size="sm" icon="timeline" label="Timeline" active={timeline} onClick={() => ui.set({ timeline: !timeline })} title={`Timeline (${shortcutLabel('timeline')})`} />
      <Btn size="sm" icon="ruler" title="Rulers" active={rulers} onClick={() => setPrefs({ showRulers: !rulers })} />
      <Btn size="sm" icon="grid" title="Grid" active={grid} onClick={() => setPrefs({ showGrid: !grid })} />
    </div>
  );
}

function NotesBar() {
  const slideId = useStore(ui, (s) => s.slideId);
  const deck = useSyncExternalStore(doc.subscribe, () => doc.deck);
  const slide = deck.slides.find((s) => s.id === slideId);
  return (
    <div className="notes">
      <textarea
        aria-label="Speaker notes"
        placeholder="Speaker notes for this slide"
        value={slide?.notes ?? ''}
        onChange={(e) => cmd.patchSlide({ notes: e.target.value }, 'Edit notes', 'notes:' + slideId)}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

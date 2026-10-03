import { useState, useSyncExternalStore } from 'react';
import { Btn } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { MenuButton, type MenuItem } from '../ui/Menu';
import { Dialog } from '../ui/Dialog';
import { doc } from '../state/session';
import { useStore } from '../state/store';
import { ui } from '../state/ui';
import { prefs } from '../state/prefs';
import { goHome, startPresenting } from '../app/flow';
import * as cmd from './commands';
import { CHARTS, IconPicker, ShapePicker, TablePicker, useFilePicker } from './pickers';
import { shortcutLabel } from './shortcuts';

export function Toolbar() {
  const deck = useSyncExternalStore(doc.subscribe, () => doc.deck);
  const version = useSyncExternalStore(doc.subscribe, () => doc.version);
  const sel = useStore(ui, (s) => s.sel);
  const inspector = useStore(ui, (s) => s.inspector);
  const inspectorOpen = useStore(ui, (s) => s.inspectorOpen);
  const tool = useStore(ui, (s) => s.tool);
  const imageIn = useFilePicker('image/*,.svg', (f) => void cmd.importFiles(f));
  const mediaIn = useFilePicker('video/*,audio/*', (f) => void cmd.importFiles(f));
  void version;
  const [title, setTitle] = useState<string | null>(null);

  const imageItems: MenuItem[] = [
    { label: 'Upload from computer…', icon: 'upload', onClick: imageIn.open },
    { label: 'Empty picture frame', icon: 'image', onClick: cmd.insertImagePlaceholder },
    { label: 'Icon…', icon: 'star', onClick: () => ui.set({ dialog: 'icons' }) },
    { divider: true },
    { label: 'Tip: drop or paste images straight onto the slide', disabled: true },
  ];
  const lineItems: MenuItem[] = [
    { label: 'Line', icon: 'line', onClick: () => { ui.set({ lineKind: 'straight' }); cmd.insertLine(); } },
    { label: 'Arrow', icon: 'arrow-right', onClick: () => { ui.set({ lineKind: 'straight' }); cmd.insertLine(undefined, true); } },
    { label: 'Curved connector', icon: 'activity', onClick: () => { ui.set({ lineKind: 'curve' }); cmd.insertLine(undefined, true); } },
    { label: 'Elbow connector', icon: 'corner', onClick: () => { ui.set({ lineKind: 'elbow' }); cmd.insertLine(undefined, true); } },
    { divider: true },
    { label: 'Draw a line by dragging', icon: 'move', onClick: () => ui.set({ tool: 'line' }) },
  ];
  const chartItems: MenuItem[] = CHARTS.map((c) => ({ label: c.label, icon: c.icon, onClick: () => cmd.insertChart(c.kind) }));
  const addItems: MenuItem[] = [
    { heading: 'New slide' },
    ...deck.layouts.map((l) => ({ label: l.name, icon: 'template', onClick: () => cmd.addSlide(l.id) })),
  ];

  return (
    <header className="topbar" role="toolbar" aria-label="Frames toolbar">
      <div className="tb-group left">
        <Btn icon="chevron-left" title="All presentations" onClick={() => void goHome()} />
        <input
          className="title-in"
          aria-label="Presentation title"
          value={title ?? deck.title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== null && title.trim() && title !== deck.title) doc.commit('Rename', (d) => { d.title = title.trim(); }, 'title');
            setTitle(null);
          }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setTitle(null); (e.target as HTMLInputElement).blur(); } }}
        />
      </div>
      <div className="tb-group center">
        <Btn icon="undo" title={`Undo ${doc.undoLabel ? doc.undoLabel.toLowerCase() : ''}`} disabled={!doc.canUndo} onClick={cmd.undo} />
        <Btn icon="redo" title={`Redo ${doc.redoLabel ? doc.redoLabel.toLowerCase() : ''}`} disabled={!doc.canRedo} onClick={cmd.redo} />
        <span className="sep" />
        <MenuButton items={addItems} trigger={({ ref, toggle }) => <Btn btnRef={ref} icon="plus" label="Add" title="Add a slide" onClick={toggle} />} />
        <Btn icon="type" label="Text" title={`Add text (${shortcutLabel('text')})`} active={tool === 'text'} onClick={() => cmd.insertText()} />
        <MenuButton items={imageItems} trigger={({ ref, toggle }) => <Btn btnRef={ref} icon="image" label="Image" title="Add an image" onClick={toggle} />} />
        <MenuButton align="center" trigger={({ ref, open, toggle }) => (
          <Btn btnRef={ref} icon="shapes" label="Shape" title="Add a shape" active={open || tool === 'shape'} onClick={toggle} />
        )}>{(close) => <ShapePicker onDone={close} />}</MenuButton>
        <MenuButton items={lineItems} trigger={({ ref, toggle }) => <Btn btnRef={ref} icon="line" label="Line" title="Add a line" active={tool === 'line'} onClick={toggle} />} />
        <MenuButton items={[
          { label: 'Video or audio…', icon: 'film', onClick: mediaIn.open },
        ]} trigger={({ ref, toggle }) => <Btn btnRef={ref} icon="film" label="Media" title="Add video or audio" onClick={toggle} />} />
        <MenuButton align="center" trigger={({ ref, toggle }) => <Btn btnRef={ref} icon="table" label="Table" title="Add a table" onClick={toggle} />}>{(close) => <TablePicker onDone={close} />}</MenuButton>
        <MenuButton items={chartItems} trigger={({ ref, toggle }) => <Btn btnRef={ref} icon="chart" label="Chart" title="Add a chart" onClick={toggle} />} />
        <span className="sep" />
        <ArrangeButton disabled={!sel.length} />
        <Btn icon="sparkles" label="Animate" title="Animate" active={inspectorOpen && inspector === 'animate'} onClick={() => ui.set({ inspectorOpen: true, inspector: 'animate' })} />
      </div>
      <div className="tb-group right">
        <Btn icon="download" label="Export" title="Export" onClick={() => ui.set({ dialog: 'export' })} />
        <Btn icon="present" label="Present" variant="tint" title={`Present (${shortcutLabel('present')})`} onClick={() => startPresenting(false)} />
        <Btn icon="settings" title="Preferences" onClick={() => ui.set({ dialog: 'prefs' })} />
        <Btn icon="sliders" title={inspectorOpen ? 'Hide inspector' : 'Show inspector'} active={inspectorOpen} onClick={() => ui.set({ inspectorOpen: !inspectorOpen })} />
      </div>
      {imageIn.el}
      {mediaIn.el}
      <IconDialog />
    </header>
  );
}

function IconDialog() {
  const open = useStore(ui, (s) => s.dialog === 'icons');
  if (!open) return null;
  return (
    <Dialog title="Icons" onClose={() => ui.set({ dialog: null })}>
      <IconPicker onDone={() => ui.set({ dialog: null })} />
    </Dialog>
  );
}

function ArrangeButton({ disabled }: { disabled: boolean }) {
  const multi = useStore(ui, (s) => s.sel.length > 1);
  const items: MenuItem[] = [
    { heading: 'Order' },
    { label: 'Bring to front', icon: 'bring-front', kbd: shortcutLabel('front'), onClick: () => cmd.arrange('front') },
    { label: 'Bring forward', icon: 'bring-forward', kbd: shortcutLabel('forward'), onClick: () => cmd.arrange('forward') },
    { label: 'Send backward', icon: 'send-backward', kbd: shortcutLabel('backward'), onClick: () => cmd.arrange('backward') },
    { label: 'Send to back', icon: 'send-back', kbd: shortcutLabel('back'), onClick: () => cmd.arrange('back') },
    { divider: true },
    { heading: multi ? 'Align to each other' : 'Align to slide' },
    { label: 'Left', icon: 'align-left', onClick: () => cmd.align('left') },
    { label: 'Centre', icon: 'align-center', onClick: () => cmd.align('center') },
    { label: 'Right', icon: 'align-right', onClick: () => cmd.align('right') },
    { label: 'Top', icon: 'align-top', onClick: () => cmd.align('top') },
    { label: 'Middle', icon: 'align-middle', onClick: () => cmd.align('middle') },
    { label: 'Bottom', icon: 'align-bottom', onClick: () => cmd.align('bottom') },
    { divider: true },
    { label: 'Distribute horizontally', icon: 'distribute-h', disabled: !multi, onClick: () => cmd.distribute('h') },
    { label: 'Distribute vertically', icon: 'distribute-v', disabled: !multi, onClick: () => cmd.distribute('v') },
    { divider: true },
    { label: 'Group', icon: 'group', kbd: shortcutLabel('group'), disabled: !multi, onClick: cmd.group },
    { label: 'Ungroup', icon: 'ungroup', kbd: shortcutLabel('ungroup'), onClick: cmd.ungroup },
    { label: 'Lock', icon: 'lock', onClick: () => cmd.setLocked(true) },
    { label: 'Unlock', icon: 'unlock', onClick: () => cmd.setLocked(false) },
    { label: 'Flip horizontally', icon: 'flip-h', onClick: () => cmd.flip('x') },
    { label: 'Flip vertically', icon: 'flip-v', onClick: () => cmd.flip('y') },
  ];
  return <MenuButton items={items} trigger={({ ref, toggle }) => <Btn btnRef={ref} icon="arrange" label="Arrange" title="Arrange" disabled={disabled} onClick={toggle} />} />;
}

void prefs;
void Icon;

import { useRef, useState } from 'react';
import { applyChartCsv, chartDataToCsv } from '../../render/charts';
import { SHAPE_GROUPS, SHAPE_INFO, shapeIconPath } from '../../render/shapes';
import { ICON_GROUPS } from '../../render/icons';
import type { Arrowhead, ChartKind, Effects, Fill, ImageEl, ShapeKind, Shadow, Stroke, TableEl } from '../../model/types';
import { Btn, ColorBtn, Empty, Field, FillEditor, Num, Section, Select, Seg, Slider, TextInput, Toggle } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { MenuButton } from '../../ui/Menu';
import { toast, ui } from '../../state/ui';
import { doc } from '../../state/session';
import * as cmd from '../commands';
import { applyPreset, copyStyle, deletePreset, pasteStyle, savePreset } from '../style';
import { useFilePicker } from '../pickers';
import { SpacingControls, TextControls } from './TextControls';
import { common, edit, editAny, round1, useSel } from './common';
import { CHARTS } from '../pickers';
import { strokeOf } from '../../model/defaults';
import { usePrefs } from '../../state/prefs';

const DASH = [{ value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dash' }, { value: 'dot', label: 'Dot' }] as const;
const HEADS: { value: Arrowhead; label: string }[] = [{ value: 'none', label: 'None' }, { value: 'arrow', label: 'Arrow' }, { value: 'triangle', label: 'Triangle' }, { value: 'dot', label: 'Dot' }, { value: 'bar', label: 'Bar' }, { value: 'diamond', label: 'Diamond' }];

export function DesignTab() {
  const { els, one, slide, theme } = useSel();
  const advanced = ui.get().advanced;
  usePrefs((p) => p.density);
  if (!slide) return null;
  if (!els.length) return <SlideTab />;
  const types = new Set(els.map((e) => e.type));
  const hasText = els.some((e) => e.type === 'text' || (e.type === 'shape' && e.doc && e.doc.some((p) => p.runs.some((r) => r.t))));
  return (
    <div>
      <div className="insp-title">
        {one ? <input className="title-in" aria-label="Object name" value={one.name ?? one.type[0]!.toUpperCase() + one.type.slice(1)} onChange={(e) => editAny((x) => { x.name = e.target.value; }, 'Rename', 'name')} onKeyDown={(e) => e.stopPropagation()} /> : <span>{els.length} objects <small>selected</small></span>}
      </div>
      {one && <PositionSection />}
      {els.length > 1 && <MultiSection />}
      {hasText && <Section title="Text"><TextControls />{advanced && <SpacingControls />}</Section>}
      {types.size === 1 && one?.type === 'text' && <TextBoxSection />}
      {(types.has('shape') || types.has('text')) && <FillSection />}
      {one?.type === 'shape' && <ShapeSection />}
      {one?.type === 'line' && <LineSection />}
      {one?.type === 'image' && <ImageSection />}
      {one?.type === 'icon' && <IconSection />}
      {(one?.type === 'video' || one?.type === 'audio') && <MediaSection />}
      {one?.type === 'table' && <TableSection />}
      {one?.type === 'chart' && <ChartSection />}
      <EffectsSection />
      <StylesSection />
      <Section title="More" defaultOpen={false}>
        <Field label="Link"><TextInput label="Link" placeholder="https://" value={common(els, (e) => e.link) ?? ''} onCommit={(v) => editAny((x) => { x.link = v.trim() || undefined; }, 'Link')} /></Field>
        <Field label="Alt text"><TextInput label="Alt text" placeholder="Describe for screen readers" value={common(els, (e) => e.alt) ?? ''} onCommit={(v) => editAny((x) => { x.alt = v.trim() || undefined; }, 'Alt text')} /></Field>
        {advanced && <Field label="Magic Move" hint="Objects with the same key on neighbouring slides glide into each other."><TextInput label="Magic Move key" placeholder="e.g. hero" value={common(els, (e) => e.morph) ?? ''} onCommit={(v) => editAny((x) => { x.morph = v.trim() || undefined; }, 'Magic Move key')} /></Field>}
      </Section>
      <div style={{ padding: '10px 14px' }}>
        <Btn size="sm" label={advanced ? 'Hide advanced controls' : 'Show advanced controls'} onClick={() => ui.set({ advanced: !advanced })} />
      </div>
      <span hidden>{theme.name}</span>
    </div>
  );
}

// ── Position ─────────────────────────────────────────────────────────────────

function PositionSection() {
  const { one } = useSel();
  const [lock, setLock] = useState(false);
  if (!one) return null;
  const aspect = one.w / Math.max(1, one.h);
  const set = (patch: Partial<typeof one>, k: string) => editAny((e) => Object.assign(e, patch), 'Position', 'pos:' + k);
  return (
    <Section title="Position & size" id="pos">
      <div className="row two"><Num label="X" value={round1(one.x)} onChange={(v) => set({ x: v }, 'x')} /><Num label="Y" value={round1(one.y)} onChange={(v) => set({ y: v }, 'y')} /></div>
      <div className="row two">
        <Num label="W" value={round1(one.w)} min={1} onChange={(v) => set(lock ? { w: v, h: v / aspect } : { w: v }, 'w')} disabled={one.type === 'text' && one.fit === 'grow' && false} />
        <Num label="H" value={round1(one.h)} min={1} onChange={(v) => set(lock ? { h: v, w: v * aspect } : { h: v }, 'h')} />
      </div>
      <div className="row two">
        <Num label="∠" value={round1(one.rot)} unit="°" onChange={(v) => set({ rot: ((v % 360) + 360) % 360 }, 'rot')} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Btn size="sm" icon={lock ? 'lock' : 'unlock'} title="Keep proportions" active={lock} onClick={() => setLock(!lock)} />
          <Btn size="sm" icon="flip-h" title="Flip horizontally" active={!!one.flipX} onClick={() => cmd.flip('x')} />
          <Btn size="sm" icon="flip-v" title="Flip vertically" active={!!one.flipY} onClick={() => cmd.flip('y')} />
        </div>
      </div>
    </Section>
  );
}

function MultiSection() {
  const { ids } = useSel();
  const A = (icon: string, title: string, fn: () => void) => <Btn key={icon} size="sm" icon={icon} title={title} onClick={fn} />;
  return (
    <Section title="Arrange" id="multi">
      <div className="row wrap" style={{ gap: 2 }}>
        {A('align-left', 'Align left', () => cmd.align('left'))}{A('align-center', 'Align centres', () => cmd.align('center'))}{A('align-right', 'Align right', () => cmd.align('right'))}
        {A('align-top', 'Align top', () => cmd.align('top'))}{A('align-middle', 'Align middles', () => cmd.align('middle'))}{A('align-bottom', 'Align bottom', () => cmd.align('bottom'))}
        {A('distribute-h', 'Distribute horizontally', () => cmd.distribute('h'))}{A('distribute-v', 'Distribute vertically', () => cmd.distribute('v'))}
        {A('group', 'Group', cmd.group)}
      </div>
      <span hidden>{ids.length}</span>
    </Section>
  );
}

// ── Fill, border ─────────────────────────────────────────────────────────────

function FillSection() {
  const { els, theme } = useSel();
  const fills = els.filter((e) => e.type === 'text' || e.type === 'shape');
  const fill = common(fills, (e) => (e.type === 'text' || e.type === 'shape' ? e.fill ?? null : null));
  const stroke = common(fills, (e) => (e.type === 'text' || e.type === 'shape' ? e.stroke ?? null : null));
  const setFill = (f: Fill | null) => editAny((e) => { if (e.type === 'text' || e.type === 'shape') e.fill = f; }, 'Fill', 'fill');
  const setStroke = (s: Stroke | null) => editAny((e) => { if (e.type === 'text' || e.type === 'shape') e.stroke = s; }, 'Border', 'stroke');
  return (
    <>
      <Section title="Fill"><FillEditor value={fill} onChange={setFill} theme={theme} label="Fill" /></Section>
      <Section title="Border">
        <div className="row">
          <ColorBtn value={stroke?.c ?? null} allowNone theme={theme} label="Border colour" onChange={(c) => setStroke(c ? { ...(stroke ?? strokeOf(c, 4)), c } : null)} />
          <Num label="Width" value={stroke?.w ?? 0} min={0} max={80} step={1} onChange={(w) => setStroke(w > 0 ? { ...(stroke ?? strokeOf('@text', w)), w } : null)} />
        </div>
        {stroke && <Seg value={stroke.dash ?? 'solid'} onChange={(dash) => setStroke({ ...stroke, dash })} label="Dash" options={DASH.map((d) => ({ value: d.value, label: d.label }))} />}
      </Section>
    </>
  );
}

function TextBoxSection() {
  const { one } = useSel();
  if (!one || one.type !== 'text') return null;
  return (
    <Section title="Text box" defaultOpen={false}>
      <Field label="Auto fit"><Seg value={one.fit} onChange={(fit) => edit('text', (e) => { e.fit = fit; })} label="Auto fit" options={[{ value: 'grow', label: 'Grow' }, { value: 'shrink', label: 'Shrink' }, { value: 'none', label: 'Off' }]} /></Field>
      <Field label="Align"><Seg value={one.vAlign} onChange={(vAlign) => edit('text', (e) => { e.vAlign = vAlign; })} label="Vertical alignment" options={[{ value: 'top', icon: 'align-top', title: 'Top' }, { value: 'middle', icon: 'align-middle', title: 'Middle' }, { value: 'bottom', icon: 'align-bottom', title: 'Bottom' }]} /></Field>
      <div className="row two"><Num label="Pad" value={one.pad} min={0} max={200} onChange={(v) => edit('text', (e) => { e.pad = v; }, 'Padding', 'pad')} /><Num label="Round" value={one.radius ?? 0} min={0} max={300} onChange={(v) => edit('text', (e) => { e.radius = v; }, 'Corner radius', 'rad')} /></div>
    </Section>
  );
}

function ShapeSection() {
  const { one } = useSel();
  const ref = useRef<HTMLButtonElement>(null);
  if (!one || one.type !== 'shape') return null;
  const info = SHAPE_INFO[one.shape];
  return (
    <Section title="Shape">
      <MenuButton align="start" trigger={({ ref: r, toggle }) => (
        <Btn btnRef={r} className="ghost" variant="ghost" onClick={toggle}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.6"><path d={shapeIconPath(one.shape)} /></svg>
          <span>{info?.label ?? one.shape}</span><Icon name="chevron-down" size={14} />
        </Btn>
      )}>
        {(close) => (
          <div className="picker shapes">
            {SHAPE_GROUPS.map((g) => (
              <div key={g.name}><h4>{g.name}</h4><div className="grid">{g.kinds.map((k) => (
                <button key={k} type="button" title={SHAPE_INFO[k as ShapeKind]?.label ?? k} onClick={() => { edit('shape', (e) => { e.shape = k as ShapeKind; if (e.radius === undefined) e.radius = SHAPE_INFO[k as ShapeKind]?.adj?.def; }, 'Change shape'); close(); }}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.6"><path d={shapeIconPath(k as ShapeKind)} /></svg>
                </button>
              ))}</div></div>
            ))}
          </div>
        )}
      </MenuButton>
      {info?.adj && <Field label={info.adj.label}><Slider label={info.adj.label} value={one.radius ?? info.adj.def} min={info.adj.min} max={info.adj.max} step={info.adj.step} onChange={(v) => edit('shape', (e) => { e.radius = v; }, 'Adjust shape', 'adj')} /></Field>}
      <span ref={ref} hidden />
    </Section>
  );
}

function LineSection() {
  const { one, theme } = useSel();
  if (!one || one.type !== 'line') return null;
  const s = one.stroke;
  const set = (p: Partial<Stroke>, k: string) => edit('line', (e) => { Object.assign(e.stroke, p); }, 'Line style', 'line:' + k);
  return (
    <Section title="Line">
      <div className="row"><ColorBtn value={s.c} theme={theme} label="Line colour" onChange={(c) => c && set({ c }, 'c')} /><Num label="Width" value={s.w} min={1} max={80} onChange={(w) => set({ w }, 'w')} /></div>
      <Seg value={s.dash ?? 'solid'} onChange={(dash) => set({ dash }, 'dash')} label="Dash" options={DASH.map((d) => ({ value: d.value, label: d.label }))} />
      <Field label="Shape"><Seg value={one.curve} onChange={(curve) => edit('line', (e) => { e.curve = curve; })} label="Line shape" options={[{ value: 'straight', label: 'Straight' }, { value: 'curve', label: 'Curve' }, { value: 'elbow', label: 'Elbow' }]} /></Field>
      <Field label="Start"><Select label="Start" value={one.start} options={HEADS} onChange={(v) => edit('line', (e) => { e.start = v; })} /></Field>
      <Field label="End"><Select label="End" value={one.end} options={HEADS} onChange={(v) => edit('line', (e) => { e.end = v; })} /></Field>
    </Section>
  );
}

// ── Image ────────────────────────────────────────────────────────────────────

function ImageSection() {
  const { one, theme } = useSel();
  const pick = useFilePicker('image/*,.svg', (f) => void cmd.importFiles(f.slice(0, 1), undefined, { replace: true }), false);
  const advanced = ui.get().advanced;
  if (!one || one.type !== 'image') return null;
  const meta = doc.deck.assets[one.asset ?? ''];
  const isSvg = meta?.kind === 'svg';
  const f = one.filters;
  const setF = (p: Partial<ImageEl['filters']>) => edit('image', (e) => { Object.assign(e.filters, p); }, 'Image adjustments', 'filter');
  const zoom = 1 / one.crop.w;
  return (
    <>
      <Section title="Image">
        <div className="row two">
          <Btn size="sm" icon="upload" label="Replace" className="ghost" variant="ghost" onClick={pick.open} />
          <Btn size="sm" icon="crop" label="Crop" className="ghost" variant="ghost" disabled={!one.asset} onClick={() => ui.set({ editing: { type: 'crop', id: one.id } })} />
        </div>
        {one.asset && (
          <Field label="Zoom"><Slider label="Zoom" value={zoom} min={1} max={5} step={0.02} format={(v) => `${Math.round(v * 100)}%`} onChange={(z) => edit('image', (e) => {
            const cx = e.crop.x + e.crop.w / 2, cy = e.crop.y + e.crop.h / 2;
            const ratio = e.crop.h / e.crop.w;
            const w = 1 / z, h = Math.min(1, w * ratio);
            e.crop = { w, h, x: Math.min(1 - w, Math.max(0, cx - w / 2)), y: Math.min(1 - h, Math.max(0, cy - h / 2)) };
          }, 'Zoom image', 'zoom')} /></Field>
        )}
        <Field label="Mask"><Select label="Mask" value={one.mask} options={[{ value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Circle / oval' }, { value: 'round-rect', label: 'Rounded' }, { value: 'hexagon', label: 'Hexagon' }, { value: 'diamond', label: 'Diamond' }, { value: 'star', label: 'Star' }, { value: 'heart', label: 'Heart' }, { value: 'triangle', label: 'Triangle' }, { value: 'pill', label: 'Pill' }, { value: 'cloud', label: 'Cloud' }]} onChange={(m) => edit('image', (e) => { e.mask = m as ShapeKind; })} /></Field>
        <Field label="Corners"><Slider label="Corner radius" value={one.radius} min={0} max={300} onChange={(v) => edit('image', (e) => { e.radius = v; }, 'Corner radius', 'rad')} /></Field>
        {isSvg && <Field label="Recolour"><ColorBtn value={one.tint ?? null} allowNone theme={theme} label="Recolour" onChange={(c) => edit('image', (e) => { e.tint = c; })} /></Field>}
        {pick.el}
      </Section>
      <Section title="Adjust" defaultOpen={false}>
        <Field label="Brightness"><Slider label="Brightness" value={f.brightness ?? 1} min={0.2} max={2} step={0.02} onChange={(v) => setF({ brightness: v })} format={(v) => `${Math.round(v * 100)}%`} /></Field>
        <Field label="Contrast"><Slider label="Contrast" value={f.contrast ?? 1} min={0.2} max={2} step={0.02} onChange={(v) => setF({ contrast: v })} format={(v) => `${Math.round(v * 100)}%`} /></Field>
        <Field label="Saturation"><Slider label="Saturation" value={f.saturate ?? 1} min={0} max={3} step={0.02} onChange={(v) => setF({ saturate: v })} format={(v) => `${Math.round(v * 100)}%`} /></Field>
        <div className="row wrap">{[['None', {}], ['Mono', { grayscale: 1 }], ['Sepia', { sepia: 0.8 }], ['Vivid', { saturate: 1.6, contrast: 1.1 }], ['Fade', { contrast: 0.85, brightness: 1.1, saturate: 0.8 }], ['Noir', { grayscale: 1, contrast: 1.3, brightness: 0.9 }]].map(([n, p]) => (
          <button key={n as string} type="button" className="chip" onClick={() => edit('image', (e) => { e.filters = { ...(p as ImageEl['filters']) }; }, 'Filter')}>{n as string}</button>
        ))}</div>
        {advanced && <>
          <Field label="Blur"><Slider label="Blur" value={f.blur ?? 0} min={0} max={40} onChange={(v) => setF({ blur: v })} /></Field>
          <Field label="Hue"><Slider label="Hue" value={f.hue ?? 0} min={-180} max={180} onChange={(v) => setF({ hue: v })} format={(v) => `${v}°`} /></Field>
        </>}
      </Section>
    </>
  );
}

function IconSection() {
  const { one, theme } = useSel();
  if (!one || one.type !== 'icon') return null;
  return (
    <Section title="Icon">
      <MenuButton trigger={({ ref, toggle }) => <Btn btnRef={ref} className="ghost" variant="ghost" onClick={toggle}><Icon name={one.icon} size={20} /><span>{one.icon.replace(/-/g, ' ')}</span><Icon name="chevron-down" size={14} /></Btn>}>
        {(close) => <div className="picker icons"><div className="icon-scroll">{ICON_GROUPS.map((g) => <div key={g.name}><h4>{g.name}</h4><div className="grid">{g.icons.map((n) => <button key={n} type="button" title={n} onClick={() => { edit('icon', (e) => { e.icon = n; }, 'Change icon'); close(); }}><Icon name={n} size={22} /></button>)}</div></div>)}</div></div>}
      </MenuButton>
      <div className="row"><ColorBtn value={one.color} theme={theme} label="Icon colour" onChange={(c) => c && edit('icon', (e) => { e.color = c; }, 'Icon colour', 'ic')} /><Num label="Stroke" value={one.sw} min={0.5} max={4} step={0.25} onChange={(v) => edit('icon', (e) => { e.sw = v; }, 'Icon stroke', 'sw')} /></div>
    </Section>
  );
}

function MediaSection() {
  const { one } = useSel();
  if (!one || (one.type !== 'video' && one.type !== 'audio')) return null;
  const t = one.type;
  return (
    <Section title={t === 'video' ? 'Video' : 'Audio'}>
      <Field label="Autoplay"><Toggle label="Autoplay" value={one.autoplay} onChange={(v) => editAny((e) => { if (e.type === t) (e as typeof one).autoplay = v; }, 'Autoplay')} /></Field>
      <Field label="Loop"><Toggle label="Loop" value={one.loop} onChange={(v) => editAny((e) => { if (e.type === t) (e as typeof one).loop = v; }, 'Loop')} /></Field>
      {one.type === 'video' && <Field label="Muted"><Toggle label="Muted" value={one.muted} onChange={(v) => edit('video', (e) => { e.muted = v; }, 'Mute')} /></Field>}
      <Field label="Volume"><Slider label="Volume" value={one.volume} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => editAny((e) => { if (e.type === t) (e as typeof one).volume = v; }, 'Volume', 'vol')} /></Field>
      <p className="hint">In a presentation, click a video to play or pause it.</p>
    </Section>
  );
}

// ── Table & chart ────────────────────────────────────────────────────────────

function TableSection() {
  const { one, theme } = useSel();
  if (!one || one.type !== 'table') return null;
  const t: TableEl = one;
  const resize = (fn: (e: TableEl) => void, label: string) => edit('table', (e) => { fn(e); e.w = e.cols.reduce((a, b) => a + b, 0); e.h = e.rows.reduce((a, b) => a + b, 0); }, label);
  return (
    <Section title="Table">
      <div className="row two">
        <div className="row"><span className="mono">Rows</span><Btn size="sm" icon="minus" title="Remove last row" disabled={t.rows.length <= 1} onClick={() => resize((e) => { e.rows.pop(); e.cells.pop(); }, 'Remove row')} /><b>{t.rows.length}</b><Btn size="sm" icon="plus" title="Add row" onClick={() => resize((e) => { e.rows.push(e.rows[e.rows.length - 1] ?? 96); e.cells.push(e.cols.map(() => ({ t: '' }))); }, 'Add row')} /></div>
        <div className="row"><span className="mono">Cols</span><Btn size="sm" icon="minus" title="Remove last column" disabled={t.cols.length <= 1} onClick={() => resize((e) => { e.cols.pop(); e.cells.forEach((r) => r.pop()); }, 'Remove column')} /><b>{t.cols.length}</b><Btn size="sm" icon="plus" title="Add column" onClick={() => resize((e) => { e.cols.push(e.cols[e.cols.length - 1] ?? 300); e.cells.forEach((r) => r.push({ t: '' })); }, 'Add column')} /></div>
      </div>
      <Field label="Header row"><Toggle label="Header row" value={t.header} onChange={(v) => edit('table', (e) => { e.header = v; })} /></Field>
      <Field label="Banded rows"><Toggle label="Banded rows" value={t.banded} onChange={(v) => edit('table', (e) => { e.banded = v; })} /></Field>
      <div className="row"><span className="mono">Header</span><ColorBtn value={t.headerFill} theme={theme} label="Header colour" onChange={(c) => c && edit('table', (e) => { e.headerFill = c; }, 'Header colour', 'hf')} /><span className="mono">Band</span><ColorBtn value={t.bandFill} theme={theme} label="Band colour" onChange={(c) => c && edit('table', (e) => { e.bandFill = c; }, 'Band colour', 'bf')} /><span className="mono">Lines</span><ColorBtn value={t.border.c} theme={theme} label="Line colour" onChange={(c) => c && edit('table', (e) => { e.border.c = c; }, 'Line colour', 'bc')} /></div>
      <div className="row two"><Num label="Text" value={t.base.size} min={8} max={120} onChange={(v) => edit('table', (e) => { e.base.size = v; }, 'Table text size', 'ts')} /><Num label="Pad" value={t.pad} min={0} max={80} onChange={(v) => edit('table', (e) => { e.pad = v; }, 'Cell padding', 'tp')} /></div>
      <p className="hint">Double-click a cell to edit. Tab moves to the next cell.</p>
    </Section>
  );
}

function ChartSection() {
  const { one, theme } = useSel();
  const [csv, setCsv] = useState<string | null>(null);
  if (!one || one.type !== 'chart') return null;
  return (
    <>
      <Section title="Chart">
        <Select label="Chart type" value={one.kind} options={CHARTS.map((c) => ({ value: c.kind, label: c.label }))} onChange={(k) => edit('chart', (e) => { e.kind = k as ChartKind; })} />
        <Field label="Title"><TextInput label="Chart title" value={one.title ?? ''} onCommit={(v) => edit('chart', (e) => { e.title = v || undefined; })} /></Field>
        <Field label="Legend"><Select label="Legend" value={one.legend} options={[{ value: 'none', label: 'None' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }, { value: 'right', label: 'Right' }]} onChange={(v) => edit('chart', (e) => { e.legend = v; })} /></Field>
        <Field label="Grid"><Toggle label="Grid" value={one.grid} onChange={(v) => edit('chart', (e) => { e.grid = v; })} /></Field>
        <Field label="Values"><Toggle label="Value labels" value={one.labels} onChange={(v) => edit('chart', (e) => { e.labels = v; })} /></Field>
        {(one.kind === 'column' || one.kind === 'bar' || one.kind === 'area') && <Field label="Stacked"><Toggle label="Stacked" value={one.stacked} onChange={(v) => edit('chart', (e) => { e.stacked = v; })} /></Field>}
        {one.kind === 'line' && <Field label="Smooth"><Toggle label="Smooth" value={one.smooth} onChange={(v) => edit('chart', (e) => { e.smooth = v; })} /></Field>}
      </Section>
      <Section title="Data">
        <TextInput label="Chart data" multiline rows={6} value={csv ?? chartDataToCsv(one)} onChange={setCsv} onCommit={(v) => { if (csv === null) return; const d = applyChartCsv(one, v); edit('chart', (e) => { e.categories = d.categories; e.series = d.series; }, 'Edit chart data'); setCsv(null); }} />
        <p className="hint">One row per category; the first row names the series. Paste from a spreadsheet.</p>
        <div className="row wrap">{one.series.map((s, i) => <ColorBtn key={i} value={s.color ?? theme.palette[i % theme.palette.length]!} theme={theme} label={`Colour of ${s.name}`} onChange={(c) => c && edit('chart', (e) => { e.series[i]!.color = c; }, 'Series colour', 'sc' + i)} />)}</div>
      </Section>
    </>
  );
}

// ── Effects ──────────────────────────────────────────────────────────────────

function EffectsSection() {
  const { els, theme } = useSel();
  const advanced = ui.get().advanced;
  const fx: Effects | undefined = common(els, (e) => e.fx) ?? undefined;
  const opacity = common(els, (e) => e.opacity) ?? 1;
  const setFx = (p: Partial<Effects>, k: string) => editAny((e) => { e.fx = { ...(e.fx ?? {}), ...p }; }, 'Effects', 'fx:' + k);
  const shadowKey = !fx?.shadow ? 'none' : typeof fx.shadow === 'string' ? fx.shadow : 'custom';
  const custom: Shadow | null = fx?.shadow && typeof fx.shadow === 'object' ? fx.shadow : null;
  return (
    <Section title="Effects" defaultOpen={false}>
      <Field label="Opacity"><Slider label="Opacity" value={opacity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => editAny((e) => { e.opacity = v; }, 'Opacity', 'op')} /></Field>
      <Field label="Shadow"><Seg value={shadowKey} label="Shadow" onChange={(k) => setFx({ shadow: k === 'none' ? null : k === 'custom' ? { x: 0, y: 12, blur: 28, c: 'rgba(0,0,0,0.3)' } : k }, 'shadow')} options={[{ value: 'none', label: 'None' }, { value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }, { value: 'custom', label: '···' }]} /></Field>
      {custom && (
        <div className="row wrap">
          <Num label="X" value={custom.x} onChange={(x) => setFx({ shadow: { ...custom, x } }, 'shadow')} width={70} /><Num label="Y" value={custom.y} onChange={(y) => setFx({ shadow: { ...custom, y } }, 'shadow')} width={70} />
          <Num label="Blur" value={custom.blur} min={0} onChange={(blur) => setFx({ shadow: { ...custom, blur } }, 'shadow')} width={84} />
          <ColorBtn value={custom.c} theme={theme} label="Shadow colour" onChange={(c) => c && setFx({ shadow: { ...custom, c } }, 'shadow')} />
        </div>
      )}
      <Field label="Blur"><Slider label="Blur" value={fx?.blur ?? 0} min={0} max={60} onChange={(v) => setFx({ blur: v || undefined }, 'blur')} /></Field>
      {advanced && (
        <>
          <Field label="Glow"><div className="row"><ColorBtn value={fx?.glow?.c ?? null} allowNone theme={theme} label="Glow colour" onChange={(c) => setFx({ glow: c ? { c, blur: fx?.glow?.blur ?? 40 } : null }, 'glow')} /><Num label="Size" value={fx?.glow?.blur ?? 0} min={0} max={200} onChange={(b) => setFx({ glow: { c: fx?.glow?.c ?? '@accent', blur: b } }, 'glow')} /></div></Field>
          <Field label="Blend"><Select label="Blend mode" value={(fx?.blend ?? 'source-over') as string} options={['source-over', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'color-dodge', 'difference'].map((v) => ({ value: v, label: v === 'source-over' ? 'Normal' : v }))} onChange={(v) => setFx({ blend: v === 'source-over' ? undefined : (v as GlobalCompositeOperation) }, 'blend')} /></Field>
        </>
      )}
    </Section>
  );
}

function StylesSection() {
  const { one } = useSel();
  const styles = doc.deck.styles;
  const [name, setName] = useState('');
  return (
    <Section title="Styles" defaultOpen={false}>
      <div className="row two">
        <Btn size="sm" icon="brush" label="Copy style" className="ghost" variant="ghost" onClick={copyStyle} />
        <Btn size="sm" icon="paste" label="Paste style" className="ghost" variant="ghost" onClick={pasteStyle} />
      </div>
      {styles.length > 0 && <div className="list">{styles.map((s) => (
        <div key={s.id} className="row"><button type="button" className="list-item" onClick={() => applyPreset(s)}><span className="grow">{s.name}</span></button><Btn size="sm" icon="trash" title={`Delete ${s.name}`} onClick={() => deletePreset(s.id)} /></div>
      ))}</div>}
      {one && (
        <div className="row"><TextInput label="Style name" placeholder="Name this style" value={name} onChange={setName} /><Btn size="sm" label="Save" disabled={!name.trim()} onClick={() => { savePreset(name.trim()); setName(''); toast('Style saved to this presentation'); }} /></div>
      )}
    </Section>
  );
}

// The Slide tab is shown when nothing is selected.
import { SlideTab } from './SlideTab';
void Empty;

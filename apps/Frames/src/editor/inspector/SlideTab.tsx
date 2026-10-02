import { clone } from '../../model/clone';
import { useSyncExternalStore } from 'react';
import { THEMES, FONTS } from '../../model/theme';
import { solid } from '../../model/defaults';
import * as ops from '../../model/ops';
import type { DesignSystem, Direction, Fill, ThemeColors } from '../../model/types';
import { TRANSITION_MAP } from '../../transitions/registry';
import { Btn, ColorBtn, Field, FillEditor, Num, Section, Select, Seg, Slider, TextInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { doc, currentSlide } from '../../state/session';
import { useStore } from '../../state/store';
import { toast, ui } from '../../state/ui';
import * as cmd from '../commands';

const COLOR_LABELS: [keyof ThemeColors, string][] = [['bg', 'Background'], ['surface', 'Surface'], ['text', 'Text'], ['muted', 'Muted'], ['primary', 'Primary'], ['secondary', 'Secondary'], ['accent', 'Accent'], ['success', 'Success'], ['danger', 'Danger']];
const FONT_OPTS = FONTS.map((f) => ({ value: f.name, label: f.name }));

export function SlideTab() {
  const deck = useSyncExternalStore(doc.subscribe, () => doc.deck);
  const slideId = useStore(ui, (s) => s.slideId);
  const slide = deck.slides.find((s) => s.id === slideId) ?? currentSlide();
  if (!slide) return null;
  const layout = deck.layouts.find((l) => l.id === slide.layout);
  const tr = slide.transition;
  const trDef = tr ? TRANSITION_MAP.get(tr.type) : null;
  const setTheme = (t: DesignSystem) => doc.commit('Apply theme', (d) => { d.theme = clone(t); });
  const bg = slide.background ?? null;

  return (
    <div>
      <div className="insp-title"><span>Slide {deck.slides.findIndex((s) => s.id === slide.id) + 1}</span> <small>{layout?.name ?? 'No layout'}</small></div>

      <Section title="Layout">
        <div className="preset-grid">
          {deck.layouts.map((l) => (
            <button key={l.id} type="button" className="preset-card" aria-pressed={l.id === slide.layout} style={l.id === slide.layout ? { outline: '2px solid var(--tint)' } : undefined} onClick={() => doc.commit('Change layout', (d) => ops.applyLayout(d, slide.id, l.id))}>
              <b>{l.name}</b>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Background">
        <FillEditor value={bg} theme={deck.theme} label="Background" onChange={(f: Fill | null) => cmd.patchSlide({ background: f }, 'Slide background', 'bg')} />
        {bg && <Btn size="sm" label="Use the theme background" onClick={() => cmd.patchSlide({ background: undefined }, 'Reset background')} />}
      </Section>

      <Section title="Transition">
        <button type="button" className="list-item ghost" style={{ border: '1px solid var(--separator)' }} onClick={() => ui.set({ dialog: 'transition' })}>
          <Icon name="film" size={18} />
          <span className="grow">{trDef ? trDef.name : 'None'}<br /><small>{trDef ? trDef.category : 'Cut'}</small></span>
          <Icon name="chevron-right" size={14} />
        </button>
        {tr && trDef && (
          <>
            <Field label="Duration"><Slider label="Transition duration" value={tr.dur} min={100} max={4000} step={50} format={(v) => `${(v / 1000).toFixed(2)}s`} onChange={(dur) => cmd.patchSlide({ transition: { ...tr, dur } }, 'Transition', 'trd')} /></Field>
            {trDef.directional && <Field label="Direction"><Seg<Direction> value={tr.dir ?? 'left'} label="Direction" onChange={(dir) => cmd.patchSlide({ transition: { ...tr, dir } }, 'Transition')} options={[{ value: 'left', label: '←' }, { value: 'right', label: '→' }, { value: 'up', label: '↑' }, { value: 'down', label: '↓' }]} /></Field>}
          </>
        )}
        <Btn size="sm" label="Apply to all slides" disabled={!tr} onClick={() => { doc.commit('Apply transition to all', (d) => { d.slides.forEach((s) => { s.transition = clone(tr); }); }); toast('Transition applied to every slide'); }} />
      </Section>

      <Section title="Timing" defaultOpen={false}>
        <Field label="Advance" hint="Move on by itself after the last build finishes."><Seg value={slide.auto ? 'auto' : 'click'} label="Advance" onChange={(v) => cmd.patchSlide({ auto: v === 'auto' ? 4000 : undefined }, 'Slide timing')} options={[{ value: 'click', label: 'On click' }, { value: 'auto', label: 'Automatic' }]} /></Field>
        {slide.auto ? <Field label="After"><Slider label="Auto-advance" value={slide.auto} min={500} max={30000} step={250} format={(v) => `${(v / 1000).toFixed(1)}s`} onChange={(v) => cmd.patchSlide({ auto: v }, 'Slide timing', 'auto')} /></Field> : null}
        <Field label="Skip"><Seg value={slide.hidden ? 'skip' : 'show'} label="Presentation" onChange={(v) => cmd.patchSlide({ hidden: v === 'skip' ? true : undefined }, 'Skip slide')} options={[{ value: 'show', label: 'Show' }, { value: 'skip', label: 'Skip' }]} /></Field>
      </Section>

      <Section title="Notes" defaultOpen={false}>
        <TextInput label="Speaker notes" multiline rows={4} placeholder="Speaker notes" value={slide.notes} onChange={(v) => cmd.patchSlide({ notes: v }, 'Edit notes', 'notes:' + slide.id)} />
      </Section>

      <Section title="Theme" id="theme">
        <div className="row wrap">
          {THEMES.map((t) => (
            <button key={t.name} type="button" className={`chip ${t.name === deck.theme.name ? 'on' : ''}`} title={`Apply ${t.name}`} onClick={() => setTheme(t)}>
              <span style={{ display: 'inline-flex' }}>{[t.colors.bg, t.colors.primary, t.colors.secondary].map((c, i) => <i key={i} style={{ width: 10, height: 10, borderRadius: 3, background: c, border: '1px solid rgba(128,128,128,.4)', marginRight: -2 }} />)}</span>
              {t.name}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          {COLOR_LABELS.map(([k, label]) => (
            <ColorBtn key={k} value={deck.theme.colors[k]} theme={deck.theme} label={label} alpha={false} onChange={(c) => c && doc.commit('Theme colour', (d) => { d.theme.colors[k] = c; }, 'tc:' + k)} />
          ))}
        </div>
        <Field label="Headings"><Select label="Heading font" value={deck.theme.fonts.heading} options={FONT_OPTS} onChange={(v) => doc.commit('Heading font', (d) => { d.theme.fonts.heading = v; })} /></Field>
        <Field label="Body"><Select label="Body font" value={deck.theme.fonts.body} options={FONT_OPTS} onChange={(v) => doc.commit('Body font', (d) => { d.theme.fonts.body = v; })} /></Field>
        <div className="row two">
          <Num label="Title" value={deck.theme.type.title} min={20} max={300} onChange={(v) => doc.commit('Type scale', (d) => { d.theme.type.title = v; }, 'ty')} />
          <Num label="Body" value={deck.theme.type.body} min={12} max={120} onChange={(v) => doc.commit('Type scale', (d) => { d.theme.type.body = v; }, 'ty2')} />
        </div>
        <Btn size="sm" icon="palette" label="Styles, templates & brand kits…" className="ghost" variant="ghost" onClick={() => ui.set({ dialog: 'brand' })} />
      </Section>

      <Section title="Slide size" defaultOpen={false}>
        <Seg value={`${deck.size.w}x${deck.size.h}`} label="Slide size" onChange={(v) => { const [w, h] = v.split('x').map(Number) as [number, number]; doc.commit('Slide size', (d) => { d.size = { w, h }; }); }} options={[{ value: '1920x1080', label: '16:9' }, { value: '1920x1200', label: '16:10' }, { value: '1600x1200', label: '4:3' }, { value: '1440x1440', label: '1:1' }, { value: '1080x1920', label: '9:16' }]} />
        <p className="hint">Changing the size keeps objects where they are; adjust them afterwards.</p>
        <Field label="Margin"><Slider label="Margin" value={deck.margin} min={0} max={240} step={4} onChange={(v) => doc.commit('Margin', (d) => { d.margin = v; }, 'margin')} /></Field>
      </Section>
      <span hidden>{solid('#000').t}</span>
    </div>
  );
}

import { clone } from '../../model/clone';
import { useState, useSyncExternalStore } from 'react';
import { CAMERA, findEl } from '../../anim/engine';
import { PRESET_KINDS, PRESET_MAP, defaultParams, presetsFor, type PresetDef } from '../../anim/presets';
import { uid } from '../../model/ids';
import * as ops from '../../model/ops';
import type { AnimKind, SlideAnim, Stagger, Trigger } from '../../model/types';
import { library } from '../../io/library';
import { Btn, Empty, Field, Num, Section, Select, Seg, Slider, Toggle } from '../../ui/controls';
import { EasePicker } from '../../ui/EasePicker';
import { Icon } from '../../ui/Icon';
import { doc, currentSlide } from '../../state/session';
import { useStore } from '../../state/store';
import { toast, ui } from '../../state/ui';
import * as cmd from '../commands';
import { useSel } from './common';

const KIND_COLOR: Record<AnimKind, string> = { entrance: 'var(--tint)', exit: '#ff9f0a', emphasis: '#8b5cf6', motion: '#0a84ff', transform: '#34c759', camera: '#ff375f' };

export function previewAll() {
  ui.set({ preview: { startedAt: performance.now() }, playhead: null });
}
export function previewOne(id: string) {
  ui.set({ preview: { startedAt: performance.now(), solo: id }, playhead: null });
}

export function AnimateTab() {
  const deck = useSyncExternalStore(doc.subscribe, () => doc.deck);
  const { one, els } = useSel();
  const animSel = useStore(ui, (s) => s.animSel);
  const slide = deck.slides.find((s) => s.id === ui.get().slideId) ?? currentSlide();
  const [kind, setKind] = useState<AnimKind>('entrance');
  if (!slide) return null;
  const mine = one ? slide.anims.filter((a) => a.el === one.id) : [];
  const selected = slide.anims.find((a) => animSel.includes(a.id));
  const nameOf = (id: string) => (id === CAMERA ? 'Camera' : findEl(slide.elements, id)?.name ?? findEl(slide.elements, id)?.type ?? 'Object');

  return (
    <div>
      <div className="insp-title"><span>Animate</span> <small>{one ? one.name ?? one.type : els.length > 1 ? 'Select one object' : 'Nothing selected'}</small></div>

      <Section title="Add animation" id="addanim">
        {!one ? <Empty icon="sparkles" title="Pick an object">Select something on the slide to animate it, or add a camera move below.</Empty> : (
          <>
            <Seg<AnimKind> value={kind} label="Animation type" onChange={setKind} options={PRESET_KINDS.filter((k) => k.kind !== 'camera').map((k) => ({ value: k.kind, label: k.label.slice(0, 5) === 'Trans' ? 'Change' : k.label }))} />
            <Gallery defs={presetsFor(kind, one.type)} onPick={(d) => {
              const a = cmd.addAnimation(d.id, one.id);
              if (a) previewOne(a.id);
            }} />
          </>
        )}
      </Section>

      {mine.length > 0 && (
        <Section title="On this object" id="mine">
          <div className="list">{mine.map((a) => <AnimRow key={a.id} a={a} sel={animSel.includes(a.id)} />)}</div>
        </Section>
      )}

      {selected && <AnimEditor key={selected.id} a={selected} />}

      <Section title="Camera" id="camera" defaultOpen={false}>
        <p className="hint" style={{ marginTop: 0 }}>Move the whole view: zoom to an object, pan, push in.</p>
        <div className="preset-grid">
          {presetsFor('camera').map((d) => (
            <button key={d.id} type="button" className="preset-card" onClick={() => { const a = cmd.addAnimation(d.id, CAMERA, one && d.id === 'camera-zoom-to' ? {} : {}); if (a) previewOne(a.id); }}>
              <b>{d.name}</b><small>{d.id === 'camera-zoom-to' ? (one ? 'to selected object' : 'select an object first') : `${(d.dur / 1000).toFixed(1)}s`}</small>
            </button>
          ))}
        </div>
      </Section>

      <Section title={`Build order (${slide.anims.length})`} id="order">
        {slide.anims.length === 0 ? <p className="hint" style={{ margin: 0 }}>Nothing animates on this slide yet.</p> : (
          <div className="list">
            {slide.anims.map((a, i) => (
              <div key={a.id} className="row">
                <button type="button" className={`list-item ${animSel.includes(a.id) ? 'sel' : ''}`} onClick={() => ui.set({ animSel: [a.id] })}>
                  <i style={{ width: 8, height: 8, borderRadius: 3, background: KIND_COLOR[a.kind], flex: 'none' }} />
                  <span className="grow">{nameOf(a.el)} · {PRESET_MAP.get(a.preset ?? '')?.name ?? a.kind}</span>
                  <small>{triggerLabel(a.trigger)}</small>
                </button>
                <Btn size="sm" icon="chevron-up" title="Move earlier" disabled={i === 0} onClick={() => doc.commit('Reorder animation', (d) => ops.moveAnim(d, slide.id, a.id, i - 1))} />
                <Btn size="sm" icon="chevron-down" title="Move later" disabled={i === slide.anims.length - 1} onClick={() => doc.commit('Reorder animation', (d) => ops.moveAnim(d, slide.id, a.id, i + 1))} />
              </div>
            ))}
          </div>
        )}
        <div className="row two">
          <Btn size="sm" icon="play" label="Preview slide" disabled={slide.anims.length === 0} className="ghost" variant="ghost" onClick={previewAll} />
          <Btn size="sm" icon="timeline" label="Open timeline" className="ghost" variant="ghost" onClick={() => ui.set({ timeline: true })} />
        </div>
      </Section>

      <SavedPresets disabled={!one} />
    </div>
  );
}

const triggerLabel = (t: Trigger) => (t === 'click' ? 'On click' : t === 'with' ? 'With previous' : 'After previous');

function Gallery({ defs, onPick }: { defs: PresetDef[]; onPick: (d: PresetDef) => void }) {
  const groups = [...new Set(defs.map((d) => d.category))];
  return (
    <div>
      {groups.map((g) => (
        <div key={g}>
          <h4 className="pop-h">{g}</h4>
          <div className="preset-grid">
            {defs.filter((d) => d.category === g).map((d) => (
              <button key={d.id} type="button" className="preset-card" onClick={() => onPick(d)}><b>{d.name}</b><small>{(d.dur / 1000).toFixed(1)}s{d.params.length ? ' · adjustable' : ''}</small></button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AnimRow({ a, sel }: { a: SlideAnim; sel: boolean }) {
  return (
    <div className="row">
      <button type="button" className={`list-item ${sel ? 'sel' : ''}`} onClick={() => ui.set({ animSel: [a.id] })}>
        <i style={{ width: 8, height: 8, borderRadius: 3, background: KIND_COLOR[a.kind], flex: 'none' }} />
        <span className="grow">{PRESET_MAP.get(a.preset ?? '')?.name ?? a.name ?? 'Custom'}</span>
        <small>{triggerLabel(a.trigger)}</small>
      </button>
      <Btn size="sm" icon="play" title="Preview" onClick={() => previewOne(a.id)} />
      <Btn size="sm" icon="trash" title="Remove animation" onClick={() => cmd.removeAnimations([a.id])} />
    </div>
  );
}

function AnimEditor({ a }: { a: SlideAnim }) {
  const def = a.preset ? PRESET_MAP.get(a.preset) : undefined;
  const params = { ...(def ? defaultParams(def) : {}), ...(a.params ?? {}) };
  const set = (patch: Partial<SlideAnim>, label = 'Edit animation', rebuild = false) => cmd.updateAnim(a.id, patch, label, rebuild);
  const isText = !!a.stagger || (() => { const s = currentSlide(); const e = s && findEl(s.elements, a.el); return e?.type === 'text'; })();
  const stagger = a.stagger;
  return (
    <Section title={def?.name ?? 'Animation'} id="animed" action={<Btn size="sm" icon="play" title="Preview" onClick={() => previewOne(a.id)} />}>
      <Field label="Start"><Seg<Trigger> value={a.trigger} label="Start" onChange={(trigger) => set({ trigger }, 'Animation start')} options={[{ value: 'click', label: 'Click' }, { value: 'with', label: 'With' }, { value: 'after', label: 'After' }]} /></Field>
      <div className="row two">
        <Num label="Delay" value={a.delay} min={0} max={20000} step={50} unit="ms" onChange={(delay) => set({ delay }, 'Animation delay')} />
        <Num label="Time" value={a.dur} min={1} max={30000} step={50} unit="ms" onChange={(dur) => set({ dur }, 'Animation duration')} />
      </div>
      <Field label="Easing" wide><EasePicker value={a.ease} onChange={(ease) => set({ ease }, 'Animation easing')} /></Field>
      {def?.params.map((p) => (
        <Field key={p.id} label={p.label}>
          {p.type === 'range'
            ? <Slider label={p.label} value={Number(params[p.id] ?? p.def)} min={p.min!} max={p.max!} step={p.step} onChange={(v) => set({ params: { ...params, [p.id]: v } }, 'Animation setting', true)} />
            : <Select label={p.label} value={String(params[p.id] ?? p.def)} options={p.options!} onChange={(v) => set({ params: { ...params, [p.id]: v } }, 'Animation setting', true)} />}
        </Field>
      ))}
      {isText && (
        <>
          <Field label="Spread"><Select label="Spread over" value={stagger?.by ?? 'all'} options={[{ value: 'all', label: 'Whole object' }, { value: 'line', label: 'Line by line' }, { value: 'word', label: 'Word by word' }, { value: 'char', label: 'Letter by letter' }]} onChange={(v) => set({ stagger: v === 'all' ? undefined : ({ by: v, each: stagger?.each ?? (v === 'char' ? 30 : v === 'word' ? 90 : 160), from: stagger?.from ?? 'start' } as Stagger) }, 'Animation spread')} /></Field>
          {stagger && <>
            {!def?.params.some((p) => p.id === 'each') && <Field label="Stagger"><Slider label="Stagger" value={stagger.each} min={4} max={600} step={2} format={(v) => `${v}ms`} onChange={(each) => set({ stagger: { ...stagger, each } }, 'Stagger')} /></Field>}
            <Field label="From"><Seg value={stagger.from} label="From" onChange={(from) => set({ stagger: { ...stagger, from } }, 'Stagger origin')} options={[{ value: 'start', label: 'Start' }, { value: 'center', label: 'Middle' }, { value: 'end', label: 'End' }, { value: 'edges', label: 'Edges' }]} /></Field>
          </>}
        </>
      )}
      {(a.kind === 'emphasis' || a.kind === 'motion') && (
        <div className="row two">
          <Field label="Repeat"><Select label="Repeat" value={String(a.repeat ?? 1)} options={[{ value: '1', label: 'Once' }, { value: '2', label: 'Twice' }, { value: '3', label: '3 times' }, { value: '0', label: 'Forever' }]} onChange={(v) => set({ repeat: Number(v) }, 'Repeat')} /></Field>
          <Field label="Reverse"><Toggle label="Reverse each time" value={!!a.yoyo} onChange={(yoyo) => set({ yoyo }, 'Yoyo')} /></Field>
        </div>
      )}
      {a.path && (
        <div className="row two">
          <Btn size="sm" icon="move" label="Edit path" className="ghost" variant="ghost" onClick={() => ui.set({ editing: { type: 'path', anim: a.id } })} />
          <Field label="Face"><Toggle label="Turn to follow the path" value={!!a.orient} onChange={(orient) => set({ orient }, 'Orient to path')} /></Field>
        </div>
      )}
      <div className="row two">
        <Btn size="sm" icon="copy" label="Duplicate" className="ghost" variant="ghost" onClick={() => { const s = currentSlide(); if (s) { const copy = { ...clone(a), id: uid('a') }; doc.commit('Duplicate animation', (d) => ops.addAnim(d, s.id, copy, s.anims.findIndex((x) => x.id === a.id) + 1)); ui.set({ animSel: [copy.id] }); } }} />
        <Btn size="sm" icon="trash" label="Remove" variant="danger" onClick={() => cmd.removeAnimations([a.id])} />
      </div>
      <SaveAsPreset a={a} />
    </Section>
  );
}

function SaveAsPreset({ a }: { a: SlideAnim }) {
  return <Btn size="sm" icon="bookmark" label="Save as my preset" onClick={async () => {
    const { id: _i, el: _e, ...rest } = a;
    void _i; void _e;
    await library.put('presets', { id: uid('p'), name: PRESET_MAP.get(a.preset ?? '')?.name ?? 'My animation', created: Date.now(), kind: 'animation', anim: clone(rest) });
    toast('Saved to your animation presets');
  }} />;
}

function SavedPresets({ disabled }: { disabled: boolean }) {
  const [list, setList] = useState<Awaited<ReturnType<typeof library.all<'presets'>>> | null>(null);
  const load = () => void library.all('presets').then((l) => setList(l.filter((p) => p.kind === 'animation')));
  const { one } = useSel();
  return (
    <Section title="My presets" id="mypresets" defaultOpen={false}>
      {list === null ? <Btn size="sm" label="Show my saved animations" onClick={load} /> : list.length === 0 ? <p className="hint" style={{ margin: 0 }}>Save an animation as a preset to reuse it in any presentation.</p> : (
        <div className="list">{list.map((p) => (
          <div key={p.id} className="row">
            <button type="button" className="list-item" disabled={disabled || !one} onClick={() => { const s = currentSlide(); if (!s || !one || !p.anim) return; const anim: SlideAnim = { ...clone(p.anim), id: uid('a'), el: one.id, trigger: s.anims.length ? 'after' : 'click' }; doc.commit('Add animation', (d) => ops.addAnim(d, s.id, anim)); ui.set({ animSel: [anim.id] }); previewOne(anim.id); }}><span className="grow">{p.name}</span></button>
            <Btn size="sm" icon="trash" title="Delete preset" onClick={() => void library.remove('presets', p.id).then(load)} />
          </div>
        ))}</div>
      )}
      <Icon name="sparkles" size={0} />
    </Section>
  );
}

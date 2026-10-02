import { clone } from '../model/clone';
import { useEffect, useMemo, useRef, useState } from 'react';
import { newSlide, newText, solid } from '../model/defaults';
import { uid } from '../model/ids';
import type { Deck, Direction, Slide, Transition } from '../model/types';
import { library } from '../io/library';
import { TRANSITIONS, TRANSITION_CATEGORIES, TRANSITION_MAP, defaultTransitionParams } from '../transitions/registry';
import { TransitionRun } from '../transitions/runner';
import type { TParam, TransitionDef } from '../transitions/types';
import { Dialog } from '../ui/Dialog';
import { EasePicker } from '../ui/EasePicker';
import { Btn, ColorBtn, Field, Seg, Select, Slider, TextInput, Toggle } from '../ui/controls';
import { assets, currentSlide, doc } from '../state/session';
import { toast } from '../state/ui';
import * as cmd from '../editor/commands';
import { useSyncExternalStore } from 'react';

/** A pair of slides to preview with: the current one and the one after it (or a stand-in). */
function previewPair(deck: Deck, cur: Slide): [Slide, Slide] {
  const i = deck.slides.findIndex((s) => s.id === cur.id);
  const next = deck.slides[i + 1] ?? deck.slides[i - 1];
  if (next && next.id !== cur.id) return [cur, next];
  const t = newText(deck.theme, 'Next slide', 160, 380, 1600, 'display', { base: { font: '@heading', size: 160, weight: 800, color: '#ffffff', align: 'center', lh: 1.1, ls: -3 } });
  return [cur, newSlide({ background: { t: 'linear', angle: 135, stops: [{ o: 0, c: '@primary' }, { o: 1, c: '@secondary' }] }, elements: [t] })];
}

const W = 256;

function Card({ def, deck, pair, selected, onPick }: { def: TransitionDef; deck: Deck; pair: [Slide, Slide]; selected: boolean; onPick: () => void }) {
  const box = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef<TransitionRun | null>(null);
  const raf = useRef(0);
  const [visible, setVisible] = useState(false);
  const H = Math.round((W * deck.size.h) / deck.size.w);

  useEffect(() => {
    const io = new IntersectionObserver((e) => setVisible(e.some((x) => x.isIntersecting)));
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, []);

  const frame = (t: number) => {
    const c = canvas.current, r = run.current;
    if (!c || !r) return;
    r.draw(c.getContext('2d')!, t, performance.now());
  };

  useEffect(() => {
    if (!visible) return;
    let live = true;
    const r = new TransitionRun({ deck, assets, from: pair[0], to: pair[1], transition: { type: def.id, dur: def.dur, ease: def.ease, dir: 'left', params: defaultTransitionParams(def) }, w: W, h: H });
    void r.prepare().then(() => {
      if (!live) return r.dispose();
      run.current = r;
      frame(0.5);
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf.current);
      run.current?.dispose();
      run.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, def.id, pair[0], pair[1]]);

  const play = () => {
    const start = performance.now();
    const loop = () => {
      const t = ((performance.now() - start) % (def.dur + 700)) / def.dur;
      frame(Math.min(1, t));
      raf.current = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(raf.current);
    loop();
  };
  const stop = () => {
    cancelAnimationFrame(raf.current);
    frame(0.5);
  };

  return (
    <button ref={box} type="button" className={`tr-card ${selected ? 'sel' : ''}`} onClick={onPick} onPointerEnter={play} onPointerLeave={stop} onFocus={play} onBlur={stop} aria-pressed={selected}>
      <canvas ref={canvas} width={W} height={H} />
      <b>{def.name}</b>
    </button>
  );
}

function ParamEditor({ p, value, onChange }: { p: TParam; value: unknown; onChange: (v: number | string | boolean) => void }) {
  const { theme } = doc.deck;
  switch (p.type) {
    case 'range': return <Field label={p.label}><Slider label={p.label} value={Number(value ?? p.def)} min={p.min} max={p.max} step={p.step} onChange={onChange} /></Field>;
    case 'choice': return <Field label={p.label}><Select label={p.label} value={String(value ?? p.def)} options={p.options} onChange={onChange} /></Field>;
    case 'text': return <Field label={p.label}><TextInput label={p.label} value={String(value ?? p.def)} onCommit={onChange} /></Field>;
    case 'toggle': return <Field label={p.label}><Toggle label={p.label} value={Boolean(value ?? p.def)} onChange={onChange} /></Field>;
    case 'color': return <Field label={p.label}><div className="row"><ColorBtn value={(value as string) || theme.colors.primary} theme={theme} label={p.label} onChange={(c) => onChange(c ?? '')} /><Btn size="sm" label="Theme colour" onClick={() => onChange('')} /></div></Field>;
  }
}

export default function TransitionDialog({ onClose }: { onClose: () => void }) {
  const deck = useSyncExternalStore(doc.subscribe, () => doc.deck);
  const slide = currentSlide()!;
  const cur = deck.slides.find((s) => s.id === slide.id) ?? slide;
  const tr = cur.transition;
  const [cat, setCat] = useState<string>('All');
  const pair = useMemo(() => previewPair(doc.deck, slide), [slide.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const def = tr ? TRANSITION_MAP.get(tr.type) : undefined;

  const choose = (d: TransitionDef) => {
    cmd.patchSlide({ transition: { type: d.id, dur: d.dur, ease: d.ease, dir: d.directional ? (tr?.dir ?? 'left') : undefined, params: defaultTransitionParams(d) } }, 'Choose transition');
  };
  const patch = (p: Partial<Transition>, merge?: string) => tr && cmd.patchSlide({ transition: { ...tr, ...p } }, 'Edit transition', merge);

  return (
    <Dialog title="Transitions" wide onClose={onClose} footer={<Btn variant="tint" label="Done" onClick={onClose} />}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 22, alignItems: 'start' }}>
        <div>
          <div className="tabs-row">
            {['All', ...TRANSITION_CATEGORIES].map((c) => <button key={c} type="button" className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div className="tr-grid">
            <button type="button" className={`tr-card ${!tr ? 'sel' : ''}`} onClick={() => cmd.patchSlide({ transition: null }, 'Remove transition')}>
              <div style={{ aspectRatio: '16 / 9', borderRadius: 6, background: 'var(--fill-2)', display: 'grid', placeItems: 'center', color: 'var(--label-2)' }}>Cut</div><b>None</b>
            </button>
            {TRANSITIONS.filter((t) => cat === 'All' || t.category === cat).map((t) => <Card key={t.id} def={t} deck={doc.deck} pair={pair} selected={tr?.type === t.id} onPick={() => choose(t)} />)}
          </div>
        </div>
        <div style={{ position: 'sticky', top: 0 }}>
          {tr && def ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div><b style={{ fontSize: 16 }}>{def.name}</b><p className="hint" style={{ margin: '4px 0 0' }}>{def.desc}</p></div>
              <Field label="Duration"><Slider label="Duration" value={tr.dur} min={100} max={4000} step={50} format={(v) => `${(v / 1000).toFixed(2)}s`} onChange={(dur) => patch({ dur }, 'trd')} /></Field>
              <Field label="Easing" wide><EasePicker value={tr.ease} onChange={(ease) => patch({ ease })} /></Field>
              {def.directional && <Field label="Direction"><Seg<Direction> value={tr.dir ?? 'left'} label="Direction" onChange={(dir) => patch({ dir })} options={[{ value: 'left', label: '←' }, { value: 'right', label: '→' }, { value: 'up', label: '↑' }, { value: 'down', label: '↓' }]} /></Field>}
              {def.params.map((p) => <ParamEditor key={p.id} p={p} value={tr.params?.[p.id]} onChange={(v) => patch({ params: { ...(tr.params ?? {}), [p.id]: v } }, 'trp' + p.id)} />)}
              <div className="row two">
                <Btn size="sm" label="Apply to all slides" className="ghost" variant="ghost" onClick={() => { doc.commit('Apply transition to all', (d) => { d.slides.forEach((s) => { s.transition = clone(tr); }); }); toast('Applied to every slide'); }} />
                <Btn size="sm" icon="bookmark" label="Save preset" className="ghost" variant="ghost" onClick={async () => { await library.put('presets', { id: uid('p'), name: def.name, created: Date.now(), kind: 'transition', transition: clone(tr) }); toast('Saved to your transition presets'); }} />
              </div>
              <SavedTransitions />
            </div>
          ) : (
            <><p className="hint">Pick a transition. Hover a card to preview it with your slides.</p><SavedTransitions /></>
          )}
        </div>
      </div>
      <span hidden>{solid('#000').t}</span>
    </Dialog>
  );
}

function SavedTransitions() {
  const [list, setList] = useState<{ id: string; name: string; transition?: Transition }[] | null>(null);
  useEffect(() => { void library.all('presets').then((l) => setList(l.filter((p) => p.kind === 'transition'))); }, []);
  if (!list?.length) return null;
  return (
    <div>
      <h4 className="pop-h">My presets</h4>
      <div className="list">{list.map((p) => <button key={p.id} type="button" className="list-item" onClick={() => p.transition && cmd.patchSlide({ transition: clone(p.transition) }, 'Use transition preset')}><span className="grow">{p.name}</span></button>)}</div>
    </div>
  );
}

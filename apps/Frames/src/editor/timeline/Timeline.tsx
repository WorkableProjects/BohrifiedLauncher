import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CAMERA, compileTimeline, findEl, sampleNumber, trackMode, type Clip } from '../../anim/engine';
import { PRESET_MAP } from '../../anim/presets';
import { uid } from '../../model/ids';
import * as ops from '../../model/ops';
import type { Easing, Key, SlideAnim, Track } from '../../model/types';
import { Btn } from '../../ui/controls';
import { EasePicker } from '../../ui/EasePicker';
import { Icon } from '../../ui/Icon';
import { doc, currentSlide } from '../../state/session';
import { useStore } from '../../state/store';
import { ui } from '../../state/ui';
import * as cmd from '../commands';
import { previewOne } from '../inspector/AnimateTab';

const KIND_ICON: Record<string, string> = { text: 'type', shape: 'shapes', line: 'line', image: 'image', icon: 'star', video: 'film', audio: 'music', table: 'table', chart: 'chart', group: 'group', camera: 'camera' };

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;

interface KeySel { anim: string; prop: string; i: number }

export function Timeline() {
  const deck = useSyncExternalStore(doc.subscribe, () => doc.deck);
  const slideId = useStore(ui, (s) => s.slideId);
  const playhead = useStore(ui, (s) => s.playhead);
  const animSel = useStore(ui, (s) => s.animSel);
  const slide = deck.slides.find((s) => s.id === slideId) ?? currentSlide();
  const tl = useMemo(() => (slide ? compileTimeline(slide) : null), [slide]);
  const [pps, setPps] = useState(110); // pixels per second
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ksel, setKsel] = useState<KeySel | null>(null);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const track = useRef<HTMLDivElement>(null);

  const total = tl?.total ?? 0;
  const width = Math.max(600, ((total + 2500) / 1000) * pps);
  const x = (ms: number) => (ms / 1000) * pps;
  const msAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, ((clientX - r.left) / pps) * 1000);
  };

  // Playback of the scrub head
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now() - (ui.get().playhead ?? 0);
    const step = () => {
      const t = performance.now() - t0;
      if (t >= total + 300) {
        ui.set({ playhead: total });
        return setPlaying(false);
      }
      ui.set({ playhead: t });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, total]);

  useEffect(() => () => ui.set({ playhead: null }), []);

  if (!slide || !tl) return null;

  // Rows: the camera, then objects top-of-stack first, only those with animations.
  const rows: { id: string; label: string; icon: string; clips: Clip[] }[] = [];
  const camClips = tl.byEl.get(CAMERA);
  if (camClips) rows.push({ id: CAMERA, label: 'Camera', icon: 'camera', clips: camClips });
  const flat: ReturnType<typeof findEl>[] = [];
  const collect = (els: typeof slide.elements) => els.forEach((e) => { flat.push(e); if (e.type === 'group') collect(e.children); });
  collect([...slide.elements].reverse());
  for (const e of flat) {
    if (!e) continue;
    const c = tl.byEl.get(e.id);
    if (c) rows.push({ id: e.id, label: e.name ?? (e.type === 'text' ? 'Text' : e.type[0]!.toUpperCase() + e.type.slice(1)), icon: KIND_ICON[e.type] ?? 'shapes', clips: c });
  }

  const selectedAnims = slide.anims.filter((a) => animSel.includes(a.id));

  const select = (id: string, additive: boolean) => {
    const group = slide.anims.find((a) => a.id === id)?.group;
    const ids = group ? slide.anims.filter((a) => a.group === group).map((a) => a.id) : [id];
    ui.set({ animSel: additive ? [...new Set([...animSel, ...ids])] : ids });
    const a = slide.anims.find((x) => x.id === id);
    if (a && a.el !== CAMERA) cmd.select([a.el], true);
  };

  // ── Dragging clips ──
  const dragClip = (e: React.PointerEvent, clip: Clip, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation();
    e.preventDefault();
    select(clip.anim.id, e.shiftKey || e.metaKey);
    const startX = e.clientX;
    const group = clip.anim.group ? slide.anims.filter((a) => a.group === clip.anim.group) : [clip.anim];
    const base = new Map(group.map((a) => [a.id, { delay: a.delay, dur: a.dur }]));
    const g = doc.begin(mode === 'move' ? 'Move animation' : 'Resize animation');
    // Snap targets: every other clip's start/end and the playhead.
    const snaps = tl.clips.filter((c) => !group.some((a) => a.id === c.anim.id)).flatMap((c) => [c.start, c.end]);
    const move = (ev: PointerEvent) => {
      let dMs = ((ev.clientX - startX) / pps) * 1000;
      const ref = mode === 'r' ? clip.end : clip.start;
      const snap = snaps.find((s) => Math.abs(s - (ref + dMs)) < 120 / pps * 8);
      if (snap !== undefined && !ev.altKey) dMs = snap - ref;
      g.update((d) => {
        for (const a of group) {
          const b = base.get(a.id)!;
          ops.patchAnim(d, slide.id, a.id, (t) => {
            if (mode === 'move') t.delay = Math.max(0, Math.round(b.delay + dMs));
            else if (mode === 'r') t.dur = Math.max(20, Math.round(b.dur + dMs));
            else {
              const nd = Math.max(0, Math.round(b.delay + dMs));
              t.delay = nd;
              t.dur = Math.max(20, Math.round(b.dur - (nd - b.delay)));
            }
          });
        }
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      g.end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const scrub = (e: React.PointerEvent) => {
    setPlaying(false);
    const apply = (cx: number) => ui.set({ playhead: Math.round(msAt(cx)) });
    apply(e.clientX);
    const move = (ev: PointerEvent) => apply(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ── Keyframes ──
  const editTrack = (animId: string, prop: string, fn: (t: Track) => void, label = 'Edit keyframe', gesture?: ReturnType<typeof doc.begin>) => {
    const recipe = (d: Parameters<Parameters<typeof doc.commit>[1]>[0]) => ops.patchAnim(d, slide.id, animId, (a) => {
      const t = a.tracks.find((x) => x.prop === prop);
      if (t) fn(t);
      if (a.preset) { a.name = PRESET_MAP.get(a.preset)?.name ?? a.name; a.preset = undefined; }
    });
    if (gesture) gesture.update(recipe);
    else doc.commit(label, recipe, 'key:' + animId + prop);
  };

  const dragKey = (e: React.PointerEvent, clip: Clip, t: Track, i: number) => {
    e.stopPropagation();
    e.preventDefault();
    setKsel({ anim: clip.anim.id, prop: t.prop, i });
    const keys = [...t.keys].sort((a, b) => a.t - b.t);
    const k0 = keys[i]!;
    const startX = e.clientX;
    const g = doc.begin('Move keyframe');
    const lo = i > 0 ? keys[i - 1]!.t + 0.001 : 0, hi = i < keys.length - 1 ? keys[i + 1]!.t - 0.001 : 1;
    const move = (ev: PointerEvent) => {
      const dt = ((ev.clientX - startX) / pps / (clip.anim.dur / 1000));
      const nt = Math.min(hi, Math.max(lo, k0.t + dt));
      editTrack(clip.anim.id, t.prop, (tr) => {
        const target = [...tr.keys].sort((a, b) => a.t - b.t)[i];
        if (target && i !== 0 && i !== keys.length - 1) target.t = Math.round(nt * 1000) / 1000;
      }, 'Move keyframe', g);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      g.end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const addKeyAt = (clip: Clip, t: Track, clientX: number) => {
    const u = Math.min(0.999, Math.max(0.001, (msAt(clientX) - clip.start) / clip.anim.dur));
    const v = t.prop === 'color' || t.prop === 'fill' ? 'base' : Math.round(sampleNumber(t, u) * 100) / 100;
    editTrack(clip.anim.id, t.prop, (tr) => { tr.keys = [...tr.keys, { t: Math.round(u * 1000) / 1000, v }].sort((a, b) => a.t - b.t); }, 'Add keyframe');
  };

  const addKeyAtPlayhead = () => {
    const ph = playhead ?? 0;
    for (const a of selectedAnims) {
      const clip = tl.clips.find((c) => c.anim.id === a.id);
      if (!clip || ph <= clip.start || ph >= clip.end) continue;
      const u = (ph - clip.start) / a.dur;
      for (const t of a.tracks) {
        const v = t.prop === 'color' || t.prop === 'fill' ? 'base' : Math.round(sampleNumber(t, u) * 100) / 100;
        editTrack(a.id, t.prop, (tr) => { tr.keys = [...tr.keys, { t: Math.round(u * 1000) / 1000, v }].sort((p, q) => p.t - q.t); }, 'Add keyframe');
      }
    }
  };

  const deleteKey = () => {
    if (!ksel) return;
    editTrack(ksel.anim, ksel.prop, (tr) => {
      const sorted = [...tr.keys].sort((a, b) => a.t - b.t);
      if (sorted.length <= 2 || ksel.i === 0 || ksel.i === sorted.length - 1) return;
      sorted.splice(ksel.i, 1);
      tr.keys = sorted;
    }, 'Delete keyframe');
    setKsel(null);
  };

  const selKey: Key | null = ksel ? ([...(slide.anims.find((a) => a.id === ksel.anim)?.tracks.find((t) => t.prop === ksel.prop)?.keys ?? [])].sort((a, b) => a.t - b.t)[ksel.i] ?? null) : null;

  const toggleGroup = () => {
    if (selectedAnims.length < 2) return;
    const anyGrouped = selectedAnims.every((a) => a.group);
    const gid = uid('g');
    doc.commit(anyGrouped ? 'Ungroup animations' : 'Group animations', (d) => {
      for (const a of selectedAnims) ops.patchAnim(d, slide.id, a.id, (t) => { t.group = anyGrouped ? undefined : gid; });
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (ksel) deleteKey();
      else if (animSel.length) cmd.removeAnimations(animSel);
    }
    if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
  };

  const nameOf = (a: SlideAnim) => PRESET_MAP.get(a.preset ?? '')?.name ?? a.name ?? a.kind;

  return (
    <div className="timeline" role="region" aria-label="Animation timeline" tabIndex={0} onKeyDown={onKeyDown} data-testid="timeline">
      <div className="tl-head">
        <Btn size="sm" icon="skip-back" title="Back to start" onClick={() => { setPlaying(false); ui.set({ playhead: 0 }); }} />
        <Btn size="sm" icon={playing ? 'pause' : 'play'} title={playing ? 'Pause' : 'Play (Space)'} active={playing} onClick={() => { if (!playing && (ui.get().playhead ?? 0) >= total) ui.set({ playhead: 0 }); else if (!playing && ui.get().playhead === null) ui.set({ playhead: 0 }); setPlaying(!playing); }} />
        <Btn size="sm" icon="eye" title="Show the finished slide" onClick={() => { setPlaying(false); ui.set({ playhead: null }); }} />
        <span className="time">{fmt(playhead ?? 0)} / {fmt(total)}</span>
        <span className="sep" />
        <Btn size="sm" icon="keyframe" label="Keyframe" title="Add a keyframe at the playhead to the selected animation" disabled={!selectedAnims.length || playhead === null} onClick={addKeyAtPlayhead} />
        <Btn size="sm" icon="trash" title="Delete the selected keyframe or animation" disabled={!ksel && !animSel.length} onClick={() => (ksel ? deleteKey() : cmd.removeAnimations(animSel))} />
        <Btn size="sm" icon="group" label={selectedAnims.length > 1 && selectedAnims.every((a) => a.group) ? 'Ungroup' : 'Group'} title="Link selected animations so they move together" disabled={selectedAnims.length < 2} onClick={toggleGroup} />
        {selKey && ksel && (
          <div style={{ width: 170 }}><EasePicker label="Easing to next keyframe" value={selKey.e ?? { k: 'preset', name: 'linear' }} onChange={(e: Easing) => editTrack(ksel.anim, ksel.prop, (tr) => { const s = [...tr.keys].sort((a, b) => a.t - b.t); const k = s[ksel.i]; if (k) { k.e = e; tr.keys = s; } }, 'Keyframe easing')} /></div>
        )}
        <span style={{ flex: 1 }} />
        <Icon name="zoom-out" size={14} />
        <input type="range" min={40} max={420} value={pps} aria-label="Timeline zoom" onChange={(e) => setPps(Number(e.target.value))} style={{ width: 90, accentColor: 'var(--tint)' }} />
        <Icon name="zoom-in" size={14} />
        <Btn size="sm" icon="x" title="Close timeline" onClick={() => ui.set({ timeline: false })} />
      </div>
      <div className="tl-body">
        <div className="tl-names">
          <div className="tl-ruler" style={{ cursor: 'default' }} />
          {rows.length === 0 && <div className="tl-row"><span className="nm" style={{ color: 'var(--label-2)' }}>No animations yet</span></div>}
          {rows.map((r) => (
            <div key={r.id}>
              <div className="tl-row">
                <button type="button" aria-label={expanded.has(r.id) ? 'Hide keyframes' : 'Show keyframes'} onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}><Icon name={expanded.has(r.id) ? 'chevron-down' : 'chevron-right'} size={12} /></button>
                <Icon name={r.icon} size={14} /><span className="nm">{r.label}</span>
              </div>
              {expanded.has(r.id) && r.clips.flatMap((c) => c.anim.tracks.map((t) => <div key={c.anim.id + t.prop} className="tl-row" style={{ paddingLeft: 30, color: 'var(--label-2)' }}><span className="nm">{t.prop} <small>({trackMode(t)})</small></span></div>))}
            </div>
          ))}
        </div>
        <div className="tl-track" ref={track} style={{ width }}>
          <div className="tl-ruler" onPointerDown={scrub}>
            <svg width={width} height={24} style={{ display: 'block' }}>
              {Array.from({ length: Math.ceil(width / pps) + 1 }, (_, i) => (
                <g key={i}><line x1={i * pps + 0.5} x2={i * pps + 0.5} y1={12} y2={24} stroke="currentColor" strokeOpacity=".35" /><text x={i * pps + 4} y={11} fontSize="10" fill="currentColor" fillOpacity=".6">{i}s</text>
                  {[1, 2, 3].map((q) => <line key={q} x1={i * pps + (q * pps) / 4 + 0.5} x2={i * pps + (q * pps) / 4 + 0.5} y1={19} y2={24} stroke="currentColor" strokeOpacity=".2" />)}</g>
              ))}
            </svg>
          </div>
          {tl.steps.slice(1).map((s) => <div key={s.index} className="tl-step" style={{ left: x(s.nominalStart) }} title={`Click ${s.index}`}><span style={{ position: 'absolute', top: 24, left: 4, fontSize: 10, color: 'var(--label-2)', whiteSpace: 'nowrap' }}>Click {s.index}</span></div>)}
          {rows.map((r) => (
            <div key={r.id}>
              <div className="tl-lane" onPointerDown={(e) => { if (e.target === e.currentTarget) scrub(e); }}>
                {r.clips.map((c) => (
                  <div key={c.anim.id} className={`tl-clip ${c.anim.kind} ${animSel.includes(c.anim.id) ? 'sel' : ''}`} style={{ left: x(c.start), width: Math.max(14, x(c.span)), outline: c.anim.group ? '2px dashed rgba(255,255,255,.7)' : undefined }} title={`${nameOf(c.anim)} · ${c.anim.dur}ms · ${c.anim.trigger}`} onPointerDown={(e) => dragClip(e, c, 'move')} onDoubleClick={() => previewOne(c.anim.id)}>
                    <span className="grip l" onPointerDown={(e) => dragClip(e, c, 'l')} />
                    {c.anim.group && <Icon name="link" size={11} />}&nbsp;{nameOf(c.anim)}
                    <span className="grip r" onPointerDown={(e) => dragClip(e, c, 'r')} />
                  </div>
                ))}
              </div>
              {expanded.has(r.id) && r.clips.flatMap((c) => c.anim.tracks.map((t) => (
                <div key={c.anim.id + t.prop} className="tl-lane" onDoubleClick={(e) => addKeyAt(c, t, e.clientX)}>
                  <div style={{ position: 'absolute', left: x(c.start), width: x(c.anim.dur), top: 14, height: 2, background: 'var(--separator)' }} />
                  {[...t.keys].sort((a, b) => a.t - b.t).map((k, i) => (
                    <div key={i} className={`tl-key ${ksel && ksel.anim === c.anim.id && ksel.prop === t.prop && ksel.i === i ? 'sel' : ''}`} style={{ left: x(c.start + k.t * c.anim.dur) - 5 }} title={`${t.prop} = ${typeof k.v === 'number' ? Math.round(k.v * 100) / 100 : k.v}`} onPointerDown={(e) => dragKey(e, c, t, i)} />
                  ))}
                </div>
              )))}
            </div>
          ))}
          {playhead !== null && <div className="tl-playhead" style={{ left: x(playhead) }} />}
        </div>
      </div>
    </div>
  );
}

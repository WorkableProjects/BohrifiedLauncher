import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { compileTimeline, evalSlide, nominalStarts, type SlideState } from '../anim/engine';
import { absoluteRect, findEl } from '../model/ops';
import type { Slide } from '../model/types';
import { paintSlide, type RenderEnv } from '../render/paint';
import { assets, currentSlide, doc, onRedraw } from '../state/session';
import { prefs, usePrefs } from '../state/prefs';
import { useStore } from '../state/store';
import { toast, ui } from '../state/ui';
import * as cmd from './commands';
import { frameOf, lineEnds, selectionFrame } from './frames';
import { Interactions, pathSel, type Dyn } from './interactions';
import { drawOverlay, type OverlayState } from './overlay';
import { Rulers } from './Rulers';
import { CellEditor, TextEditor } from './TextEditor';
import { makeView, panFor, toSlide, MAX_ZOOM, MIN_ZOOM, type View } from './viewport';

const RULER = 22;

/** A preview of one animation plays it alone, starting immediately. */
function previewSlide(s: Slide, solo?: string): Slide {
  if (!solo) return s;
  return { ...s, anims: s.anims.filter((a) => a.id === solo).map((a) => ({ ...a, trigger: 'with' as const, delay: 0 })) };
}

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** The slide canvas: painting, selection overlay, direct manipulation, in-place text editing. */
export function Stage() {
  const host = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const slideId = useStore(ui, (s) => s.slideId);
  const zoom = useStore(ui, (s) => s.zoom);
  const pan = useStore(ui, (s) => s.pan);
  const editing = useStore(ui, (s) => s.editing);
  const showRulers = usePrefs((p) => p.showRulers);
  const deck = useSyncExternalStore(doc.subscribe, () => doc.deck);
  const slide = deck.slides.find((s) => s.id === slideId) ?? deck.slides[0];
  const inset = useMemo(() => (showRulers ? { x: RULER, y: RULER } : { x: 0, y: 0 }), [showRulers]);

  const view = useMemo<View>(() => makeView(size.w, size.h, deck.size.w, deck.size.h, zoom, pan, inset), [size, deck.size.w, deck.size.h, zoom, pan, inset]);
  const viewRef = useRef(view);
  viewRef.current = view;

  const dyn = useRef<Dyn>({ hover: null, marquee: null, guides: [], hud: null, pending: null }).current;
  const raf = useRef(0);
  const dirty = useRef({ main: true, over: true });
  const lastState = useRef<OverlayState | null>(null);

  // ── Painting ──

  const animState = useCallback((s: Slide): SlideState | null => {
    const u = ui.get();
    if (u.playhead === null && !u.preview) return null;
    if (u.preview) {
      const tl = compileTimeline(previewSlide(s, u.preview.solo));
      return evalSlide(tl, nominalStarts(tl), performance.now() - u.preview.startedAt);
    }
    const tl = compileTimeline(s);
    return evalSlide(tl, nominalStarts(tl), u.playhead ?? 0);
  }, []);

  const frame = useCallback(() => {
    raf.current = 0;
    const s = currentSlide();
    const m = main.current, o = over.current;
    if (!s || !m || !o || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    const v = viewRef.current;
    if (m.width !== Math.round(size.w * dpr) || m.height !== Math.round(size.h * dpr)) {
      m.width = o.width = Math.round(size.w * dpr);
      m.height = o.height = Math.round(size.h * dpr);
      dirty.current = { main: true, over: true };
    }
    const u = ui.get();
    let again = false;
    if (dirty.current.main || u.preview || u.playhead !== null) {
      const ctx = m.getContext('2d', { alpha: false })!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = cssVar('--stage', '#e5e5ea');
      ctx.fillRect(0, 0, size.w, size.h);
      // Slide drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = 28 * dpr;
      ctx.shadowOffsetY = 6 * dpr;
      ctx.fillStyle = '#fff';
      ctx.fillRect(v.x, v.y, doc.deck.size.w * v.zoom, doc.deck.size.h * v.zoom);
      ctx.restore();
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.scale(v.zoom, v.zoom);
      const env: RenderEnv = {
        deck: doc.deck,
        assets,
        mode: 'edit',
        px: v.zoom * dpr,
        editingId: u.editing?.type === 'text' ? u.editing.id : null,
        editingCell: u.editing?.type === 'cell' ? { id: u.editing.id, r: u.editing.r, c: u.editing.c } : null,
        noPrompts: u.preview !== null || u.playhead !== null,
      };
      paintSlide(ctx, env, s, animState(s));
      ctx.restore();
      dirty.current.main = false;
      if (u.preview) {
        const tl = compileTimeline(previewSlide(s, u.preview.solo));
        const t = performance.now() - u.preview.startedAt;
        if (t < tl.total + 400 && ui.get().preview === u.preview) again = true;
        else ui.set({ preview: null });
        dirty.current.main = true;
      }
      dirty.current.over = true;
    }
    if (dirty.current.over) {
      const st = overlayState(s, v, dpr);
      lastState.current = st;
      drawOverlay(o.getContext('2d')!, st);
      dirty.current.over = false;
    }
    if (again) schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, animState]);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(() => frameRef.current());
  }, []);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const invalidate = useCallback((what: 'main' | 'over' | 'both' = 'both') => {
    if (what !== 'over') dirty.current.main = true;
    dirty.current.over = true;
    schedule();
  }, [schedule]);

  function overlayState(s: Slide, v: View, dpr: number): OverlayState {
    const u = ui.get();
    const p = prefs.get();
    const selected = u.sel.map((id) => findEl(s.elements, id)).filter((e): e is NonNullable<typeof e> => !!e);
    const frameSel = selectionFrame(s.elements, u.sel);
    const editingPath = u.editing?.type === 'path' ? s.anims.find((a) => a.id === (u.editing as { anim: string }).anim) : null;
    const pathEl = editingPath && findEl(s.elements, editingPath.el);
    let crop: OverlayState['crop'] = null;
    if (u.editing?.type === 'crop') {
      const el = findEl(s.elements, u.editing.id);
      if (el && el.type === 'image') {
        const f = frameOf(s.elements, el);
        const cw = f.w / el.crop.w, ch = f.h / el.crop.h;
        crop = { box: f, full: { x: f.x - el.crop.x * cw, y: f.y - el.crop.y * ch, w: cw, h: ch } };
      }
    }
    return {
      view: v,
      slide: s,
      size: doc.deck.size,
      frame: u.editing?.type === 'path' ? null : frameSel,
      multi: selected.length > 1,
      selected: u.editing?.type === 'path' ? [] : selected,
      hover: dyn.hover ? findEl(s.elements, dyn.hover) ?? null : null,
      marquee: dyn.marquee,
      guides: dyn.guides,
      userGuides: s.guides ?? { v: [], h: [] },
      margin: doc.deck.margin,
      grid: p.showGrid ? 40 : 0,
      showMargins: p.showGrid || p.showRulers,
      hud: dyn.hud,
      editing: !!u.editing && u.editing.type !== 'crop',
      lineOf: (e) => (e.type === 'line' ? lineEnds(s.elements, e) : null),
      absOf: (e) => frameOf(s.elements, e),
      tint: cssVar('--tint', '#ff6083'),
      path: editingPath && pathEl ? { nodes: editingPath.path ?? [], origin: { x: frameOf(s.elements, pathEl).x + pathEl.w / 2, y: frameOf(s.elements, pathEl).y + pathEl.h / 2 }, sel: pathSel.get() } : null,
      crop,
      dpr,
      pending: dyn.pending,
    };
  }

  // Redraw on any document / UI change.
  useEffect(() => {
    const a = doc.subscribe(() => invalidate());
    const b = ui.subscribe(() => invalidate());
    const c = onRedraw(() => invalidate());
    const d = prefs.subscribe(() => invalidate());
    const e = pathSel.subscribe(() => invalidate());
    const mo = new MutationObserver(() => invalidate());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      a(); b(); c(); d(); e();
      mo.disconnect();
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [invalidate]);

  useEffect(() => invalidate(), [size, view, invalidate]);

  // Size observer
  useEffect(() => {
    const el = host.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ── Interaction ──

  const api = useMemo(() => ({
    view: () => viewRef.current,
    slide: () => currentSlide(),
    dyn,
    invalidate: () => invalidate('over'),
    cursor: (c: string) => { if (host.current) host.current.style.cursor = c; },
    prefs: () => prefs.get(),
    overlayState: () => lastState.current,
    local: (e: { clientX: number; clientY: number }) => {
      const r = host.current!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    },
    panBy: (dx: number, dy: number) => {
      const u = ui.get();
      const v = viewRef.current;
      const base = u.zoom === 'fit' ? { x: 0, y: 0 } : u.pan;
      ui.set({ zoom: v.zoom, pan: { x: base.x + dx, y: base.y + dy } });
    },
  }), [dyn, invalidate]);
  const inter = useRef<Interactions | null>(null);
  inter.current ??= new Interactions(api);

  // Moves that need the main canvas (a drag changes the document, which already subscribes).
  useEffect(() => {
    const el = host.current!;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.te-box, .stage-ctl')) return;
      if (ui.get().editing?.type === 'text' || ui.get().editing?.type === 'cell') ui.set({ editing: null });
      el.focus({ preventScroll: true });
      inter.current!.down(e, el);
    };
    const move = (e: PointerEvent) => inter.current!.move(e);
    const up = (e: PointerEvent) => inter.current!.up(e, el);
    const dbl = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.te-box, .stage-ctl')) return;
      inter.current!.dblclick(e);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', dbl);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('dblclick', dbl);
    };
  }, []);

  // Space = temporary hand tool; Escape cancels a gesture.
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable="true"], select')) return;
      if (e.code === 'Space') {
        inter.current!.space = true;
        api.cursor('grab');
        if (!e.repeat) e.preventDefault();
      }
      if (e.key === 'Escape') inter.current!.cancel();
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        inter.current!.space = false;
        api.cursor('default');
      }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [api]);

  // Wheel: pinch / ctrl = zoom to cursor; otherwise pan.
  useEffect(() => {
    const el = host.current!;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.te-box')) return;
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const local = api.local(e);
        const p = toSlide(v, local.x, local.y);
        const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * Math.exp(-e.deltaY * 0.0022)));
        ui.set({ zoom: z, pan: panFor(v.w, v.h, doc.deck.size.w, doc.deck.size.h, z, p, local, inset) });
      } else {
        const u = ui.get();
        const base = u.zoom === 'fit' ? { x: 0, y: 0 } : u.pan;
        ui.set({ zoom: v.zoom, pan: { x: base.x - e.deltaX, y: base.y - e.deltaY } });
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [api, inset]);

  // Drag and drop of files
  const [dropping, setDropping] = useState(false);
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const files = [...e.dataTransfer.files];
    if (!files.length) {
      const t = e.dataTransfer.getData('text/plain');
      if (t) cmd.pasteText(t);
      return;
    }
    const local = api.local(e);
    const pt = toSlide(viewRef.current, local.x, local.y);
    // Dropping on an image replaces it, keeping the layout.
    const s = currentSlide();
    let target = false;
    if (s) {
      for (const el of [...s.elements].reverse()) {
        const r = absoluteRect(s.elements, el.id) ?? el;
        if (el.type === 'image' && pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) {
          cmd.select([el.id], true);
          target = true;
          break;
        }
      }
    }
    await cmd.importFiles(files, target ? undefined : pt, { replace: target });
  };

  const editEl = editing && slide ? findEl(slide.elements, (editing as { id?: string }).id ?? '') : null;
  const setEditingNull = useCallback(() => ui.set({ editing: null }), []);

  return (
    <div
      ref={host}
      className={`stage ${dropping ? 'dropping' : ''}`}
      tabIndex={0}
      data-testid="stage"
      onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
      onContextMenu={(e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('frames:contextmenu', { detail: { x: e.clientX, y: e.clientY } }));
      }}
    >
      <canvas ref={main} className="stage-main" style={{ width: size.w, height: size.h }} />
      <canvas ref={over} className="stage-over" style={{ width: size.w, height: size.h }} />
      {showRulers && <Rulers view={view} onGuide={(axis) => inter.current!.startGuide(currentSlide()!, axis, -1)} />}
      {editing?.type === 'text' && editEl && (editEl.type === 'text' || editEl.type === 'shape') && slide && (
        <TextEditor key={editEl.id} el={editEl} slideId={slide.id} view={view} onDone={setEditingNull} />
      )}
      {editing?.type === 'cell' && editEl && editEl.type === 'table' && slide && (
        <CellEditor key={`${editEl.id}:${editing.r}:${editing.c}`} el={editEl} r={editing.r} c={editing.c} slideId={slide.id} view={view} onDone={setEditingNull} onMove={(r, c) => ui.set({ editing: { type: 'cell', id: editEl.id, r, c } })} />
      )}
      {editing?.type === 'crop' && <div className="stage-hint stage-ctl">Drag the picture to reposition it · drag the handles to crop · Esc or click outside when done</div>}
      {editing?.type === 'path' && <div className="stage-hint stage-ctl">Click to add points · drag points and handles to shape the path · Esc when done</div>}
      {dropping && <div className="drop-hint">Drop to add to this slide</div>}
      <ZoomBar view={view} />
    </div>
  );
}

function ZoomBar({ view }: { view: View }) {
  const setZoom = (z: number | 'fit') => ui.set({ zoom: z === 'fit' ? 'fit' : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)), pan: { x: 0, y: 0 } });
  return (
    <div className="zoombar stage-ctl" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom out" onClick={() => setZoom(view.zoom / 1.25)}>−</button>
      <button type="button" className="pct" aria-label="Fit slide to window" title="Fit to window" onClick={() => setZoom('fit')}>{Math.round(view.zoom * 100)}%</button>
      <button type="button" aria-label="Zoom in" onClick={() => setZoom(view.zoom * 1.25)}>+</button>
    </div>
  );
}

void toast;

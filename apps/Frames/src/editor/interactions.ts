import { bounds, clamp, rotatePoint, unionRects, type Pt, type Rect } from '../model/geometry';
import * as ops from '../model/ops';
import type { El, Slide } from '../model/types';
import { layoutText } from '../render/text';
import { doc } from '../state/session';
import type { PrefsState } from '../state/prefs';
import { ui } from '../state/ui';
import * as cmd from './commands';
import { centerOf, frameOf, lineEnds, selectionFrame, type Frame, type HandleId } from './frames';
import { hitElement } from './hit';
import { handleScreen, visibleHandles, type OverlayState } from './overlay';
import { snapEdge, snapMove, type GuideLine, type SnapTargets } from './snap';
import { toSlide, type View } from './viewport';

export interface Dyn {
  hover: string | null;
  marquee: Rect | null;
  guides: GuideLine[];
  hud: { text: string; at: Pt } | null;
  pending: OverlayState['pending'];
}

export interface InteractionApi {
  view(): View;
  slide(): Slide | undefined;
  dyn: Dyn;
  invalidate(): void;
  cursor(c: string): void;
  prefs(): PrefsState;
  overlayState(): OverlayState | null;
  /** Screen position (relative to the stage) of a pointer event. */
  local(e: { clientX: number; clientY: number }): Pt;
  /** Begin editing a table cell / text for the element under the pointer. */
  panBy(dx: number, dy: number): void;
}

type Drag =
  | { kind: 'pan'; last: Pt }
  | { kind: 'move'; start: Pt; ids: string[]; orig: Map<string, Pt>; box: Rect; g: ReturnType<typeof doc.begin> | null; others: Rect[]; moved: boolean; clicked: string; shift: boolean }
  | { kind: 'resize'; handle: HandleId; start: Pt; f0: Frame; g: ReturnType<typeof doc.begin>; origs: Map<string, { x: number; y: number; w: number; h: number; local: Pt }>; ids: string[]; others: Rect[]; multi: boolean }
  | { kind: 'rotate'; start: number; g: ReturnType<typeof doc.begin>; c: Pt; origs: Map<string, { x: number; y: number; rot: number }>; ids: string[] }
  | { kind: 'line'; end: 'p0' | 'p1'; id: string; fixed: Pt; g: ReturnType<typeof doc.begin>; parent: Pt }
  | { kind: 'marquee'; start: Pt; add: boolean; base: string[] }
  | { kind: 'create'; tool: 'text' | 'shape' | 'line'; start: Pt; moved: boolean }
  | { kind: 'guide'; axis: 'v' | 'h'; index: number; g: ReturnType<typeof doc.begin> }
  | { kind: 'path'; node: number; part: 'node' | 'in' | 'out'; g: ReturnType<typeof doc.begin>; animId: string; origin: Pt }
  | { kind: 'crop'; g: ReturnType<typeof doc.begin>; start: Pt; crop: { x: number; y: number; w: number; h: number }; id: string; nat: { w: number; h: number }; handle: HandleId | null; box: Rect };

const HANDLE_CURSOR: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rot: 'grab', p0: 'crosshair', p1: 'crosshair' };

export class Interactions {
  private drag: Drag | null = null;
  space = false;
  private downAt: Pt | null = null;

  constructor(private api: InteractionApi) {}

  // ── Helpers ──

  private level(s: Slide): El[] {
    return cmd.pickable(s);
  }

  private targets(s: Slide, exclude: Set<string>): { rects: Rect[]; t: SnapTargets } {
    const p = this.api.prefs();
    const rects = this.level(s).filter((e) => !exclude.has(e.id) && !e.hidden).map((e) => bounds(frameOf(s.elements, e)));
    return {
      rects,
      t: {
        rects,
        slide: doc.deck.size,
        margin: doc.deck.margin,
        guides: s.guides,
        grid: p.showGrid ? 40 : 0,
        smart: p.smartGuides,
        objects: p.snapObjects,
      },
    };
  }

  private threshold() {
    return 7 / this.api.view().zoom;
  }

  private hitHandle(local: Pt): HandleId | null {
    const st = this.api.overlayState();
    if (!st || !st.frame) return null;
    for (const h of visibleHandles(st).reverse()) {
      const p = handleScreen(st, h);
      if (p && Math.hypot(p.x - local.x, p.y - local.y) <= (h === 'rot' || h === 'p0' || h === 'p1' ? 11 : 9)) return h;
    }
    return null;
  }

  // ── Pointer events ──

  down(e: PointerEvent, host: HTMLElement) {
    const s = this.api.slide();
    if (!s) return;
    const local = this.api.local(e);
    const pt = toSlide(this.api.view(), local.x, local.y);
    this.downAt = local;
    const u = ui.get();

    if (e.button === 1 || this.space || u.tool === 'hand') {
      this.drag = { kind: 'pan', last: { x: e.clientX, y: e.clientY } };
      host.setPointerCapture(e.pointerId);
      return this.api.cursor('grabbing');
    }
    if (e.button !== 0) return;
    host.setPointerCapture(e.pointerId);

    // Motion-path editing takes over the canvas.
    if (u.editing?.type === 'path') return this.downPath(local, pt);
    if (u.editing?.type === 'crop') return this.downCrop(s, local, pt);

    // Guides
    const gi = this.hitGuide(s, local);
    if (gi) return this.startGuide(s, gi.axis, gi.index);

    if (u.tool === 'text' || u.tool === 'shape' || u.tool === 'line') {
      this.drag = { kind: 'create', tool: u.tool, start: pt, moved: false };
      return;
    }

    const handle = this.hitHandle(local);
    if (handle) return this.startHandle(s, handle, pt, local);

    const hit = hitElement(s.elements, this.level(s), pt, 4 / this.api.view().zoom);
    if (hit) {
      const sel = u.sel;
      let ids = sel;
      if (e.shiftKey) {
        ids = sel.includes(hit.id) ? sel.filter((x) => x !== hit.id) : [...sel, hit.id];
        cmd.select(ids, true);
        if (!ids.includes(hit.id)) return;
      } else if (!sel.includes(hit.id)) {
        ids = [hit.id];
        cmd.select(ids, true);
      }
      return this.startMove(s, ids, pt, hit.id, e.shiftKey);
    }
    // Empty space: marquee (or clear selection).
    if (!e.shiftKey) cmd.select([], true);
    ui.set({ editing: null });
    this.drag = { kind: 'marquee', start: pt, add: e.shiftKey, base: e.shiftKey ? u.sel : [] };
  }

  move(e: PointerEvent) {
    const s = this.api.slide();
    if (!s) return;
    const local = this.api.local(e);
    const view = this.api.view();
    const pt = toSlide(view, local.x, local.y);
    const d = this.drag;
    if (!d) return this.hover(s, local, pt);

    switch (d.kind) {
      case 'pan':
        this.api.panBy(e.clientX - d.last.x, e.clientY - d.last.y);
        d.last = { x: e.clientX, y: e.clientY };
        return;
      case 'move':
        return this.doMove(s, d, pt, e, local);
      case 'resize':
        return this.doResize(s, d, pt, e, local);
      case 'rotate':
        return this.doRotate(d, pt, e, local);
      case 'line':
        return this.doLine(d, pt, e, local);
      case 'marquee':
        return this.doMarquee(s, d, pt);
      case 'create':
        return this.doCreate(d, pt, e, local);
      case 'guide':
        return this.doGuide(d, pt, e);
      case 'path':
        return this.doPath(d, pt);
      case 'crop':
        return this.doCrop(d, pt, e);
    }
  }

  up(e: PointerEvent, host: HTMLElement) {
    const d = this.drag;
    this.drag = null;
    try {
      host.releasePointerCapture(e.pointerId);
    } catch { /* not captured */ }
    this.api.dyn.guides = [];
    this.api.dyn.hud = null;
    this.api.dyn.marquee = null;
    this.api.dyn.pending = null;
    if (!d) return;
    switch (d.kind) {
      case 'move':
        if (d.g) d.g.end();
        // A click (no drag) on one element of a multi-selection selects just that element.
        else if (!d.moved && !d.shift && ui.get().sel.length > 1) cmd.select([d.clicked], true);
        break;
      case 'resize':
        this.finishText(d.ids);
        d.g.end();
        break;
      case 'guide':
      case 'rotate':
      case 'line':
      case 'path':
      case 'crop':
        d.g.end();
        break;
      case 'create':
        this.finishCreate(d, toSlide(this.api.view(), this.api.local(e).x, this.api.local(e).y), e);
        break;
      case 'marquee':
      case 'pan':
        break;
    }
    this.api.cursor(this.space ? 'grab' : 'default');
    this.api.invalidate();
  }

  private hover(s: Slide, local: Pt, pt: Pt) {
    const u = ui.get();
    const dyn = this.api.dyn;
    if (u.editing?.type === 'path' || u.editing?.type === 'crop') return this.api.cursor('default');
    if (this.space || u.tool === 'hand') return this.api.cursor('grab');
    if (u.tool !== 'select') return this.api.cursor('crosshair');
    const h = this.hitHandle(local);
    if (h) {
      dyn.hover = null;
      this.api.cursor(HANDLE_CURSOR[h] ?? 'default');
      return this.api.invalidate();
    }
    if (this.hitGuide(s, local)) return this.api.cursor(this.hitGuide(s, local)!.axis === 'v' ? 'ew-resize' : 'ns-resize');
    const hit = hitElement(s.elements, this.level(s), pt, 4 / this.api.view().zoom);
    const id = hit?.id ?? null;
    this.api.cursor(hit ? (u.sel.includes(hit.id) ? 'move' : 'default') : 'default');
    if (dyn.hover !== id) {
      dyn.hover = id;
      this.api.invalidate();
    }
  }

  dblclick(e: MouseEvent) {
    const s = this.api.slide();
    if (!s) return;
    const local = this.api.local(e);
    const pt = toSlide(this.api.view(), local.x, local.y);
    const u = ui.get();
    if (u.editing?.type === 'path') return;
    const hit = hitElement(s.elements, this.level(s), pt, 4 / this.api.view().zoom);
    if (!hit) {
      // Double-click empty space: leave a group, or add text.
      if (u.group) return cmd.select(u.sel, false), ui.set({ group: null });
      return void cmd.insertText(pt);
    }
    cmd.select([hit.id], true);
    switch (hit.type) {
      case 'text':
        return ui.set({ editing: { type: 'text', id: hit.id } });
      case 'shape':
        cmd.ensureShapeText(hit.id);
        return ui.set({ editing: { type: 'text', id: hit.id } });
      case 'group':
        return ui.set({ group: hit.id, sel: [] });
      case 'image':
        return ui.set({ editing: hit.asset ? { type: 'crop', id: hit.id } : null });
      case 'table': {
        const abs = frameOf(s.elements, hit);
        const lp = rotatePoint(pt, centerOf(abs), -abs.rot);
        let x = lp.x - abs.x, y = lp.y - abs.y, c = 0, r = 0;
        for (; c < hit.cols.length - 1 && x > hit.cols[c]!; c++) x -= hit.cols[c]!;
        for (; r < hit.rows.length - 1 && y > hit.rows[r]!; r++) y -= hit.rows[r]!;
        return ui.set({ editing: { type: 'cell', id: hit.id, r, c } });
      }
      default:
    }
  }

  // ── Move ──

  private startMove(s: Slide, ids: string[], pt: Pt, clicked: string, shift: boolean) {
    const els = ids.map((id) => ops.findEl(s.elements, id)).filter((x): x is El => !!x);
    const orig = new Map<string, Pt>(els.map((e) => [e.id, { x: e.x, y: e.y }]));
    const box = unionRects(els.map((e) => bounds(frameOf(s.elements, e))))!;
    const { rects } = this.targets(s, new Set(ids));
    this.drag = { kind: 'move', start: pt, ids, orig, box, g: null, others: rects, moved: false, clicked, shift };
    if (els.every((e) => e.locked)) this.drag = null;
  }

  private doMove(s: Slide, d: Extract<Drag, { kind: 'move' }>, pt: Pt, e: PointerEvent, local: Pt) {
    let dx = pt.x - d.start.x, dy = pt.y - d.start.y;
    if (!d.moved) {
      if (Math.hypot(local.x - this.downAt!.x, local.y - this.downAt!.y) < 3) return;
      d.moved = true;
      if (e.altKey) {
        const copies = cmd.duplicateSelection(0);
        if (copies.length) {
          d.ids = copies.map((c) => c.id);
          d.orig = new Map(copies.map((c) => [c.id, { x: c.x, y: c.y }]));
        }
      }
      d.g = doc.begin(d.ids.length > 1 ? 'Move elements' : 'Move');
    }
    if (e.shiftKey && !d.shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    let rect = { ...d.box, x: d.box.x + dx, y: d.box.y + dy };
    if (!(e.metaKey || e.ctrlKey)) {
      const { t } = this.targets(s, new Set(d.ids));
      const snap = snapMove(rect, t, this.threshold());
      dx += snap.dx;
      dy += snap.dy;
      this.api.dyn.guides = snap.lines;
      rect = { ...rect, x: rect.x + snap.dx, y: rect.y + snap.dy };
    } else this.api.dyn.guides = [];
    const slideId = s.id;
    d.g!.update((deck) => {
      for (const id of d.ids) {
        const o = d.orig.get(id)!;
        ops.patchElement(deck, slideId, id, { x: o.x + dx, y: o.y + dy });
      }
    });
    this.api.dyn.hud = { text: `${Math.round(rect.x)}, ${Math.round(rect.y)}`, at: local };
    this.api.invalidate();
  }

  // ── Resize / rotate ──

  private startHandle(s: Slide, handle: HandleId, pt: Pt, local: Pt) {
    const sel = ui.get().sel;
    const els = sel.map((id) => ops.findEl(s.elements, id)).filter((x): x is El => !!x);
    if (!els.length || els.every((x) => x.locked)) return;
    const f0 = selectionFrame(s.elements, sel)!;
    const multi = els.length > 1;
    const slideId = s.id;
    void slideId;
    if (handle === 'rot') {
      const c = centerOf(f0);
      const origs = new Map(els.map((x) => [x.id, { x: x.x, y: x.y, rot: x.rot }]));
      this.drag = { kind: 'rotate', start: Math.atan2(pt.y - c.y, pt.x - c.x), g: doc.begin('Rotate'), c, origs, ids: sel };
      return;
    }
    if (handle === 'p0' || handle === 'p1') {
      const line = els[0]!;
      if (line.type !== 'line') return;
      const [a, b] = lineEnds(s.elements, line);
      const abs = frameOf(s.elements, line);
      this.drag = { kind: 'line', end: handle, id: line.id, fixed: handle === 'p0' ? b : a, g: doc.begin('Edit line'), parent: { x: abs.x - line.x, y: abs.y - line.y } };
      return;
    }
    const origs = new Map(els.map((x) => {
      const abs = frameOf(s.elements, x);
      return [x.id, { x: x.x, y: x.y, w: x.w, h: x.h, local: { x: abs.x - x.x, y: abs.y - x.y } }];
    }));
    const { rects } = this.targets(s, new Set(sel));
    void pt;
    void local;
    this.drag = { kind: 'resize', handle, start: pt, f0, g: doc.begin('Resize'), origs, ids: sel, others: rects, multi };
  }

  private doResize(s: Slide, d: Extract<Drag, { kind: 'resize' }>, pt: Pt, e: PointerEvent, local: Pt) {
    const f0 = d.f0;
    const c0 = centerOf(f0);
    const p = rotatePoint(pt, c0, -f0.rot);
    let l = f0.x, r = f0.x + f0.w, t = f0.y, b = f0.y + f0.h;
    const h = d.handle;
    const min = 8;
    const alt = e.altKey;
    const guides: GuideLine[] = [];
    let px = p.x, py = p.y;
    // Snap the dragged edge(s) when unrotated.
    if (!f0.rot && !(e.metaKey || e.ctrlKey)) {
      const { t: tg } = this.targets(s, new Set(d.ids));
      if (h.includes('e') || h.includes('w')) {
        const sn = snapEdge('x', px, tg, this.threshold(), [0, doc.deck.size.h]);
        px += sn.d;
        if (sn.line) guides.push(sn.line);
      }
      if (h.includes('n') || h.includes('s')) {
        const sn = snapEdge('y', py, tg, this.threshold(), [0, doc.deck.size.w]);
        py += sn.d;
        if (sn.line) guides.push(sn.line);
      }
    }
    if (h.includes('e')) r = Math.max(px, (alt ? c0.x : l) + min);
    if (h.includes('w')) l = Math.min(px, (alt ? c0.x : r) - min);
    if (h.includes('s')) b = Math.max(py, (alt ? c0.y : t) + min);
    if (h.includes('n')) t = Math.min(py, (alt ? c0.y : b) - min);
    if (alt) {
      if (h.includes('e')) l = c0.x - (r - c0.x);
      if (h.includes('w')) r = c0.x + (c0.x - l);
      if (h.includes('s')) t = c0.y - (b - c0.y);
      if (h.includes('n')) b = c0.y + (c0.y - t);
    }
    const els = d.ids.map((id) => ops.findEl(s.elements, id)).filter((x): x is El => !!x);
    const lockType = !d.multi && ['image', 'icon', 'video', 'group'].includes(els[0]!.type);
    const corner = h.length === 2;
    if (corner && (e.shiftKey || lockType)) {
      const ratio = f0.w / Math.max(1, f0.h);
      let w = r - l, hh = b - t;
      if (w / hh > ratio) w = hh * ratio;
      else hh = w / ratio;
      if (h.includes('w')) l = r - w;
      else r = l + w;
      if (h.includes('n')) t = b - hh;
      else b = t + hh;
    }
    const nw = r - l, nh = b - t;
    const ncLocal = { x: (l + r) / 2, y: (t + b) / 2 };
    const nc = rotatePoint(ncLocal, c0, f0.rot);
    const nx = nc.x - nw / 2, ny = nc.y - nh / 2;
    const slideId = s.id;
    const kx = nw / f0.w, ky = nh / f0.h;

    d.g.update((deck) => {
      const sl = ops.slideById(deck, slideId)!;
      if (!d.multi) {
        const id = d.ids[0]!;
        const o = d.origs.get(id)!;
        const el = ops.findEl(sl.elements, id)!;
        el.x = nx - o.local.x;
        el.y = ny - o.local.y;
        el.w = nw;
        el.h = nh;
        if (el.type === 'group') scaleChildren(el, nw / o.w, nh / o.h, ops);
        if (el.type === 'table') {
          const sx = nw / o.w, sy = nh / o.h;
          const src = ops.findEl(s.elements, id)!;
          if (src.type === 'table') {
            el.cols = src.cols.map((v) => v * sx);
            el.rows = src.rows.map((v) => v * sy);
          }
        }
        if (el.type === 'text' && el.fit === 'grow') {
          const lay = layoutText(el.doc, el.base, doc.deck.theme, Math.max(10, nw - el.pad * 2));
          el.h = Math.max(lay.height + el.pad * 2, 16);
        }
      } else {
        for (const id of d.ids) {
          const o = d.origs.get(id)!;
          const el = ops.findEl(sl.elements, id)!;
          const ax = o.x + o.local.x, ay = o.y + o.local.y;
          el.x = nx + (ax - f0.x) * kx - o.local.x;
          el.y = ny + (ay - f0.y) * ky - o.local.y;
          el.w = o.w * kx;
          el.h = o.h * ky;
          if (el.type === 'group') scaleChildren(el, kx, ky, ops);
        }
      }
    });
    this.api.dyn.guides = guides;
    this.api.dyn.hud = { text: `${Math.round(nw)} × ${Math.round(nh)}`, at: local };
    this.api.invalidate();
  }

  private finishText(ids: string[]) {
    // Text boxes in 'grow' mode already track their content during resize.
    void ids;
  }

  private doRotate(d: Extract<Drag, { kind: 'rotate' }>, pt: Pt, e: PointerEvent, local: Pt) {
    let delta = ((Math.atan2(pt.y - d.c.y, pt.x - d.c.x) - d.start) * 180) / Math.PI;
    const slide = this.api.slide()!;
    const first = d.origs.values().next().value!;
    const total = first.rot + delta;
    if (e.shiftKey) delta = Math.round(total / 15) * 15 - first.rot;
    else if (d.ids.length === 1) {
      const snapped = Math.round(total / 45) * 45;
      if (Math.abs(total - snapped) < 2.5) delta = snapped - first.rot;
    }
    d.g.update((deck) => {
      for (const id of d.ids) {
        const o = d.origs.get(id)!;
        const el = ops.findEl(ops.slideById(deck, slide.id)!.elements, id)!;
        if (d.ids.length > 1) {
          const orig = ops.findEl(slide.elements, id)!;
          const oc = { x: o.x + orig.w / 2, y: o.y + orig.h / 2 };
          const nc = rotatePoint(oc, d.c, delta);
          el.x = nc.x - el.w / 2;
          el.y = nc.y - el.h / 2;
        }
        el.rot = Math.round((o.rot + delta) * 10) / 10;
      }
    });
    const shown = ((((first.rot + delta) % 360) + 360) % 360);
    this.api.dyn.hud = { text: `${Math.round(shown)}°`, at: local };
    this.api.invalidate();
  }

  private doLine(d: Extract<Drag, { kind: 'line' }>, pt: Pt, e: PointerEvent, local: Pt) {
    let p = pt;
    if (e.shiftKey) {
      const dx = p.x - d.fixed.x, dy = p.y - d.fixed.y;
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      p = { x: d.fixed.x + Math.cos(ang) * len, y: d.fixed.y + Math.sin(ang) * len };
    } else if (!(e.metaKey || e.ctrlKey)) {
      const s = this.api.slide()!;
      const { t } = this.targets(s, new Set([d.id]));
      const a = snapEdge('x', p.x, t, this.threshold(), [0, doc.deck.size.h]);
      const b = snapEdge('y', p.y, t, this.threshold(), [0, doc.deck.size.w]);
      p = { x: p.x + a.d, y: p.y + b.d };
      this.api.dyn.guides = [a.line, b.line].filter((x): x is GuideLine => !!x);
    }
    const x = Math.min(p.x, d.fixed.x), y = Math.min(p.y, d.fixed.y), w = Math.abs(p.x - d.fixed.x), h = Math.abs(p.y - d.fixed.y);
    // Which diagonal? "up" means bottom-left → top-right.
    const start = d.end === 'p0' ? p : d.fixed, end = d.end === 'p0' ? d.fixed : p;
    const up = end.y < start.y !== end.x < start.x;
    const slideId = this.api.slide()!.id;
    d.g.update((deck) => {
      const el = ops.findEl(ops.slideById(deck, slideId)!.elements, d.id);
      if (el && el.type === 'line') {
        el.x = x - d.parent.x;
        el.y = y - d.parent.y;
        el.w = w;
        el.h = h;
        el.up = up;
        // Keep arrowheads on their ends when the endpoints swap sides.
      }
    });
    this.api.dyn.hud = { text: `${Math.round(Math.hypot(p.x - d.fixed.x, p.y - d.fixed.y))}`, at: local };
    this.api.invalidate();
  }

  // ── Marquee / create ──

  private doMarquee(s: Slide, d: Extract<Drag, { kind: 'marquee' }>, pt: Pt) {
    const r = { x: Math.min(pt.x, d.start.x), y: Math.min(pt.y, d.start.y), w: Math.abs(pt.x - d.start.x), h: Math.abs(pt.y - d.start.y) };
    this.api.dyn.marquee = r;
    const hit = this.level(s).filter((e) => !e.hidden && !e.locked).filter((e) => {
      const b = bounds(frameOf(s.elements, e));
      return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y;
    }).map((e) => e.id);
    const next = [...new Set([...d.base, ...hit])];
    if (next.join() !== ui.get().sel.join()) cmd.select(next, true);
    this.api.invalidate();
  }

  private doCreate(d: Extract<Drag, { kind: 'create' }>, pt: Pt, e: PointerEvent, local: Pt) {
    if (!d.moved && Math.hypot(local.x - this.downAt!.x, local.y - this.downAt!.y) < 4) return;
    d.moved = true;
    let b = pt;
    if (d.tool === 'line' && e.shiftKey) {
      const dx = b.x - d.start.x, dy = b.y - d.start.y;
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      b = { x: d.start.x + Math.cos(ang) * len, y: d.start.y + Math.sin(ang) * len };
    } else if (d.tool === 'shape' && e.shiftKey) {
      const m = Math.max(Math.abs(b.x - d.start.x), Math.abs(b.y - d.start.y));
      b = { x: d.start.x + Math.sign(b.x - d.start.x || 1) * m, y: d.start.y + Math.sign(b.y - d.start.y || 1) * m };
    }
    this.api.dyn.pending = { kind: d.tool, a: d.start, b };
    this.api.dyn.hud = { text: `${Math.round(Math.abs(b.x - d.start.x))} × ${Math.round(Math.abs(b.y - d.start.y))}`, at: local };
    this.api.invalidate();
  }

  private finishCreate(d: Extract<Drag, { kind: 'create' }>, pt: Pt, e: PointerEvent) {
    let b = pt;
    const a = d.start;
    if (d.moved) {
      if (d.tool === 'shape' && e.shiftKey) {
        const m = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        b = { x: a.x + Math.sign(b.x - a.x || 1) * m, y: a.y + Math.sign(b.y - a.y || 1) * m };
      }
      if (d.tool === 'line' && e.shiftKey) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        b = { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
      }
    }
    const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    if (d.tool === 'text') {
      const el = cmd.insertText({ x: a.x + (d.moved ? rect.w / 2 : 400), y: a.y + (d.moved ? rect.h / 2 : 30) });
      if (d.moved && rect.w > 40) {
        cmd.setProps({ x: rect.x, w: rect.w, y: rect.y }, 'Size text', undefined, [el.id]);
      }
      return;
    }
    if (d.tool === 'shape') {
      const kind = ui.get().shapeKind;
      if (d.moved && rect.w > 6 && rect.h > 6) cmd.insertShape(kind, rect);
      else cmd.insertShape(kind, { x: a.x - 150, y: a.y - 100 });
      return;
    }
    // line
    if (d.moved && (rect.w > 4 || rect.h > 4)) {
      const up = b.y < a.y !== b.x < a.x;
      cmd.insertLine({ ...rect, up }, false);
    } else cmd.insertLine({ x: a.x, y: a.y, w: 400, h: 0 });
  }

  // ── Guides ──

  private hitGuide(s: Slide, local: Pt): { axis: 'v' | 'h'; index: number } | null {
    const v = this.api.view();
    const g = s.guides;
    if (!g) return null;
    for (let i = 0; i < g.v.length; i++) if (Math.abs(v.x + g.v[i]! * v.zoom - local.x) < 4) return { axis: 'v', index: i };
    for (let i = 0; i < g.h.length; i++) if (Math.abs(v.y + g.h[i]! * v.zoom - local.y) < 4) return { axis: 'h', index: i };
    return null;
  }

  /** Begin dragging a guide (an existing one, or a new one pulled from a ruler). */
  startGuide(s: Slide, axis: 'v' | 'h', index: number) {
    const slideId = s.id;
    let idx = index;
    if (idx < 0) {
      doc.commit('Add guide', (d) => {
        const sl = ops.slideById(d, slideId)!;
        sl.guides ??= { v: [], h: [] };
        sl.guides[axis].push(0);
        idx = sl.guides[axis].length - 1;
      });
    }
    this.drag = { kind: 'guide', axis, index: idx, g: doc.begin('Move guide') };
  }

  private doGuide(d: Extract<Drag, { kind: 'guide' }>, pt: Pt, e: PointerEvent) {
    const slideId = this.api.slide()!.id;
    const pos = Math.round((d.axis === 'v' ? pt.x : pt.y) * (e.shiftKey ? 1 : 1));
    const view = this.api.view();
    const local = this.api.local(e);
    const outside = d.axis === 'v' ? local.x < 22 : local.y < 22;
    d.g.update((deck) => {
      const sl = ops.slideById(deck, slideId)!;
      if (!sl.guides) return;
      if (outside) sl.guides[d.axis].splice(d.index, 1);
      else sl.guides[d.axis][d.index] = pos;
    });
    void view;
    this.api.dyn.hud = { text: outside ? 'Remove' : String(pos), at: local };
    this.api.invalidate();
  }

  // ── Motion path ──

  private pathOrigin(): { anim: string; origin: Pt; nodes: import('../model/types').PathNode[] } | null {
    const u = ui.get();
    if (u.editing?.type !== 'path') return null;
    const s = this.api.slide();
    const a = s?.anims.find((x) => x.id === (u.editing as { anim: string }).anim);
    if (!s || !a) return null;
    const el = ops.findEl(s.elements, a.el);
    if (!el) return null;
    const f = frameOf(s.elements, el);
    return { anim: a.id, origin: centerOf(f), nodes: a.path ?? [] };
  }

  private downPath(local: Pt, pt: Pt) {
    const info = this.pathOrigin();
    if (!info) return;
    const v = this.api.view();
    const near = (p: Pt) => Math.hypot(v.x + p.x * v.zoom - local.x, v.y + p.y * v.zoom - local.y) < 10;
    const sel = this.api.overlayState()?.path?.sel ?? null;
    // Handles of the selected node first.
    if (sel !== null) {
      const n = info.nodes[sel]!;
      if (n.ox !== undefined && near({ x: info.origin.x + n.x + n.ox, y: info.origin.y + n.y + (n.oy ?? 0) })) return this.startPathDrag(sel, 'out', info);
      if (n.ix !== undefined && near({ x: info.origin.x + n.x + n.ix, y: info.origin.y + n.y + (n.iy ?? 0) })) return this.startPathDrag(sel, 'in', info);
    }
    for (let i = 0; i < info.nodes.length; i++) {
      const n = info.nodes[i]!;
      if (near({ x: info.origin.x + n.x, y: info.origin.y + n.y })) {
        pathSel.set(i);
        return this.startPathDrag(i, 'node', info);
      }
    }
    // Click on empty space adds a node at the end.
    const slideId = this.api.slide()!.id;
    const nodes = [...info.nodes, { x: pt.x - info.origin.x, y: pt.y - info.origin.y }];
    doc.commit('Add path point', (d) => ops.patchAnim(d, slideId, info.anim, { path: nodes }));
    pathSel.set(nodes.length - 1);
    this.api.invalidate();
  }

  private startPathDrag(node: number, part: 'node' | 'in' | 'out', info: { anim: string; origin: Pt }) {
    this.drag = { kind: 'path', node, part, g: doc.begin('Edit path'), animId: info.anim, origin: info.origin };
    pathSel.set(node);
  }

  private doPath(d: Extract<Drag, { kind: 'path' }>, pt: Pt) {
    const slideId = this.api.slide()!.id;
    const rel = { x: pt.x - d.origin.x, y: pt.y - d.origin.y };
    d.g.update((deck) => {
      const a = ops.slideById(deck, slideId)?.anims.find((x) => x.id === d.animId);
      const n = a?.path?.[d.node];
      if (!n) return;
      if (d.part === 'node') {
        n.x = rel.x;
        n.y = rel.y;
      } else if (d.part === 'out') {
        n.ox = rel.x - n.x;
        n.oy = rel.y - n.y;
        n.ix = -(n.ox ?? 0);
        n.iy = -(n.oy ?? 0);
      } else {
        n.ix = rel.x - n.x;
        n.iy = rel.y - n.y;
        n.ox = -(n.ix ?? 0);
        n.oy = -(n.iy ?? 0);
      }
    });
    this.api.invalidate();
  }

  // ── Crop (pan the picture inside its frame) ──

  private downCrop(s: Slide, local: Pt, pt: Pt) {
    const u = ui.get();
    const id = (u.editing as { id: string }).id;
    const el = ops.findEl(s.elements, id);
    if (!el || el.type !== 'image') return;
    const f = frameOf(s.elements, el);
    const inside = pt.x >= f.x && pt.x <= f.x + f.w && pt.y >= f.y && pt.y <= f.y + f.h;
    const st = this.api.overlayState();
    // Crop handles
    let handle: HandleId | null = null;
    if (st?.crop && !el.rot) {
      const v = this.api.view();
      const pts: [HandleId, Pt][] = [['nw', { x: f.x, y: f.y }], ['ne', { x: f.x + f.w, y: f.y }], ['se', { x: f.x + f.w, y: f.y + f.h }], ['sw', { x: f.x, y: f.y + f.h }], ['n', { x: f.x + f.w / 2, y: f.y }], ['s', { x: f.x + f.w / 2, y: f.y + f.h }], ['w', { x: f.x, y: f.y + f.h / 2 }], ['e', { x: f.x + f.w, y: f.y + f.h / 2 }]];
      for (const [h, p] of pts) if (Math.hypot(v.x + p.x * v.zoom - local.x, v.y + p.y * v.zoom - local.y) < 10) handle = h;
    }
    if (!inside && !handle) {
      ui.set({ editing: null });
      this.drag = null;
      return;
    }
    const meta = doc.deck.assets[el.asset ?? ''];
    this.drag = { kind: 'crop', g: doc.begin('Crop'), start: pt, crop: { ...el.crop }, id, nat: { w: meta?.w ?? 1000, h: meta?.h ?? 1000 }, handle, box: { x: el.x, y: el.y, w: el.w, h: el.h } };
  }

  private doCrop(d: Extract<Drag, { kind: 'crop' }>, pt: Pt, e: PointerEvent) {
    const slideId = this.api.slide()!.id;
    const dx = pt.x - d.start.x, dy = pt.y - d.start.y;
    // screen px per source px
    const scaleX = d.box.w / (d.crop.w * d.nat.w), scaleY = d.box.h / (d.crop.h * d.nat.h);
    d.g.update((deck) => {
      const el = ops.findEl(ops.slideById(deck, slideId)!.elements, d.id);
      if (!el || el.type !== 'image') return;
      if (!d.handle) {
        // Dragging the picture moves the crop window the other way.
        el.crop.x = clamp(d.crop.x - dx / scaleX / d.nat.w, 0, 1 - d.crop.w);
        el.crop.y = clamp(d.crop.y - dy / scaleY / d.nat.h, 0, 1 - d.crop.h);
        return;
      }
      const h = d.handle;
      let { x, y, w, h: hh } = d.box;
      let cx = d.crop.x, cy = d.crop.y, cw = d.crop.w, ch = d.crop.h;
      const minPx = 24;
      if (h.includes('w')) {
        const nx = Math.min(x + dx, x + w - minPx);
        const delta = nx - x;
        cx += delta / scaleX / d.nat.w; cw -= delta / scaleX / d.nat.w; x = nx; w -= delta;
      }
      if (h.includes('e')) {
        const nw = Math.max(w + dx, minPx);
        cw += (nw - w) / scaleX / d.nat.w; w = nw;
      }
      if (h.includes('n')) {
        const ny = Math.min(y + dy, y + hh - minPx);
        const delta = ny - y;
        cy += delta / scaleY / d.nat.h; ch -= delta / scaleY / d.nat.h; y = ny; hh -= delta;
      }
      if (h.includes('s')) {
        const nh = Math.max(hh + dy, minPx);
        ch += (nh - hh) / scaleY / d.nat.h; hh = nh;
      }
      if (cx < 0 || cy < 0 || cx + cw > 1 || cy + ch > 1) return; // can't crop beyond the picture
      el.x = x; el.y = y; el.w = w; el.h = hh;
      el.crop = { x: cx, y: cy, w: cw, h: ch };
    });
    void e;
    this.api.invalidate();
  }

  /** Cancel whatever is in flight (Escape). */
  cancel() {
    const d = this.drag;
    this.drag = null;
    if (d && 'g' in d && d.g) d.g.cancel();
    this.api.dyn.guides = [];
    this.api.dyn.hud = null;
    this.api.dyn.marquee = null;
    this.api.dyn.pending = null;
    this.api.invalidate();
  }

  get busy() {
    return !!this.drag;
  }
}

function scaleChildren(g: Extract<El, { type: 'group' }>, kx: number, ky: number, o: typeof ops) {
  for (const c of g.children) {
    c.x *= kx;
    c.y *= ky;
    c.w *= kx;
    c.h *= ky;
    if (c.type === 'group') scaleChildren(c, 1, 1, o);
  }
}

/** The motion-path node being edited (shared with the overlay). */
export const pathSel = (() => {
  let v: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => v,
    set: (n: number | null) => {
      v = n;
      listeners.forEach((f) => f());
    },
    subscribe: (f: () => void) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
  };
})();


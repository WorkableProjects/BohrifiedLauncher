import { samplePath } from '../anim/path';
import { rotatePoint, type Pt, type Rect } from '../model/geometry';
import type { El, PathNode, Slide } from '../model/types';
import { frameCorners, handlePoint, lineEnds, type Frame, type HandleId } from './frames';
import type { GuideLine } from './snap';
import { toScreen, type View } from './viewport';

export const ROT_OFFSET = 34; // screen px above the top edge

export interface OverlayState {
  view: View;
  slide: Slide;
  size: { w: number; h: number };
  /** Selection frame (single element, or union of several). */
  frame: Frame | null;
  multi: boolean;
  selected: El[];
  hover: El | null;
  marquee: Rect | null;
  guides: GuideLine[];
  userGuides: { v: number[]; h: number[] };
  margin: number;
  grid: number;
  showMargins: boolean;
  /** Text shown beside the cursor while resizing/rotating. */
  hud: { text: string; at: Pt } | null;
  /** Elements being edited (no handles). */
  editing: boolean;
  lineOf: (el: El) => [Pt, Pt] | null;
  /** Slide-space frame of an element (resolving group nesting). */
  absOf: (el: El) => Frame;
  /** Colours resolved from CSS. */
  tint: string;
  path: { nodes: PathNode[]; origin: Pt; sel: number | null } | null;
  crop: { full: Rect; box: Frame } | null;
  /** Space-held / hand tool. */
  dpr: number;
  pending: { kind: 'shape' | 'line' | 'text'; a: Pt; b: Pt } | null;
}

const HS = 8; // handle size (screen px)

export function handleScreen(s: OverlayState, id: HandleId): Pt | null {
  if (!s.frame) return null;
  if (id === 'rot') {
    const f = s.frame;
    const cx = f.x + f.w / 2;
    const c = toScreen(s.view, { x: cx, y: f.y });
    const base = rotatePoint({ x: c.x, y: c.y - ROT_OFFSET }, toScreen(s.view, { x: f.x + f.w / 2, y: f.y + f.h / 2 }), f.rot);
    return base;
  }
  if (id === 'p0' || id === 'p1') {
    const e = s.selected[0];
    const ends = e && s.lineOf(e);
    return ends ? toScreen(s.view, id === 'p0' ? ends[0] : ends[1]) : null;
  }
  return toScreen(s.view, handlePoint(s.frame, id));
}

export function visibleHandles(s: OverlayState): HandleId[] {
  if (!s.frame || s.editing) return [];
  const e = s.selected[0];
  if (!s.multi && e?.type === 'line') return ['p0', 'p1'];
  const f = s.frame;
  const sw = f.w * s.view.zoom, sh = f.h * s.view.zoom;
  const all: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  if (s.multi && s.selected.some((x) => x.locked)) return [];
  const list = sw < 36 || sh < 36 ? (all.filter((h) => h.length === 2) as HandleId[]) : all;
  list.push('rot');
  return list;
}

export function drawOverlay(ctx: CanvasRenderingContext2D, s: OverlayState) {
  const { view: v } = s;
  ctx.save();
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  ctx.clearRect(0, 0, v.w, v.h);

  const sx0 = v.x, sy0 = v.y, sx1 = v.x + s.size.w * v.zoom, sy1 = v.y + s.size.h * v.zoom;

  // Grid
  if (s.grid > 0 && s.grid * v.zoom >= 6) {
    ctx.strokeStyle = 'rgba(128,128,140,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= s.size.w; x += s.grid) {
      const px = Math.round(sx0 + x * v.zoom) + 0.5;
      ctx.moveTo(px, sy0);
      ctx.lineTo(px, sy1);
    }
    for (let y = 0; y <= s.size.h; y += s.grid) {
      const py = Math.round(sy0 + y * v.zoom) + 0.5;
      ctx.moveTo(sx0, py);
      ctx.lineTo(sx1, py);
    }
    ctx.stroke();
  }

  // Margins and safe area
  if (s.showMargins && s.margin > 0) {
    ctx.strokeStyle = 'rgba(10,132,255,0.35)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(sx0 + s.margin * v.zoom + 0.5, sy0 + s.margin * v.zoom + 0.5, (s.size.w - s.margin * 2) * v.zoom, (s.size.h - s.margin * 2) * v.zoom);
    const sa = Math.min(s.size.w, s.size.h) * 0.05;
    ctx.strokeStyle = 'rgba(255,149,0,0.35)';
    ctx.strokeRect(sx0 + sa * v.zoom + 0.5, sy0 + sa * v.zoom + 0.5, (s.size.w - sa * 2) * v.zoom, (s.size.h - sa * 2) * v.zoom);
    ctx.setLineDash([]);
  }

  // User guides
  ctx.strokeStyle = 'rgba(0,200,200,0.9)';
  ctx.lineWidth = 1;
  for (const gx of s.userGuides.v) {
    const px = Math.round(v.x + gx * v.zoom) + 0.5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, v.h); ctx.stroke();
  }
  for (const gy of s.userGuides.h) {
    const py = Math.round(v.y + gy * v.zoom) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(v.w, py); ctx.stroke();
  }

  // Hover outline
  if (s.hover && !s.selected.includes(s.hover) && !s.editing) {
    outline(ctx, s, s.hover, s.tint, 1.5, 0.7);
  }

  // Crop mode
  if (s.crop) {
    const f = s.crop.full;
    const a = toScreen(v, { x: f.x, y: f.y });
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(a.x, a.y, f.w * v.zoom, f.h * v.zoom);
    const bx = toScreen(v, { x: s.crop.box.x, y: s.crop.box.y });
    ctx.clearRect(bx.x, bx.y, s.crop.box.w * v.zoom, s.crop.box.h * v.zoom);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx.x, bx.y, s.crop.box.w * v.zoom, s.crop.box.h * v.zoom);
  }

  // Selection
  for (const e of s.selected) if (s.selected.length > 1 || e.type !== 'line') outline(ctx, s, e, s.tint, 1.5, s.multi ? 0.6 : 0);
  if (s.frame && !s.editing) {
    const c = frameCorners(s.frame).map((p) => toScreen(v, p));
    const e = s.selected[0];
    if (s.multi || e?.type !== 'line') {
      ctx.strokeStyle = s.tint;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
    }
    const locked = s.selected.length > 0 && s.selected.every((x) => x.locked);
    if (!locked) {
      const handles = visibleHandles(s);
      if (handles.includes('rot')) {
        const top = handleScreen(s, 'n')!, rot = handleScreen(s, 'rot')!;
        ctx.strokeStyle = s.tint;
        ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rot.x, rot.y); ctx.stroke();
      }
      for (const h of handles) {
        const p = handleScreen(s, h);
        if (!p) continue;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = s.tint;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (h === 'rot' || h === 'p0' || h === 'p1') ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
        else ctx.roundRect(p.x - HS / 2, p.y - HS / 2, HS, HS, 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = s.tint;
      ctx.font = '600 11px system-ui';
      ctx.fillText('🔒', c[0]!.x - 2, c[0]!.y - 6);
    }
  }
  const e0 = s.selected[0];
  if (e0 && e0.type === 'line' && !s.multi && !s.editing) {
    const ends = s.lineOf(e0);
    if (ends) {
      ctx.strokeStyle = s.tint;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      const a = toScreen(v, ends[0]), b = toScreen(v, ends[1]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Smart guides
  for (const g of s.guides) {
    const color = g.kind === 'guide' ? 'rgba(0,200,200,1)' : g.kind === 'space' ? '#ff9f0a' : g.kind === 'margin' ? '#0a84ff' : '#ff375f';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (g.kind === 'space') {
      const a = g.axis === 'x' ? { x: v.x + g.pos * v.zoom, y: v.y + g.from * v.zoom } : { x: v.x + g.from * v.zoom, y: v.y + g.pos * v.zoom };
      const b = g.axis === 'x' ? { x: a.x, y: v.y + g.to * v.zoom } : { x: v.x + g.to * v.zoom, y: a.y };
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      // end caps
      const cap = 4;
      if (g.axis === 'x') { ctx.moveTo(a.x - cap, a.y); ctx.lineTo(a.x + cap, a.y); ctx.moveTo(b.x - cap, b.y); ctx.lineTo(b.x + cap, b.y); }
      else { ctx.moveTo(a.x, a.y - cap); ctx.lineTo(a.x, a.y + cap); ctx.moveTo(b.x, b.y - cap); ctx.lineTo(b.x, b.y + cap); }
      ctx.stroke();
      if (g.gap !== undefined) {
        ctx.font = '600 10px system-ui';
        ctx.fillText(String(Math.round(g.gap)), (a.x + b.x) / 2 + 4, (a.y + b.y) / 2 - 3);
      }
    } else if (g.axis === 'x') {
      const px = Math.round(v.x + g.pos * v.zoom) + 0.5;
      ctx.moveTo(px, v.y + Math.max(0, g.from) * v.zoom - 6);
      ctx.lineTo(px, v.y + Math.min(s.size.h, g.to) * v.zoom + 6);
      ctx.stroke();
    } else {
      const py = Math.round(v.y + g.pos * v.zoom) + 0.5;
      ctx.moveTo(v.x + Math.max(0, g.from) * v.zoom - 6, py);
      ctx.lineTo(v.x + Math.min(s.size.w, g.to) * v.zoom + 6, py);
      ctx.stroke();
    }
  }

  // Create-preview
  if (s.pending) {
    const a = toScreen(v, s.pending.a), b = toScreen(v, s.pending.b);
    ctx.strokeStyle = s.tint;
    ctx.lineWidth = 1.5;
    if (s.pending.kind === 'line') {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else {
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.setLineDash([]);
    }
  }

  // Motion path
  if (s.path) {
    const { nodes, origin, sel } = s.path;
    ctx.strokeStyle = s.tint;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const q = samplePath(nodes, i / 80);
      const p = toScreen(v, { x: origin.x + q.x, y: origin.y + q.y });
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    nodes.forEach((n, i) => {
      const p = toScreen(v, { x: origin.x + n.x, y: origin.y + n.y });
      if (i === sel) {
        ctx.lineWidth = 1;
        for (const [hx, hy] of [[n.ix, n.iy], [n.ox, n.oy]] as const) {
          if (hx === undefined || hy === undefined || (!hx && !hy)) continue;
          const h = toScreen(v, { x: origin.x + n.x + hx, y: origin.y + n.y + hy });
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(h.x, h.y); ctx.stroke();
          ctx.fillStyle = s.tint;
          ctx.beginPath(); ctx.arc(h.x, h.y, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.fillStyle = i === sel ? s.tint : '#fff';
      ctx.strokeStyle = s.tint;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(p.x - 6, p.y - 6, 12, 12, i === 0 || i === nodes.length - 1 ? 6 : 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  // Marquee
  if (s.marquee) {
    const a = toScreen(v, { x: s.marquee.x, y: s.marquee.y });
    ctx.fillStyle = 'rgba(10,132,255,0.10)';
    ctx.strokeStyle = 'rgba(10,132,255,0.8)';
    ctx.lineWidth = 1;
    ctx.fillRect(a.x, a.y, s.marquee.w * v.zoom, s.marquee.h * v.zoom);
    ctx.strokeRect(a.x + 0.5, a.y + 0.5, s.marquee.w * v.zoom, s.marquee.h * v.zoom);
  }

  // HUD label
  if (s.hud) {
    ctx.font = '600 11px system-ui, sans-serif';
    const w = ctx.measureText(s.hud.text).width + 14;
    const x = Math.min(v.w - w - 6, s.hud.at.x + 14), y = Math.min(v.h - 28, s.hud.at.y + 16);
    ctx.fillStyle = 'rgba(20,20,24,0.88)';
    ctx.beginPath(); ctx.roundRect(x, y, w, 22, 6); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(s.hud.text, x + 7, y + 15);
  }
  ctx.restore();
}

function outline(ctx: CanvasRenderingContext2D, s: OverlayState, e: El, color: string, width: number, alpha: number) {
  const frame = s.absOf(e);
  if (e.type === 'line') {
    const ends = s.lineOf(e);
    if (!ends) return;
    const a = toScreen(s.view, ends[0]), b = toScreen(s.view, ends[1]);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha || 1;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  if (!alpha) return;
  const pts = frameCorners(frame).map((p) => toScreen(s.view, p));
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export { lineEnds };

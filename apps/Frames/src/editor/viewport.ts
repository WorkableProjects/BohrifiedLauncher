import type { Pt } from '../model/geometry';

export interface View {
  /** Stage size in CSS px. */
  w: number;
  h: number;
  /** CSS px per slide unit. */
  zoom: number;
  /** Screen position of the slide's top-left corner. */
  x: number;
  y: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export function fitZoom(stageW: number, stageH: number, sw: number, sh: number, pad = 56): number {
  return Math.max(MIN_ZOOM, Math.min((stageW - pad * 2) / sw, (stageH - pad * 2) / sh));
}

export function makeView(stageW: number, stageH: number, sw: number, sh: number, zoom: number | 'fit', pan: Pt, inset = { x: 0, y: 0 }): View {
  const z = zoom === 'fit' ? fitZoom(stageW - inset.x, stageH - inset.y, sw, sh) : zoom;
  return {
    w: stageW,
    h: stageH,
    zoom: z,
    x: inset.x + (stageW - inset.x) / 2 - (sw * z) / 2 + (zoom === 'fit' ? 0 : pan.x),
    y: inset.y + (stageH - inset.y) / 2 - (sh * z) / 2 + (zoom === 'fit' ? 0 : pan.y),
  };
}

export const toSlide = (v: View, sx: number, sy: number): Pt => ({ x: (sx - v.x) / v.zoom, y: (sy - v.y) / v.zoom });
export const toScreen = (v: View, p: Pt): Pt => ({ x: v.x + p.x * v.zoom, y: v.y + p.y * v.zoom });

/** The pan that keeps slide point `p` under screen point `s` at a given zoom. */
export function panFor(stageW: number, stageH: number, sw: number, sh: number, zoom: number, p: Pt, s: Pt, inset = { x: 0, y: 0 }): Pt {
  const base = makeView(stageW, stageH, sw, sh, zoom, { x: 0, y: 0 }, inset);
  return { x: s.x - p.x * zoom - base.x, y: s.y - p.y * zoom - base.y };
}

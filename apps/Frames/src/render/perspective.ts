import { rad } from '../model/geometry';

/**
 * Pseudo-3D for a 2D canvas: tilt an image about its vertical or horizontal
 * axis in perspective by drawing thin strips scaled by depth. Good enough for
 * card flips, cubes and tilting slides without WebGL, and it stays on the
 * GPU-accelerated drawImage path.
 */

export interface TiltOpts {
  /** Rotation about the vertical axis, degrees (positive turns the right edge away). */
  rotY?: number;
  /** Rotation about the horizontal axis, degrees (positive turns the top edge away). */
  rotX?: number;
  /** Camera distance in destination units (larger = flatter). */
  distance?: number;
  /** Pivot of the Y rotation, as an x offset from the centre (a door swings about its hinge). */
  pivotX?: number;
  /** Distance of the picture plane from the rotation axis: > 0 turns the image about an axis behind it, like a cube face. */
  axisDepth?: number;
}

/**
 * Draw `src` (source rect sx,sy,sw,sh) into a box of dw×dh centred on the
 * current origin, tilted. Strips are ~2 device px wide at most 700 per pass.
 */
export function drawTilted(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number, o: TiltOpts) {
  const D = o.distance ?? Math.max(dw, dh) * 2.4;
  const ry = o.rotY ?? 0, rx = o.rotX ?? 0;
  if (!ry && !rx) {
    ctx.drawImage(src, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    return;
  }
  if (ry && rx) {
    // Two passes: Y into a scratch canvas, then X from it.
    const pad = Math.ceil(dw * 0.5);
    const mw = Math.ceil(dw + pad * 2), mh = Math.ceil(dh);
    const scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(mw, mh) : Object.assign(document.createElement('canvas'), { width: mw, height: mh });
    const m = scratch.getContext('2d') as CanvasRenderingContext2D;
    m.translate(mw / 2, mh / 2);
    drawTilted(m, src, sx, sy, sw, sh, dw, dh, { rotY: ry, distance: D, pivotX: o.pivotX });
    drawTilted(ctx, scratch as CanvasImageSource, 0, 0, mw, mh, mw, mh, { rotX: rx, distance: D });
    return;
  }
  if (ry) {
    const a = rad(ry), cos = Math.cos(a), sin = Math.sin(a);
    const px = o.pivotX ?? 0, zc = o.axisDepth ?? 0;
    const n = Math.min(700, Math.max(8, Math.ceil(dw / 2)));
    const at = (t: number) => {
      const u = (t - 0.5) * dw - px;
      const z = u * sin + zc * (1 - cos);
      const k = D / (D + z);
      return { x: (u * cos + zc * sin) * k + px, k };
    };
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const A = at(t0), B = at(t1);
      if (A.k <= 0 || B.k <= 0) continue;
      const k = (A.k + B.k) / 2;
      ctx.drawImage(src, sx + t0 * sw, sy, Math.max(0.5, sw / n), sh, Math.min(A.x, B.x), (-dh * k) / 2, Math.abs(B.x - A.x) + 0.6, dh * k);
    }
    return;
  }
  const a = rad(rx), cos = Math.cos(a), sin = Math.sin(a);
  const n = Math.min(700, Math.max(8, Math.ceil(dh / 2)));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const y0 = (t0 - 0.5) * dh, y1 = (t1 - 0.5) * dh;
    const k0 = D / (D + y0 * sin), k1 = D / (D + y1 * sin);
    if (k0 <= 0 || k1 <= 0) continue;
    const p0 = y0 * cos * k0, p1 = y1 * cos * k1;
    const k = (k0 + k1) / 2;
    ctx.drawImage(src, sx, sy + t0 * sh, sw, Math.max(0.5, sh / n), (-dw * k) / 2, p0, dw * k, Math.abs(p1 - p0) + 0.6);
  }
}

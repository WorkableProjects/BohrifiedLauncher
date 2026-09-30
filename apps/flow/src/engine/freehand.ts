import { getStroke, type StrokeOptions } from 'perfect-freehand';
import type { StrokeElement } from './types';

/** Tuned for an Apple Pencil–like feel: gentle taper, responsive, smooth. */
export function strokeOptions(tool: StrokeElement['tool'], size: number, pressure: boolean, last: boolean): StrokeOptions {
  if (tool === 'highlighter') {
    return { size, thinning: 0, smoothing: 0.6, streamline: 0.45, simulatePressure: false, last, start: { cap: true }, end: { cap: true } };
  }
  return {
    size,
    thinning: pressure ? 0.62 : 0.5,
    smoothing: 0.58,
    streamline: last ? 0.5 : 0.42,
    simulatePressure: !pressure,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    last,
    start: { taper: 0, cap: true },
    end: { taper: pressure ? 0 : size * 1.5, cap: true },
  };
}

/** Convert a perfect-freehand outline polygon to a smooth closed Path2D. */
export function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  const n = outline.length;
  if (n < 2) return path;
  const [x0, y0] = outline[0];
  const [x1, y1] = outline[1];
  path.moveTo(x0, y0);
  path.quadraticCurveTo(x1, y1, (x1 + outline[Math.min(2, n - 1)][0]) / 2, (y1 + outline[Math.min(2, n - 1)][1]) / 2);
  for (let i = 2; i < n - 1; i++) {
    const a = outline[i], b = outline[i + 1];
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  path.closePath();
  return path;
}

/** Flat [x,y,p,...] → perfect-freehand input. */
export function toInput(points: ArrayLike<number>, count = points.length): number[][] {
  const out: number[][] = new Array(Math.floor(count / 3));
  for (let i = 0, j = 0; i + 2 < count; i += 3, j++) out[j] = [points[i], points[i + 1], points[i + 2]];
  return out;
}

export function strokePath(points: ArrayLike<number>, tool: StrokeElement['tool'], size: number, pressure: boolean, last: boolean, count?: number) {
  return outlineToPath(getStroke(toInput(points, count), strokeOptions(tool, size, pressure, last)));
}

const cache = new WeakMap<StrokeElement, Path2D>();

export function cachedStrokePath(el: StrokeElement): Path2D {
  let p = cache.get(el);
  if (!p) {
    p = strokePath(el.points, el.tool, el.size, el.pressure, true);
    cache.set(el, p);
  }
  return p;
}

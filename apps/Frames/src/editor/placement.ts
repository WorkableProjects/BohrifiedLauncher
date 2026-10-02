import type { CSSProperties } from 'react';
import type { Pt } from '../model/geometry';
import { toScreen, type View } from './viewport';

/** CSS to lay a w×h (slide-unit) box over the stage, centred on slide point `c`, scaled and rotated. */
export function rectPlacement(view: View, c: Pt, w: number, h: number, rot: number): CSSProperties {
  const s = toScreen(view, c);
  return {
    position: 'absolute',
    left: s.x - w / 2,
    top: s.y - h / 2,
    width: w,
    height: h,
    transformOrigin: 'center center',
    transform: `scale(${view.zoom})${rot ? ` rotate(${rot}deg)` : ''}`,
  };
}

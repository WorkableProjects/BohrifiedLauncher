import { useEffect, useRef } from 'react';
import type { View } from './viewport';

const R = 22;

function step(zoom: number): number {
  const target = 64 / zoom;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (p * m >= target) return p * m;
  return p * 10;
}

/** Top and left rulers; dragging out of one pulls a guide onto the slide. */
export function Rulers({ view, onGuide }: { view: View; onGuide: (axis: 'v' | 'h') => void }) {
  const top = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--label-2').trim() || '#888';
    const bg = css.getPropertyValue('--background-2').trim() || '#eee';
    for (const axis of ['x', 'y'] as const) {
      const c = axis === 'x' ? top.current! : left.current!;
      const w = axis === 'x' ? view.w : R, h = axis === 'x' ? R : view.h;
      c.width = w * dpr;
      c.height = h * dpr;
      const ctx = c.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;
      ctx.font = '10px system-ui';
      ctx.lineWidth = 1;
      const st = step(view.zoom), origin = axis === 'x' ? view.x : view.y;
      const len = axis === 'x' ? view.w : view.h;
      const from = Math.floor((R - origin) / view.zoom / st) * st, to = Math.ceil((len - origin) / view.zoom / st) * st;
      ctx.beginPath();
      for (let v = from; v <= to; v += st) {
        const p = Math.round(origin + v * view.zoom) + 0.5;
        if (axis === 'x') { ctx.moveTo(p, R - 7); ctx.lineTo(p, R); ctx.fillText(String(Math.round(v)), p + 3, 10); }
        else {
          ctx.moveTo(R - 7, p); ctx.lineTo(R, p);
          ctx.save(); ctx.translate(10, p - 3); ctx.rotate(-Math.PI / 2); ctx.fillText(String(Math.round(v)), 0, 0); ctx.restore();
        }
        // minor ticks
        for (let i = 1; i < 5; i++) {
          const q = Math.round(origin + (v + (st * i) / 5) * view.zoom) + 0.5;
          if (axis === 'x') { ctx.moveTo(q, R - 3); ctx.lineTo(q, R); } else { ctx.moveTo(R - 3, q); ctx.lineTo(R, q); }
        }
      }
      ctx.stroke();
    }
  }, [view]);
  return (
    <>
      <canvas ref={top} className="ruler ruler-x stage-ctl" style={{ width: view.w, height: R }} onPointerDown={(e) => { e.stopPropagation(); onGuide('h'); (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId); }} />
      <canvas ref={left} className="ruler ruler-y stage-ctl" style={{ width: R, height: view.h }} onPointerDown={(e) => { e.stopPropagation(); onGuide('v'); (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId); }} />
      <div className="ruler-corner" style={{ width: R, height: R }} />
    </>
  );
}

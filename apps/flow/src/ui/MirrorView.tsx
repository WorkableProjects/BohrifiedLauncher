import { useEffect, useRef } from 'react';
import { ui, useUI } from '../state/ui';
import { Icon } from '../icons/Icon';

/**
 * Mirror mode (portrait): the board is the bottom half; this top half shows
 * the same canvases reflected across the divider, updated every frame.
 * 'mirror' = true reflection; 'rotate' = turned 180° so someone across the
 * table reads it the right way round.
 */
export function MirrorView({ stage }: { stage: React.RefObject<HTMLElement | null> }) {
  const flip = useUI((s) => s.mirror.flip);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const out = ref.current;
      const sources = stage.current?.querySelectorAll('canvas');
      if (!out || !sources?.length) return;
      const w = Math.round(out.clientWidth * devicePixelRatio);
      const h = Math.round(out.clientHeight * devicePixelRatio);
      if (out.width !== w || out.height !== h) {
        out.width = w;
        out.height = h;
      }
      const ctx = out.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // Reflect across the bottom edge (the divider); 'rotate' also flips x.
      ctx.setTransform(flip === 'rotate' ? -1 : 1, 0, 0, -1, flip === 'rotate' ? w : 0, h);
      for (const c of sources) if (c.width && c.height) ctx.drawImage(c, 0, 0, w, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [stage, flip]);

  const btn = 'flex h-9 items-center gap-1.5 rounded-full bg-bg/80 px-3 text-subhead font-medium text-label shadow backdrop-blur';
  return (
    <section className="fixed inset-x-0 top-0 h-1/2 overflow-hidden border-b-2 border-fill-2 bg-bg" aria-label="Mirror view">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />
      <div className="absolute right-3 bottom-3 flex gap-2">
        <button type="button" className={btn} onClick={() => ui.set((s) => ({ mirror: { ...s.mirror, flip: s.mirror.flip === 'mirror' ? 'rotate' : 'mirror' } }))}>
          {flip === 'mirror' ? 'Mirror' : 'Face-to-face'}
        </button>
        <button type="button" className={btn} aria-label="Exit mirror mode" onClick={() => ui.set((s) => ({ mirror: { ...s.mirror, on: false } }))}>
          <Icon name="close" size={14} />
        </button>
      </div>
    </section>
  );
}

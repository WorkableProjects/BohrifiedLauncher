import { useEffect, useRef } from 'react';
import { ui } from '../state/ui';
import { Icon } from '../icons/Icon';

/**
 * Mirror mode (portrait): the board is the bottom half; this top half shows
 * the same canvases reflected across the divider, updated every frame.
 * 'mirror' = true reflection; 'rotate' = turned 180° so someone across the
 * table reads it the right way round.
 */
export function MirrorView({ stage }: { stage: React.RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const out = ref.current;
      const sources = stage.current?.querySelectorAll<HTMLCanvasElement>('canvas[data-board-layer]');
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
      // Rotated 180° so someone across the table reads it.
      ctx.setTransform(-1, 0, 0, -1, w, h);
      for (const c of sources) if (c.width && c.height) ctx.drawImage(c, 0, 0, w, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  return (
    <section className="fixed inset-x-0 top-0 h-1/2 overflow-hidden bg-bg-2" aria-label="Mirror view">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-hairline" />
      <div aria-hidden className="absolute bottom-0 left-1/2 h-1 w-10 -translate-x-1/2 translate-y-1/2 rounded-full bg-fill-2" />
      <div className="glass absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 p-1" style={{ borderRadius: 24 }} role="toolbar" aria-label="Mirror">
        <span className="flex h-11 w-9 items-center justify-center text-label-2" title="Mirror">
          <Icon name="tablet" size={17} />
        </span>
        <button
          type="button"
          className="spring flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-label hover:bg-fill active:scale-[0.92]"
          aria-label="Exit mirror mode"
          title="Exit mirror mode"
          onClick={() => ui.set((s) => ({ mirror: { ...s.mirror, on: false } }))}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    </section>
  );
}

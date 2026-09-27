import { useEffect, useRef } from 'react';
import { ui, useUI } from '../state/ui';
import { useGlass } from './GlassProvider';
import { usePresence } from '../hooks/usePresence';

/**
 * Reveal curtain — the classic overhead-projector trick. An opaque shade
 * covers the lower part of the board; drag its handle to reveal worked
 * steps or answers one line at a time.
 */
export function Curtain() {
  const { on, y } = useUI((s) => s.curtain);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number } | null>(null);
  const { markChanged } = useGlass();
  const { mounted, leaving } = usePresence(on, 240);

  useEffect(() => {
    if (ref.current) markChanged(ref.current);
  }, [on, y, markChanged]);

  if (!mounted) return null;
  const set = (clientY: number) => ui.set({ curtain: { on: true, y: Math.min(0.97, Math.max(0.05, clientY / window.innerHeight)) } });

  return (
    <div
      ref={ref}
      className={`absolute inset-x-0 bottom-0 z-10 ${leaving ? 'curtain-out' : 'curtain-in'}`}
      style={{ top: `${y * 100}%`, background: 'var(--bg-2)', boxShadow: '0 -10px 30px rgba(0,0,0,0.12)' }}
      aria-label="Screen Hider"
    >
      <div
        role="slider"
        tabIndex={0}
        aria-label="Curtain position"
        aria-valuemin={5}
        aria-valuemax={97}
        aria-valuenow={Math.round(y * 100)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') ui.set({ curtain: { on, y: Math.min(0.97, y + 0.03) } });
          if (e.key === 'ArrowUp') ui.set({ curtain: { on, y: Math.max(0.05, y - 0.03) } });
        }}
        onPointerDown={(e) => {
          drag.current = { id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => drag.current?.id === e.pointerId && set(e.clientY)}
        onPointerUp={() => (drag.current = null)}
        className="absolute inset-x-0 -top-6 flex h-12 cursor-ns-resize touch-none items-center justify-center"
      >
        <span className="flex h-8 items-center gap-2 rounded-full bg-bg px-4 text-footnote font-semibold text-label-2 shadow-[0_2px_10px_rgba(0,0,0,0.15)]">
          <span className="h-1 w-8 rounded-full bg-label-3" />
          Drag to reveal
        </span>
      </div>
    </div>
  );
}

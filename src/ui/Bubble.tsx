import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * The moving selection "bubble" for a group of mutually exclusive controls.
 *
 * Instead of each button painting its own selected state, the group owns a
 * single bubble that flows from the old choice to the new one: the leading
 * edge moves first and the trailing edge catches up, so it stretches like a
 * drop of liquid and settles on the target. Interruptible mid-flight.
 *
 * Mark each choice with `data-bubble="<key>"` and pass the active key.
 */

type Variant = 'tint' | 'raised' | 'soft' | 'ring';

const InBubble = createContext(false);
/** True inside a BubbleGroup: controls leave the selected fill to the bubble. */
export const useInBubble = () => useContext(InBubble);

const VARIANT: Record<Variant, string> = {
  tint: 'bg-tint shadow-[0_2px_10px_var(--tint-glow)]',
  raised: 'bg-bg shadow-[0_1px_4px_rgba(0,0,0,0.12)] dark:bg-fill-2',
  soft: 'bg-tint-soft',
  ring: 'shadow-[inset_0_0_0_2.5px_var(--tint)]',
};

const DURATION = 480;
const SAMPLES = 24;
/** Close to the app's spring curve (cubic-bezier(.32,.72,0,1)). */
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4);

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function frame(b: Box, squash = 1): Keyframe {
  return {
    transform: `translate(${b.x}px, ${b.y}px) scaleY(${squash})`,
    width: `${b.w}px`,
    height: `${b.h}px`,
  };
}

/** Keyframes for a liquid move: leading edge leads, trailing edge follows. */
function liquidFrames(from: Box, to: Box): Keyframe[] {
  const right = to.x + to.w / 2 >= from.x + from.w / 2;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const lead = ease(t / 0.72);
    const trail = ease((t - 0.1) / 0.9);
    const l0 = from.x, r0 = from.x + from.w, l1 = to.x, r1 = to.x + to.w;
    const left = l0 + (l1 - l0) * (right ? trail : lead);
    const rightEdge = r0 + (r1 - r0) * (right ? lead : trail);
    const p = ease(t);
    const box = { x: left, y: from.y + (to.y - from.y) * p, w: Math.max(4, rightEdge - left), h: from.h + (to.h - from.h) * p };
    // A slight squash while stretched sells the surface tension.
    frames.push(frame(box, 1 - 0.1 * Math.sin(Math.PI * Math.min(1, t / 0.8))));
  }
  return frames;
}

export function BubbleGroup({
  active,
  children,
  className = '',
  variant = 'tint',
  role,
  label,
}: {
  active: string | null | undefined;
  children: ReactNode;
  className?: string;
  variant?: Variant;
  role?: string;
  label?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const shown = useRef<Box | null>(null);
  const anim = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const el = root.current;
    const b = bubble.current;
    if (!el || !b) return;

    const measure = (): Box | null => {
      if (active == null) return null;
      const target = el.querySelector<HTMLElement>(`[data-bubble="${CSS.escape(active)}"]`);
      if (!target || target.offsetWidth === 0) return null;
      return { x: target.offsetLeft, y: target.offsetTop, w: target.offsetWidth, h: target.offsetHeight };
    };

    /** Where the bubble is on screen right now (mid-flight included). */
    const current = (): Box | null => {
      if (!shown.current) return null;
      if (!anim.current || anim.current.playState !== 'running') return shown.current;
      const r = b.getBoundingClientRect();
      const o = el.getBoundingClientRect();
      const h = shown.current.h;
      return { x: r.left - o.left + el.scrollLeft, y: r.top - o.top + el.scrollTop - (h - r.height) / 2, w: r.width, h };
    };

    const place = (animate: boolean) => {
      const next = measure();
      if (!next) {
        b.style.opacity = '0';
        shown.current = null;
        return;
      }
      const from = animate ? current() : null;
      anim.current?.cancel();
      Object.assign(b.style, frame(next) as Record<string, string>, { opacity: '1' });
      shown.current = next;
      const moved = from && (Math.abs(from.x - next.x) > 0.5 || Math.abs(from.y - next.y) > 0.5 || Math.abs(from.w - next.w) > 0.5);
      if (from && moved && !reducedMotion()) {
        anim.current = b.animate(liquidFrames(from, next), { duration: DURATION, easing: 'linear' });
      } else if (animate && !from && !reducedMotion()) {
        // First appearance: a quick grow-in rather than a pop.
        anim.current = b.animate([{ opacity: 0, transform: `${frame(next).transform} scale(0.8)` }, { opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.32,.72,0,1)' });
      }
    };

    place(true);
    // Layout shifts (resize, labels changing) snap the bubble without a trip.
    // (ResizeObserver reports once on observe; only real size changes count.)
    let size = `${el.offsetWidth}x${el.offsetHeight}`;
    const ro = new ResizeObserver(() => {
      const next = `${el.offsetWidth}x${el.offsetHeight}`;
      if (next === size) return;
      size = next;
      place(false);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  return (
    <InBubble.Provider value>
      <div ref={root} className={`relative ${className}`} role={role} aria-label={label}>
        <span ref={bubble} aria-hidden className={`pointer-events-none absolute top-0 left-0 rounded-full opacity-0 ${VARIANT[variant]}`} style={{ transformOrigin: '50% 50%' }} />
        {children}
      </div>
    </InBubble.Provider>
  );
}

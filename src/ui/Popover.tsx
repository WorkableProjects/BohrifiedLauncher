import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
  className?: string;
  label: string;
}

const GAP = 12;
const MARGIN = 12;

/**
 * Menus and inspectors render in the overlay layer (outside the stage) so
 * they never become glass-on-glass inside a toolbar.
 */
export function Popover({ open, onClose, anchor, placement = 'top', children, className = '', label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const el = ref.current;
      if (!a || !el) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      let left = 0, top = 0, origin = '50% 100%';
      if (placement === 'top' || placement === 'bottom') {
        left = a.left + a.width / 2 - w / 2;
        top = placement === 'top' ? a.top - h - GAP : a.bottom + GAP;
        origin = placement === 'top' ? '50% 100%' : '50% 0%';
      } else {
        top = a.top + a.height / 2 - h / 2;
        left = placement === 'left' ? a.left - w - GAP : a.right + GAP;
        origin = placement === 'left' ? '100% 50%' : '0% 50%';
      }
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - w - MARGIN));
      top = Math.max(MARGIN, Math.min(top, window.innerHeight - h - MARGIN));
      setPos({ left, top, origin });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, placement]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`sheet pop-in fixed z-50 ${className}`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, ['--origin' as string]: pos?.origin }}
    >
      {children}
    </div>,
    document.getElementById('overlay') ?? document.body,
  );
}

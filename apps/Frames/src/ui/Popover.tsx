import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Preferred side relative to the anchor. */
  side?: 'bottom' | 'top' | 'right' | 'left';
  align?: 'start' | 'end' | 'center';
  className?: string;
  width?: number;
}

/** A floating panel anchored to an element: closes on outside click or Escape, and stays on screen. */
export function Popover({ anchor, open, onClose, children, side = 'bottom', align = 'start', className = '', width }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const a = anchor.current?.getBoundingClientRect();
    const p = ref.current?.getBoundingClientRect();
    if (!a || !p) return;
    const vw = window.innerWidth, vh = window.innerHeight, gap = 8;
    let x = a.left, y = a.bottom + gap;
    if (side === 'bottom' || side === 'top') {
      x = align === 'end' ? a.right - p.width : align === 'center' ? a.left + a.width / 2 - p.width / 2 : a.left;
      y = side === 'bottom' ? a.bottom + gap : a.top - p.height - gap;
      if (side === 'bottom' && y + p.height > vh - 8 && a.top - p.height - gap > 8) y = a.top - p.height - gap;
      if (side === 'top' && y < 8) y = a.bottom + gap;
    } else {
      y = a.top;
      x = side === 'right' ? a.right + gap : a.left - p.width - gap;
      if (x + p.width > vw - 8) x = a.left - p.width - gap;
    }
    x = Math.max(8, Math.min(x, vw - p.width - 8));
    y = Math.max(8, Math.min(y, vh - p.height - 8));
    setPos({ x, y });
  }, [open, anchor, side, align, children]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      // Nested popovers (colour pickers inside a popover) live in the same portal root.
      if ((t as HTMLElement).closest?.('[data-popover]')) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div ref={ref} data-popover className={`popover ${className}`} style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, width, visibility: pos ? 'visible' : 'hidden' }} role="dialog">
      {children}
    </div>,
    document.body,
  );
}

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/** A modal sheet. Closes on Escape or a click on the backdrop; focus moves in and returns on close. */
export function Dialog({ title, onClose, children, wide, footer, label }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label ?? title} tabIndex={-1} className={`dialog ${wide ? 'wide' : ''}`}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="btn plain md" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

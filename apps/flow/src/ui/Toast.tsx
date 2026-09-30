import { createPortal } from 'react-dom';
import { useUI } from '../state/ui';

/** Brief HUD confirmation, like the iOS system HUD. */
export function Toast() {
  const msg = useUI((s) => s.toast);
  if (!msg) return null;
  return createPortal(
    <div role="status" className="sheet pop-in pointer-events-none fixed top-[calc(max(16px,env(safe-area-inset-top))+72px)] left-1/2 z-50 -translate-x-1/2 rounded-full! px-5 py-2.5 text-subhead font-semibold text-label" style={{ ['--origin' as string]: '50% 0%' }}>
      {msg}
    </div>,
    document.getElementById('overlay') ?? document.body,
  );
}

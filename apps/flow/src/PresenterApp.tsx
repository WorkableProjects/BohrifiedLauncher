import { useEffect, useRef, useState } from 'react';
import { BoardCanvas } from './canvas/BoardCanvas';
import { getController } from './canvas/instance';
import { followCamera, ViewerSync } from './engine/sync';
import { useAppearance } from './hooks/useAppearance';
import { board, useBoard } from './state/board';
import { Glass } from './ui/Glass';
import { GlassProvider } from './ui/GlassProvider';
import { useUI } from './state/ui';

/**
 * Student / share view: a chrome-free, read-only mirror of the tutor's
 * board that follows their page, camera, ink and laser in real time.
 * Share this window in any video call for a clean board.
 */
export function PresenterApp() {
  const appearance = useAppearance();
  const liquid = useUI((s) => s.liquidGlass && s.device !== 'mobile');
  const stage = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const title = useBoard((b) => b.doc.title);
  const pageName = useBoard((b) => b.page.name);
  const last = useRef<{ cam: { x: number; y: number; z: number }; w: number; h: number } | null>(null);

  useEffect(() => {
    document.title = 'Flow — Student View';
    const apply = () => {
      const c = getController();
      const l = last.current;
      if (!c || !l) return;
      const { width, height } = c.viewport;
      board.setCamera(followCamera(l.cam, l.w, l.h, width, height));
    };
    const sync = new ViewerSync(board, {
      onCamera: (cam, w, h) => {
        last.current = { cam, w, h };
        apply();
      },
      onPresence: (p) => getController()?.setRemotePresence(p),
      onConnected: () => setConnected(true),
    });
    window.addEventListener('resize', apply);
    return () => {
      sync.destroy();
      window.removeEventListener('resize', apply);
    };
  }, []);

  return (
    <GlassProvider root={stage} enabled={liquid}>
      <main ref={stage} className="fixed inset-0 overflow-hidden" data-liquid="off">
        <BoardCanvas appearance={appearance} readOnly />
        <Glass radius={20} className="absolute top-4 left-4 z-20">
          <div className="flex h-10 items-center gap-2 px-4">
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-[#34C759]' : 'bg-label-3'}`} />
            <span className="text-subhead font-semibold tracking-title text-label">{connected ? title : 'Waiting for tutor…'}</span>
            {connected && <span className="text-subhead text-label-2">· {pageName}</span>}
          </div>
        </Glass>
      </main>
    </GlassProvider>
  );
}

import { useEffect } from 'react';
import { board } from '../state/board';
import { closeCurrent, saveCurrent } from '../state/lessons';

/** Persist the open lesson shortly after each edit, and on leave/hide. */
export function useAutosave() {
  useEffect(() => {
    let t = 0;
    const off = board.subscribe((c) => {
      clearTimeout(t);
      // Camera moves are saved too, just lazily.
      t = window.setTimeout(saveCurrent, c.type === 'camera' ? 1500 : 600);
    });
    const onHide = () => document.visibilityState === 'hidden' && saveCurrent();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', saveCurrent);
    return () => {
      off();
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', saveCurrent);
    };
  }, []);
}

export { closeCurrent };

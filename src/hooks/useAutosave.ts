import { useEffect } from 'react';
import { saveAutosave } from '../engine/persistence';
import { board } from '../state/board';

/** Persist the document to IndexedDB shortly after each edit (camera included). */
export function useAutosave() {
  useEffect(() => {
    let t = 0;
    const flush = () => saveAutosave(board.doc);
    const off = board.subscribe(() => {
      clearTimeout(t);
      t = window.setTimeout(flush, 600);
    });
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      off();
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, []);
}

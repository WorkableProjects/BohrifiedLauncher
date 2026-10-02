import { useEffect, useSyncExternalStore } from 'react';
import { isSuspended, onSuspendChange } from './bohr';
import { Editor } from './editor/Editor';
import { deckThumb } from './editor/thumbs';
import { installShortcuts } from './editor/shortcuts';
import { Home } from './home/Home';
import { Presenter } from './present/Presenter';
import { openDeck, setThumbMaker, startAutosave } from './state/session';
import { useStore } from './state/store';
import { ui } from './state/ui';
import { Dialogs } from './dialogs/Dialogs';
import { Toast } from './ui/Toast';

export function Root() {
  const screen = useStore(ui, (s) => s.screen);
  const presenting = useStore(ui, (s) => s.presenting);
  const loading = useStore(ui, (s) => s.loading);
  const suspended = useSyncExternalStore(onSuspendChange, isSuspended);

  useEffect(() => {
    setThumbMaker(deckThumb);
    const stops = [startAutosave(), installShortcuts()];
    const id = new URLSearchParams(location.search).get('deck');
    if (id && id !== 'new') void openDeck(id);
    const onHide = () => { if (document.visibilityState === 'hidden') void import('./state/session').then((m) => m.saveNow()); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      stops.forEach((s) => s());
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  // Suspended inside Bohrified: render nothing so every canvas and loop is released.
  if (suspended) return null;

  return (
    <>
      {screen === 'home' ? <Home /> : <Editor />}
      {presenting && <Presenter from={presenting.from} onExit={() => ui.set({ presenting: null })} />}
      <Dialogs />
      {loading && <div className="loading"><div className="spinner" role="status" aria-label="Opening" /></div>}
      <Toast />
    </>
  );
}

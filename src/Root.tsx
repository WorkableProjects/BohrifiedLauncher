import { useEffect, useState } from 'react';
import App from './App';
import { Home } from './home/Home';
import { Onboarding } from './home/Onboarding';
import { useAppearance } from './hooks/useAppearance';
import { closeCurrent, newLesson, openLesson } from './state/lessons';
import { useUI } from './state/ui';
import { Toast } from './ui/Toast';

type Screen = 'loading' | 'home' | 'board';

/**
 * App shell: Home (welcome + recents) ⇄ Board. First launch asks for the
 * device type. Deep links: `?lesson=new` or `?lesson=<id>` open a board directly.
 */
export function Root() {
  useAppearance();
  const device = useUI((s) => s.device);
  const [screen, setScreen] = useState<Screen>('loading');

  useEffect(() => {
    if (device) document.documentElement.dataset.device = device;
    else delete document.documentElement.dataset.device;
  }, [device]);

  useEffect(() => {
    const link = new URLSearchParams(location.search).get('lesson');
    if (link === 'new') {
      newLesson();
      setScreen('board');
    } else if (link) {
      openLesson(link).then((ok) => setScreen(ok ? 'board' : 'home'));
    } else setScreen('home');
  }, []);

  const goHome = async () => {
    await closeCurrent();
    setScreen('home');
  };

  return (
    <>
      {screen === 'home' && <Home onOpen={() => setScreen('board')} />}
      {screen === 'board' && <App onHome={goHome} />}
      {screen === 'home' && !device && <Onboarding />}
      <Toast />
    </>
  );
}

import { useEffect, useState } from 'react';
import type { Appearance } from '../engine/theme';
import { useUI } from '../state/ui';

/** Resolve the appearance preference against the system setting. */
export function useAppearance(): Appearance {
  const pref = useUI((s) => s.appearance);
  const [system, setSystem] = useState<Appearance>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const fn = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  const resolved = pref === 'system' ? system : pref;
  useEffect(() => {
    document.documentElement.dataset.appearance = resolved;
  }, [resolved]);
  return resolved;
}

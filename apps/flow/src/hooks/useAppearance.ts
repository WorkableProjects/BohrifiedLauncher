import { useEffect, useState } from 'react';
import { accentTokens } from '../engine/accent';
import type { Appearance } from '../engine/theme';
import { useUI } from '../state/ui';

/** Resolve the appearance preference against the system setting, and apply the accent. */
export function useAppearance(): Appearance {
  const pref = useUI((s) => s.appearance);
  const accent = useUI((s) => s.accent);
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
    const root = document.documentElement;
    root.dataset.appearance = resolved;
    for (const [k, v] of Object.entries(accentTokens(accent, resolved))) root.style.setProperty(k, v);
  }, [resolved, accent]);
  return resolved;
}

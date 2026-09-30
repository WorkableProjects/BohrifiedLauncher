import { useEffect, useState } from 'react';
import type { Appearance } from '../engine/theme';
import { useUI, type Colorway } from '../state/ui';

/** NoirW is white-led and NoirB black-led, so they pin the appearance. */
export const PINNED_APPEARANCE: Partial<Record<Colorway, Appearance>> = { noirw: 'light', noirb: 'dark' };

/** Resolve the appearance preference against the system setting and colorway. */
export function useAppearance(): Appearance {
  const pref = useUI((s) => s.appearance);
  const colorway = useUI((s) => s.colorway);
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
  const resolved = PINNED_APPEARANCE[colorway] ?? (pref === 'system' ? system : pref);
  useEffect(() => {
    document.documentElement.dataset.appearance = resolved;
    document.documentElement.dataset.colorway = colorway;
  }, [resolved, colorway]);
  return resolved;
}

/** Theme preference shared by Bohrified and its apps. */
export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const dark = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export const resolveTheme = (pref: ThemePref): Theme => (pref === 'system' ? (dark()?.matches ? 'dark' : 'light') : pref);

export const isThemePref = (v: unknown): v is ThemePref => v === 'system' || v === 'light' || v === 'dark';

/**
 * Set `data-theme` on <html> to the resolved theme, following the system
 * while the preference is 'system'. Returns a cleanup for the listener.
 */
export function applyTheme(pref: ThemePref): () => void {
  const root = document.documentElement;
  const apply = () => (root.dataset.theme = resolveTheme(pref));
  apply();
  const mq = dark();
  if (pref !== 'system' || !mq) return () => {};
  mq.addEventListener('change', apply);
  return () => mq.removeEventListener('change', apply);
}

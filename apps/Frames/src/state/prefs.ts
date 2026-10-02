import { applyTheme } from '@bohrified/ui';
import { PREFS_DEFAULT, PREFS_KEY, THEME_KEY, type Prefs, type ThemePref } from './prefsSchema';
import { createStore, useStore } from './store';

/**
 * Preferences, kept in step with Bohrified's settings sheet.
 *
 * Both sides read and write the same localStorage keys. A write fires a
 * `storage` event in every other document on the origin: the launcher
 * refreshes its sheet when Frames changes something, and Frames updates here
 * when the sheet does. The theme is Bohrified's own (`bohr:theme`); changing
 * it from Frames updates the launcher and every other app too.
 */

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    const out = { ...PREFS_DEFAULT };
    // Keep only known keys of the right type, so a hand-edited value can't break the UI.
    for (const k of Object.keys(PREFS_DEFAULT) as (keyof Prefs)[]) {
      if (raw && typeof raw[k] === typeof PREFS_DEFAULT[k]) (out as Record<string, unknown>)[k] = raw[k];
    }
    return out;
  } catch {
    return { ...PREFS_DEFAULT };
  }
}

function readTheme(): ThemePref {
  try {
    const v = JSON.parse(localStorage.getItem(THEME_KEY) ?? '"system"');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export interface PrefsState extends Prefs {
  theme: ThemePref;
}

export const prefs = createStore<PrefsState>({ ...readPrefs(), theme: readTheme() });

export function setPrefs(patch: Partial<Prefs>) {
  prefs.set(patch);
  try {
    // Merge into what's stored so keys written by newer versions or by the launcher survive.
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') ?? {};
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...stored, ...patch }));
  } catch { /* storage unavailable */ }
}

/** Change the shared Bohrified appearance. */
export function setTheme(theme: ThemePref) {
  prefs.set({ theme });
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch { /* storage unavailable */ }
  applyAppearance();
}

let stop: (() => void) | null = null;
export function applyAppearance(theme: ThemePref = prefs.get().theme) {
  stop?.();
  stop = applyTheme(theme);
}

/** Follow changes made elsewhere (Bohrified's settings sheet, another tab). Returns an unsubscribe. */
export function watchPrefs(): () => void {
  const on = (e: StorageEvent) => {
    if (e.key === PREFS_KEY || e.key === null) prefs.set(readPrefs());
    if (e.key === THEME_KEY || e.key === null) {
      const t = readTheme();
      if (t !== prefs.get().theme) {
        prefs.set({ theme: t });
        applyAppearance(t);
      }
    }
  };
  window.addEventListener('storage', on);
  return () => window.removeEventListener('storage', on);
}

export const usePrefs = <S,>(select: (p: PrefsState) => S): S => useStore(prefs, select);

/** Reflect interface prefs on <html> so CSS can react (density, animations). */
export function applyUiPrefs(p: PrefsState = prefs.get()) {
  const root = document.documentElement;
  root.dataset.density = p.density;
  const system = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  root.dataset.motion = p.animations === 'full' && system ? 'reduced' : p.animations;
}

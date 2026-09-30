/**
 * App settings the launcher can show in Bohrified's settings sheet.
 *
 * An app describes its own preferences declaratively, next to its manifest,
 * and reads/writes them where it already keeps them (same origin, so the
 * launcher can reach the app's localStorage keys directly). No app code
 * loads to show them, and the app doesn't have to be open.
 *
 * Live sync: a write from the launcher fires a `storage` event in every
 * other same-origin document, including a mounted app's frame, so the app
 * picks it up by listening for its own keys. The launcher does the same for
 * changes an app makes, via `storageKeys`.
 */

interface SettingBase {
  /** Stable id, unique within the app. */
  id: string;
  label: string;
  description?: string;
}

export type AppSetting =
  | (SettingBase & { kind: 'toggle'; get(): boolean; set(value: boolean): void })
  | (SettingBase & {
      kind: 'choice';
      options: readonly { value: string; label: string }[];
      get(): string;
      set(value: string): void;
    })
  | (SettingBase & { kind: 'text'; placeholder?: string; maxLength?: number; get(): string; set(value: string): void })
  | (SettingBase & {
      kind: 'action';
      /** Button text. */
      button: string;
      /** Ask before running. */
      confirm?: string;
      danger?: boolean;
      run(): void;
    });

export interface AppSettings {
  settings: readonly AppSetting[];
  /** localStorage keys these settings live in; changes to them refresh the sheet. */
  storageKeys: readonly string[];
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch { /* storage unavailable */ }
}

/**
 * A preferences object stored as JSON under one key (e.g. `flow:prefs:v1`).
 * `patch` merges into what's stored, so fields the launcher doesn't know
 * about are kept.
 */
export function jsonPrefs<T extends object>(key: string, defaults: T) {
  const get = (): T => {
    try {
      return { ...defaults, ...(JSON.parse(read(key) ?? '{}') as Partial<T>) };
    } catch {
      return { ...defaults };
    }
  };
  return {
    key,
    get,
    patch(next: Partial<T>) {
      let stored: object = {};
      try {
        stored = JSON.parse(read(key) ?? '{}') ?? {};
      } catch { /* start over */ }
      write(key, JSON.stringify({ ...stored, ...next }));
    },
  };
}

/** A single raw string value under one key (e.g. `rbl-ask`). */
export function rawPref(key: string, fallback: string) {
  return { key, get: () => read(key) ?? fallback, set: (value: string) => write(key, value) };
}

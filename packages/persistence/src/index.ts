/**
 * Namespaced JSON storage that never throws: private mode, blocked
 * cookies or a full quota just mean nothing is remembered.
 *
 *   local   — survives restarts (preferences)
 *   session — this tab only (which lesson was open, unsaved app session)
 *
 * Bohrified's own keys all start with `bohr:`; apps keep their own prefixes.
 */

export interface JsonStore {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

function store(area: () => Storage, prefix: string): JsonStore {
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = area().getItem(prefix + key);
        return raw === null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        area().setItem(prefix + key, JSON.stringify(value));
      } catch { /* storage unavailable */ }
    },
    remove(key) {
      try {
        area().removeItem(prefix + key);
      } catch { /* storage unavailable */ }
    },
  };
}

export const localStore = (prefix = 'bohr:') => store(() => localStorage, prefix);
export const sessionStore = (prefix = 'bohr:') => store(() => sessionStorage, prefix);

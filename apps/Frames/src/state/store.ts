import { useSyncExternalStore } from 'react';

/** A tiny observable store: `get`, `set` (shallow-merge), `subscribe`, and a React hook with selectors. */
export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(fn: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k in next) if (!Object.is(state[k as keyof T], next[k as keyof T])) changed = true;
      if (!changed) return;
      state = { ...state, ...next };
      listeners.forEach((fn) => fn());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function useStore<T extends object, S>(store: Store<T>, select: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}

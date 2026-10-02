import { current, isDraft } from 'immer';

/** structuredClone that also accepts immer drafts (which are Proxies and can't be cloned directly). */
export function clone<T>(x: T): T {
  return structuredClone(isDraft(x) ? current(x) : x);
}

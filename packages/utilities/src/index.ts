/** Run async tasks one at a time, in order. A failed task doesn't block the next. */
export function serialQueue() {
  let tail: Promise<void> = Promise.resolve();
  return (task: () => Promise<void>): Promise<void> => {
    const next = tail.then(task, task);
    tail = next.catch(() => {});
    return next;
  };
}

/** Resolve with `value` after `ms`, or earlier when `promise` settles. */
export function withTimeout<T>(promise: Promise<T>, ms: number, value: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** A tiny observable value (settings, status) without a framework. */
export function observable<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((fn) => fn(value));
    },
    subscribe(fn: (v: T) => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

type Props<K extends keyof HTMLElementTagNameMap> = Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> };

/** Create an element with properties and children. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props<K> = {}, ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(node, rest);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children);
  return node;
}

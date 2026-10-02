/** Presenter ⇄ audience windows talk over a BroadcastChannel, one per deck. */

export type PresentMsg =
  | { t: 'next' }
  | { t: 'prev' }
  | { t: 'goto'; i: number }
  | { t: 'blank'; b: 'black' | 'white' }
  | { t: 'hello' }
  | { t: 'sync'; i: number; step: number }
  | { t: 'exit' };

export interface Channel {
  send(m: PresentMsg): void;
  on(fn: (m: PresentMsg) => void): () => void;
  close(): void;
}

export function openChannel(deckId: string): Channel {
  if (typeof BroadcastChannel === 'undefined') return { send() {}, on: () => () => {}, close() {} };
  const ch = new BroadcastChannel(`frames-present:${deckId}`);
  return {
    send: (m) => ch.postMessage(m),
    on: (fn) => {
      const h = (e: MessageEvent) => fn(e.data as PresentMsg);
      ch.addEventListener('message', h);
      return () => ch.removeEventListener('message', h);
    },
    close: () => ch.close(),
  };
}

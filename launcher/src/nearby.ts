import { isLocalHost } from '@bohrified/app-sdk';

/**
 * Live sessions running on the computer that serves this page (the "same room" case):
 * opening its address shows them on the home screen, so nobody has to type a code.
 * Only asks when the page itself is served from a local or network address, or from
 * `npm run tunnel` (a trycloudflare.com address); the hosted site has no such list.
 */
export interface NearbySession {
  code: string;
  students: number;
}

const POLL_MS = 4000;

/** Where the local relay answers: its own port in development, this page's origin otherwise. */
const base = () => (import.meta.env.DEV ? `http://${location.hostname}:8787` : location.origin);

export const nearbyAvailable = () => isLocalHost(location.hostname) || location.hostname.endsWith('.trycloudflare.com');

/** Calls `onChange` with the sessions found, now and whenever they change. Returns a stop function. */
export function watchNearby(onChange: (sessions: NearbySession[]) => void): () => void {
  if (!nearbyAvailable()) return () => {};
  let timer = 0;
  let stopped = false;
  let last = '';
  const tick = async () => {
    if (stopped) return;
    if (!document.hidden) {
      try {
        const res = await fetch(`${base()}/api/sessions`, { cache: 'no-store' });
        const body = res.ok ? ((await res.json()) as { sessions?: NearbySession[] }) : null;
        const sessions = Array.isArray(body?.sessions) ? body.sessions.filter((s) => typeof s?.code === 'string') : [];
        const sig = JSON.stringify(sessions);
        if (sig !== last) {
          last = sig;
          onChange(sessions);
        }
      } catch {
        if (last !== '[]') {
          last = '[]';
          onChange([]);
        }
      }
    }
    timer = window.setTimeout(tick, POLL_MS);
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

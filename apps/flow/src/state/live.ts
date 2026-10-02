import { useSyncExternalStore } from 'react';
import { DEFAULT_ONLINE_SITE, isLocalHost, joinPath, liveBackend, newSessionCode, sessionSocketUrl, type LiveBackend, type LiveMode } from '@bohrified/app-sdk';
import { pollTransport, socketTransport, type LinkStatus, type Transport } from '../engine/transport';
import type { SharingState, SyncMessage, TutorSync } from '../engine/sync';
import { ui } from './ui';

/**
 * The tutor's live session: a code students can join from another device
 * through the session relay. It lives outside React so it survives Flow
 * being suspended by Bohrified (the socket is cheap; the board is not), and
 * is remembered per tab so a reload resumes the same code.
 */

const MODE_KEY = 'flow:live:mode:v1';
const ONLINE_SITE: string = import.meta.env.VITE_ONLINE_SITE_URL || DEFAULT_ONLINE_SITE;

/** The tutor's choice, remembered on this device. Online is the default: anyone, on any network, can join. */
export function savedMode(): LiveMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'local' ? 'local' : 'online';
  } catch {
    return 'online';
  }
}

/**
 * How live sessions travel on this deployment for `mode`, or null when they aren't available:
 * online → the hosted site's function (or this page's own, when it *is* the hosted site);
 * local → this computer's relay (`npm run dev` / `npm run serve`). `VITE_LIVE_SESSION_URL` overrides both.
 */
export function liveRelay(mode: LiveMode = state.mode): LiveBackend | null {
  const here = typeof location === 'undefined' ? undefined : location;
  return liveBackend(import.meta.env.VITE_LIVE_SESSION_URL, { dev: import.meta.env.DEV, origin: here?.origin, protocol: here?.protocol, hostname: here?.hostname, mode, onlineSite: ONLINE_SITE });
}

/** One transport to a live session, whichever way this deployment carries it. */
export function openLiveTransport(code: string, role: 'tutor' | 'student', key?: string, mode: LiveMode = state.mode): Transport<SyncMessage> | null {
  const backend = liveRelay(mode);
  if (!backend) return null;
  return backend.kind === 'ws'
    ? socketTransport<SyncMessage>({ url: sessionSocketUrl(backend.url, code, role, key) })
    : pollTransport<SyncMessage>({ url: backend.url, code, role, key });
}

/** The address people on this network type to reach this computer: `{ host, port }`, or null when unknown. */
export async function localAddress(): Promise<{ host: string; port: string; hint?: boolean } | null> {
  const here = location;
  // Opened at the computer's own network address already: that is what others use too.
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(here.hostname)) return { host: here.hostname, port: here.port || '80' };
  try {
    const base = import.meta.env.DEV ? `http://${here.hostname}:8787` : here.origin;
    const info = (await (await fetch(`${base}/api/info`)).json()) as { addresses: string[]; port: number };
    if (info.addresses[0]) return { host: info.addresses[0], port: String(info.port), hint: true };
  } catch { /* no local relay */ }
  return null;
}

/** The link to share for a code, for the mode it was started in. */
export function shareLink(code: string, mode: LiveMode, local?: { host: string; port: string } | null): string {
  if (mode === 'local') return local ? `http://${local.host}${local.port === '80' ? '' : `:${local.port}`}${joinPath('/', code)}?via=local` : '';
  const site = isLocalHost(location.hostname) ? ONLINE_SITE : location.origin;
  return joinPath(site + '/', code);
}

export interface LiveState {
  /** Where the session runs: the hosted site (any network) or this computer (same network). */
  mode: LiveMode;
  /** Live sessions are available on this deployment. */
  configured: boolean;
  code: string | null;
  link: LinkStatus | 'off';
  /** Students watching, local windows included. */
  viewers: number;
  sharing: SharingState;
}

const SESSION_KEY = 'flow:live:v1';

let state: LiveState = { mode: savedMode(), configured: false, code: null, link: 'off', viewers: 0, sharing: 'live' };
const listeners = new Set<() => void>();
const set = (patch: Partial<LiveState>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};

export const live = { get: () => state };
export function useLive<T>(selector: (s: LiveState) => T): T {
  return useSyncExternalStore((fn) => (listeners.add(fn), () => void listeners.delete(fn)), () => selector(state), () => selector(state));
}

let tutor: TutorSync | null = null;
let socket: Transport<SyncMessage> | null = null;
let offStatus: (() => void) | null = null;
let offViewers: (() => void) | null = null;

const read = (): { code: string; key: string; mode?: LiveMode } | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    return v && typeof v.code === 'string' && typeof v.key === 'string' ? v : null;
  } catch {
    return null;
  }
};

const randomKey = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');

function connect(code: string, key: string) {
  const next = openLiveTransport(code, 'tutor', key);
  if (!next) return;
  socket?.close();
  offStatus?.();
  socket = next;
  offStatus = socket.onStatus((link) => set({ link }));
  set({ code, link: socket.status });
  tutor?.addTransport(socket);
}

/** Choose where the next session runs (not while one is running). */
export function setLiveMode(mode: LiveMode) {
  if (state.code) return;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch { /* the choice just won't be remembered */ }
  set({ mode, configured: !!liveRelay(mode) });
}

/** Start sharing under a new code. */
export function startLiveSession() {
  if (state.code || !liveRelay()) return;
  const code = newSessionCode();
  const key = randomKey();
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, key, mode: state.mode }));
  } catch { /* the session just won't survive a reload */ }
  set({ sharing: 'live' });
  connect(code, key);
}

/** Stop sharing: students are told the session ended. */
export function endLiveSession() {
  if (socket) {
    tutor?.setSharing('ended');
    tutor?.removeTransport(socket);
  }
  socket?.close();
  socket = null;
  offStatus?.();
  offStatus = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
  tutor?.setSharing('live');
  set({ code: null, link: 'off', sharing: 'live' });
}

export function setSharing(next: SharingState) {
  set({ sharing: next });
  tutor?.setSharing(next);
}

/** Connect the running session (and the viewer count) to a board's TutorSync, e.g. when Flow wakes from suspend. */
export function attachTutor(sync: TutorSync | null) {
  offViewers?.();
  offViewers = null;
  tutor = sync;
  set({ configured: !!liveRelay() });
  if (!sync) return;
  offViewers = sync.onViewers((viewers) => set({ viewers }));
  if (!socket) {
    const saved = read();
    if (saved) {
      // A reload resumes the session in the mode it started in.
      if (saved.mode && saved.mode !== state.mode) set({ mode: saved.mode });
      if (liveRelay()) connect(saved.code, saved.key);
    }
  } else sync.addTransport(socket);
  if (state.sharing !== 'live') sync.setSharing(state.sharing);
}

/** The first name students see, if the tutor gave one. */
export const tutorName = () => ui.get().name;

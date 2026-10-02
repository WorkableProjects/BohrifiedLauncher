import { useSyncExternalStore } from 'react';
import { liveBackend, newSessionCode, sessionSocketUrl, type LiveBackend } from '@bohrified/app-sdk';
import { pollTransport, socketTransport, type LinkStatus, type Transport } from '../engine/transport';
import type { SharingState, SyncMessage, TutorSync } from '../engine/sync';
import { ui } from './ui';

/**
 * The tutor's live session: a code students can join from another device
 * through the session relay. It lives outside React so it survives Flow
 * being suspended by Bohrified (the socket is cheap; the board is not), and
 * is remembered per tab so a reload resumes the same code.
 */

/**
 * How live sessions travel on this deployment, or null when they aren't available:
 * the local relay in development, the site's Netlify Function (`/api/live`) in
 * production, or whatever `VITE_LIVE_SESSION_URL` points at.
 */
export function liveRelay(): LiveBackend | null {
  const here = typeof location === 'undefined' ? undefined : location;
  return liveBackend(import.meta.env.VITE_LIVE_SESSION_URL, { dev: import.meta.env.DEV, origin: here?.origin, protocol: here?.protocol, hostname: here?.hostname });
}

/** One transport to a live session, whichever way this deployment carries it. */
export function openLiveTransport(code: string, role: 'tutor' | 'student', key?: string): Transport<SyncMessage> | null {
  const backend = liveRelay();
  if (!backend) return null;
  return backend.kind === 'ws'
    ? socketTransport<SyncMessage>({ url: sessionSocketUrl(backend.url, code, role, key) })
    : pollTransport<SyncMessage>({ url: backend.url, code, role, key });
}

export interface LiveState {
  /** Live sessions are available on this deployment. */
  configured: boolean;
  code: string | null;
  link: LinkStatus | 'off';
  /** Students watching, local windows included. */
  viewers: number;
  sharing: SharingState;
}

const SESSION_KEY = 'flow:live:v1';

let state: LiveState = { configured: false, code: null, link: 'off', viewers: 0, sharing: 'live' };
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

const read = (): { code: string; key: string } | null => {
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

/** Start sharing under a new code. */
export function startLiveSession() {
  if (state.code || !liveRelay()) return;
  const code = newSessionCode();
  const key = randomKey();
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, key }));
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
    if (saved && liveRelay()) connect(saved.code, saved.key);
  } else sync.addTransport(socket);
  if (state.sharing !== 'live') sync.setSharing(state.sharing);
}

/** The first name students see, if the tutor gave one. */
export const tutorName = () => ui.get().name;

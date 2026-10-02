/**
 * Live sessions: the small pieces Bohrified and Flow share so a student can
 * join a tutor's whiteboard from another device. Pure helpers (no DOM
 * except `crypto`), covered by unit tests.
 *
 * A session is a short code. The tutor's Flow and the student's viewer both
 * connect to a relay (a WebSocket server, see scripts/session-relay.mjs)
 * that passes messages between them. The relay's address comes from the
 * deployment's configuration (`VITE_LIVE_SESSION_URL`); nothing secret is
 * ever stored in this repository or sent to the browser except the code.
 */

/** No 0/O, 1/I/L: codes get read aloud and typed from a screen share. */
export const SESSION_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SESSION_CODE_LENGTH = 6;

export type SessionRole = 'tutor' | 'student';

/** A fresh random session code, e.g. "K7QX2M". */
export function newSessionCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(SESSION_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < SESSION_CODE_LENGTH; i++) out += SESSION_ALPHABET[bytes[i] % SESSION_ALPHABET.length];
  return out;
}

/** "k7q-x2m" → "K7QX2M"; null when it isn't a valid code. */
export function normalizeSessionCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]+/g, '');
  if (code.length !== SESSION_CODE_LENGTH) return null;
  return [...code].every((c) => SESSION_ALPHABET.includes(c)) ? code : null;
}

/**
 * What a student pastes or types: a bare code, or a join link such as
 * `https://bohrified.app/join/K7QX2M` or `…/join?code=K7QX2M`.
 */
export function parseJoinInput(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const direct = normalizeSessionCode(text);
  if (direct) return direct;
  try {
    const url = new URL(text, 'https://x.invalid');
    const fromQuery = url.searchParams.get('code');
    if (fromQuery) return normalizeSessionCode(fromQuery);
    const m = /\/join\/([^/?#]+)/i.exec(url.pathname);
    if (m) return normalizeSessionCode(decodeURIComponent(m[1]));
  } catch { /* not a URL */ }
  return null;
}

/** The shareable link for a code, under the deployment `base` (ends with '/'). */
export const joinPath = (base: string, code: string) => `${base.replace(/\/?$/, '/')}join/${code}`;

/**
 * Validate the configured relay address. Only ws: and wss: are accepted,
 * and a page served over https must use wss: (browsers block ws: there).
 * Returns the URL without a trailing slash, or null when unusable.
 */
export function relayUrl(raw: string | undefined | null, pageProtocol = 'https:'): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
    if (pageProtocol === 'https:' && u.protocol === 'ws:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) return null;
    u.hash = '';
    u.search = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** How this deployment carries live sessions: a WebSocket relay, or HTTP polling (Netlify Functions, or a relay's /api/live). */
export type LiveBackend = { kind: 'ws' | 'http'; url: string };

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/**
 * Pick the live-session backend.
 *  • `VITE_LIVE_SESSION_URL` set: ws(s):// → WebSocket relay; http(s):// → HTTP endpoint.
 *  • Unset in development: the local relay, ws://localhost:8787.
 *  • Unset in production: the site's own Netlify Function at `<origin>/api/live`.
 * Returns null when the configured address is unusable.
 */
export function liveBackend(raw: string | undefined | null, env: { dev: boolean; origin?: string; protocol?: string }): LiveBackend | null {
  const protocol = env.protocol ?? 'https:';
  if (raw?.trim()) {
    const ws = relayUrl(raw, protocol);
    if (ws) return { kind: 'ws', url: ws };
    try {
      const u = new URL(raw.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (protocol === 'https:' && u.protocol === 'http:' && !LOCAL_HOST.test(u.hostname)) return null;
      u.hash = '';
      u.search = '';
      return { kind: 'http', url: u.toString().replace(/\/$/, '') };
    } catch {
      return null;
    }
  }
  if (env.dev) return { kind: 'ws', url: 'ws://localhost:8787' };
  return env.origin ? { kind: 'http', url: `${env.origin.replace(/\/$/, '')}/api/live` } : null;
}

/** The WebSocket address for one connection to a session. */
export function sessionSocketUrl(relay: string, code: string, role: SessionRole, key?: string): string {
  const u = new URL(`${relay}/session/${code}`);
  u.searchParams.set('role', role);
  if (key) u.searchParams.set('key', key);
  return u.toString();
}

/** Messages the join page's Flow viewer sends to the page around it (separate from the app lifecycle protocol). */
export type JoinState = 'connecting' | 'waiting' | 'live' | 'paused' | 'reconnecting' | 'ended' | 'unavailable' | 'not-found' | 'error';

export interface JoinMessage {
  bohrJoin: 1;
  state: JoinState;
  /** Lesson title once the tutor's board has arrived. */
  title?: string;
  /** Tutor's first name, when the tutor chose to share it. */
  tutor?: string;
  page?: string;
}

export const isJoinMessage = (d: unknown): d is JoinMessage => typeof d === 'object' && d !== null && (d as { bohrJoin?: unknown }).bohrJoin === 1 && typeof (d as { state?: unknown }).state === 'string';

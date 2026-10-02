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

/**
 * Where a live session runs.
 *  • `online` (default): through the hosted Bohrified site, so anyone on any network can join at its /join page.
 *  • `local`: through this computer, for people on the same network (classroom, projector). Joiners enter its address.
 */
export type LiveMode = 'online' | 'local';

/** The hosted site, used by copies running on a local computer. Override with VITE_ONLINE_SITE_URL. */
export const DEFAULT_ONLINE_SITE = 'https://bohrified.netlify.app';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** localhost, loopback, or a private-network (LAN) address: a copy running on someone's own computer. */
export function isLocalHost(hostname: string | undefined | null): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (LOCAL_HOST.test(h) || h.endsWith('.local')) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

export interface LiveEnv {
  dev: boolean;
  origin?: string;
  protocol?: string;
  hostname?: string;
  /** Default 'online'. */
  mode?: LiveMode;
  /** The hosted site for `online` mode from a local copy. */
  onlineSite?: string;
}

/**
 * Pick the live-session backend.
 *  • `VITE_LIVE_SESSION_URL` set: ws(s):// → WebSocket relay; http(s):// → HTTP endpoint.
 *  • Otherwise, in `online` mode from a local computer: the hosted site's function, `<onlineSite>/api/live`.
 *  • Otherwise (`local` mode, or the page is itself the hosted site): this page's own host. In
 *    development that is the relay on ws://<host>:8787; in production, `<origin>/api/live`
 *    (the Netlify Function, or `npm run serve`).
 * Returns null when the configured address is unusable.
 */
export function liveBackend(raw: string | undefined | null, env: LiveEnv): LiveBackend | null {
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
  const mode = env.mode ?? 'online';
  if (mode === 'online' && env.onlineSite && isLocalHost(env.hostname)) return { kind: 'http', url: `${env.onlineSite.replace(/\/$/, '')}/api/live` };
  if (env.dev) return { kind: 'ws', url: `ws://${env.hostname && /^[\w.-]+$/.test(env.hostname) ? env.hostname : 'localhost'}:8787` };
  return env.origin ? { kind: 'http', url: `${env.origin.replace(/\/$/, '')}/api/live` } : null;
}

/** "192.168.1.20", "8787", "k7q-x2m" → the address a joiner opens, or null when something is off. */
export function localJoinUrl(host: string, port: string, code: string): string | null {
  const h = host.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  const p = Number(port.trim() || 80);
  const c = normalizeSessionCode(code);
  if (!/^[A-Za-z0-9.-]+$/.test(h) || !c || !Number.isInteger(p) || p < 1 || p > 65535) return null;
  return `http://${h}${p === 80 ? '' : `:${p}`}/join/${c}?via=local`;
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

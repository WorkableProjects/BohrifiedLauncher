/**
 * How live-sync messages travel. Flow's tutor and viewer talk to a
 * `Transport`: a same-origin BroadcastChannel for the "student view" window
 * on the same computer, or a WebSocket through the session relay, or HTTP polling
 * (for a server that can't hold a WebSocket), or WebRTC peer-to-peer (static hosts like GitHub Pages), for a
 * student on another device. Both carry the same messages.
 */

export type LinkStatus = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'refused';

export interface Transport<M> {
  send(message: M): void;
  onMessage(fn: (message: M) => void): () => void;
  /** Fires with the current status immediately, then on every change. */
  onStatus(fn: (status: LinkStatus, detail?: string) => void): () => void;
  readonly status: LinkStatus;
  close(): void;
}

export const channelSupported = () => typeof BroadcastChannel !== 'undefined';

/** Messages between windows of the same browser. Always "open". */
export function channelTransport<M>(name: string): Transport<M> {
  const ch = new BroadcastChannel(name);
  const handlers = new Set<(m: M) => void>();
  ch.onmessage = (e: MessageEvent<M>) => handlers.forEach((fn) => fn(e.data));
  return {
    status: 'open',
    send(m) {
      try {
        ch.postMessage(m);
      } catch (err) {
        console.warn('Flow: sync post failed', err);
      }
    },
    onMessage(fn) {
      handlers.add(fn);
      return () => void handlers.delete(fn);
    },
    onStatus(fn) {
      fn('open');
      return () => {};
    },
    close() {
      handlers.clear();
      ch.close();
    },
  };
}

export interface SocketOptions {
  url: string;
  /** Called on every (re)connect, with the attempt number, to rebuild the URL if needed. */
  maxBackoffMs?: number;
  /** Test seam. */
  WebSocketImpl?: typeof WebSocket;
}

/** Close codes the relay uses; a refused connection is not retried. */
export const CLOSE_NOT_FOUND = 4404;
export const CLOSE_FORBIDDEN = 4403;
export const CLOSE_FULL = 4429;

/** The delay before reconnect attempt `n` (0-based): 0.5 s doubling to a cap, with jitter. */
export function backoffMs(n: number, cap = 8000, random = Math.random): number {
  const base = Math.min(cap, 500 * 2 ** n);
  return Math.round(base * (0.75 + random() * 0.5));
}

/**
 * A WebSocket that reconnects by itself. Messages sent while it is down are
 * dropped on purpose: after reconnecting, both sides re-send their state
 * (the viewer asks for a snapshot), which is cheaper than replaying a log.
 */
export function socketTransport<M>(opts: SocketOptions): Transport<M> {
  const WS = opts.WebSocketImpl ?? WebSocket;
  const handlers = new Set<(m: M) => void>();
  const statusHandlers = new Set<(s: LinkStatus, detail?: string) => void>();
  let ws: WebSocket | null = null;
  let status: LinkStatus = 'connecting';
  let attempt = 0;
  let timer = 0;
  let closed = false;
  let ping = 0;

  const set = (s: LinkStatus, detail?: string) => {
    status = s;
    statusHandlers.forEach((fn) => fn(s, detail));
  };

  const connect = () => {
    if (closed) return;
    set(attempt === 0 ? 'connecting' : 'reconnecting');
    let socket: WebSocket;
    try {
      socket = new WS(opts.url);
    } catch (err) {
      set('refused', String(err));
      return;
    }
    ws = socket;
    socket.onopen = () => {
      attempt = 0;
      set('open');
      // Keep idle proxies from closing a quiet session.
      clearInterval(ping);
      ping = window.setInterval(() => socket.readyState === 1 && socket.send('{"t":"ping"}'), 25000);
    };
    socket.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      try {
        const m = JSON.parse(e.data) as M;
        handlers.forEach((fn) => fn(m));
      } catch { /* ignore malformed frames */ }
    };
    socket.onclose = (e) => {
      clearInterval(ping);
      if (closed) return;
      if (e.code === CLOSE_NOT_FOUND || e.code === CLOSE_FORBIDDEN || e.code === CLOSE_FULL) {
        set('refused', String(e.code));
        return;
      }
      timer = window.setTimeout(connect, backoffMs(attempt++, opts.maxBackoffMs));
      set('reconnecting');
    };
    socket.onerror = () => {
      /* onclose follows and handles the retry */
    };
  };
  connect();

  return {
    get status() {
      return status;
    },
    send(m) {
      if (ws?.readyState === 1) ws.send(JSON.stringify(m));
    },
    onMessage(fn) {
      handlers.add(fn);
      return () => void handlers.delete(fn);
    },
    onStatus(fn) {
      statusHandlers.add(fn);
      fn(status);
      return () => void statusHandlers.delete(fn);
    },
    close() {
      closed = true;
      clearTimeout(timer);
      clearInterval(ping);
      handlers.clear();
      statusHandlers.clear();
      ws?.close(1000);
    },
  };
}

export interface PollOptions {
  /** The endpoint, e.g. `https://site/api/live`. */
  url: string;
  code: string;
  role: 'tutor' | 'student';
  key?: string;
  /** Test seams. */
  fetchImpl?: typeof fetch;
  pollMs?: number;
  idlePollMs?: number;
  flushMs?: number;
}

/** Largest message the HTTP endpoint accepts; bigger ones are dropped (the live board stays correct on the next snapshot). */
export const MAX_POLL_BODY = 3.5 * 1024 * 1024;

/**
 * The same messages as `socketTransport`, carried by short HTTP requests: the
 * sender batches outgoing messages into one POST, and a poll loop (fast while
 * messages flow, slower when idle) collects what is addressed to this side.
 * Mirrors the WebSocket relay's rules and statuses, so Flow's sync code does
 * not know the difference.
 */
export function pollTransport<M>(opts: PollOptions): Transport<M> {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const fast = opts.pollMs ?? 600;
  const idle = opts.idlePollMs ?? 1800;
  const flushMs = opts.flushMs ?? 80;
  const client = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const base = `${opts.url.replace(/\/$/, '')}/${opts.code}`;
  const handlers = new Set<(m: M) => void>();
  const statusHandlers = new Set<(s: LinkStatus, detail?: string) => void>();
  let status: LinkStatus = 'connecting';
  let cursor: string | null = null;
  let queue: M[] = [];
  let flushTimer = 0;
  let pollTimer = 0;
  let attempt = 0;
  let quiet = 0;
  let closed = false;
  let sending = false;
  let peers = '';

  const set = (s: LinkStatus, detail?: string) => {
    if (s === status && s !== 'refused') return;
    status = s;
    statusHandlers.forEach((fn) => fn(s, detail));
  };
  const refuse = (code: number) => {
    set('refused', String(code));
    clearTimeout(pollTimer);
    clearTimeout(flushTimer);
    flushTimer = 0;
    queue = [];
  };
  const isRefused = () => status === 'refused';
  const noteHttp = (res: Response) => {
    if (res.status === 404) refuse(CLOSE_NOT_FOUND);
    else if (res.status === 403) refuse(CLOSE_FORBIDDEN);
    else if (res.status === 429) refuse(CLOSE_FULL);
  };
  const notePeers = (p?: { tutors: number; students: number }) => {
    if (!p) return;
    const sig = `${p.tutors}/${p.students}`;
    if (sig === peers) return;
    peers = sig;
    handlers.forEach((fn) => fn({ t: 'peers', ...p } as M));
  };
  const retry = (fn: () => void) => {
    if (closed || status === 'refused') return;
    set('reconnecting');
    pollTimer = window.setTimeout(fn, backoffMs(attempt++));
  };

  const poll = async () => {
    if (closed || status === 'refused') return;
    try {
      const q = new URLSearchParams({ role: opts.role, client });
      if (opts.key) q.set('key', opts.key);
      if (cursor) q.set('since', cursor);
      const res = await doFetch(`${base}?${q}`, { cache: 'no-store' });
      if (closed) return;
      if (!res.ok) {
        noteHttp(res);
        if (!isRefused()) retry(poll);
        return;
      }
      const body = (await res.json()) as { cursor: string; messages: M[]; peers?: { tutors: number; students: number } };
      attempt = 0;
      const first = cursor === null;
      cursor = body.cursor;
      set('open');
      if (first) peers = '';
      notePeers(body.peers);
      for (const m of body.messages) handlers.forEach((fn) => fn(m));
      quiet = body.messages.length ? 0 : quiet + 1;
      pollTimer = window.setTimeout(poll, quiet > 12 ? idle : fast);
    } catch {
      retry(poll);
    }
  };

  const flush = async () => {
    if (closed || sending || !queue.length || status === 'refused') return;
    if (cursor === null) {
      // Not connected yet: the first poll establishes the session; messages sent before are dropped like a down socket.
      queue = [];
      return;
    }
    sending = true;
    const batch = queue;
    queue = [];
    try {
      const body = JSON.stringify({ role: opts.role, key: opts.key, client, messages: batch });
      if (body.length > MAX_POLL_BODY) console.warn('Flow: live message too large for HTTP sync, skipped');
      else {
        const res = await doFetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        if (!res.ok) noteHttp(res);
        else quiet = 0;
      }
    } catch {
      /* dropped; both sides resync after a reconnect */
    } finally {
      sending = false;
      if (queue.length) schedule();
    }
  };
  const schedule = () => {
    if (flushTimer) return;
    flushTimer = window.setTimeout(() => {
      flushTimer = 0;
      void flush();
    }, flushMs);
  };

  poll();

  return {
    get status() {
      return status;
    },
    send(m) {
      if (closed || status === 'refused') return;
      queue.push(m);
      schedule();
    },
    onMessage(fn) {
      handlers.add(fn);
      return () => void handlers.delete(fn);
    },
    onStatus(fn) {
      statusHandlers.add(fn);
      fn(status);
      return () => void statusHandlers.delete(fn);
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(pollTimer);
      clearTimeout(flushTimer);
      handlers.clear();
      statusHandlers.clear();
      if (opts.role === 'student') void doFetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'student', client, messages: [{ t: 'bye' }] }), keepalive: true }).catch(() => {});
    },
  };
}

/* ───────────────────────── Peer-to-peer (WebRTC) ───────────────────────── */

/**
 * The minimum of PeerJS this transport uses, so tests can pass a fake.
 * (`import('peerjs').Peer` satisfies it.)
 */
export interface PeerLike {
  readonly id: string;
  readonly disconnected: boolean;
  readonly destroyed: boolean;
  on(event: 'open', fn: (id: string) => void): void;
  on(event: 'connection', fn: (conn: DataConnLike) => void): void;
  on(event: 'disconnected' | 'close', fn: () => void): void;
  on(event: 'error', fn: (err: { type?: string; message?: string }) => void): void;
  connect(id: string, options?: { reliable?: boolean; serialization?: string; metadata?: unknown }): DataConnLike;
  reconnect(): void;
  destroy(): void;
}
export interface DataConnLike {
  readonly open: boolean;
  readonly metadata?: unknown;
  on(event: 'open' | 'close', fn: () => void): void;
  on(event: 'data', fn: (data: unknown) => void): void;
  on(event: 'error', fn: (err: unknown) => void): void;
  send(data: unknown): void;
  close(): void;
}
export type PeerFactory = (id?: string) => PeerLike;

export interface PeerOptions {
  code: string;
  role: 'tutor' | 'student';
  /** Builds a PeerJS peer (lazy-loaded so the library only downloads when a session starts). */
  createPeer?: PeerFactory;
  maxStudents?: number;
  /** How long a student waits for the tutor's connection to open before retrying. */
  connectTimeoutMs?: number;
  /** How long a tutor keeps retrying when its session id is still held (e.g. right after a reload). */
  claimWindowMs?: number;
}

/** The public signalling id for a session. Codes are random; the prefix keeps them apart from other PeerJS users. */
export const peerIdFor = (code: string) => `bohrified-live-${code}`;

/** Data channels cap message size; bigger messages are split into chunks of this many characters. */
export const PEER_CHUNK = 60_000;
const STUDENT_MAY_SEND = new Set(['hello', 'viewer', 'bye', 'edit']);

type Chunk = { t: '_c'; id: string; i: number; n: number; d: string };

function chunked(m: unknown): unknown[] {
  const text = JSON.stringify(m);
  if (text.length <= PEER_CHUNK) return [m];
  const id = Math.random().toString(36).slice(2, 10);
  const n = Math.ceil(text.length / PEER_CHUNK);
  const out: Chunk[] = [];
  for (let i = 0; i < n; i++) out.push({ t: '_c', id, i, n, d: text.slice(i * PEER_CHUNK, (i + 1) * PEER_CHUNK) });
  return out;
}

/** Reassembles chunked messages from one connection. */
function assembler<M>(deliver: (m: M) => void) {
  const parts = new Map<string, string[]>();
  return (data: unknown) => {
    const c = data as Chunk;
    if (!c || typeof c !== 'object') return;
    if (c.t !== '_c') return deliver(data as M);
    if (typeof c.id !== 'string' || !Number.isInteger(c.n) || c.n > 2000 || typeof c.d !== 'string') return;
    const got = parts.get(c.id) ?? new Array<string>(c.n);
    got[c.i] = c.d;
    parts.set(c.id, got);
    if (got.filter((x) => x !== undefined).length < c.n) return;
    parts.delete(c.id);
    try {
      deliver(JSON.parse(got.join('')) as M);
    } catch { /* malformed */ }
  };
}

const defaultPeer: PeerFactory = () => {
  throw new Error('createPeer is required');
};

/**
 * Live sessions with no server of our own (for static hosts like GitHub Pages):
 * the tutor's browser *is* the relay. Its PeerJS id is derived from the session
 * code; each student opens a WebRTC data channel to it. A free public PeerJS
 * server only introduces the browsers; the board travels directly between them
 * (or through PeerJS's public TURN server when a network blocks direct links).
 *
 * The tutor applies the relay's rules itself: students may only send
 * hello / viewer / bye / edit, a student count is announced as `peers`, and
 * the room is capped. Statuses and refusal codes match `socketTransport`.
 */
export function peerTransport<M>(opts: PeerOptions): Transport<M> {
  const create = opts.createPeer ?? defaultPeer;
  const maxStudents = opts.maxStudents ?? 64;
  const timeoutMs = opts.connectTimeoutMs ?? 15_000;
  const claimWindow = opts.claimWindowMs ?? 120_000;
  const handlers = new Set<(m: M) => void>();
  const statusHandlers = new Set<(s: LinkStatus, detail?: string) => void>();
  const tutorId = peerIdFor(opts.code);
  let status: LinkStatus = 'connecting';
  let closed = false;
  let peer: PeerLike | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let everOpen = false;

  const set = (s: LinkStatus, detail?: string) => {
    if (s === status && s !== 'refused') return;
    status = s;
    statusHandlers.forEach((fn) => fn(s, detail));
  };
  const emit = (m: M) => handlers.forEach((fn) => fn(m));
  const refuse = (code: number) => {
    clearTimeout(timer);
    set('refused', String(code));
    peer?.destroy();
    peer = null;
  };
  const sendOn = (conn: DataConnLike, m: unknown) => {
    if (!conn.open) return;
    try {
      for (const part of chunked(m)) conn.send(part);
    } catch (err) {
      console.warn('Flow: live send failed', err);
    }
  };

  /* ── Tutor: hosts the session ── */
  const students = new Set<DataConnLike>();
  const announce = () => {
    const p = { t: 'peers', tutors: 1, students: students.size };
    emit(p as M);
    for (const s of students) sendOn(s, p);
  };
  const startTutor = () => {
    const started = Date.now();
    const claim = () => {
      if (closed) return;
      const p = create(tutorId);
      peer = p;
      p.on('open', () => {
        attempt = 0;
        everOpen = true;
        set('open');
        announce();
      });
      p.on('connection', (conn) => {
        conn.on('open', () => {
          if (students.size >= maxStudents) {
            sendOn(conn, { t: '_full' });
            setTimeout(() => conn.close(), 200);
            return;
          }
          students.add(conn);
          announce();
        });
        conn.on('data', assembler<{ t?: string }>((m) => {
          if (students.has(conn) && m && typeof m.t === 'string' && STUDENT_MAY_SEND.has(m.t)) emit(m as M);
        }));
        const gone = () => {
          if (students.delete(conn)) announce();
        };
        conn.on('close', gone);
        conn.on('error', gone);
      });
      p.on('disconnected', () => {
        // Lost the signalling server only: open data channels keep working; re-register so new students can join.
        if (!closed && !p.destroyed) setTimeout(() => !closed && !p.destroyed && p.reconnect(), backoffMs(Math.min(attempt++, 4)));
      });
      p.on('error', (err) => {
        if (closed || peer !== p) return;
        if (err.type === 'unavailable-id') {
          // The id is still held, most often by this tab before a reload. Wait for it to be released.
          p.destroy();
          if (Date.now() - started > claimWindow) return refuse(CLOSE_FORBIDDEN);
          set(everOpen ? 'reconnecting' : 'connecting');
          timer = setTimeout(claim, backoffMs(Math.min(attempt++, 3)));
        } else if (err.type === 'browser-incompatible') refuse(CLOSE_FORBIDDEN);
        else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
          set('reconnecting');
          if (p.disconnected && !p.destroyed) timer = setTimeout(() => !closed && !p.destroyed && p.reconnect(), backoffMs(attempt++));
        }
      });
    };
    claim();
  };

  /* ── Student: connects to the tutor ── */
  let conn: DataConnLike | null = null;
  const startStudent = () => {
    const p = create();
    peer = p;
    const dial = () => {
      if (closed || status === 'refused' || peer !== p) return;
      clearTimeout(timer);
      if (p.disconnected && !p.destroyed) p.reconnect();
      const c = p.connect(tutorId, { reliable: true, serialization: 'json', metadata: { role: 'student' } });
      conn = c;
      let opened = false;
      const retry = () => {
        if (closed || status === 'refused' || conn !== c) return;
        conn = null;
        clearTimeout(timer);
        try {
          c.close();
        } catch { /* ignore */ }
        set('reconnecting');
        timer = setTimeout(dial, backoffMs(attempt++));
      };
      timer = setTimeout(() => !opened && retry(), timeoutMs);
      c.on('open', () => {
        opened = true;
        clearTimeout(timer);
        attempt = 0;
        everOpen = true;
        set('open');
      });
      c.on('data', assembler<{ t?: string }>((m) => {
        if (m?.t === '_full') return refuse(CLOSE_FULL);
        emit(m as M);
      }));
      c.on('close', retry);
      c.on('error', retry);
    };
    p.on('open', () => dial());
    p.on('disconnected', () => {
      if (!closed && !p.destroyed) setTimeout(() => !closed && !p.destroyed && p.disconnected && p.reconnect(), backoffMs(Math.min(attempt, 4)));
    });
    p.on('error', (err) => {
      if (closed || peer !== p) return;
      if (err.type === 'peer-unavailable') {
        // Nobody is hosting this code. Before the first connection that means a wrong code;
        // afterwards the tutor is probably reloading, so keep trying.
        if (!everOpen) return refuse(CLOSE_NOT_FOUND);
        conn = null;
        set('reconnecting');
        clearTimeout(timer);
        timer = setTimeout(dial, backoffMs(attempt++));
      } else if (err.type === 'browser-incompatible') refuse(CLOSE_FORBIDDEN);
      else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') set(everOpen ? 'reconnecting' : 'connecting');
    });
  };

  if (opts.role === 'tutor') startTutor();
  else startStudent();

  return {
    get status() {
      return status;
    },
    send(m) {
      if (closed || status === 'refused') return;
      if (opts.role === 'tutor') for (const s of students) sendOn(s, m);
      else if (conn) sendOn(conn, m);
    },
    onMessage(fn) {
      handlers.add(fn);
      return () => void handlers.delete(fn);
    },
    onStatus(fn) {
      statusHandlers.add(fn);
      fn(status);
      return () => void statusHandlers.delete(fn);
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      handlers.clear();
      statusHandlers.clear();
      const p = peer;
      peer = null;
      // Give the last messages (the tutor's "ended", a student's "bye") a moment to leave.
      setTimeout(() => p?.destroy(), 300);
    },
  };
}

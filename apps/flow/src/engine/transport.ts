/**
 * How live-sync messages travel. Flow's tutor and viewer talk to a
 * `Transport`: a same-origin BroadcastChannel for the "student view" window
 * on the same computer, or a WebSocket through the session relay, or HTTP polling
 * (for hosts like Netlify that can't hold a WebSocket), for a
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
        if (status !== 'refused') retry(poll);
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

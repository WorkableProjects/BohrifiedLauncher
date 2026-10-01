/**
 * How live-sync messages travel. Flow's tutor and viewer talk to a
 * `Transport`: a same-origin BroadcastChannel for the "student view" window
 * on the same computer, or a WebSocket through the session relay for a
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

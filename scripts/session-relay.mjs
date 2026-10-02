#!/usr/bin/env node
/**
 * Bohrified live-session relay (reference implementation).
 *
 * A tiny WebSocket server with no dependencies. A tutor's Flow and the
 * students joining by code all connect to  /session/<CODE>  and the relay
 * passes messages between them. It never looks inside a whiteboard, stores
 * nothing on disk, and forgets a room ten minutes after everyone has left.
 *
 *   node scripts/session-relay.mjs            # listens on :8787
 *   PORT=9000 ALLOWED_ORIGINS=https://bohrified.example node scripts/session-relay.mjs
 *
 * Connect:  ws(s)://host/session/<CODE>?role=tutor&key=<tutor key>
 *           ws(s)://host/session/<CODE>?role=student
 *
 * Rules
 *  • The first tutor to connect creates the room and its key; a later tutor
 *    connection must present the same key (so a student who learns a code can't take over).
 *  • Students may only join a room that exists (close code 4404 otherwise).
 *  • Tutor → every student: any message.  Student → tutors: hello / viewer / bye only.
 *  • After every join or leave, everyone in the room gets {t:'peers', tutors, students}.
 *
 * Environment (all optional; none are secrets that belong in the frontend)
 *   PORT              default 8787
 *   HOST              default 0.0.0.0
 *   ALLOWED_ORIGINS   comma-separated origins allowed to connect; unset = any
 *   MAX_ROOMS         default 500
 *   MAX_STUDENTS      per room, default 64
 *   MAX_MESSAGE_MB    default 16
 *   ROOM_TTL_MIN      default 10
 *   STATIC_DIR        also serve this built site (e.g. dist) on the same port: see scripts/serve.mjs
 *
 * Netlify cannot host WebSockets, so on Netlify live sessions run over HTTP
 * through the Netlify Function in netlify/functions/live.mjs (no setup). This
 * relay also answers that same HTTP protocol under /api/live, so a self-hosted
 * deployment can point VITE_LIVE_SESSION_URL at either ws(s):// or http(s)://.
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { handleLive, listSessions, memoryStore } from '../netlify/lib/live-core.mjs';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const STUDENT_MAY_SEND = new Set(['hello', 'viewer', 'bye', 'ping']);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.map': 'application/json',
};

/** This computer's LAN addresses (IPv4, non-internal), e.g. ['192.168.1.20']. */
export function lanAddresses() {
  return Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

/**
 * Serve a built site (dist/) the way netlify.toml does: real files as-is,
 * /app/*, /join and /join/* fall back to the shell. Returns true when handled.
 */
function serveStatic(root, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) return false;
  const isFile = (f) => { try { return statSync(f).isFile(); } catch { return false; } };
  if (!isFile(file) && path.endsWith('/') && isFile(join(file, 'index.html'))) file = join(file, 'index.html');
  if (!isFile(file)) {
    if (!/^\/(app\/|join(\/|$))/.test(path)) return false;
    file = join(root, 'index.html');
  }
  const hashed = /\/assets\//.test(path);
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache', 'x-content-type-options': 'nosniff' });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
  return true;
}

export const CLOSE = { BAD_REQUEST: 4400, FORBIDDEN: 4403, NOT_FOUND: 4404, FULL: 4429 };

/** Encode one unfragmented server → client frame. */
export function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) head = Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]);
  else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

/**
 * Incremental parser for client → server frames. Calls `onFrame(opcode, payload)`
 * for each complete message (fragments joined) and `onError(code)` on protocol violations.
 */
export function createParser({ maxBytes, onFrame, onError }) {
  let buf = Buffer.alloc(0);
  let fragments = [];
  let fragOpcode = 0;
  let fragBytes = 0;
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let at = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(maxBytes)) return onError(1009);
        len = Number(big);
        at = 10;
      }
      if (!masked) return onError(1002);
      if (len > maxBytes) return onError(1009);
      if (buf.length < at + 4 + len) return;
      const mask = buf.subarray(at, at + 4);
      const payload = Buffer.from(buf.subarray(at + 4, at + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(at + 4 + len);

      if (opcode >= 0x8) {
        // Control frames are never fragmented.
        if (!fin || len > 125) return onError(1002);
        onFrame(opcode, payload);
        continue;
      }
      if (opcode === 0x0) {
        if (!fragments.length) return onError(1002);
      } else {
        if (fragments.length) return onError(1002);
        fragOpcode = opcode;
      }
      fragBytes += payload.length;
      if (fragBytes > maxBytes) return onError(1009);
      fragments.push(payload);
      if (fin) {
        const whole = fragments.length === 1 ? fragments[0] : Buffer.concat(fragments);
        fragments = [];
        fragBytes = 0;
        onFrame(fragOpcode, whole);
      }
    }
  };
}

export function startRelay(options = {}) {
  const env = process.env;
  const cfg = {
    port: Number(options.port ?? env.PORT ?? 8787),
    host: options.host ?? env.HOST ?? '0.0.0.0',
    origins: (options.origins ?? env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    maxRooms: Number(options.maxRooms ?? env.MAX_ROOMS ?? 500),
    maxStudents: Number(options.maxStudents ?? env.MAX_STUDENTS ?? 64),
    maxBytes: Number(options.maxMessageMB ?? env.MAX_MESSAGE_MB ?? 16) * 1024 * 1024,
    ttlMs: Number(options.roomTtlMin ?? env.ROOM_TTL_MIN ?? 10) * 60_000,
    staticDir: options.staticDir ?? env.STATIC_DIR ? resolve(options.staticDir ?? env.STATIC_DIR) : '',
  };
  /** @type {Map<string, {key: string, tutors: Set<any>, students: Set<any>, timer: any}>} */
  const rooms = new Map();

  const peers = (room) => {
    const msg = JSON.stringify({ t: 'peers', tutors: room.tutors.size, students: room.students.size });
    for (const c of [...room.tutors, ...room.students]) c.send(msg);
  };

  const dropIfEmpty = (code, room) => {
    clearTimeout(room.timer);
    if (room.tutors.size || room.students.size) return;
    room.timer = setTimeout(() => rooms.get(code) === room && !room.tutors.size && !room.students.size && rooms.delete(code), cfg.ttlMs);
    room.timer.unref?.();
  };

  // The HTTP flavour of the protocol (what Netlify serves): same rules, in memory, for local use and tests.
  const httpStore = memoryStore();
  const allowOrigin = (req) => (!cfg.origins.length || cfg.origins.includes(req.headers.origin ?? '') ? (req.headers.origin ?? '*') : null);

  const server = createServer(async (req, res) => {
    if (req.url === '/api/info' || req.url === '/api/sessions' || req.url?.startsWith('/api/live/')) {
      const origin = allowOrigin(req);
      const cors = origin ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' } : {};
      if (!origin) return void res.writeHead(403, cors).end();
      if (req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
      if (req.url === '/api/info') {
        // Where other devices on this network can reach this computer (for the "same network" share option).
        const port = cfg.staticDir ? server.address().port : Number(env.APP_PORT ?? 5173);
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors });
        return void res.end(JSON.stringify({ addresses: lanAddresses(), port }));
      }
      if (req.url === '/api/sessions') {
        // Sessions a tutor is running here (WebSocket rooms and HTTP rooms), for the home-page "join" bubble.
        const found = new Map((await listSessions(httpStore)).map((s) => [s.code, s]));
        for (const [code, room] of rooms) if (room.tutors.size && !found.has(code)) found.set(code, { code, students: room.students.size });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors });
        return void res.end(JSON.stringify({ sessions: [...found.values()] }));
      }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const response = await handleLive(new Request(`http://relay${req.url}`, { method: req.method, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }), httpStore);
      res.writeHead(response.status, { ...Object.fromEntries(response.headers), ...cors });
      return void res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (cfg.staticDir && req.url !== '/health' && serveStatic(cfg.staticDir, req, res)) return;
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    res.writeHead(426, { 'content-type': 'text/plain' });
    res.end('Bohrified live-session relay: connect with a WebSocket.\n');
  });

  const reject = (socket, status, text) => {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  };

  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url ?? '/', 'http://relay');
    const m = /^\/session\/([A-Z0-9]+)$/.exec(url.pathname);
    const key = req.headers['sec-websocket-key'];
    if (!m || !key || req.headers.upgrade?.toLowerCase() !== 'websocket') return reject(socket, 400, 'Bad Request');
    if (cfg.origins.length && !cfg.origins.includes(req.headers.origin ?? '')) return reject(socket, 403, 'Forbidden');

    socket.write(
      ['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${createHash('sha1').update(key + GUID).digest('base64')}`, '', ''].join('\r\n'),
    );
    socket.setNoDelay(true);
    // A client that vanishes mid-write must not take the relay down.
    socket.on('error', () => {});

    let closed = false;
    const conn = {
      send(text) {
        // A student who can't keep up misses frames (and resyncs on reconnect) rather than stalling everyone.
        if (closed || socket.writableLength > 32 * 1024 * 1024) return;
        socket.write(encodeFrame(0x1, Buffer.from(text)));
      },
      close(code, reason = '') {
        if (closed) return;
        closed = true;
        const body = Buffer.alloc(2 + Buffer.byteLength(reason));
        body.writeUInt16BE(code, 0);
        body.write(reason, 2);
        socket.end(encodeFrame(0x8, body));
      },
    };

    const code = m[1];
    const role = url.searchParams.get('role');
    const tutorKey = url.searchParams.get('key') ?? '';
    let room = rooms.get(code);
    const refuse = (c, why) => {
      // Parse nothing further; the client reads the close code and does not retry 44xx.
      conn.close(c, why);
    };

    if (!CODE.test(code) || (role !== 'tutor' && role !== 'student')) return refuse(CLOSE.BAD_REQUEST, 'bad request');
    if (role === 'tutor') {
      if (tutorKey.length < 8) return refuse(CLOSE.BAD_REQUEST, 'tutor key required');
      if (!room) {
        if (rooms.size >= cfg.maxRooms) return refuse(CLOSE.FULL, 'relay is full');
        room = { key: tutorKey, tutors: new Set(), students: new Set(), timer: null };
        rooms.set(code, room);
      } else if (room.key !== tutorKey) return refuse(CLOSE.FORBIDDEN, 'session belongs to another tutor');
      room.tutors.add(conn);
    } else {
      if (!room) return refuse(CLOSE.NOT_FOUND, 'no such session');
      if (room.students.size >= cfg.maxStudents) return refuse(CLOSE.FULL, 'session is full');
      room.students.add(conn);
    }
    clearTimeout(room.timer);
    peers(room);

    const leave = () => {
      if (!room) return;
      closed = true;
      room.tutors.delete(conn);
      room.students.delete(conn);
      peers(room);
      dropIfEmpty(code, room);
      room = undefined;
    };

    const parse = createParser({
      maxBytes: cfg.maxBytes,
      onError: (c) => {
        conn.close(c);
        leave();
      },
      onFrame: (opcode, payload) => {
        if (!room) return;
        if (opcode === 0x8) {
          conn.close(1000);
          return leave();
        }
        if (opcode === 0x9) return void (!closed && socket.write(encodeFrame(0xa, payload)));
        if (opcode === 0xa) return;
        if (opcode !== 0x1) return conn.close(1003);
        const text = payload.toString('utf8');
        if (role === 'tutor') {
          for (const s of room.students) s.send(text);
          // Other tutor windows of the same session (e.g. a reload) stay in step too.
          for (const t of room.tutors) if (t !== conn) t.send(text);
        } else {
          let type;
          try {
            type = JSON.parse(text)?.t;
          } catch {
            return;
          }
          if (STUDENT_MAY_SEND.has(type)) for (const t of room.tutors) t.send(text);
        }
      },
    });
    socket.on('data', (chunk) => {
      try {
        parse(chunk);
      } catch {
        conn.close(1011);
        leave();
      }
    });
    socket.on('close', leave);
    socket.on('error', leave);
  });

  return new Promise((resolve) => {
    server.listen(cfg.port, cfg.host, () => {
      const address = server.address();
      resolve({
        port: typeof address === 'object' && address ? address.port : cfg.port,
        rooms,
        close: () => new Promise((done) => {
          for (const room of rooms.values()) {
            clearTimeout(room.timer);
            for (const c of [...room.tutors, ...room.students]) c.close(1001, 'shutting down');
          }
          server.close(() => done());
          server.closeAllConnections?.();
        }),
      });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const relay = await startRelay();
  console.log(`Bohrified live-session relay listening on :${relay.port}`);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => relay.close().then(() => process.exit(0)));
}

/**
 * Live sessions over plain HTTP: the same tutor ↔ student messages as the
 * WebSocket relay (scripts/session-relay.mjs), carried by short requests so
 * they work on hosts that cannot hold a WebSocket open, such as Netlify.
 *
 *   POST /api/live/<CODE>   { role, key?, client, messages: [...] }   send
 *   GET  /api/live/<CODE>?role=&key=&client=&since=<cursor>           poll
 *   GET  /api/live/health
 *
 * Rules match the relay: the first tutor creates the room and its key (later
 * tutors must present it); students may only join an existing room and may
 * only send hello / viewer / bye. A poll returns the messages addressed to
 * the caller since `cursor`, plus how many tutors and students are present.
 *
 * Everything goes through a tiny async `store` so the same code runs on
 * Netlify Blobs (production), in memory (local relay, tests):
 *   get(key) → string | null · set(key, text) · delete(key) · list(prefix) → string[]
 */

export const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const STUDENT_MAY_SEND = new Set(['hello', 'viewer', 'bye']);
export const LIMITS = {
  /** Netlify Functions accept request bodies up to 6 MB. */
  maxBodyBytes: 4 * 1024 * 1024,
  /** Messages are only needed until every poller has seen them; snapshots are re-sent on `hello`. */
  messageTtlMs: 60_000,
  presenceTtlMs: 20_000,
  roomTtlMs: 10 * 60_000,
  maxStudents: 64,
  maxMessagesPerPoll: 500,
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fail = (status, error) => json(status, { error });

const pad = (n) => String(n).padStart(13, '0');
const rand = () => Math.random().toString(36).slice(2, 8);

/** In-memory store with the same shape as the Netlify Blobs adapter. */
export function memoryStore() {
  const map = new Map();
  return {
    map,
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async set(key, text) {
      map.set(key, text);
    },
    async delete(key) {
      map.delete(key);
    },
    async list(prefix) {
      return [...map.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

/** Adapt a Netlify Blobs store (`getStore({ consistency: 'strong' })`). */
export function blobsStore(store) {
  return {
    get: (key) => store.get(key, { type: 'text' }),
    set: (key, text) => store.set(key, text),
    delete: (key) => store.delete(key),
    async list(prefix) {
      const keys = [];
      for await (const page of store.list({ prefix, paginate: true })) for (const b of page.blobs) keys.push(b.key);
      return keys.sort();
    },
  };
}

/** Handle one request. `now` is injectable for tests. */
export async function handleLive(req, store, now = Date.now) {
  const url = new URL(req.url);
  const m = /\/api\/live\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return fail(404, 'not found');
  if (m[1] === 'health') return json(200, { ok: true, transport: 'http' });
  const code = m[1].toUpperCase();
  if (!CODE.test(code)) return fail(400, 'bad request');

  const room = `r/${code}`;
  let role;
  let key = '';
  let client;
  let messages = [];
  let since = null;
  if (req.method === 'POST') {
    const text = await req.text();
    if (text.length > LIMITS.maxBodyBytes) return fail(413, 'message too large');
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return fail(400, 'bad request');
    }
    ({ role, client } = body);
    key = typeof body.key === 'string' ? body.key : '';
    messages = Array.isArray(body.messages) ? body.messages : [];
  } else if (req.method === 'GET') {
    role = url.searchParams.get('role');
    key = url.searchParams.get('key') ?? '';
    client = url.searchParams.get('client');
    since = url.searchParams.get('since');
  } else return fail(405, 'method not allowed');
  if ((role !== 'tutor' && role !== 'student') || typeof client !== 'string' || !/^[a-z0-9]{6,32}$/i.test(client)) return fail(400, 'bad request');

  const t = now();
  let meta = JSON.parse((await store.get(`${room}/meta`)) ?? 'null');
  if (meta && t - meta.touched > LIMITS.roomTtlMs) {
    await dropRoom(store, room);
    meta = null;
  }
  if (role === 'tutor') {
    if (key.length < 8) return fail(400, 'tutor key required');
    if (!meta) meta = { key, created: t, touched: 0 };
    else if (meta.key !== key) return fail(403, 'session belongs to another tutor');
  } else if (!meta) return fail(404, 'no such session');
  if (t - meta.touched > 30_000) {
    meta.touched = t;
    await store.set(`${room}/meta`, JSON.stringify(meta));
  }

  // Presence: one small record per client, counted while recent.
  await store.set(`${room}/p/${role}/${client}`, String(t));
  const peers = await countPeers(store, room, t);
  if (role === 'student' && peers.students > LIMITS.maxStudents) {
    await store.delete(`${room}/p/student/${client}`);
    return fail(429, 'session is full');
  }

  if (req.method === 'POST') {
    const allowed = role === 'tutor' ? messages : messages.filter((x) => STUDENT_MAY_SEND.has(x?.t));
    if (allowed.length) {
      const inbox = role === 'tutor' ? 's' : 't';
      await store.set(`${room}/${inbox}/${pad(t)}-${rand()}`, JSON.stringify(allowed));
      await sweep(store, room, t);
    }
    return json(200, { ok: true, peers });
  }

  // Poll. A first poll (no cursor) starts "now": newcomers ask for a snapshot with `hello`.
  const inbox = role === 'tutor' ? 't' : 's';
  const cursor = since && /^\d{13}-[a-z0-9]*$/.test(since) ? since : `${pad(t)}-`;
  const out = [];
  let last = cursor;
  if (since) {
    for (const k of await store.list(`${room}/${inbox}/`)) {
      const id = k.slice(`${room}/${inbox}/`.length);
      if (id <= cursor) continue;
      const text = await store.get(k);
      if (text) for (const x of JSON.parse(text)) out.push(x);
      last = id;
      if (out.length >= LIMITS.maxMessagesPerPoll) break;
    }
  }
  return json(200, { cursor: last, messages: out, peers });
}

async function countPeers(store, room, t) {
  const count = async (role) => {
    let n = 0;
    for (const k of await store.list(`${room}/p/${role}/`)) {
      const at = Number(await store.get(k));
      if (t - at > LIMITS.presenceTtlMs) await store.delete(k);
      else n++;
    }
    return n;
  };
  return { tutors: await count('tutor'), students: await count('student') };
}

async function sweep(store, room, t) {
  for (const inbox of ['s', 't']) {
    for (const k of await store.list(`${room}/${inbox}/`)) {
      const at = Number(k.slice(`${room}/${inbox}/`.length, -7));
      if (t - at > LIMITS.messageTtlMs) await store.delete(k);
    }
  }
}

async function dropRoom(store, room) {
  for (const k of await store.list(`${room}/`)) await store.delete(k);
}

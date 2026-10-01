/**
 * Live-session relay tests: `node --test tests/relay.test.mjs`
 * Uses Node's built-in WebSocket client against a relay on a random port.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CLOSE, createParser, encodeFrame, startRelay } from '../scripts/session-relay.mjs';

let relay;
before(async () => {
  relay = await startRelay({ port: 0, host: '127.0.0.1', roomTtlMin: 0.001 });
});
after(() => relay.close());

const url = (code, role, key) => `ws://127.0.0.1:${relay.port}/session/${code}?role=${role}${key ? `&key=${key}` : ''}`;

/** Open a socket and collect everything it receives; resolves once open (or on early close). */
function client(code, role, key) {
  const ws = new WebSocket(url(code, role, key));
  const got = [];
  const out = { ws, got, closed: null, opened: false, next: null };
  const waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    got.push(m);
    waiters.splice(0).forEach((w) => w());
  };
  out.closedP = new Promise((res) => (ws.onclose = (e) => res((out.closed = e.code))));
  out.openP = new Promise((res) => {
    ws.onopen = () => res((out.opened = true));
    ws.onerror = () => {};
    ws.onclose = (e) => {
      out.closed = e.code;
      res(false);
      waiters.splice(0).forEach((w) => w());
    };
  });
  out.waitFor = async (pred, ms = 2000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hit = got.find(pred);
      if (hit) return hit;
      await new Promise((r) => { waiters.push(r); setTimeout(r, 50); });
    }
    throw new Error(`timed out; got ${JSON.stringify(got.map((g) => g.t))}`);
  };
  return out;
}
const KEY = 'tutorkey123';

describe('session relay', () => {
  it('refuses a student when no such session exists', async () => {
    const s = client('ABCDEF', 'student');
    await s.openP;
    await s.closedP;
    assert.equal(s.closed, CLOSE.NOT_FOUND);
  });

  it('rejects bad codes and missing roles or keys', async () => {
    for (const [code, role, key] of [['abc', 'tutor', KEY], ['ABCDEF', 'tutor', 'short'], ['ABCDEF', 'wizard', KEY]]) {
      const c = client(code, role, key);
      await c.openP;
      await c.closedP;
      assert.equal(c.closed, CLOSE.BAD_REQUEST, `${code}/${role}/${key}`);
    }
  });

  it('relays tutor messages to students and student hellos to the tutor', async () => {
    const t = client('K7QX2M', 'tutor', KEY);
    await t.openP;
    const s = client('K7QX2M', 'student');
    assert.equal(await s.openP, true);
    await t.waitFor((m) => m.t === 'peers' && m.students === 1);
    await s.waitFor((m) => m.t === 'peers' && m.tutors === 1 && m.students === 1);

    s.ws.send(JSON.stringify({ t: 'hello' }));
    await t.waitFor((m) => m.t === 'hello');
    t.ws.send(JSON.stringify({ t: 'snapshot', doc: { title: 'Chem' } }));
    const snap = await s.waitFor((m) => m.t === 'snapshot');
    assert.equal(snap.doc.title, 'Chem');

    // Students can't write to the board or talk to each other.
    const s2 = client('K7QX2M', 'student');
    await s2.openP;
    s.ws.send(JSON.stringify({ t: 'op', op: { evil: true } }));
    s.ws.send(JSON.stringify({ t: 'snapshot', doc: { title: 'Hacked' } }));
    s.ws.send(JSON.stringify({ t: 'viewer', id: 'one' }));
    await t.waitFor((m) => m.t === 'viewer' && m.id === 'one');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(t.got.some((m) => m.t === 'op' || m.t === 'snapshot'), false, 'tutor must not receive student ops');
    assert.equal(s2.got.some((m) => m.t === 'op' || m.t === 'snapshot' || m.t === 'viewer'), false, 'students must not hear each other');

    // Leaving updates everyone's peer count.
    s2.ws.close();
    await t.waitFor((m) => m.t === 'peers' && m.students === 1 && t.got.filter((x) => x.t === 'peers').length > 2);
    t.ws.close();
    s.ws.close();
  });

  it('only lets the same tutor key back into a room', async () => {
    const a = client('ZZZZZZ', 'tutor', KEY);
    await a.openP;
    const intruder = client('ZZZZZZ', 'tutor', 'differentkey1');
    await intruder.openP;
    await intruder.closedP;
    assert.equal(intruder.closed, CLOSE.FORBIDDEN);
    const again = client('ZZZZZZ', 'tutor', KEY);
    assert.equal(await again.openP, true);
    a.ws.close();
    again.ws.close();
  });

  it('carries large whiteboards', async () => {
    const t = client('BIGBIG', 'tutor', KEY);
    await t.openP;
    const s = client('BIGBIG', 'student');
    await s.openP;
    const big = 'x'.repeat(3 * 1024 * 1024);
    t.ws.send(JSON.stringify({ t: 'snapshot', doc: { big } }));
    const got = await s.waitFor((m) => m.t === 'snapshot', 5000);
    assert.equal(got.doc.big.length, big.length);
    t.ws.close();
    s.ws.close();
  });

  it('forgets an empty room after its time to live', async () => {
    const t = client('GONEGO', 'tutor', KEY);
    await t.openP;
    assert.ok(relay.rooms.has('GONEGO'));
    t.ws.close();
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(relay.rooms.has('GONEGO'), false);
    const s = client('GONEGO', 'student');
    await s.openP;
    await s.closedP;
    assert.equal(s.closed, CLOSE.NOT_FOUND);
  });

  it('reports health', async () => {
    const res = await fetch(`http://127.0.0.1:${relay.port}/health`);
    assert.equal((await res.json()).ok, true);
  });
});

describe('origin allow-list', () => {
  it('refuses connections from other origins', async () => {
    const locked = await startRelay({ port: 0, host: '127.0.0.1', origins: 'https://bohrified.example' });
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${locked.port}/session/ABCDEF?role=tutor&key=${KEY}`);
      const opened = await new Promise((res) => {
        ws.onopen = () => res(true);
        ws.onerror = () => res(false);
        ws.onclose = () => res(false);
      });
      assert.equal(opened, false);
    } finally {
      await locked.close();
    }
  });
});

describe('frame parser', () => {
  const mask = [1, 2, 3, 4];
  const frame = (opcode, text, { fin = true, masked = true } = {}) => {
    const p = Buffer.from(text);
    const body = Buffer.alloc(p.length);
    for (let i = 0; i < p.length; i++) body[i] = p[i] ^ mask[i & 3];
    const head = p.length < 126 ? [(fin ? 0x80 : 0) | opcode, (masked ? 0x80 : 0) | p.length] : [(fin ? 0x80 : 0) | opcode, (masked ? 0x80 : 0) | 126, p.length >> 8, p.length & 255];
    return Buffer.concat([Buffer.from(head), masked ? Buffer.from(mask) : Buffer.alloc(0), masked ? body : p]);
  };
  const run = (chunks, maxBytes = 1000) => {
    const frames = [];
    const errors = [];
    const parse = createParser({ maxBytes, onFrame: (o, p) => frames.push([o, p.toString()]), onError: (c) => errors.push(c) });
    chunks.forEach(parse);
    return { frames, errors };
  };
  it('decodes masked text frames split across chunks', () => {
    const f = frame(1, 'hello world');
    const { frames } = run([f.subarray(0, 3), f.subarray(3, 9), f.subarray(9)]);
    assert.deepEqual(frames, [[1, 'hello world']]);
  });
  it('joins fragmented messages and allows pings between them', () => {
    const { frames } = run([frame(1, 'ab', { fin: false }), frame(9, 'p'), frame(0, 'cd')]);
    assert.deepEqual(frames, [[9, 'p'], [1, 'abcd']]);
  });
  it('handles 16-bit lengths and back-to-back frames', () => {
    const long = 'y'.repeat(300);
    const { frames } = run([Buffer.concat([frame(1, long), frame(1, 'z')])], 10_000);
    assert.equal(frames.length, 2);
    assert.equal(frames[0][1].length, 300);
  });
  it('rejects unmasked, oversized and misordered frames', () => {
    assert.deepEqual(run([frame(1, 'x', { masked: false })]).errors, [1002]);
    assert.deepEqual(run([frame(1, 'x'.repeat(200))], 100).errors, [1009]);
    assert.deepEqual(run([frame(0, 'orphan')]).errors, [1002]);
    assert.deepEqual(run([frame(1, 'a', { fin: false }), frame(1, 'b')]).errors, [1002]);
  });
  it('encodes server frames with the right length form', () => {
    assert.equal(encodeFrame(1, Buffer.alloc(5)).length, 7);
    assert.equal(encodeFrame(1, Buffer.alloc(300)).length, 304);
    assert.equal(encodeFrame(1, Buffer.alloc(70000)).length, 70010);
  });
});

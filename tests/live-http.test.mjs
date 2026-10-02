/**
 * Live sessions over HTTP (the Netlify path): `node --test tests/live-http.test.mjs`
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleLive, memoryStore, LIMITS } from '../netlify/lib/live-core.mjs';

const KEY = 'tutorkey123';
function setup() {
  const store = memoryStore();
  let t = 1_700_000_000_000;
  const clock = { tick: (ms) => (t += ms) };
  const call = async (method, code, { query = {}, body } = {}) => {
    const q = new URLSearchParams(query);
    const res = await handleLive(new Request(`https://x.test/api/live/${code}${q.size ? `?${q}` : ''}`, { method, body: body ? JSON.stringify(body) : undefined }), store, () => t);
    return { status: res.status, body: await res.json() };
  };
  const poll = (code, role, client, since, key) => call('GET', code, { query: { role, client, ...(since ? { since } : {}), ...(key ? { key } : {}) } });
  const send = (code, role, client, messages, key) => call('POST', code, { body: { role, client, messages, key } });
  return { store, clock, poll, send };
}

describe('live sessions over HTTP', () => {
  it('health', async () => {
    const { call } = { call: (await import('../netlify/lib/live-core.mjs')).handleLive };
    const res = await call(new Request('https://x.test/api/live/health'), memoryStore());
    assert.equal((await res.json()).ok, true);
  });

  it('tutor creates the room; students need it to exist', async () => {
    const s = setup();
    assert.equal((await s.poll('K7QX2M', 'student', 'stud0001')).status, 404);
    const first = await s.poll('K7QX2M', 'tutor', 'tutor001', null, KEY);
    assert.equal(first.status, 200);
    assert.equal(first.body.peers.tutors, 1);
    assert.equal((await s.poll('K7QX2M', 'student', 'stud0001')).status, 200);
  });

  it('rejects a second tutor with a different key and short keys', async () => {
    const s = setup();
    await s.poll('K7QX2M', 'tutor', 'tutor001', null, KEY);
    assert.equal((await s.poll('K7QX2M', 'tutor', 'tutor002', null, 'someotherkey')).status, 403);
    assert.equal((await s.poll('ABCDEF', 'tutor', 'tutor001', null, 'short')).status, 400);
    assert.equal((await s.poll('NOPE', 'tutor', 'tutor001', null, KEY)).status, 400);
  });

  it('delivers tutor messages to students in order, only once', async () => {
    const s = setup();
    await s.poll('K7QX2M', 'tutor', 'tutor001', null, KEY);
    const a = await s.poll('K7QX2M', 'student', 'stud0001');
    s.clock.tick(10);
    await s.send('K7QX2M', 'tutor', 'tutor001', [{ t: 'one' }, { t: 'two' }], KEY);
    s.clock.tick(10);
    await s.send('K7QX2M', 'tutor', 'tutor001', [{ t: 'three' }], KEY);
    const b = await s.poll('K7QX2M', 'student', 'stud0001', a.body.cursor);
    assert.deepEqual(b.body.messages.map((m) => m.t), ['one', 'two', 'three']);
    const c = await s.poll('K7QX2M', 'student', 'stud0001', b.body.cursor);
    assert.deepEqual(c.body.messages, []);
    assert.equal(c.body.peers.students, 1);
  });

  it('a new student does not replay old messages', async () => {
    const s = setup();
    await s.poll('K7QX2M', 'tutor', 'tutor001', null, KEY);
    await s.send('K7QX2M', 'tutor', 'tutor001', [{ t: 'old' }], KEY);
    s.clock.tick(5);
    const joined = await s.poll('K7QX2M', 'student', 'stud0002');
    assert.deepEqual(joined.body.messages, []);
  });

  it('students may only send hello / viewer / bye, and only the tutor hears them', async () => {
    const s = setup();
    const t0 = await s.poll('K7QX2M', 'tutor', 'tutor001', null, KEY);
    await s.poll('K7QX2M', 'student', 'stud0001');
    s.clock.tick(5);
    await s.send('K7QX2M', 'student', 'stud0001', [{ t: 'hello' }, { t: 'op', evil: 1 }, { t: 'viewer', x: 1 }]);
    const got = await s.poll('K7QX2M', 'tutor', 'tutor001', t0.body.cursor, KEY);
    assert.deepEqual(got.body.messages.map((m) => m.t), ['hello', 'viewer']);
    const other = await s.poll('K7QX2M', 'student', 'stud0001', t0.body.cursor);
    assert.deepEqual(other.body.messages, []);
  });

  it('counts peers and forgets those who stop polling', async () => {
    const s = setup();
    await s.poll('K7QX2M', 'tutor', 'tutor001', null, KEY);
    await s.poll('K7QX2M', 'student', 'stud0001');
    await s.poll('K7QX2M', 'student', 'stud0002');
    assert.equal((await s.poll('K7QX2M', 'tutor', 'tutor001', null, KEY)).body.peers.students, 2);
    s.clock.tick(LIMITS.presenceTtlMs + 1000);
    assert.equal((await s.poll('K7QX2M', 'tutor', 'tutor001', null, KEY)).body.peers.students, 0);
  });

  it('sweeps old messages and expires idle rooms', async () => {
    const s = setup();
    await s.poll('K7QX2M', 'tutor', 'tutor001', null, KEY);
    await s.send('K7QX2M', 'tutor', 'tutor001', [{ t: 'a' }], KEY);
    s.clock.tick(LIMITS.messageTtlMs + 1000);
    await s.send('K7QX2M', 'tutor', 'tutor001', [{ t: 'b' }], KEY);
    assert.equal([...s.store.map.keys()].filter((k) => k.includes('/s/')).length, 1);
    s.clock.tick(LIMITS.roomTtlMs + 1000);
    assert.equal((await s.poll('K7QX2M', 'student', 'stud0001')).status, 404);
  });

  it('refuses oversized bodies and bad methods', async () => {
    const s = setup();
    await s.poll('K7QX2M', 'tutor', 'tutor001', null, KEY);
    const big = await s.send('K7QX2M', 'tutor', 'tutor001', ['x'.repeat(LIMITS.maxBodyBytes + 1)], KEY);
    assert.equal(big.status, 413);
    const res = await handleLive(new Request('https://x.test/api/live/K7QX2M', { method: 'DELETE' }), s.store);
    assert.equal(res.status, 405);
  });
});

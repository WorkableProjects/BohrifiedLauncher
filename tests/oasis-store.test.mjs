import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOasisStore } from '../scripts/oasis-store.mjs';

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const TOKEN = 'a'.repeat(64), OTHER = 'b'.repeat(64);
const sealed = (ct = 'Y2lwaGVy') => ({ v: 1, salt: 'c2FsdA==', iter: 250000, iv: 'aXY=', ct });

async function boot(opts = {}) {
  const store = createOasisStore({ debounceMs: 20, backoffMs: [10, 10], log: () => {}, ...opts });
  const server = createServer((req, res) => store.handle(req, res).then((d) => d || (res.writeHead(404), res.end())));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/oasis`;
  const call = (path, init = {}) => fetch(base + path, { ...init, headers: { 'x-oasis': '1', ...(init.headers ?? {}) } });
  const put = (tutor, body, { token = TOKEN, rev = 0 } = {}) => call(`/data/${tutor}`, { method: 'PUT', headers: { 'x-oasis-token': token, 'x-oasis-base': String(rev), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await store.ready();
  return { store, server, call, put, close: async () => { await store.close(); server.closeAllConnections(); server.close(); } };
}
const remote = () => { const d = mkdtempSync(join(tmpdir(), 'oasis-remote-')); git(d, 'init', '-q', '--bare', '-b', 'oasis-data'); return d; };

test('saves, versions and protects each tutor file', async () => {
  const t = await boot({ dataDir: mkdtempSync(join(tmpdir(), 'oasis-')), sync: false });
  assert.equal((await t.call('/data/caden')).status, 404);
  let r = await t.put('caden', sealed()); assert.equal(r.status, 200); assert.equal((await r.json()).rev, 1);
  const got = await (await t.call('/data/caden')).json();
  assert.equal(got.rev, 1); assert.equal(got.ct, 'Y2lwaGVy'); assert.equal(got.auth, undefined, 'token hash is not exposed');
  assert.equal((await t.put('caden', sealed('bmV3'), { token: OTHER, rev: 1 })).status, 403, 'wrong password');
  assert.equal((await t.put('caden', sealed('bmV3'), { rev: 0 })).status, 409, 'stale base');
  r = await t.put('caden', sealed('bmV3'), { rev: 1 }); assert.equal((await r.json()).rev, 2);
  assert.equal((await t.put('jayden', sealed(), { token: OTHER })).status, 200, 'tutors are independent');
  assert.deepEqual(await (await t.call('/data/caden/meta')).json().then((m) => m.rev), 2);
  await t.close();
});

test('rejects bad requests', async () => {
  const t = await boot({ dataDir: mkdtempSync(join(tmpdir(), 'oasis-')), sync: false });
  assert.equal((await t.put('..%2Fx', sealed())).status, 404);
  assert.equal((await t.put('Caden', sealed())).status, 404, 'tutor ids are lowercase');
  assert.equal((await t.put('caden', { ...sealed(), iter: 5 })).status, 400);
  assert.equal((await t.put('caden', { ...sealed(), ct: '<script>' })).status, 400);
  assert.equal((await t.put('caden', sealed(), { token: 'zz' })).status, 400);
  const base = `http://127.0.0.1:${t.server.address().port}/api/oasis`;
  assert.equal((await fetch(base + '/status')).status, 400, 'custom header required');
  assert.equal((await fetch(base + '/status', { headers: { 'x-oasis': '1', origin: 'https://evil.example' } })).status, 403, 'cross-origin refused');
  assert.equal((await t.call('/status')).status, 200);
  await t.close();
});

test('pushes encrypted files to the remote and another computer receives them', async () => {
  const bare = remote();
  const a = await boot({ dataDir: mkdtempSync(join(tmpdir(), 'oasis-a-')), remote: bare });
  assert.equal((await a.put('caden', sealed('Y2xhc3M='))).status, 200);
  const s = await (await a.call('/sync', { method: 'POST' })).json();
  assert.equal(s.sync.state, 'idle', s.sync.message);
  assert.match(git(bare, 'log', '--oneline', 'oasis-data'), /OASIS data/);
  assert.ok(git(bare, 'show', 'oasis-data:caden.oasis.json').includes('Y2xhc3M='));
  assert.ok(!git(bare, 'show', 'oasis-data:caden.oasis.json').includes('"auth":"' + TOKEN), 'only a hash of the token is stored');

  const b = await boot({ dataDir: mkdtempSync(join(tmpdir(), 'oasis-b-')), remote: bare });
  const got = await (await b.call('/data/caden')).json();
  assert.equal(got.ct, 'Y2xhc3M=', 'a new computer starts from GitHub');
  // b edits, a syncs and gets it
  assert.equal((await b.put('caden', sealed('Yg=='), { rev: got.rev })).status, 200);
  await b.call('/sync', { method: 'POST' });
  await a.call('/sync', { method: 'POST' });
  assert.equal((await (await a.call('/data/caden')).json()).ct, 'Yg==');
  await a.close(); await b.close();
});

test('autosyncs after a quiet moment, and merges different tutors edited on two computers', async () => {
  const bare = remote();
  const a = await boot({ dataDir: mkdtempSync(join(tmpdir(), 'oasis-a-')), remote: bare });
  const b = await boot({ dataDir: mkdtempSync(join(tmpdir(), 'oasis-b-')), remote: bare });
  await a.put('caden', sealed('QQ=='));
  await b.put('jayden', sealed('Qg=='), { token: OTHER });
  await a.store.sync(); await b.store.sync(); await a.store.sync();
  assert.equal(a.store.status.state, 'idle', a.store.status.message);
  assert.ok(existsSync(join(a.store.dataDir, 'jayden.oasis.json')) && existsSync(join(b.store.dataDir, 'caden.oasis.json')));
  await a.put('caden', sealed('QQE='), { rev: 1 });
  for (let i = 0; i < 60 && !git(bare, 'show', 'oasis-data:caden.oasis.json').includes('QQE='); i++) await new Promise((r) => setTimeout(r, 100)); // debounce, then push
  assert.ok(git(bare, 'show', 'oasis-data:caden.oasis.json').includes('QQE='), 'autosync pushed');
  await a.close(); await b.close();
});

test('reports a conflict instead of overwriting when one tutor file diverges', async () => {
  const bare = remote();
  const a = await boot({ dataDir: mkdtempSync(join(tmpdir(), 'oasis-a-')), remote: bare });
  await a.put('caden', sealed('QQ==')); await a.store.sync();
  const b = await boot({ dataDir: mkdtempSync(join(tmpdir(), 'oasis-b-')), remote: bare });
  await a.put('caden', sealed('QUE='), { rev: 1 }); await a.store.sync();
  await b.put('caden', sealed('QkI='), { rev: 1 });
  const s = await (await b.call('/sync', { method: 'POST' })).json();
  assert.equal(s.sync.state, 'conflict'); assert.match(s.sync.message, /same tutor file/);
  assert.equal((await (await b.call('/data/caden')).json()).ct, 'QkI=', 'local file is untouched');
  await a.close(); await b.close();
});

test('works with no GitHub remote', async () => {
  const t = await boot({ dataDir: mkdtempSync(join(tmpdir(), 'oasis-')), repoDir: mkdtempSync(join(tmpdir(), 'norepo-')) });
  await t.put('caden', sealed());
  const s = await (await t.call('/sync', { method: 'POST' })).json();
  assert.equal(s.sync.enabled, false); assert.equal((await t.call('/data/caden')).status, 200);
  await t.close();
});

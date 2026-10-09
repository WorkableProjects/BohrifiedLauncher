/**
 * OASIS data store: when OASIS runs locally (npm run dev / npm run serve), each tutor's data lives
 * in one encrypted file, and every change is committed and pushed to GitHub.
 *
 *   <dataDir>/<tutor>.oasis.json   AES-256-GCM ciphertext. The key comes from the tutor's password in
 *                                  the browser (PBKDF2), so this server and GitHub only ever see
 *                                  ciphertext, and each tutor's file opens only with their own password.
 *
 * <dataDir> (default .oasis-data/) is its own small git repository on the branch `oasis-data`, with the
 * same `origin` as this project, so data history never mixes with the code's history.
 *
 * HTTP (all under /api/oasis, loopback only unless OASIS_ALLOW_LAN=1, custom header required):
 *   GET  /status               { ok, sync: { enabled, state, last, message, branch } }
 *   GET  /data/<tutor>         the encrypted file, 404 if none yet
 *   GET  /data/<tutor>/meta    { rev, updated }
 *   PUT  /data/<tutor>         save; needs x-oasis-token (proves the password) and x-oasis-base (rev being replaced)
 *   POST /sync                 commit, pull and push now
 *
 * Environment: OASIS_SYNC=off (keep files local), OASIS_BRANCH, OASIS_DATA_DIR, OASIS_REMOTE (git URL),
 * OASIS_ALLOW_LAN=1.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TUTOR = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function validateSealed(b, maxBytes) {
  if (!b || typeof b !== 'object' || b.v !== 1) return 'Unsupported file version.';
  for (const k of ['salt', 'iv', 'ct']) if (typeof b[k] !== 'string' || !b[k] || !B64.test(b[k])) return `Bad ${k}.`;
  if (b.salt.length > 64 || b.iv.length > 32) return 'Bad header.';
  if (b.ct.length > maxBytes) return 'Data too large.';
  if (!Number.isInteger(b.iter) || b.iter < 100_000 || b.iter > 2_000_000) return 'Bad iteration count.';
  return '';
}

export function createOasisStore(opts = {}) {
  const repoDir = resolve(opts.repoDir ?? '.');
  const dataDir = resolve(opts.dataDir ?? process.env.OASIS_DATA_DIR ?? join(repoDir, '.oasis-data'));
  const branch = opts.branch ?? process.env.OASIS_BRANCH ?? 'oasis-data';
  const syncOn = opts.sync ?? process.env.OASIS_SYNC !== 'off';
  const allowLan = opts.allowLan ?? process.env.OASIS_ALLOW_LAN === '1';
  const debounceMs = opts.debounceMs ?? 8000;
  const backoff = opts.backoffMs ?? [2000, 4000, 8000, 16000];
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
  const log = opts.log ?? ((m) => console.log(`[oasis] ${m}`));

  const status = { enabled: syncOn, state: syncOn ? 'starting' : 'off', last: 0, message: syncOn ? '' : 'GitHub sync is off (OASIS_SYNC=off).', branch };

  const git = (args, cwd = dataDir) => new Promise((ok, fail) => {
    execFile('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { err.stderr = String(stderr || ''); err.message = `git ${args[0]}: ${(String(stderr).trim() || err.message).slice(0, 300)}`; fail(err); } else ok(String(stdout));
    });
  });
  const tryGit = (args, cwd) => git(args, cwd).then(() => true, () => false);

  mkdirSync(dataDir, { recursive: true });
  const fileOf = (tutor) => join(dataDir, `${tutor}.oasis.json`);
  const readFile = (tutor) => { try { return JSON.parse(readFileSync(fileOf(tutor), 'utf8')); } catch { return null; } };

  // ---- git ----
  async function prepare() {
    if (!syncOn) return;
    if (!existsSync(join(dataDir, '.git'))) await git(['init', '-q', '-b', branch]);
    await git(['config', 'user.name', 'OASIS']); await git(['config', 'user.email', 'oasis@localhost']); await git(['config', 'commit.gpgsign', 'false']);
    let url = opts.remote ?? process.env.OASIS_REMOTE;
    if (!url) { try { url = (await git(['remote', 'get-url', 'origin'], repoDir)).trim(); } catch { url = ''; } }
    if (!url) { status.enabled = false; status.state = 'off'; status.message = 'No GitHub remote: this project has no "origin".'; return; }
    if (!(await tryGit(['remote', 'set-url', 'origin', url]))) await git(['remote', 'add', 'origin', url]);
    await pullRemote().catch((e) => { if (e.conflict) throw e; });
    status.state = 'idle';
  }
  // Brings in what other computers pushed. First run on a fresh data dir adopts the remote's files.
  async function pullRemote() {
    if (!(await tryGit(['fetch', '-q', 'origin', branch]))) return; // no remote branch yet (or offline): nothing to pull
    if (!(await tryGit(['rev-parse', '--verify', '-q', 'HEAD']))) { await git(['reset', '-q', '--hard', `origin/${branch}`]); return; }
    try { await git(['merge', '-q', '--no-edit', '--allow-unrelated-histories', '-m', 'OASIS: merge data from GitHub', `origin/${branch}`]); }
    catch (e) { await tryGit(['merge', '--abort']); const err = new Error('Two computers changed the same tutor file. Pick one in .oasis-data/ (or restore from GitHub) and sync again.'); err.conflict = true; throw err; }
  }

  let ready = prepare().catch((e) => { status.state = e.conflict ? 'conflict' : 'error'; status.message = e.message; log(`sync setup failed: ${e.message}`); });
  let chain = Promise.resolve(), timer = null, queued = false;
  const runSync = () => {
    chain = chain.then(async () => {
      await ready;
      if (!status.enabled) return;
      queued = false; status.state = 'syncing'; status.message = '';
      try {
        await git(['add', '-A']);
        if ((await git(['status', '--porcelain'])).trim()) await git(['commit', '-q', '-m', `OASIS data ${new Date().toISOString()}`]);
        await pullRemote().catch((e) => { if (e.conflict) throw e; });
        for (let i = 0; ; i++) {
          try { await git(['push', '-q', 'origin', `HEAD:refs/heads/${branch}`]); break; }
          catch (e) {
            if (i >= backoff.length) throw e;
            await sleep(backoff[i]);
            await pullRemote().catch((x) => { if (x.conflict) throw x; });
          }
        }
        status.state = 'idle'; status.last = Date.now();
      } catch (e) { status.state = e.conflict ? 'conflict' : 'error'; status.message = e.message; log(`sync failed: ${e.message}`); }
    });
    return chain;
  };
  const schedule = () => {
    if (!syncOn || !status.enabled) return;
    queued = true; status.state = status.state === 'syncing' ? 'syncing' : 'pending'; clearTimeout(timer);
    timer = setTimeout(runSync, debounceMs); timer.unref?.();
  };

  // ---- http ----
  const send = (res, code, body) => { const s = JSON.stringify(body); res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(s); };
  const readBody = (req) => new Promise((ok, fail) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > maxBytes + 4096) { fail(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
  const sameToken = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

  /** @returns {Promise<boolean>} true if the request was an OASIS API call (and has been answered). */
  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/api/oasis/')) return false;
    if (!allowLan && !LOOPBACK.has(req.socket.remoteAddress ?? '')) return send(res, 403, { error: 'OASIS storage is available on the computer running it only.' }), true;
    if (!req.headers['x-oasis']) return send(res, 400, { error: 'Missing x-oasis header.' }), true;
    if (req.headers.origin) { let h = ''; try { h = new URL(req.headers.origin).host; } catch {} if (h !== req.headers.host) return send(res, 403, { error: 'Cross-origin request refused.' }), true; }
    const parts = url.pathname.slice('/api/oasis/'.length).split('/');
    try {
      if (parts[0] === 'status' && req.method === 'GET') return send(res, 200, { ok: true, sync: { ...status } }), true;
      if (parts[0] === 'sync' && req.method === 'POST') { clearTimeout(timer); await runSync(); return send(res, 200, { ok: true, sync: { ...status } }), true; }
      if (parts[0] === 'data' && TUTOR.test(parts[1] ?? '')) {
        const tutor = parts[1], cur = readFile(tutor);
        if (req.method === 'GET' && parts[2] === 'meta') return cur ? send(res, 200, { rev: cur.rev, updated: cur.updated }) : send(res, 404, { error: 'No data file yet.' }), true;
        if (req.method === 'GET' && !parts[2]) { if (!cur) return send(res, 404, { error: 'No data file yet.' }), true; const { auth: _a, ...pub } = cur; return send(res, 200, pub), true; }
        if (req.method === 'PUT' && !parts[2]) {
          const token = String(req.headers['x-oasis-token'] ?? ''), base = Number(req.headers['x-oasis-base']);
          if (!/^[0-9a-f]{64}$/.test(token) || !Number.isInteger(base)) return send(res, 400, { error: 'Missing credentials.' }), true;
          let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'Too large.' : 'Bad JSON.' }), true; }
          const bad = validateSealed(body, maxBytes); if (bad) return send(res, 400, { error: bad }), true;
          if (cur && !sameToken(sha256(token), cur.auth)) return send(res, 403, { error: 'Wrong password for this data file.' }), true;
          if (base !== (cur ? cur.rev : 0)) return send(res, 409, { error: 'The data file changed since you opened it.', rev: cur ? cur.rev : 0 }), true;
          const rev = (cur ? cur.rev : 0) + 1;
          const file = { v: 1, tutor, salt: body.salt, iter: body.iter, iv: body.iv, ct: body.ct, auth: sha256(token), rev, updated: new Date().toISOString() };
          const tmp = fileOf(tutor) + '.tmp'; writeFileSync(tmp, JSON.stringify(file)); renameSync(tmp, fileOf(tutor));
          schedule();
          return send(res, 200, { ok: true, rev }), true;
        }
      }
      return send(res, 404, { error: 'Not found.' }), true;
    } catch (e) { return send(res, 500, { error: 'Storage error.' }), true; }
  }

  return { handle, status, dataDir, ready: () => ready, sync: runSync, close: async () => { clearTimeout(timer); if (queued) await runSync(); else await chain; } };
}

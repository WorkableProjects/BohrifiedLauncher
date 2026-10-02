import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module shared with the Netlify Function
import { handleLive, memoryStore } from '../../../../netlify/lib/live-core.mjs';
import { CLOSE_NOT_FOUND, pollTransport, type LinkStatus, type Transport } from './transport';

/** The HTTP protocol served in-process, so the client and the Netlify handler are tested together. */
const serve = (store: unknown) => ((url: string, init?: RequestInit) => handleLive(new Request(url, init), store)) as unknown as typeof fetch;
const wait = (cond: () => boolean, ms = 3000) =>
  new Promise<void>((res, rej) => {
    const start = Date.now();
    const tick = () => (cond() ? res() : Date.now() - start > ms ? rej(new Error('timed out')) : setTimeout(tick, 10));
    tick();
  });
const fast = { pollMs: 15, idlePollMs: 30, flushMs: 5 };

type Msg = { t: string; [k: string]: unknown };
let open: Transport<Msg>[] = [];
const make = (store: unknown, code: string, role: 'tutor' | 'student', key?: string) => {
  const tr = pollTransport<Msg>({ url: 'https://x.test/api/live', code, role, key, fetchImpl: serve(store), ...fast });
  const got: Msg[] = [];
  const statuses: LinkStatus[] = [];
  tr.onMessage((m) => got.push(m));
  const details: string[] = [];
  tr.onStatus((s, d) => (statuses.push(s), d && details.push(d)));
  open.push(tr);
  return { tr, got, statuses, details };
};

beforeEach(() => {
  (globalThis as { window?: unknown }).window = globalThis;
});
afterEach(() => {
  open.forEach((t) => t.close());
  open = [];
});

describe('pollTransport', () => {
  it('carries messages both ways and reports peers', async () => {
    const store = memoryStore();
    const tutor = make(store, 'K7QX2M', 'tutor', 'tutorkey123');
    await wait(() => tutor.tr.status === 'open');
    const student = make(store, 'K7QX2M', 'student');
    await wait(() => student.tr.status === 'open');
    await wait(() => tutor.got.some((m) => m.t === 'peers' && m.students === 1));

    student.tr.send({ t: 'hello' });
    await wait(() => tutor.got.some((m) => m.t === 'hello'));
    tutor.tr.send({ t: 'snapshot', n: 1 });
    tutor.tr.send({ t: 'op', n: 2 });
    await wait(() => student.got.filter((m) => m.t === 'snapshot' || m.t === 'op').length === 2);
    expect(student.got.filter((m) => m.t !== 'peers').map((m) => m.t)).toEqual(['snapshot', 'op']);
  });

  it('a student cannot send board operations', async () => {
    const store = memoryStore();
    const tutor = make(store, 'K7QX2M', 'tutor', 'tutorkey123');
    await wait(() => tutor.tr.status === 'open');
    const student = make(store, 'K7QX2M', 'student');
    await wait(() => student.tr.status === 'open');
    student.tr.send({ t: 'op', evil: true });
    student.tr.send({ t: 'viewer' });
    await wait(() => tutor.got.some((m) => m.t === 'viewer'));
    expect(tutor.got.some((m) => m.t === 'op')).toBe(false);
  });

  it('refuses a student for a session that does not exist', async () => {
    const student = make(memoryStore(), 'K7QX2M', 'student');
    await wait(() => student.tr.status === 'refused');
    expect(student.statuses.at(-1)).toBe('refused');
    expect(student.details).toEqual([String(CLOSE_NOT_FOUND)]);
  });

  it('recovers after a failed request and reports reconnecting then open', async () => {
    const store = memoryStore();
    let down = false;
    const flaky = ((url: string, init?: RequestInit) => (down ? Promise.reject(new Error('offline')) : handleLive(new Request(url, init), store))) as unknown as typeof fetch;
    const tr = pollTransport<Msg>({ url: 'https://x.test/api/live', code: 'K7QX2M', role: 'tutor', key: 'tutorkey123', fetchImpl: flaky, ...fast });
    open.push(tr);
    const statuses: LinkStatus[] = [];
    tr.onStatus((s) => statuses.push(s));
    await wait(() => tr.status === 'open');
    down = true;
    await wait(() => tr.status === 'reconnecting');
    down = false;
    await wait(() => tr.status === 'open', 6000);
    expect(statuses).toContain('reconnecting');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOSE_FULL, CLOSE_NOT_FOUND, PEER_CHUNK, peerTransport, type DataConnLike, type PeerFactory, type PeerLike, type Transport } from './transport';

type Fn = (...a: any[]) => void;
class Emitter {
  private fns = new Map<string, Fn[]>();
  on(ev: string, fn: Fn) {
    this.fns.set(ev, [...(this.fns.get(ev) ?? []), fn]);
  }
  emit(ev: string, ...a: unknown[]) {
    for (const fn of this.fns.get(ev) ?? []) fn(...a);
  }
}

/** An in-memory stand-in for the PeerJS signalling server and data channels. */
function network() {
  const peers = new Map<string, FakePeer>();
  let n = 0;
  class FakeConn extends Emitter implements DataConnLike {
    open = false;
    other!: FakeConn;
    constructor(public metadata?: unknown) {
      super();
    }
    send(d: unknown) {
      const copy = JSON.parse(JSON.stringify(d));
      queueMicrotask(() => this.other.open && this.other.emit('data', copy));
    }
    close() {
      if (!this.open) return;
      this.open = this.other.open = false;
      this.emit('close');
      this.other.emit('close');
    }
  }
  class FakePeer extends Emitter implements PeerLike {
    disconnected = false;
    destroyed = false;
    conns: FakeConn[] = [];
    constructor(public id: string) {
      super();
      queueMicrotask(() => {
        if (peers.has(id)) return this.emit('error', { type: 'unavailable-id' });
        peers.set(id, this);
        this.emit('open', id);
      });
    }
    connect(id: string, o?: { metadata?: unknown }) {
      const a = new FakeConn(o?.metadata);
      queueMicrotask(() => {
        const host = peers.get(id);
        if (!host) return this.emit('error', { type: 'peer-unavailable' });
        const b = new FakeConn(o?.metadata);
        a.other = b;
        b.other = a;
        this.conns.push(a);
        host.conns.push(b);
        host.emit('connection', b);
        a.open = b.open = true;
        b.emit('open');
        a.emit('open');
      });
      return a;
    }
    reconnect() {}
    destroy() {
      this.destroyed = true;
      if (peers.get(this.id) === this) peers.delete(this.id);
      for (const c of this.conns) c.close();
    }
  }
  const create: PeerFactory = (id) => new FakePeer(id ?? `anon-${n++}`);
  return { create, peers };
}

const tick = () => new Promise((r) => setTimeout(r, 5));
type Msg = { t: string; [k: string]: unknown };
const collect = (t: Transport<Msg>) => {
  const got: Msg[] = [];
  t.onMessage((m) => got.push(m));
  return got;
};

describe('peerTransport', () => {
  const open: Transport<Msg>[] = [];
  afterEach(() => open.splice(0).forEach((t) => t.close()));
  const make = (o: Parameters<typeof peerTransport>[0]) => {
    const t = peerTransport<Msg>(o);
    open.push(t);
    return t;
  };

  it('carries tutor → students and only allowed student → tutor messages, with peer counts', async () => {
    const { create } = network();
    const tutor = make({ code: 'K7QX2M', role: 'tutor', createPeer: create });
    const toTutor = collect(tutor);
    await tick();
    expect(tutor.status).toBe('open');
    const a = make({ code: 'K7QX2M', role: 'student', createPeer: create });
    const toA = collect(a);
    await tick();
    expect(a.status).toBe('open');
    expect(toTutor.at(-1)).toEqual({ t: 'peers', tutors: 1, students: 1 });
    tutor.send({ t: 'snapshot', n: 1 });
    a.send({ t: 'hello', id: 'a' });
    a.send({ t: 'snapshot', evil: true });
    await tick();
    expect(toA).toContainEqual({ t: 'snapshot', n: 1 });
    expect(toTutor.filter((m) => m.t !== 'peers')).toEqual([{ t: 'hello', id: 'a' }]);
  });

  it('splits and reassembles large messages', async () => {
    const { create } = network();
    const tutor = make({ code: 'K7QX2M', role: 'tutor', createPeer: create });
    await tick();
    const s = make({ code: 'K7QX2M', role: 'student', createPeer: create });
    const got = collect(s);
    await tick();
    const big = 'x'.repeat(PEER_CHUNK * 3 + 7);
    tutor.send({ t: 'snapshot', big });
    await tick();
    expect(got.find((m) => m.t === 'snapshot')?.big).toBe(big);
  });

  it('refuses an unknown code and a full room', async () => {
    const { create } = network();
    const lost = make({ code: 'ZZZZZZ', role: 'student', createPeer: create });
    await tick();
    expect(lost.status).toBe('refused');
    make({ code: 'K7QX2M', role: 'tutor', createPeer: create, maxStudents: 1 });
    await tick();
    make({ code: 'K7QX2M', role: 'student', createPeer: create });
    await tick();
    const late = make({ code: 'K7QX2M', role: 'student', createPeer: create });
    const statuses: string[] = [];
    late.onStatus((s, d) => statuses.push(`${s}:${d ?? ''}`));
    await tick();
    expect(statuses).toContain(`refused:${CLOSE_FULL}`);
    expect(statuses.join()).not.toContain(String(CLOSE_NOT_FOUND));
  });

  it('a tutor waits for its id to be released (reload)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { create, peers } = network();
      const held = create('bohrified-live-K7QX2M');
      await Promise.resolve();
      const tutor = make({ code: 'K7QX2M', role: 'tutor', createPeer: create });
      await vi.advanceTimersByTimeAsync(10);
      expect(tutor.status).toBe('connecting');
      held.destroy();
      expect(peers.size).toBe(0);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(tutor.status).toBe('open');
    } finally {
      vi.useRealTimers();
    }
  });
});

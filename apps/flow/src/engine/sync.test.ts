import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TutorSync, ViewerSync, type SyncMessage } from './sync';
import { backoffMs, type LinkStatus, type Transport } from './transport';
import { BoardStore } from './store';
import type { ShapeElement } from './types';

/** A pair of linked in-memory transports: what one sends, the other receives. */
function pair(): [FakeTransport, FakeTransport] {
  const a = new FakeTransport();
  const b = new FakeTransport();
  a.peer = b;
  b.peer = a;
  return [a, b];
}
class FakeTransport implements Transport<SyncMessage> {
  peer: FakeTransport | null = null;
  status: LinkStatus = 'open';
  sent: SyncMessage[] = [];
  private msg = new Set<(m: SyncMessage) => void>();
  private st = new Set<(s: LinkStatus, d?: string) => void>();
  send(m: SyncMessage) {
    this.sent.push(m);
    // Real transports copy messages; handing over the same object would make both boards share one document.
    const copy = structuredClone(m);
    queueMicrotask(() => this.peer?.msg.forEach((fn) => fn(structuredClone(copy))));
  }
  onMessage(fn: (m: SyncMessage) => void) {
    this.msg.add(fn);
    return () => void this.msg.delete(fn);
  }
  onStatus(fn: (s: LinkStatus, d?: string) => void) {
    this.st.add(fn);
    fn(this.status);
    return () => void this.st.delete(fn);
  }
  setStatus(s: LinkStatus, detail?: string) {
    this.status = s;
    this.st.forEach((fn) => fn(s, detail));
  }
  close() {}
}

const rect = (id: string): ShapeElement => ({ id, type: 'shape', kind: 'rect', x1: 0, y1: 0, x2: 10, y2: 10, color: 'label', size: 2, fill: false });
const tick = () => new Promise((r) => setTimeout(r, 0));
const viewport = () => ({ width: 1000, height: 700 });

beforeEach(() => {
  vi.stubGlobal('window', Object.assign(globalThis, { addEventListener: () => {}, removeEventListener: () => {}, setInterval, clearInterval }));
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => vi.unstubAllGlobals());

describe('live sync between a tutor and a student', () => {
  it('sends the board to a student who joins, then streams edits', async () => {
    const tutorBoard = new BoardStore();
    tutorBoard.addElements([rect('a')]);
    const [tutorSide, studentSide] = pair();
    const tutor = new TutorSync(tutorBoard, viewport, [tutorSide]);
    const studentBoard = new BoardStore();
    const statuses: string[] = [];
    const viewer = new ViewerSync(studentBoard, { onCamera: () => {}, onPresence: () => {}, onConnected: () => {}, onStatus: (s) => statuses.push(s.state) }, studentSide);
    await tick();
    expect(studentBoard.page.elements.map((e) => e.id)).toEqual(['a']);
    expect(statuses).toContain('live');
    tutorBoard.addElements([rect('b')]);
    await tick();
    expect(studentBoard.page.elements.map((e) => e.id)).toEqual(['a', 'b']);
    expect(tutor.viewerCount).toBe(1);
    viewer.destroy();
    tutor.destroy();
  });

  it('counts students from heartbeats and forgets those who say goodbye', async () => {
    const [t, s] = pair();
    const tutor = new TutorSync(new BoardStore(), viewport, [t]);
    const counts: number[] = [];
    tutor.onViewers((n) => counts.push(n));
    const v = new ViewerSync(new BoardStore(), { onCamera: () => {}, onPresence: () => {}, onConnected: () => {} }, s);
    await tick();
    expect(tutor.viewerCount).toBe(1);
    v.destroy();
    await tick();
    expect(tutor.viewerCount).toBe(0);
    expect(counts).toEqual([0, 1, 0]);
    tutor.destroy();
  });

  it('pausing freezes what students see and resuming catches them up', async () => {
    const tutorBoard = new BoardStore();
    const [t, s] = pair();
    const tutor = new TutorSync(tutorBoard, viewport, [t]);
    const studentBoard = new BoardStore();
    const states: string[] = [];
    new ViewerSync(studentBoard, { onCamera: () => {}, onPresence: () => {}, onConnected: () => {}, onStatus: (x) => states.push(x.state) }, s);
    await tick();
    tutor.setSharing('paused');
    tutorBoard.addElements([rect('secret')]);
    await tick();
    expect(studentBoard.page.elements).toHaveLength(0);
    expect(states.at(-1)).toBe('paused');
    tutor.setSharing('live');
    await tick();
    expect(studentBoard.page.elements.map((e) => e.id)).toEqual(['secret']);
    expect(states.at(-1)).toBe('live');
    tutor.destroy();
  });

  it('tells students when the session ends', async () => {
    const [t, s] = pair();
    const tutor = new TutorSync(new BoardStore(), viewport, [t]);
    const states: string[] = [];
    new ViewerSync(new BoardStore(), { onCamera: () => {}, onPresence: () => {}, onConnected: () => {}, onStatus: (x) => states.push(x.state) }, s);
    await tick();
    tutor.destroy({ end: true });
    await tick();
    expect(states.at(-1)).toBe('ended');
  });

  it('resyncs a student after the connection drops and returns', async () => {
    const tutorBoard = new BoardStore();
    const [t, s] = pair();
    const tutor = new TutorSync(tutorBoard, viewport, [t]);
    const studentBoard = new BoardStore();
    const links: LinkStatus[] = [];
    new ViewerSync(studentBoard, { onCamera: () => {}, onPresence: () => {}, onConnected: () => {}, onStatus: (x) => links.push(x.link) }, s);
    await tick();
    s.setStatus('reconnecting');
    tutorBoard.addElements([rect('missed')]); // sent while the student was away
    s.setStatus('open'); // reconnect → the student asks for the board again
    await tick();
    expect(links).toContain('reconnecting');
    expect(studentBoard.page.elements.map((e) => e.id)).toEqual(['missed']);
    tutor.destroy();
  });

  it('students cannot change the tutor board through the viewer', async () => {
    const tutorBoard = new BoardStore();
    const [t, s] = pair();
    const tutor = new TutorSync(tutorBoard, viewport, [t]);
    s.send({ t: 'op', op: { kind: 'elements', pageId: tutorBoard.page.id, removed: [], added: [{ index: 0, el: rect('evil') }] } });
    s.send({ t: 'snapshot', doc: tutorBoard.doc });
    await tick();
    expect(tutorBoard.page.elements).toHaveLength(0);
    tutor.destroy();
  });
});

describe('reconnect backoff', () => {
  it('doubles up to a cap with jitter', () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => backoffMs(n, 8000, mid))).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000]);
    expect(backoffMs(0, 8000, () => 0)).toBe(375);
    expect(backoffMs(0, 8000, () => 1)).toBe(625);
  });
});

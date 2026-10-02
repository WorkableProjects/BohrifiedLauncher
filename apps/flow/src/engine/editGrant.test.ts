import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TutorSync, ViewerSync, deviceLabel, type SyncMessage } from './sync';
import type { LinkStatus, Transport } from './transport';
import { BoardStore } from './store';
import type { ShapeElement } from './types';

/** Linked in-memory transports (see sync.test.ts); `many` fans one tutor side out to several students. */
class Fake implements Transport<SyncMessage> {
  peers: Fake[] = [];
  status: LinkStatus = 'open';
  private msg = new Set<(m: SyncMessage) => void>();
  send(m: SyncMessage) {
    // Real transports (BroadcastChannel, WebSocket, HTTP) copy messages; sharing objects would share the document.
    const copy = structuredClone(m);
    queueMicrotask(() => this.peers.forEach((p) => p.msg.forEach((fn) => fn(structuredClone(copy)))));
  }
  onMessage(fn: (m: SyncMessage) => void) {
    this.msg.add(fn);
    return () => void this.msg.delete(fn);
  }
  onStatus(fn: (s: LinkStatus) => void) {
    fn(this.status);
    return () => {};
  }
  close() {}
}
/** One tutor, N students: students hear the tutor; the tutor hears every student; students don't hear each other. */
function room(n: number) {
  const tutor = new Fake();
  const students = Array.from({ length: n }, () => new Fake());
  tutor.peers = students;
  students.forEach((s) => (s.peers = [tutor]));
  return { tutor, students };
}

const rect = (id: string): ShapeElement => ({ id, type: 'shape', kind: 'rect', x1: 0, y1: 0, x2: 10, y2: 10, color: 'label', size: 2, fill: false });
const tick = () => new Promise((r) => setTimeout(r, 5));
const viewport = () => ({ width: 1000, height: 700 });
const handlers = { onCamera: () => {}, onPresence: () => {}, onConnected: () => {} };
const ids = (b: BoardStore) => b.page.elements.map((e) => e.id).sort();

beforeEach(() => {
  vi.stubGlobal('window', Object.assign(globalThis, { addEventListener: () => {}, removeEventListener: () => {}, setInterval, clearInterval }));
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => vi.unstubAllGlobals());

/** Join one viewer whose local changes are forwarded to the tutor, like PresenterApp does. */
function join(tutorSide: Fake, side: Fake) {
  const board = new BoardStore();
  const editable: boolean[] = [];
  const sync = new ViewerSync(board, { ...handlers, onEditable: (on) => editable.push(on) }, side);
  board.subscribe((c) => c.type === 'op' && c.source !== 'remote' && sync.sendEdit(c.op));
  void tutorSide;
  return { board, sync, editable };
}

describe('letting a device draw', () => {
  it('a device can only draw once the tutor allows it, then its edits reach the tutor and everyone', async () => {
    const { tutor, students } = room(2);
    const tutorBoard = new BoardStore();
    const sync = new TutorSync(tutorBoard, viewport, [tutor]);
    const ipad = join(tutor, students[0]);
    const other = join(tutor, students[1]);
    await tick();

    ipad.board.addElements([rect('before-grant')]);
    await tick();
    expect(ids(tutorBoard)).toEqual([]);

    const device = sync.devices.find((d) => d.id === ipad.sync.id)!;
    expect(device.granted).toBe(false);
    sync.setGrant(ipad.sync.id, true);
    await tick();
    expect(ipad.sync.editable).toBe(true);
    expect(other.sync.editable).toBe(false);

    ipad.board.addElements([rect('from-ipad')]);
    await tick();
    expect(ids(tutorBoard)).toEqual(['from-ipad']);
    expect(ids(other.board)).toEqual(['from-ipad']);
    // The iPad does not receive its own change a second time.
    expect(ids(ipad.board)).toEqual(['before-grant', 'from-ipad']);

    // Other devices still cannot draw.
    other.board.addElements([rect('from-other')]);
    await tick();
    expect(ids(tutorBoard)).toEqual(['from-ipad']);

    sync.destroy();
  });

  it('stops accepting edits when the tutor turns it off', async () => {
    const { tutor, students } = room(1);
    const tutorBoard = new BoardStore();
    const sync = new TutorSync(tutorBoard, viewport, [tutor]);
    const ipad = join(tutor, students[0]);
    await tick();
    sync.setGrant(ipad.sync.id, true);
    await tick();
    sync.setGrant(ipad.sync.id, false);
    await tick();
    expect(ipad.sync.editable).toBe(false);
    ipad.board.addElements([rect('late')]);
    await tick();
    expect(ids(tutorBoard)).toEqual([]);
    sync.destroy();
  });

  it('rejects an edit that spoofs a granted device id without its secret', async () => {
    const { tutor, students } = room(1);
    const tutorBoard = new BoardStore();
    const sync = new TutorSync(tutorBoard, viewport, [tutor]);
    const ipad = join(tutor, students[0]);
    await tick();
    sync.setGrant(ipad.sync.id, true);
    await tick();
    students[0].send({ t: 'edit', id: ipad.sync.id, key: 'guessed', op: { kind: 'elements', pageId: tutorBoard.page.id, removed: [], added: [{ index: 0, el: rect('forged') }] } });
    await tick();
    expect(ids(tutorBoard)).toEqual([]);
    sync.destroy();
  });

  it('forgets the grant when a device leaves', async () => {
    const { tutor, students } = room(1);
    const sync = new TutorSync(new BoardStore(), viewport, [tutor]);
    const ipad = join(tutor, students[0]);
    await tick();
    sync.setGrant(ipad.sync.id, true);
    ipad.sync.destroy();
    await tick();
    expect(sync.devices).toEqual([]);
    sync.destroy();
  });
});

describe('deviceLabel', () => {
  it('names common devices', () => {
    expect(deviceLabel({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })).toBe('iPad');
    expect(deviceLabel({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe('iPad');
    expect(deviceLabel({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 })).toBe('Mac');
    expect(deviceLabel({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64)' })).toBe('Windows PC');
    expect(deviceLabel({ userAgent: '' })).toBe('Device');
  });
});

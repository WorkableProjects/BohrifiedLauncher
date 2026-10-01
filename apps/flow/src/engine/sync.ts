import type { Presence } from '../canvas/controller';
import { channelSupported, channelTransport, type LinkStatus, type Transport } from './transport';
import { isFlowDocument, type BoardStore, type Op } from './store';
import type { Camera, FlowDocument } from './types';

/**
 * Live sync between a tutor's board and student views. A student view is a
 * clean, chrome-free board that follows the tutor's page, camera, ink and
 * spotlight — ideal for sharing a single window in a video call, or for a
 * student joining from another device through the session relay.
 *
 * Messages are small: document ops (the same units as undo/redo), not
 * snapshots, except when a viewer joins or reconnects ("resync").
 */

export type SyncMessage =
  /** A viewer asks for the current state (on joining and after every reconnect). */
  | { t: 'hello' }
  | { t: 'snapshot'; doc: FlowDocument }
  | { t: 'op'; op: Op }
  | { t: 'active'; pageId: string }
  | { t: 'camera'; pageId: string; cam: Camera; w: number; h: number }
  | ({ t: 'presence' } & Presence)
  /** Viewer heartbeat, so the tutor can see how many are watching. */
  | { t: 'viewer'; id: string }
  | { t: 'bye'; id: string }
  /** The tutor's sharing state; `tutor` is the first name they chose to share. */
  | { t: 'status'; state: 'live' | 'paused' | 'ended'; title?: string; tutor?: string }
  /** From the relay: who is connected to the session. */
  | { t: 'peers'; tutors: number; students: number }
  | { t: 'ping' };

export const LOCAL_CHANNEL = 'flow-live-v1';
export { channelSupported };

export type SharingState = 'live' | 'paused' | 'ended';
const VIEWER_BEAT_MS = 4000;
const VIEWER_TTL_MS = 11000;

export interface TutorOptions {
  /** First name shown to students joining by code. */
  tutorName?: string | null;
}

export class TutorSync {
  private transports = new Map<Transport<SyncMessage>, () => void>();
  /** Transports handed to the constructor belong to this sync and close with it; added ones don't. */
  private owned: Transport<SyncMessage>[];
  private unsub: () => void;
  private camRaf = 0;
  private viewers = new Map<string, number>();
  private sweep = 0;
  private viewerListeners = new Set<(count: number) => void>();
  private state: SharingState = 'live';

  constructor(
    private store: BoardStore,
    private getViewport: () => { width: number; height: number },
    transports: Transport<SyncMessage>[] = [],
    private opts: TutorOptions = {},
  ) {
    this.owned = transports;
    transports.forEach((t) => this.addTransport(t, false));
    this.unsub = store.subscribe((c) => {
      if (this.state !== 'live') return;
      if (c.type === 'op') this.post({ t: 'op', op: c.op });
      else if (c.type === 'activePage') {
        this.post({ t: 'active', pageId: this.store.doc.activePage });
        this.sendCamera();
      } else if (c.type === 'replace') this.post({ t: 'snapshot', doc: this.store.doc });
      else if (c.type === 'camera') this.sendCamera();
    });
    this.sweep = window.setInterval(() => this.prune(), 3000);
    // Recreated after a Bohrified suspend: bring already-open viewers up to date.
    this.resync();
  }

  get sharing(): SharingState {
    return this.state;
  }

  get viewerCount() {
    return this.viewers.size;
  }

  /** Attach another way for viewers to reach this tutor (e.g. the session relay). */
  addTransport(t: Transport<SyncMessage>, announce = true): () => void {
    const offMsg = t.onMessage((m) => this.receive(m, t));
    // A (re)connected link gets the full state so late or returning viewers catch up.
    const offStatus = t.onStatus((s) => s === 'open' && announce && this.resync([t]));
    const off = () => {
      offMsg();
      offStatus();
      this.transports.delete(t);
    };
    this.transports.set(t, off);
    if (announce && t.status === 'open') this.resync([t]);
    return off;
  }

  removeTransport(t: Transport<SyncMessage>) {
    this.transports.get(t)?.();
  }

  private receive(m: SyncMessage, from: Transport<SyncMessage>) {
    switch (m?.t) {
      case 'hello':
        this.resync([from]);
        break;
      case 'viewer':
        if (typeof m.id === 'string') {
          const isNew = !this.viewers.has(m.id);
          this.viewers.set(m.id, Date.now());
          if (isNew) this.notifyViewers();
        }
        break;
      case 'bye':
        if (this.viewers.delete(m.id)) this.notifyViewers();
        break;
    }
  }

  /** Send the whole picture to `targets` (default: every transport). */
  private resync(targets: Transport<SyncMessage>[] = [...this.transports.keys()]) {
    const { width, height } = this.getViewport();
    const send = (m: SyncMessage) => targets.forEach((t) => t.send(m));
    send({ t: 'status', state: this.state, title: this.store.doc.title, tutor: this.opts.tutorName ?? undefined });
    if (this.state === 'ended') return;
    // While paused, a joining viewer is only told so: nothing the tutor is preparing leaks.
    if (this.state !== 'live') return;
    send({ t: 'snapshot', doc: this.store.doc });
    send({ t: 'camera', pageId: this.store.page.id, cam: this.store.page.camera, w: width, h: height });
  }

  private post(m: SyncMessage) {
    for (const t of this.transports.keys()) t.send(m);
  }

  /** Camera updates are coalesced to one per frame. */
  sendCamera() {
    if (this.camRaf || this.state !== 'live') return;
    this.camRaf = requestAnimationFrame(() => {
      this.camRaf = 0;
      const { width, height } = this.getViewport();
      this.post({ t: 'camera', pageId: this.store.page.id, cam: this.store.page.camera, w: width, h: height });
    });
  }

  presence(p: Presence) {
    if (this.state === 'live') this.post({ t: 'presence', ...p });
  }

  /** Pause or resume what students see. Paused viewers keep their last picture and are told why. */
  setSharing(state: SharingState) {
    if (state === this.state) return;
    this.state = state;
    this.post({ t: 'status', state, title: this.store.doc.title, tutor: this.opts.tutorName ?? undefined });
    if (state === 'live') this.resync();
  }

  /** How many students are watching, across every transport. */
  onViewers(fn: (count: number) => void): () => void {
    this.viewerListeners.add(fn);
    fn(this.viewers.size);
    return () => void this.viewerListeners.delete(fn);
  }

  private notifyViewers() {
    this.viewerListeners.forEach((fn) => fn(this.viewers.size));
  }

  private prune() {
    const cutoff = Date.now() - VIEWER_TTL_MS;
    let changed = false;
    for (const [id, at] of this.viewers) if (at < cutoff) changed = this.viewers.delete(id) || changed;
    if (changed) this.notifyViewers();
  }

  destroy(opts: { end?: boolean } = {}) {
    if (opts.end) this.post({ t: 'status', state: 'ended' });
    this.unsub();
    clearInterval(this.sweep);
    cancelAnimationFrame(this.camRaf);
    for (const off of [...this.transports.values()]) off();
    this.owned.forEach((t) => t.close());
    this.viewerListeners.clear();
  }
}

export interface ViewerHandlers {
  onCamera: (cam: Camera, w: number, h: number) => void;
  onPresence: (p: Presence) => void;
  onConnected: () => void;
  /** The tutor's sharing state, the link to the tutor, and who is on the other end. */
  onStatus?: (s: { state: SharingState | 'waiting'; link: LinkStatus; detail?: string; title?: string; tutor?: string }) => void;
}

export class ViewerSync {
  private beat = 0;
  private offs: (() => void)[] = [];
  private state: SharingState | 'waiting' = 'waiting';
  private title: string | undefined;
  private tutor: string | undefined;
  private link: LinkStatus;
  private detail: string | undefined;
  readonly id = Math.random().toString(36).slice(2, 10);

  constructor(
    private store: BoardStore,
    private handlers: ViewerHandlers,
    private transport: Transport<SyncMessage> = channelTransport<SyncMessage>(LOCAL_CHANNEL),
  ) {
    this.link = transport.status;
    this.offs.push(
      transport.onMessage((m) => this.receive(m)),
      transport.onStatus((s, detail) => {
        const was = this.link;
        this.link = s;
        this.detail = detail;
        // Every (re)connection asks for the board again: that is the whole resync protocol.
        if (s === 'open') this.hello();
        if (s !== was || s !== 'open') this.emit();
      }),
    );
    this.beat = window.setInterval(() => transport.send({ t: 'viewer', id: this.id }), VIEWER_BEAT_MS);
    window.addEventListener('pagehide', this.bye);
  }

  private hello() {
    this.transport.send({ t: 'hello' });
    this.transport.send({ t: 'viewer', id: this.id });
  }

  private emit() {
    this.handlers.onStatus?.({ state: this.state, link: this.link, detail: this.detail, title: this.title, tutor: this.tutor });
  }

  private receive(m: SyncMessage) {
    const { store, handlers } = this;
    switch (m?.t) {
      case 'snapshot':
        if (isFlowDocument(m.doc)) {
          store.load(m.doc);
          this.title = m.doc.title;
          if (this.state === 'waiting') this.state = 'live';
          handlers.onConnected();
          this.emit();
        }
        break;
      case 'op':
        store.applyRemote(m.op);
        break;
      case 'active':
        store.setActivePage(m.pageId);
        break;
      case 'camera':
        if (m.pageId !== store.page.id) store.setActivePage(m.pageId);
        handlers.onCamera(m.cam, m.w, m.h);
        break;
      case 'presence':
        handlers.onPresence(m);
        break;
      case 'status':
        this.state = m.state;
        this.title = m.title ?? this.title;
        this.tutor = m.tutor ?? this.tutor;
        this.emit();
        break;
    }
  }

  private bye = () => this.transport.send({ t: 'bye', id: this.id });

  destroy() {
    this.bye();
    window.removeEventListener('pagehide', this.bye);
    clearInterval(this.beat);
    this.offs.forEach((off) => off());
    this.transport.close();
  }
}

/** Map the tutor's visible world rect into a viewer viewport of another size. */
export function followCamera(cam: Camera, tw: number, th: number, vw: number, vh: number): Camera {
  const z = cam.z * Math.min(vw / tw, vh / th);
  const cx = cam.x + tw / cam.z / 2;
  const cy = cam.y + th / cam.z / 2;
  return { x: cx - vw / z / 2, y: cy - vh / z / 2, z };
}

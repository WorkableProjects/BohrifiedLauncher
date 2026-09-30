import type { LaserPoint, LiveStroke } from '../canvas/controller';
import { isFlowDocument, type BoardStore, type Op } from './store';
import type { Camera, FlowDocument } from './types';

/**
 * Same-origin live sync between a tutor window and "Present" viewer
 * windows over BroadcastChannel. The viewer is a clean, chrome-free board
 * that follows the tutor's page, camera, ink and laser — ideal for sharing
 * a single window in Zoom/Meet/Teams.
 *
 * Messages are small: document ops (the same units as undo/redo), not
 * snapshots, except when a viewer joins.
 */

export type SyncMessage =
  | { t: 'hello' }
  | { t: 'snapshot'; doc: FlowDocument }
  | { t: 'op'; op: Op }
  | { t: 'active'; pageId: string }
  | { t: 'camera'; pageId: string; cam: Camera; w: number; h: number }
  | { t: 'presence'; laser?: LaserPoint[]; live?: LiveStroke | null };

const CHANNEL = 'flow-live-v1';

export const channelSupported = () => typeof BroadcastChannel !== 'undefined';

export class TutorSync {
  private ch = new BroadcastChannel(CHANNEL);
  private unsub: () => void;
  private camRaf = 0;
  private getViewport: () => { width: number; height: number };

  constructor(private store: BoardStore, getViewport: () => { width: number; height: number }) {
    this.getViewport = getViewport;
    this.ch.onmessage = (e: MessageEvent<SyncMessage>) => {
      if (e.data?.t === 'hello') {
        this.post({ t: 'snapshot', doc: this.store.doc });
        this.sendCamera();
      }
    };
    this.unsub = store.subscribe((c) => {
      if (c.type === 'op') this.post({ t: 'op', op: c.op });
      else if (c.type === 'activePage') {
        this.post({ t: 'active', pageId: this.store.doc.activePage });
        this.sendCamera();
      } else if (c.type === 'replace') this.post({ t: 'snapshot', doc: this.store.doc });
      else if (c.type === 'camera') this.sendCamera();
    });
    // Recreated after a Bohrified suspend: bring already-open viewers up to date.
    this.post({ t: 'snapshot', doc: this.store.doc });
    this.sendCamera();
  }

  private post(m: SyncMessage) {
    try {
      this.ch.postMessage(m);
    } catch (err) {
      console.warn('Flow: sync post failed', err);
    }
  }

  /** Camera updates are coalesced to one per frame. */
  sendCamera() {
    if (this.camRaf) return;
    this.camRaf = requestAnimationFrame(() => {
      this.camRaf = 0;
      const { width, height } = this.getViewport();
      this.post({ t: 'camera', pageId: this.store.page.id, cam: this.store.page.camera, w: width, h: height });
    });
  }

  presence(p: { laser?: LaserPoint[]; live?: LiveStroke | null }) {
    this.post({ t: 'presence', ...p });
  }

  destroy() {
    this.unsub();
    this.ch.close();
  }
}

export class ViewerSync {
  private ch = new BroadcastChannel(CHANNEL);

  constructor(
    store: BoardStore,
    handlers: {
      onCamera: (cam: Camera, w: number, h: number) => void;
      onPresence: (p: { laser?: LaserPoint[]; live?: LiveStroke | null }) => void;
      onConnected: () => void;
    },
  ) {
    this.ch.onmessage = (e: MessageEvent<SyncMessage>) => {
      const m = e.data;
      switch (m?.t) {
        case 'snapshot':
          if (isFlowDocument(m.doc)) {
            store.load(m.doc);
            handlers.onConnected();
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
      }
    };
    this.ch.postMessage({ t: 'hello' } satisfies SyncMessage);
  }

  destroy() {
    this.ch.close();
  }
}

/** Map the tutor's visible world rect into a viewer viewport of another size. */
export function followCamera(cam: Camera, tw: number, th: number, vw: number, vh: number): Camera {
  const z = cam.z * Math.min(vw / tw, vh / th);
  const cx = cam.x + tw / cam.z / 2;
  const cy = cam.y + th / cam.z / 2;
  return { x: cx - vw / z / 2, y: cy - vh / z / 2, z };
}

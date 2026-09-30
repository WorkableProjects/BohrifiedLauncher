import { sessionStore } from '@bohrified/persistence';
import { withTimeout } from '@bohrified/utilities';
import { isBohrMessage, type AppMessage, type HostCommand, type HostMessage } from './protocol';
import type { AppContext, AppInstance, BohrApp, SharedSettings } from './types';

/**
 * Hosts an existing web app in a same-origin iframe behind the Bohrified
 * contract. The iframe is the app boundary: its globals, CSS, listeners,
 * storage keys and framework stay its own, and removing it on unmount lets
 * the browser reclaim everything (JS heap, canvases, WebGL, workers).
 */
export interface FrameAppOptions {
  /**
   * Page to load, relative to the deployment base. Receives the last session
   * the app reported (or null) so it can restore where it left off.
   */
  src: (session: unknown) => string;
  title: string;
  /**
   * The app runs the `connectBohr()` client: wait for its `ready`, and let it
   * acknowledge suspend/unmount (so it can save first). Apps without the
   * client are just shown and hidden.
   */
  protocol?: boolean;
  /** How long to wait for an ack before proceeding anyway. */
  ackTimeoutMs?: number;
  /** How long to wait for the page to load / report ready. */
  loadTimeoutMs?: number;
}

/** Last session each app reported, for this tab: `bohr:session:<id>`. */
const sessions = sessionStore('bohr:session:');

export function frameApp(options: FrameAppOptions): BohrApp {
  const { protocol = false, ackTimeoutMs = 1500, loadTimeoutMs = 20000 } = options;

  return {
    async mount(host: HTMLElement, ctx: AppContext): Promise<AppInstance> {
      const frame = document.createElement('iframe');
      frame.title = options.title;
      frame.src = new URL(options.src(sessions.get(ctx.appId, null)), new URL(ctx.baseUrl, location.href)).href;
      frame.allow = 'clipboard-read; clipboard-write; fullscreen';
      frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:transparent';

      let seq = 0;
      const pending = new Map<number, () => void>();
      let onReady: (() => void) | null = null;
      const cleanups: (() => void)[] = [];

      const onMessage = (e: MessageEvent) => {
        if (e.source !== frame.contentWindow || e.origin !== location.origin || !isBohrMessage(e.data)) return;
        const m = e.data as AppMessage;
        switch (m.type) {
          case 'ready':
            sendSettings();
            onReady?.();
            break;
          case 'ack':
            pending.get(m.seq)?.();
            pending.delete(m.seq);
            break;
          case 'session':
            sessions.set(ctx.appId, m.data);
            break;
          case 'error':
            ctx.reportError(new Error(m.message), m.fatal);
            break;
        }
      };
      window.addEventListener('message', onMessage);
      cleanups.push(() => window.removeEventListener('message', onMessage));

      const send = (type: HostCommand): Promise<void> => {
        const win = frame.contentWindow;
        if (!protocol || !win) return Promise.resolve();
        const id = ++seq;
        const acked = new Promise<void>((resolve) => pending.set(id, resolve));
        win.postMessage({ bohr: 1, type, seq: id } satisfies HostMessage, location.origin);
        return withTimeout(acked, ackTimeoutMs, undefined).finally(() => pending.delete(id));
      };

      let settings: SharedSettings = ctx.settings;
      const sendSettings = () =>
        frame.contentWindow?.postMessage({ bohr: 1, type: 'settings', settings } satisfies HostMessage, location.origin);

      // Uncaught errors inside the frame are logged, not fatal: apps that
      // can crash for real report it through the client (`fatal: true`).
      const watchErrors = () => {
        const win = frame.contentWindow;
        if (!win) return;
        const onError = (e: ErrorEvent) => ctx.reportError(e.error ?? new Error(e.message), false);
        const onRejection = (e: PromiseRejectionEvent) => ctx.reportError(e.reason, false);
        try {
          win.addEventListener('error', onError);
          win.addEventListener('unhandledrejection', onRejection);
        } catch { /* cross-origin: nothing to watch */ }
      };
      // Every load, since the app may reload or navigate inside its frame.
      const onLoad = () => {
        watchErrors();
        sendSettings();
      };
      frame.addEventListener('load', onLoad);
      cleanups.push(() => frame.removeEventListener('load', onLoad));

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${options.title} did not load in time`)), loadTimeoutMs);
        const done = () => {
          clearTimeout(timer);
          onReady = null;
          resolve();
        };
        if (protocol) onReady = done;
        else frame.addEventListener('load', done, { once: true });
        frame.addEventListener('error', () => reject(new Error(`${options.title} failed to load`)), { once: true });
        host.appendChild(frame);
      }).catch((err) => {
        cleanups.forEach((fn) => fn());
        frame.remove();
        throw err;
      });

      return {
        async activate() {
          frame.style.display = 'block';
          frame.inert = false;
          await send('activate');
          frame.focus();
          frame.contentWindow?.focus();
        },
        async suspend() {
          await send('suspend');
          frame.inert = true;
          frame.style.display = 'none';
        },
        async unmount() {
          await send('unmount');
          cleanups.forEach((fn) => fn());
          pending.clear();
          // Navigate away first so the document tears down before detaching.
          try {
            frame.src = 'about:blank';
          } catch { /* ignore */ }
          frame.remove();
        },
        applySettings(next) {
          settings = next;
          sendSettings();
        },
      };
    },
  };
}

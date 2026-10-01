import { isBohrMessage, type AppMessage, type HostMessage } from './protocol';
import { shellShortcut, type AppActivity, type SharedSettings } from './types';

/**
 * In-app side of the Bohrified protocol. Import from
 * `@bohrified/app-sdk/client` inside an app that runs in the launcher's
 * iframe host. It does nothing when the app runs standalone.
 */
export interface BohrHandlers {
  /** Shown again (or for the first time). Rebuild runtime released in suspend. */
  activate?: () => void | Promise<void>;
  /** Hidden for a normal switch. Save, then stop loops and release expensive runtime. */
  suspend?: () => void | Promise<void>;
  /** About to be destroyed. Save and report a final session. */
  unmount?: () => void | Promise<void>;
  /** Bohrified's shared settings (theme): sent on load and whenever they change. */
  settings?: (settings: SharedSettings) => void;
}

export interface BohrClient {
  /** Store small serializable state the launcher hands back after an unmount. */
  saveSession(data: unknown): void;
  /** Report an error; fatal errors show the launcher's Reload / Back screen. */
  reportError(error: unknown, fatal?: boolean): void;
  /** Tell the launcher what the user is working on, for "Continue with <App>". */
  setActivity(activity: AppActivity | null): void;
  /** Report runtime numbers (canvases, elements, frame times) for the launcher's diagnostics. */
  reportMetrics(data: Record<string, number>): void;
}

/** True when running inside the Bohrified launcher (same-origin parent). */
export function isEmbedded(): boolean {
  try {
    return window.parent !== window && window.parent.location.origin === location.origin;
  } catch {
    return false;
  }
}

export function connectBohr(handlers: BohrHandlers): BohrClient | null {
  if (!isEmbedded()) return null;
  const parent = window.parent;
  const post = (m: AppMessage) => parent.postMessage(m, location.origin);

  window.addEventListener('message', async (e: MessageEvent) => {
    if (e.source !== parent || e.origin !== location.origin || !isBohrMessage(e.data)) return;
    const m = e.data as HostMessage;
    if (m.type === 'settings') return handlers.settings?.(m.settings);
    try {
      await handlers[m.type]?.();
    } catch (err) {
      post({ bohr: 1, type: 'error', message: String((err as Error)?.message ?? err), fatal: false });
    }
    post({ bohr: 1, type: 'ack', seq: m.seq });
  });

  // Bohrified's shortcuts (quick launcher, window layout) keep working while focus is inside the app.
  window.addEventListener('keydown', (e) => {
    const name = shellShortcut(e);
    if (!name) return;
    e.preventDefault();
    post({ bohr: 1, type: 'shortcut', name });
  });

  post({ bohr: 1, type: 'ready' });

  return {
    saveSession: (data) => post({ bohr: 1, type: 'session', data }),
    setActivity: (context: AppActivity | null) => post({ bohr: 1, type: 'context', context }),
    reportMetrics: (data) => post({ bohr: 1, type: 'metrics', data }),
    reportError: (error, fatal = false) =>
      post({ bohr: 1, type: 'error', message: String((error as Error)?.message ?? error), fatal }),
  };
}

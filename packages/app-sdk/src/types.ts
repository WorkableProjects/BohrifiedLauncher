import type { AppSettings } from './settings';

/**
 * The Bohrified app contract.
 *
 * The launcher owns navigation, registration and lifecycle. An app owns its
 * screens, document model and state, and exposes itself as a `BohrApp`: a
 * `mount()` that returns an `AppInstance` the launcher drives through
 *
 *   REGISTERED → LOADING → READY → ACTIVE ⇄ SUSPENDED → UNMOUNTED
 *
 * Runtime state (canvases, workers, loops, decoded assets) must be safe to
 * destroy in `suspend()` / `unmount()`; persistent state (documents,
 * preferences) must survive both.
 */

export type LifecycleState =
  /** Known from the registry; no app code loaded. */
  | 'registered'
  /** App chunk loading / runtime initialising. */
  | 'loading'
  /** Mounted but not yet shown. */
  | 'ready'
  /** Visible and interactive; owns its full runtime. */
  | 'active'
  /** Hidden after a normal switch; expensive runtime released, cheap session kept. */
  | 'suspended'
  /** Torn down; only serialized session/persistent data remains. */
  | 'unmounted'
  /** Failed to load or reported a fatal error. The launcher stays usable. */
  | 'crashed';

/** Settings owned by Bohrified and shared with every app. */
export interface SharedSettings {
  theme: 'system' | 'light' | 'dark';
}

/** Bohrified shortcuts that keep working while focus is inside an app. */
export type ShellShortcut = 'quick-launcher' | 'snap-left' | 'snap-right' | 'toggle-maximize' | 'minimize';

/**
 * Which shell shortcut a key press means, if any:
 * Cmd/Ctrl+K, and Cmd/Ctrl+Alt+Arrow for window layout.
 */
export function shellShortcut(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): ShellShortcut | null {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return null;
  if (!e.altKey) return e.key.toLowerCase() === 'k' ? 'quick-launcher' : null;
  switch (e.key) {
    case 'ArrowLeft':
      return 'snap-left';
    case 'ArrowRight':
      return 'snap-right';
    case 'ArrowUp':
      return 'toggle-maximize';
    case 'ArrowDown':
      return 'minimize';
    default:
      return null;
  }
}

/** A short description of what the user is doing in an app, shown by "Continue with <App>". */
export interface AppActivity {
  /** e.g. the lesson or rubric name. */
  title: string;
  /** e.g. "3 pages". */
  detail?: string;
}

export interface AppContext {
  readonly appId: string;
  /** Base URL of the Bohrified deployment (ends with `/`). */
  readonly baseUrl: string;
  /** Current shared settings; changes arrive through `AppInstance.applySettings`. */
  readonly settings: SharedSettings;
  /**
   * Report an error from the app. Fatal errors move the app to `crashed`
   * and the launcher offers Reload / Back; non-fatal ones are only logged.
   */
  reportError(error: unknown, fatal?: boolean): void;
  /** Tell the launcher what the user is working on (null clears it). */
  setActivity(activity: AppActivity | null): void;
  /** Report runtime numbers for the launcher's diagnostics (small, cheap, occasional). */
  setMetrics(metrics: Record<string, number>): void;
  /** A Bohrified shortcut was pressed while focus is inside the app: the launcher acts on it. */
  shortcut(name: ShellShortcut): void;
}

export interface AppInstance {
  /** Become visible and interactive (first show, or back from suspended). */
  activate(): void | Promise<void>;
  /** Normal switch-away: stop loops, release expensive runtime, keep a cheap session. */
  suspend(): void | Promise<void>;
  /** Full teardown. Persist whatever is needed to restore, then release everything. */
  unmount(): void | Promise<void>;
  /** Shared settings changed (e.g. the Bohrified theme). */
  applySettings?(settings: SharedSettings): void;
}

export interface BohrApp {
  /** Create the app inside `host` (an empty, full-size element the launcher owns). */
  mount(host: HTMLElement, ctx: AppContext): AppInstance | Promise<AppInstance>;
}

/**
 * A registry entry: lightweight metadata the launcher can show without
 * loading any app code, plus a lazy loader for the app module.
 */
export interface AppManifest {
  /** URL-safe id, used in `/app/<id>`. */
  id: string;
  name: string;
  /** Shown in the launcher; a change shows an "Updated" indicator until the app is opened. */
  version: string;
  description: string;
  /** Icon image URL (resolved against the deployment base). */
  icon: string;
  /** Accent color for the launcher card. */
  accent: string;
  /** Search terms beyond the name and description. */
  keywords?: readonly string[];
  load: () => Promise<{ default: BohrApp }>;
  /** The app's own preferences, shown in Bohrified's settings sheet. Keep it light: it loads at startup. */
  settings?: AppSettings;
}

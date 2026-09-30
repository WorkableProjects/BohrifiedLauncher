import type { AppContext, AppInstance, AppManifest, LifecycleState, SharedSettings } from '@bohrified/app-sdk';
import { serialQueue } from '@bohrified/utilities';

/**
 * Drives every registered app through REGISTERED → LOADING → READY →
 * ACTIVE ⇄ SUSPENDED → UNMOUNTED, one transition at a time.
 *
 * Policy: switching away suspends. Suspended apps beyond `maxSuspended`
 * are unmounted, least recently used first, and `unmountSuspended()` is the
 * hook for memory pressure. No timers: thresholds come after measuring.
 */

export interface AppRecord {
  manifest: AppManifest;
  state: LifecycleState;
  instance: AppInstance | null;
  /** The element the app mounts into; exists only while mounted. */
  container: HTMLElement | null;
  lastActive: number;
  error: unknown;
  /** Last activation timing, for diagnostics. */
  timing: { loadMs?: number; mountMs?: number; activateMs?: number } | null;
}

export interface LifecycleOptions {
  stage: HTMLElement;
  baseUrl: string;
  /** How many hidden apps may keep a suspended instance. */
  maxSuspended?: number;
  settings: SharedSettings;
  onChange: () => void;
}

export class LifecycleManager {
  readonly apps = new Map<string, AppRecord>();
  private activeId: string | null = null;
  /** Transitions are serialized so rapid switching can't interleave mounts. */
  private readonly run = serialQueue();
  private readonly maxSuspended: number;
  private settings: SharedSettings;

  constructor(manifests: readonly AppManifest[], private opts: LifecycleOptions) {
    this.maxSuspended = opts.maxSuspended ?? 2;
    this.settings = opts.settings;
    for (const manifest of manifests) {
      if (this.apps.has(manifest.id)) throw new Error(`Duplicate app id: ${manifest.id}`);
      this.apps.set(manifest.id, { manifest, state: 'registered', instance: null, container: null, lastActive: 0, error: null, timing: null });
    }
  }

  get active() {
    return this.activeId;
  }

  /** Shared settings changed: tell every mounted app. */
  setSettings(settings: SharedSettings) {
    this.settings = settings;
    for (const rec of this.apps.values()) rec.instance?.applySettings?.(settings);
  }

  private set(rec: AppRecord, state: LifecycleState) {
    rec.state = state;
    this.opts.onChange();
  }

  /** Show `id` (suspending whatever was active), or just the launcher for null. */
  open(id: string | null): Promise<void> {
    return this.run(async () => {
      if (id === this.activeId) return;
      const prev = this.activeId ? this.apps.get(this.activeId) : null;
      this.activeId = id;
      if (prev) await this.suspend(prev);
      const rec = id ? this.apps.get(id) : null;
      if (rec) await this.activate(rec);
      await this.enforcePolicy();
      this.opts.onChange();
    });
  }

  /** Close an app completely (drops its runtime; session data is kept). */
  close(id: string): Promise<void> {
    return this.run(async () => {
      const rec = this.apps.get(id);
      if (!rec) return;
      if (this.activeId === id) this.activeId = null;
      await this.unmount(rec);
      this.opts.onChange();
    });
  }

  /** Tear down and remount a (possibly crashed) app. */
  reload(id: string): Promise<void> {
    return this.run(async () => {
      const rec = this.apps.get(id);
      if (!rec) return;
      await this.unmount(rec);
      if (this.activeId === id) await this.activate(rec);
    });
  }

  /** Memory pressure: unmount every app that isn't on screen. */
  unmountSuspended(): Promise<void> {
    return this.run(async () => {
      for (const rec of this.apps.values()) if (rec.state === 'suspended') await this.unmount(rec);
    });
  }

  private context(rec: AppRecord): AppContext {
    return {
      appId: rec.manifest.id,
      baseUrl: this.opts.baseUrl,
      settings: this.settings,
      reportError: (error, fatal = false) => {
        console.error(`[bohrified] ${rec.manifest.name}${fatal ? ' crashed' : ' error'}:`, error);
        if (fatal) this.crash(rec, error);
      },
    };
  }

  private crash(rec: AppRecord, error: unknown) {
    rec.error = error;
    // Keep the container (so the crash screen can sit on it) but drop the app.
    const inst = rec.instance;
    rec.instance = null;
    this.set(rec, 'crashed');
    Promise.resolve(inst?.unmount()).catch(() => {});
  }

  private async activate(rec: AppRecord) {
    const t0 = performance.now();
    rec.error = null;
    try {
      if (!rec.instance) {
        this.set(rec, 'loading');
        const mod = await rec.manifest.load();
        const tLoaded = performance.now();
        const container = rec.container ?? document.createElement('div');
        container.className = 'app-frame';
        container.dataset.app = rec.manifest.id;
        if (!container.isConnected) this.opts.stage.appendChild(container);
        rec.container = container;
        rec.instance = await mod.default.mount(container, this.context(rec));
        rec.timing = { loadMs: tLoaded - t0, mountMs: performance.now() - tLoaded };
        this.set(rec, 'ready');
      } else rec.timing = {};
      // The user may have switched away while this app was loading.
      if (this.activeId !== rec.manifest.id) return this.suspend(rec);
      const tAct = performance.now();
      rec.container!.hidden = false;
      await rec.instance!.activate();
      rec.timing!.activateMs = performance.now() - tAct;
      rec.lastActive = Date.now();
      this.set(rec, 'active');
      performance.measure(`bohr:open:${rec.manifest.id}`, { start: t0 });
    } catch (error) {
      if (rec.state === 'crashed') return;
      rec.error = error;
      rec.instance = null;
      this.set(rec, 'crashed');
    }
  }

  private async suspend(rec: AppRecord) {
    if (rec.state === 'crashed') {
      rec.container?.remove();
      rec.container = null;
      rec.error = null;
      this.set(rec, 'unmounted');
      return;
    }
    if (!rec.instance || rec.state === 'suspended') return;
    try {
      await rec.instance.suspend();
    } catch (error) {
      console.error(`[bohrified] ${rec.manifest.name} failed to suspend; unmounting`, error);
      return this.unmount(rec);
    }
    if (rec.container) rec.container.hidden = true;
    this.set(rec, 'suspended');
  }

  private async unmount(rec: AppRecord) {
    const inst = rec.instance;
    rec.instance = null;
    try {
      await inst?.unmount();
    } catch (error) {
      console.error(`[bohrified] ${rec.manifest.name} failed to unmount cleanly`, error);
    }
    rec.container?.remove();
    rec.container = null;
    rec.error = null;
    if (rec.state !== 'registered') this.set(rec, 'unmounted');
  }

  private async enforcePolicy() {
    const suspended = [...this.apps.values()].filter((r) => r.state === 'suspended').sort((a, b) => b.lastActive - a.lastActive);
    for (const rec of suspended.slice(this.maxSuspended)) await this.unmount(rec);
  }

  /** Save-and-release everything, e.g. when the tab is closing. */
  async unmountAll() {
    for (const rec of this.apps.values()) if (rec.instance) await this.unmount(rec);
  }
}

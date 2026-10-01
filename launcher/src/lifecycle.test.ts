import { beforeEach, describe, expect, it } from 'vitest';
import type { AppInstance, AppManifest, SharedSettings } from '@bohrified/app-sdk';
import { LifecycleManager } from './lifecycle';

/** The few DOM bits the lifecycle manager touches, without a browser. */
class FakeEl {
  className = '';
  dataset: Record<string, string> = {};
  hidden = false;
  isConnected = false;
  appendChild(c: FakeEl) {
    c.isConnected = true;
    return c;
  }
  remove() {
    this.isConnected = false;
  }
}

const settings: SharedSettings = { theme: 'system' };

function fakeApp(id: string, log: string[], opts: { failMount?: boolean; failSuspend?: boolean } = {}): AppManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    icon: '',
    accent: '#000',
    load: async () => ({
      default: {
        mount: async (): Promise<AppInstance> => {
          if (opts.failMount) throw new Error('boom');
          log.push(`${id}:mount`);
          return {
            activate: () => void log.push(`${id}:activate`),
            suspend: () => {
              if (opts.failSuspend) throw new Error('cannot suspend');
              log.push(`${id}:suspend`);
            },
            unmount: () => void log.push(`${id}:unmount`),
          };
        },
      },
    }),
  };
}

let log: string[];
let changes: number;
const make = (ids: string[], o: { maxSuspended?: number; failing?: Record<string, { failMount?: boolean; failSuspend?: boolean }> } = {}) =>
  new LifecycleManager(ids.map((id) => fakeApp(id, log, o.failing?.[id])), {
    stage: new FakeEl() as unknown as HTMLElement,
    baseUrl: '/',
    settings,
    maxSuspended: o.maxSuspended,
    onChange: () => void changes++,
  });
const states = (m: LifecycleManager) => Object.fromEntries([...m.apps].map(([id, r]) => [id, r.state]));

beforeEach(() => {
  log = [];
  changes = 0;
  (globalThis as unknown as { document: unknown }).document = { createElement: () => new FakeEl() };
});

describe('lifecycle', () => {
  it('launches: nothing loads until an app is opened', async () => {
    const m = make(['a', 'b']);
    expect(states(m)).toEqual({ a: 'registered', b: 'registered' });
    expect(log).toEqual([]);
    await m.open('a');
    expect(log).toEqual(['a:mount', 'a:activate']);
    expect(states(m)).toEqual({ a: 'active', b: 'registered' });
    expect(m.active).toBe('a');
  });

  it('switches: the previous app suspends, the next activates', async () => {
    const m = make(['a', 'b']);
    await m.open('a');
    await m.open('b');
    expect(states(m)).toEqual({ a: 'suspended', b: 'active' });
    expect(log).toEqual(['a:mount', 'a:activate', 'a:suspend', 'b:mount', 'b:activate']);
  });

  it('resumes a suspended app without remounting it', async () => {
    const m = make(['a', 'b']);
    await m.open('a');
    await m.open('b');
    log.length = 0;
    await m.open('a');
    expect(log).toEqual(['b:suspend', 'a:activate']);
    expect(states(m)).toEqual({ a: 'active', b: 'suspended' });
  });

  it('showing the launcher suspends the active app', async () => {
    const m = make(['a']);
    await m.open('a');
    await m.open(null);
    expect(states(m).a).toBe('suspended');
    expect(m.active).toBeNull();
  });

  it('evicts the least recently used paused app beyond the limit', async () => {
    const m = make(['a', 'b', 'c', 'd'], { maxSuspended: 2 });
    for (const id of ['a', 'b', 'c', 'd']) {
      await m.open(id);
      await new Promise((r) => setTimeout(r, 2)); // distinct lastActive stamps
    }
    expect(states(m)).toEqual({ a: 'unmounted', b: 'suspended', c: 'suspended', d: 'active' });
    expect(log).toContain('a:unmount');
    expect(log).not.toContain('b:unmount');
  });

  it('unmountSuspended frees every paused app and leaves the active one', async () => {
    const m = make(['a', 'b', 'c']);
    await m.open('a');
    await m.open('b');
    await m.open('c');
    await m.unmountSuspended();
    expect(states(m)).toEqual({ a: 'unmounted', b: 'unmounted', c: 'active' });
  });

  it('close unmounts an app and clears the active one', async () => {
    const m = make(['a']);
    await m.open('a');
    await m.close('a');
    expect(states(m).a).toBe('unmounted');
    expect(m.active).toBeNull();
    expect(log.at(-1)).toBe('a:unmount');
  });

  it('serializes rapid switching so mounts never interleave', async () => {
    const m = make(['a', 'b', 'c']);
    await Promise.all([m.open('a'), m.open('b'), m.open('c'), m.open('a')]);
    expect(m.active).toBe('a');
    expect(states(m).a).toBe('active');
    expect(Object.values(states(m)).filter((s) => s === 'active')).toHaveLength(1);
    // Every app that was ever activated is either paused or active: none stuck loading.
    expect(Object.values(states(m)).some((s) => s === 'loading' || s === 'ready')).toBe(false);
  });

  it('isolates a crash: the failing app is marked crashed and the others keep working', async () => {
    const m = make(['good', 'bad'], { failing: { bad: { failMount: true } } });
    await m.open('good');
    await m.open('bad');
    expect(states(m)).toEqual({ good: 'suspended', bad: 'crashed' });
    expect(m.apps.get('bad')!.error).toBeInstanceOf(Error);
    await m.open('good');
    expect(states(m)).toEqual({ good: 'active', bad: 'unmounted' });
  });

  it('a fatal error reported by a running app crashes only that app', async () => {
    const m = make(['a', 'b']);
    await m.open('a');
    const ctx = (m as unknown as { context(r: unknown): { reportError(e: unknown, fatal?: boolean): void } }).context(m.apps.get('a'));
    const quiet = console.error;
    console.error = () => {};
    ctx.reportError(new Error('render failed'), true);
    console.error = quiet;
    expect(states(m).a).toBe('crashed');
    await m.open('b');
    expect(states(m).b).toBe('active');
  });

  it('unmounts an app that fails to suspend rather than leaving it half-alive', async () => {
    const m = make(['a', 'b'], { failing: { a: { failSuspend: true } } });
    const quiet = console.error;
    console.error = () => {};
    await m.open('a');
    await m.open('b');
    console.error = quiet;
    expect(states(m)).toEqual({ a: 'unmounted', b: 'active' });
  });

  it('can reload a crashed app', async () => {
    const m = make(['a']);
    await m.open('a');
    (m.apps.get('a')!).state = 'crashed';
    await m.reload('a');
    expect(states(m).a).toBe('active');
  });

  it('rejects duplicate ids', () => {
    expect(() => make(['a', 'a'])).toThrow(/Duplicate/);
  });

  it('forwards activity, metrics and shortcuts from apps', async () => {
    const seen: unknown[] = [];
    const m = new LifecycleManager([fakeApp('a', log)], {
      stage: new FakeEl() as unknown as HTMLElement,
      baseUrl: '/',
      settings,
      onChange: () => {},
      onActivity: (id, a) => seen.push(['activity', id, a]),
      onMetrics: (id, d) => seen.push(['metrics', id, d]),
      onShortcut: (n) => seen.push(['shortcut', n]),
    });
    const ctx = (m as unknown as { context(r: unknown): { setActivity(a: unknown): void; setMetrics(d: unknown): void; shortcut(n: string): void } }).context(m.apps.get('a'));
    ctx.setActivity({ title: 'Lesson' });
    ctx.setMetrics({ canvases: 2 });
    ctx.shortcut('quick-launcher');
    expect(seen).toEqual([['activity', 'a', { title: 'Lesson' }], ['metrics', 'a', { canvases: 2 }], ['shortcut', 'quick-launcher']]);
  });
});

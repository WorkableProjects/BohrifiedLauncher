import { checkBudgets, type BudgetResult } from '@bohrified/app-sdk';
import type { LifecycleManager } from './lifecycle';

/**
 * Lightweight diagnostics: a snapshot taken when asked (Settings → Diagnostics,
 * or `__bohr.diagnostics()`), never polled. Loaded on demand so it adds nothing to startup.
 */

export interface AppDiagnostics {
  id: string;
  name: string;
  state: string;
  loadMs?: number;
  mountMs?: number;
  activateMs?: number;
  /** Numbers the app reported about itself (Flow: canvases, elements, frameP95Ms…). */
  metrics?: Record<string, number>;
}

export interface Diagnostics {
  at: string;
  startup: { domContentLoadedMs: number | null; loadMs: number | null; shellReadyMs: number | null };
  /** JS heap in MB where the browser exposes it (Chromium). */
  heapMB: number | null;
  apps: AppDiagnostics[];
  suspendedApps: number;
  budgets: BudgetResult[];
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function collect(manager: LifecycleManager, metrics: ReadonlyMap<string, Record<string, number>>): Diagnostics {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const ready = performance.getEntriesByName('bohr:shell-ready')[0];
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  const apps: AppDiagnostics[] = [...manager.apps.values()].map((r) => ({
    id: r.manifest.id,
    name: r.manifest.name,
    state: r.state,
    loadMs: r.timing?.loadMs === undefined ? undefined : round(r.timing.loadMs),
    mountMs: r.timing?.mountMs === undefined ? undefined : round(r.timing.mountMs),
    activateMs: r.timing?.activateMs === undefined ? undefined : round(r.timing.activateMs),
    metrics: metrics.get(r.manifest.id),
  }));
  const suspended = apps.filter((a) => a.state === 'suspended');

  const cold = apps.filter((a) => a.loadMs !== undefined).map((a) => (a.loadMs ?? 0) + (a.mountMs ?? 0) + (a.activateMs ?? 0));
  const warm = apps.filter((a) => a.loadMs === undefined && a.activateMs !== undefined).map((a) => a.activateMs!);
  const flow = metrics.get('flow');
  const flowSuspended = suspended.some((a) => a.id === 'flow');

  const budgets = checkBudgets({
    launcherReadyMs: ready ? round(ready.startTime) : undefined,
    coldOpenMs: cold.length ? Math.max(...cold) : undefined,
    switchMs: warm.length ? Math.max(...warm) : undefined,
    launcherHeapMB: undefined,
    suspendedCanvases: flowSuspended && flow ? flow.canvases : undefined,
    maxSuspendedApps: suspended.length,
    flowFrameP95Ms: flow && flow.frames > 0 ? flow.frameP95Ms : undefined,
  });

  return {
    at: new Date().toISOString(),
    startup: {
      domContentLoadedMs: nav ? round(nav.domContentLoadedEventEnd) : null,
      loadMs: nav ? round(nav.loadEventEnd) : null,
      shellReadyMs: ready ? round(ready.startTime) : null,
    },
    heapMB: mem ? round(mem.usedJSHeapSize / 1048576) : null,
    apps,
    suspendedApps: suspended.length,
    budgets,
  };
}

/** Plain text, for the panel and for pasting into a bug report. */
export function format(d: Diagnostics): string {
  const ms = (n: number | null | undefined) => (n == null ? '—' : `${n} ms`);
  const lines = [
    `Bohrified diagnostics · ${d.at}`,
    `Startup: DOMContentLoaded ${ms(d.startup.domContentLoadedMs)} · shell ready ${ms(d.startup.shellReadyMs)} · load ${ms(d.startup.loadMs)}`,
    `JS heap: ${d.heapMB == null ? 'not available in this browser' : `${d.heapMB} MB`}`,
    '',
    'Apps',
  ];
  for (const a of d.apps) {
    const t = a.loadMs === undefined && a.activateMs === undefined ? '' : ` · load ${ms(a.loadMs)} · mount ${ms(a.mountMs)} · activate ${ms(a.activateMs)}`;
    const m = a.metrics ? ` · ${Object.entries(a.metrics).map(([k, v]) => `${k} ${v}`).join(', ')}` : '';
    lines.push(`  ${a.name}: ${a.state}${t}${m}`);
  }
  lines.push('', 'Budgets');
  if (!d.budgets.length) lines.push('  Nothing measured yet. Open an app first.');
  for (const b of d.budgets) lines.push(`  ${b.ok ? '✓' : '✗'} ${b.label}: ${b.value} ${b.unit} (limit ${b.max})`);
  return lines.join('\n');
}

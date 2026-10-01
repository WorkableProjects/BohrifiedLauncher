/**
 * Practical performance budgets for Bohrified (App SDK 1.2).
 *
 * Numbers are for a mid-range laptop running Chrome, measured by
 * `npm run test:lifecycle` against the production build, and are meant to
 * catch regressions, not to be hit exactly. See docs/performance/budgets.md.
 */

export interface Budget {
  /** What is measured. */
  label: string;
  unit: 'ms' | 'MB' | 'count';
  /** Fails above this. */
  max: number;
}

export const BUDGETS = {
  /** Navigation start → launcher cards on screen, with no app code loaded. */
  launcherReadyMs: { label: 'Launcher ready', unit: 'ms', max: 1000 },
  /** Click → app active, first time (loads and mounts the app). */
  coldOpenMs: { label: 'Cold open', unit: 'ms', max: 3000 },
  /** Click → app active, from suspended. */
  switchMs: { label: 'Switch to a paused app', unit: 'ms', max: 1500 },
  /** Click → app active, after it was unmounted (remount). */
  remountMs: { label: 'Reopen after unmount', unit: 'ms', max: 4000 },
  /** JS heap with only the launcher loaded. */
  launcherHeapMB: { label: 'Launcher heap', unit: 'MB', max: 4 },
  /** Heap growth over a run of repeated switches (a leak detector). */
  switchHeapGrowthMB: { label: 'Heap growth over repeated switching', unit: 'MB', max: 3 },
  /** Canvases a suspended Flow may keep alive. */
  suspendedCanvases: { label: 'Canvases in a paused Flow', unit: 'count', max: 0 },
  /** Apps allowed to stay mounted but paused before the least recently used is unmounted. */
  maxSuspendedApps: { label: 'Paused apps kept mounted', unit: 'count', max: 2 },
  /** Flow p95 frame work while drawing, per frame. */
  flowFrameP95Ms: { label: 'Flow frame work (p95)', unit: 'ms', max: 8 },
} as const satisfies Record<string, Budget>;

export type BudgetName = keyof typeof BUDGETS;

export interface BudgetResult {
  name: BudgetName;
  label: string;
  unit: Budget['unit'];
  value: number;
  max: number;
  ok: boolean;
}

/** Compare measurements with the budgets. Names that weren't measured are left out. */
export function checkBudgets(measured: Partial<Record<BudgetName, number>>): BudgetResult[] {
  const out: BudgetResult[] = [];
  for (const name of Object.keys(BUDGETS) as BudgetName[]) {
    const value = measured[name];
    if (typeof value !== 'number' || Number.isNaN(value)) continue;
    const b: Budget = BUDGETS[name];
    out.push({ name, label: b.label, unit: b.unit, value, max: b.max, ok: value <= b.max });
  }
  return out;
}

/** 95th percentile (nearest rank) of a list of numbers; 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

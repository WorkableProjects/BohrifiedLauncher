import { localStore } from '@bohrified/persistence';
import type { AppActivity, AppManifest } from '@bohrified/app-sdk';

/**
 * What the launcher remembers about the user's apps: which they used last
 * ("Continue with…"), which are pinned, what they were doing, and which
 * versions they have already seen. Small JSON in localStorage under `bohr:`.
 */

export interface RecentEntry {
  id: string;
  at: number;
}

export interface StoredActivity extends AppActivity {
  at: number;
}

const MAX_RECENT = 8;
const prefs = localStore();

const isEntry = (v: unknown): v is RecentEntry =>
  typeof v === 'object' && v !== null && typeof (v as RecentEntry).id === 'string' && typeof (v as RecentEntry).at === 'number';

export const loadRecent = (): RecentEntry[] => {
  const raw = prefs.get<unknown>('recent', []);
  return Array.isArray(raw) ? raw.filter(isEntry).slice(0, MAX_RECENT) : [];
};

/** Put `id` first, once. Pure: returns a new list. */
export function touchRecent(list: readonly RecentEntry[], id: string, at: number): RecentEntry[] {
  return [{ id, at }, ...list.filter((r) => r.id !== id)].slice(0, MAX_RECENT);
}

export const saveRecent = (list: readonly RecentEntry[]) => prefs.set('recent', list);

export const loadPins = (): string[] => {
  const raw = prefs.get<unknown>('pins', []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
};
export const savePins = (pins: readonly string[]) => prefs.set('pins', pins);

export const togglePin = (pins: readonly string[], id: string): string[] => (pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id]);

export const loadActivity = (id: string): StoredActivity | null => {
  const a = prefs.get<Partial<StoredActivity> | null>(`activity:${id}`, null);
  return a && typeof a.title === 'string' && typeof a.at === 'number' ? (a as StoredActivity) : null;
};
export const saveActivity = (id: string, activity: AppActivity | null, at: number) =>
  activity ? prefs.set(`activity:${id}`, { title: activity.title.slice(0, 120), detail: activity.detail?.slice(0, 80), at } satisfies StoredActivity) : prefs.remove(`activity:${id}`);

/** The app to offer as "Continue with…": the most recently used one that is still registered. */
export function continueTarget(recent: readonly RecentEntry[], manifests: readonly Pick<AppManifest, 'id'>[]): RecentEntry | null {
  const known = new Set(manifests.map((m) => m.id));
  return recent.find((r) => known.has(r.id)) ?? null;
}

/** Recent apps that still exist, newest first, limited to `limit`. */
export function recentApps<T extends Pick<AppManifest, 'id'>>(recent: readonly RecentEntry[], manifests: readonly T[], limit = 4): T[] {
  const byId = new Map(manifests.map((m) => [m.id, m]));
  return recent.flatMap((r) => byId.get(r.id) ?? []).slice(0, limit);
}

// ── New / updated indicators ──────────────────────────────────────────────

export type Freshness = 'new' | 'updated' | null;

/** App id → the version the user last opened. Absent entirely until the first visit. */
type Seen = Record<string, string>;

/**
 * First visit: everything is already "seen" (a brand-new user isn't told
 * that every app is new). After that, an app missing from the record is
 * new, and one whose version changed is updated, until it is opened.
 */
export function initSeen(manifests: readonly Pick<AppManifest, 'id' | 'version'>[]): Seen {
  const stored = prefs.get<Seen | null>('seen', null);
  if (stored && typeof stored === 'object') return stored;
  const baseline = Object.fromEntries(manifests.map((m) => [m.id, m.version]));
  prefs.set('seen', baseline);
  return baseline;
}

export function freshness(seen: Seen, m: Pick<AppManifest, 'id' | 'version'>): Freshness {
  const v = seen[m.id];
  return v === undefined ? 'new' : v !== m.version ? 'updated' : null;
}

export function markSeen(seen: Seen, m: Pick<AppManifest, 'id' | 'version'>): Seen {
  if (seen[m.id] === m.version) return seen;
  const next = { ...seen, [m.id]: m.version };
  prefs.set('seen', next);
  return next;
}

// ── Search ────────────────────────────────────────────────────────────────

/**
 * How well `query` matches `text`: 0 for no match. Prefix beats word-prefix
 * beats substring beats scattered letters (in order), so "rub" finds
 * Rubricable and "fw" finds Flow Whiteboard.
 */
export function score(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 100 - Math.min(t.length - q.length, 50) / 2;
  if (t.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 80;
  if (t.includes(q)) return 60;
  // Scattered letters only make sense against short text like a name; in a sentence they match anything.
  if (t.length > 32) return 0;
  let i = 0;
  for (const ch of t) if (ch === q[i] && ++i === q.length) break;
  return i === q.length ? 20 : 0;
}

export function scoreApp(query: string, m: Pick<AppManifest, 'name' | 'description' | 'keywords'>): number {
  const name = score(query, m.name);
  if (name) return name + 20;
  const tags = Math.max(0, ...(m.keywords ?? []).map((k) => score(query, k)));
  if (tags) return tags;
  // Description matches only count as whole substrings, not scattered letters.
  return query.trim() && m.description.toLowerCase().includes(query.trim().toLowerCase()) ? 30 : 0;
}

/** Apps matching `query`, best first (registry order breaks ties). */
export function searchApps<T extends Pick<AppManifest, 'name' | 'description' | 'keywords'>>(query: string, manifests: readonly T[]): T[] {
  if (!query.trim()) return [...manifests];
  return manifests
    .map((m, i) => ({ m, i, s: scoreApp(query, m) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.m);
}

/** "5 minutes ago", "yesterday". */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (s < 45) return 'just now';
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}

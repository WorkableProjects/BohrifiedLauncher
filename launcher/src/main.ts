import './styles.css';
import { shellShortcut, type AppSetting, type LifecycleState, type SharedSettings, type ShellShortcut } from '@bohrified/app-sdk';
import { localStore } from '@bohrified/persistence';
import { applyTextSize, applyTheme, isTextSize, isThemePref, type TextSize, type ThemePref } from '@bohrified/ui';
import { el } from '@bohrified/utilities';
import { ago, continueTarget, freshness, initSeen, loadActivity, loadPins, loadRecent, markSeen, recentApps, saveActivity, savePins, saveRecent, searchApps, togglePin, touchRecent } from './library';
import { LifecycleManager, type AppRecord } from './lifecycle';
import { createQuickLauncher, type QuickItem } from './quick';
import { registry } from './registry';
import { createJoinPage, joinConfigured } from './join';
import { currentRoute, navigate, navigateJoin } from './router';
import { WindowManager, type SnapZone } from './windows';

/**
 * Bohrified shell: a launcher page, a taskbar of open apps, and a desktop
 * stage where each app lives in its own window. Only this file, the
 * registry metadata, the window manager and the lifecycle manager load at
 * startup; app code waits until an app is opened.
 */

declare const __APP_VERSION__: string;

const base = import.meta.env.BASE_URL;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const bar = $('#tabs');
const home = $('#home');
const grid = $('#apps');
const stage = $<HTMLElement>('#stage');
const status = $('#status');
$('#version').textContent = __APP_VERSION__;

// Shared settings: owned by Bohrified, applied to the shell and sent to every app.
const prefs = localStore();
const loadSettings = (): SharedSettings => {
  const theme = prefs.get<unknown>('theme', 'system');
  return { theme: isThemePref(theme) ? theme : 'system' };
};
let settings = loadSettings();
let stopTheme = applyTheme(settings.theme);

// Text size is Bohrified's own (it scales the shell's semantic text styles).
const savedSize = prefs.get<unknown>('textSize', 'default');
let textSize: TextSize = isTextSize(savedSize) ? savedSize : 'default';
applyTextSize(textSize);

const windows = new WindowManager(stage, {
  onFocusRequest: (id) => navigate(id),
  // Minimizing the focused window hands focus to the next one, or back to the launcher.
  onMinimize: (id) => manager.active === id && navigate(windows.visible()[0] ?? null),
  onClose: (id) => void closeWindow(id),
  onChange: () => render(),
});

/** What apps last reported about themselves, for diagnostics. */
const appMetrics = new Map<string, Record<string, number>>();

const joinPage = createJoinPage($('#join'), { base, configured: joinConfigured(import.meta.env.VITE_LIVE_SESSION_URL) });

const manager = new LifecycleManager(registry, {
  stage,
  host: (id) => windows.body(id),
  baseUrl: base,
  settings,
  onChange: () => render(),
  onMetrics: (id, m) => appMetrics.set(id, m),
  onActivity: (id, activity) => {
    saveActivity(id, activity, Date.now());
    renderHome();
  },
  onShortcut: (name) => runShortcut(name),
});

function setTheme(theme: ThemePref) {
  settings = { ...settings, theme };
  prefs.set('theme', theme);
  stopTheme();
  stopTheme = applyTheme(theme);
  manager.setSettings(settings);
  renderSettings();
}

const sheet = $<HTMLDialogElement>('#settings');
function renderSettings() {
  sheet.querySelectorAll<HTMLButtonElement>('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === settings.theme)));
  sheet.querySelectorAll<HTMLButtonElement>('[data-text-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.textSet === textSize)));
  const paused = [...manager.apps.values()].filter((r) => r.state === 'suspended').length;
  const release = $<HTMLButtonElement>('#release');
  release.disabled = paused === 0;
  release.textContent = paused ? `Close ${paused} paused app${paused > 1 ? 's' : ''}` : 'No paused apps';
}

// Each app's own preferences (from its manifest), under the shared ones.
const appSettings = $('#app-settings');
function settingControl(s: AppSetting, appName: string): HTMLElement {
  const label = `${appName}: ${s.label}`;
  switch (s.kind) {
    case 'toggle':
      return el('input', { type: 'checkbox', role: 'switch', className: 'switch', checked: s.get(), ariaLabel: label, onchange: (e: Event) => s.set((e.target as HTMLInputElement).checked) });
    case 'choice': {
      const value = s.get();
      return el(
        'div',
        { className: 'seg', role: 'group', ariaLabel: label },
        ...s.options.map((o) => {
          const b = el('button', { type: 'button', textContent: o.label, onclick: () => (s.set(o.value), renderAppSettings()) });
          b.setAttribute('aria-pressed', String(o.value === value));
          return b;
        }),
      );
    }
    case 'text':
      return el('input', {
        type: 'text',
        className: 'field',
        value: s.get(),
        placeholder: s.placeholder ?? '',
        maxLength: s.maxLength ?? 200,
        ariaLabel: label,
        onchange: (e: Event) => s.set((e.target as HTMLInputElement).value),
      });
    case 'action':
      return el('button', {
        type: 'button',
        className: `plain${s.danger ? ' danger' : ''}`,
        textContent: s.button,
        ariaLabel: label,
        onclick: () => {
          if (s.confirm && !confirm(s.confirm)) return;
          s.run();
          renderAppSettings();
        },
      });
  }
}
function renderAppSettings() {
  // Don't rebuild under someone typing in a field.
  if (sheet.open && appSettings.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'text') return;
  const withSettings = [...manager.apps.values()].filter((r) => r.manifest.settings?.settings.length);
  // The app on screen comes first.
  withSettings.sort((a, b) => Number(b.manifest.id === manager.active) - Number(a.manifest.id === manager.active));
  appSettings.replaceChildren(
    ...withSettings.flatMap((r) => [
      el('h3', { className: 'group' }, icon(r, 16), r.manifest.name),
      ...r.manifest.settings!.settings.map((s) =>
        el(
          'div',
          { className: 'setting', dataset: { app: r.manifest.id, setting: s.id } },
          el('div', {}, el('b', { textContent: s.label }), ...(s.description ? [el('p', { textContent: s.description })] : [])),
          settingControl(s, r.manifest.name),
        ),
      ),
    ]),
  );
}
const appSettingKeys = new Set(registry.flatMap((m) => m.settings?.storageKeys ?? []));

$('#gear').addEventListener('click', () => {
  renderAppSettings();
  renderSettings();
  sheet.showModal();
});
sheet.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t === sheet) sheet.close(); // backdrop
  const pref = t.closest<HTMLElement>('[data-theme-set]')?.dataset.themeSet;
  if (isThemePref(pref)) setTheme(pref);
  const size = t.closest<HTMLElement>('[data-text-set]')?.dataset.textSet;
  if (isTextSize(size)) {
    textSize = size;
    prefs.set('textSize', size);
    applyTextSize(size);
    renderSettings();
  }
});
$('#release').addEventListener('click', () => void manager.unmountSuspended().then(renderSettings));
// Another Bohrified tab changed the theme.
addEventListener('storage', (e) => {
  if (e.key === 'bohr:theme' && loadSettings().theme !== settings.theme) setTheme(loadSettings().theme);
  // An app (or another tab) changed one of its own settings.
  if (e.key && appSettingKeys.has(e.key) && sheet.open) renderAppSettings();
});

const STATE_LABEL: Partial<Record<LifecycleState, string>> = {
  loading: 'Opening…',
  ready: 'Opening…',
  active: 'Open',
  suspended: 'Paused',
  crashed: 'Stopped',
};

const icon = (r: AppRecord, size: number) => el('img', { src: base + r.manifest.icon, alt: '', width: size, height: size, className: 'app-icon', draggable: false });

/** Motion is decorative: skipped for Reduce Motion. */
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Keep `parent`'s children equal to `wanted` without detaching nodes that
 * are already in place (re-inserting one would restart its CSS animation).
 * Nodes leaving get a short exit animation first.
 */
function reconcile(parent: HTMLElement, wanted: HTMLElement[]) {
  const keep = new Set(wanted);
  for (const child of [...parent.children] as HTMLElement[]) {
    if (keep.has(child) || child.dataset.leaving) continue;
    if (reduceMotion()) {
      child.remove();
      continue;
    }
    // Animate an inert copy out, so the real element is gone at once.
    const ghost = child.cloneNode(true) as HTMLElement;
    ghost.dataset.leaving = '1';
    ghost.inert = true;
    ghost.removeAttribute('aria-current');
    ghost.querySelectorAll<HTMLElement>('[class]').forEach((n) => (n.className = n.className.replace(/\b(tab-open|tab-close)\b/g, '$1-ghost')));
    ghost.style.animation = 'none';
    child.replaceWith(ghost);
    ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.9)' }], { duration: 180, easing: 'ease-in' }).finished.then(() => ghost.remove(), () => ghost.remove());
  }
  const live = () => [...parent.children].filter((c) => !(c as HTMLElement).dataset.leaving);
  wanted.forEach((node, i) => {
    if (live()[i] !== node) parent.insertBefore(node, live()[i] ?? null);
  });
}

// ── Library state: recents, pins, what's new ─────────────────────────────────
let recent = loadRecent();
let pins = loadPins().filter((id) => registry.some((m) => m.id === id));
let seen = initSeen(registry);
let query = '';

const search = $<HTMLInputElement>('#search');
const pinnedSection = $('#pinned');
const recentSection = $('#recent');
const continueLink = $<HTMLAnchorElement>('#continue');
const noMatch = $('#no-match');

// Cards and tabs persist across renders, so entrance animations play once (or when the launcher is shown again).
interface CardEntry {
  slot: HTMLElement;
  card: HTMLAnchorElement;
  icon: HTMLImageElement;
  pin: HTMLButtonElement;
}
const cardEls = new Map<string, CardEntry>();
/** The app most recently on screen: its icon is the shared element between the library and the app. */
let lastApp: string | null = null;

function makeCard(r: AppRecord, i: number): CardEntry {
  const { id, name } = r.manifest;
  const iconEl = icon(r, 56);
  const card = el(
    'a',
    { href: `${base}app/${id}`, className: 'card', dataset: { app: id } },
    iconEl,
    el(
      'div',
      { className: 'card-text' },
      el('h3', {}, el('span', { textContent: name }), el('span', { className: 'ver', textContent: `v${r.manifest.version}` }), el('span', { className: 'fresh', hidden: true })),
      el('p', { textContent: r.manifest.description }),
    ),
  );
  const pin = el('button', {
    type: 'button',
    className: 'pin',
    ariaLabel: `Pin ${name}`,
    title: `Pin ${name}`,
    innerHTML: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8L12 3.2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    onclick: () => {
      pins = togglePin(pins, id);
      savePins(pins);
      renderHome();
    },
  });
  const slot = el('div', { className: 'slot', dataset: { app: id } }, card, pin);
  slot.style.setProperty('--accent', r.manifest.accent);
  slot.style.setProperty('--i', String(i));
  card.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    lastApp = id;
    renderCards(); // name this card's icon so it can grow into the app's opening screen
    navigate(id);
  });
  // Warm the app's adapter module on intent; the heavy app code still waits for open.
  card.addEventListener('pointerenter', () => void r.manifest.load().catch(() => {}), { once: true });
  return { slot, card, icon: iconEl, pin };
}

function renderCards() {
  const order = new Map([...manager.apps.keys()].map((id, i) => [id, i]));
  const matches = new Set(searchApps(query, registry).map((m) => m.id));
  const ranked = query.trim() ? searchApps(query, registry).map((m) => m.id) : [...manager.apps.keys()];
  for (const r of manager.apps.values()) {
    const id = r.manifest.id;
    let entry = cardEls.get(id);
    if (!entry) cardEls.set(id, (entry = makeCard(r, order.get(id)!)));
    entry.slot.hidden = !matches.has(id);

    const label = STATE_LABEL[r.state];
    const badge = entry.card.querySelector<HTMLElement>('.badge');
    if (!label) badge?.remove();
    else if (!badge) entry.card.append(el('span', { className: `badge badge-${r.state}`, textContent: label }));
    else if (badge.textContent !== label || badge.className !== `badge badge-${r.state}`) {
      badge.className = `badge badge-${r.state}`;
      badge.textContent = label;
      badge.animate([{ transform: 'scale(0.8)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
    }

    const fresh = freshness(seen, r.manifest);
    const pill = entry.card.querySelector<HTMLElement>('.fresh')!;
    pill.hidden = !fresh;
    pill.textContent = fresh === 'new' ? 'New' : fresh === 'updated' ? 'Updated' : '';
    pill.dataset.kind = fresh ?? '';

    const pinned = pins.includes(id);
    entry.pin.setAttribute('aria-pressed', String(pinned));
    entry.pin.title = entry.pin.ariaLabel = `${pinned ? 'Unpin' : 'Pin'} ${r.manifest.name}`;
    entry.icon.style.viewTransitionName = lastApp === id ? 'app-icon' : '';
  }
  reconcile(grid, ranked.map((id) => cardEls.get(id)?.slot).filter((n): n is HTMLElement => !!n).concat(registry.filter((m) => !matches.has(m.id)).map((m) => cardEls.get(m.id)!.slot)));
  noMatch.hidden = matches.size > 0;
}

/** Compact one-tap links for pinned and recent apps. */
function chipRow(section: HTMLElement, apps: AppRecord[]) {
  section.hidden = apps.length === 0 || !!query.trim();
  const row = section.querySelector<HTMLElement>('.chips')!;
  const key = apps.map((r) => r.manifest.id).join();
  if (row.dataset.key === key) return;
  row.dataset.key = key;
  row.replaceChildren(
    ...apps.map((r) => {
      const chip = el('a', { href: `${base}app/${r.manifest.id}`, className: 'chip', dataset: { app: r.manifest.id } }, icon(r, 24), el('span', { textContent: r.manifest.name }));
      chip.style.setProperty('--accent', r.manifest.accent);
      chip.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(r.manifest.id);
      });
      return chip;
    }),
  );
}

/** "Continue with Flow": the main way back into the last app, with what the user was doing. */
function renderContinue() {
  const target = continueTarget(recent, registry);
  continueLink.hidden = !target || !!query.trim();
  if (!target) return;
  const r = manager.apps.get(target.id)!;
  const activity = loadActivity(target.id);
  const when = ago(Math.max(target.at, activity?.at ?? 0));
  const context = [activity?.title, activity?.detail, when].filter(Boolean).join(' · ');
  const key = `${target.id}|${context}`;
  if (continueLink.dataset.key === key) return;
  continueLink.dataset.key = key;
  continueLink.href = `${base}app/${target.id}`;
  continueLink.dataset.app = target.id;
  continueLink.style.setProperty('--accent', r.manifest.accent);
  continueLink.replaceChildren(
    icon(r, 44),
    el('span', { className: 'continue-text' }, el('b', { textContent: `Continue with ${r.manifest.name}` }), el('span', { textContent: context })),
    el('span', { className: 'continue-go', ariaHidden: 'true', textContent: '›' }),
  );
}

function renderHome() {
  renderCards();
  renderContinue();
  chipRow(pinnedSection, pins.flatMap((id) => manager.apps.get(id) ?? []));
  chipRow(
    recentSection,
    recentApps(recent, registry, 4)
      .filter((m) => !pins.includes(m.id))
      .flatMap((m) => manager.apps.get(m.id) ?? []),
  );
}

continueLink.addEventListener('click', (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(continueLink.dataset.app ?? null);
});

// Search: filters as you type; Enter opens the best match, ↓ moves into the results.
const visibleCards = () => [...grid.querySelectorAll<HTMLAnchorElement>('.slot:not([hidden]) > a.card')];
search.addEventListener('input', () => {
  query = search.value;
  renderHome();
});
search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = visibleCards()[0];
    if (first) navigate(first.dataset.app!);
  } else if (e.key === 'ArrowDown') {
    visibleCards()[0]?.focus();
  } else if (e.key === 'Escape' && search.value) {
    search.value = query = '';
    renderHome();
  } else return;
  e.preventDefault();
});

/** Arrow keys move between cards (and their pin buttons stay reachable with Tab). */
grid.addEventListener('keydown', (e) => {
  const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
  const current = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.card');
  if (!dir || !current || e.metaKey || e.ctrlKey || e.altKey) return;
  const cards = visibleCards();
  const here = current.getBoundingClientRect();
  // The nearest card in the requested direction.
  let best: HTMLAnchorElement | null = null;
  let bestDist = Infinity;
  for (const c of cards) {
    if (c === current) continue;
    const b = c.getBoundingClientRect();
    const dx = b.left - here.left;
    const dy = b.top - here.top;
    const ahead = dir[0] ? Math.sign(dx) === dir[0] && Math.abs(dy) < here.height / 2 : Math.sign(dy) === dir[1] && Math.abs(dx) < here.width;
    if (!ahead) continue;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) [best, bestDist] = [c, dist];
  }
  if (best) best.focus();
  else if (dir[1] < 0) search.focus();
  e.preventDefault();
});

// ── Taskbar ──────────────────────────────────────────────────────────────────
const tabEls = new Map<string, HTMLElement>();

function renderTabs() {
  reconcile(
    bar,
    windows.ids().map((id) => {
      const r = manager.apps.get(id)!;
      const active = manager.active === id;
      let tab = tabEls.get(id);
      if (!tab || tab.dataset.leaving) {
        tab = el(
          'div',
          { className: 'tab' },
          el('button', { type: 'button', className: 'tab-open', onclick: () => navigate(id) }, icon(r, 18), el('span', { textContent: r.manifest.name })),
          el('button', {
            type: 'button',
            className: 'tab-close',
            title: `Close ${r.manifest.name}`,
            ariaLabel: `Close ${r.manifest.name}`,
            textContent: '×',
            onclick: () => void closeWindow(id),
          }),
        );
        tabEls.set(id, tab);
      }
      const minimized = windows.isMinimized(id);
      tab.classList.toggle('on', active);
      tab.dataset.state = r.state;
      tab.dataset.min = String(minimized);
      tab.querySelector('.tab-open')!.setAttribute('title', `${r.manifest.name} — ${minimized ? 'Minimized' : (STATE_LABEL[r.state] ?? 'Paused')}`);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
      return tab;
    }),
  );
}

/** Close an app's window and release the app (its work is saved by its unmount). */
async function closeWindow(id: string) {
  const wasActive = manager.active === id;
  await manager.close(id);
  windows.destroy(id);
  tabEls.delete(id);
  if (wasActive) navigate(windows.visible()[0] ?? null);
}

// ── Opening / crash screen ───────────────────────────────────────────────────

/** How long the "Opening…" screen stays up after launching from the library, even if the app is ready sooner. */
const OPEN_HOLD_MS = 1600;
const EXIT_MS = 800;
let holdUntil = 0;
let holdTimer = 0;
let statusExit: Animation | null = null;

function hideStatus(animate: boolean) {
  const rec = manager.active ? manager.apps.get(manager.active) : null;
  const opening = status.firstElementChild?.classList.contains('opening');
  statusExit?.cancel();
  statusExit = null;
  if (!animate || !opening || reduceMotion() || status.hidden) {
    status.hidden = true;
    status.replaceChildren();
    return;
  }
  // The opening screen lifts away while the app settles in underneath.
  const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';
  rec?.container?.animate([{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], { duration: EXIT_MS, easing: ease, fill: 'backwards' });
  const anim = status.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.06)' }], { duration: EXIT_MS, easing: ease });
  statusExit = anim;
  anim.finished.then(
    () => {
      if (statusExit !== anim) return;
      statusExit = null;
      status.hidden = true;
      status.replaceChildren();
    },
    () => {},
  );
}

/** Loading and crash screens sit over the focused window's content, never over its title bar or the bar. */
function renderStatus() {
  const rec = manager.active ? manager.apps.get(manager.active) : null;
  const holding = !!rec && rec.state !== 'crashed' && performance.now() < holdUntil;
  if (!rec || (!holding && rec.state !== 'loading' && rec.state !== 'ready' && rec.state !== 'crashed')) {
    if (rec && statusExit) return; // already leaving
    hideStatus(!!rec);
    return;
  }
  statusExit?.cancel();
  statusExit = null;
  const body = windows.body(rec.manifest.id);
  if (body && status.parentElement !== body) body.append(status);
  status.hidden = false;
  if (holding) {
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(renderStatus, holdUntil - performance.now() + 20);
  }
  if (rec.state === 'crashed') {
    const msg = rec.error instanceof Error ? rec.error.message : String(rec.error ?? 'Unknown error');
    status.replaceChildren(
      el(
        'div',
        { className: 'crash', role: 'alert' },
        icon(rec, 48),
        el('h2', { textContent: `${rec.manifest.name} stopped working` }),
        el('p', { textContent: 'Your saved work is safe. You can reload the app or go back to Bohrified.' }),
        el('pre', { textContent: msg }),
        el(
          'div',
          { className: 'row' },
          el('button', { type: 'button', className: 'primary', textContent: 'Reload app', onclick: () => void manager.reload(rec.manifest.id) }),
          el('button', { type: 'button', textContent: 'Back to Bohrified', onclick: () => navigate(null) }),
        ),
      ),
    );
  } else {
    if (status.firstElementChild?.classList.contains('opening')) return;
    const big = icon(rec, 72);
    big.style.viewTransitionName = 'app-icon';
    status.replaceChildren(
      el('div', { className: 'opening', ariaLive: 'polite' }, big, el('span', { textContent: `Opening ${rec.manifest.name}…` }), el('div', { className: 'opening-bar' }, el('i', {}))),
    );
  }
}

// ── Painting and routing ─────────────────────────────────────────────────────
let view: 'home' | 'app' = 'home';

function paint() {
  const onHome = manager.active === null;
  if (manager.active) lastApp = manager.active;
  home.hidden = !onHome || joining;
  stage.hidden = onHome;
  document.body.dataset.view = joining ? 'join' : onHome ? 'home' : 'app';
  $('#brand').setAttribute('aria-current', onHome ? 'page' : 'false');
  const rec = manager.active ? manager.apps.get(manager.active) : null;
  if (!joining) document.title = rec ? `${rec.manifest.name} · Bohrified` : 'Bohrified';
  renderHome();
  renderTabs();
  renderStatus();
}

/** Switching between the library and an app crossfades and zooms; the app's icon travels between the two. */
function render() {
  const next = manager.active === null ? 'home' : 'app';
  if (next === view) return paint();
  view = next;
  if (next === 'app' && !reduceMotion()) holdUntil = performance.now() + OPEN_HOLD_MS;
  const root = document.documentElement;
  root.dataset.nav = next === 'app' ? 'forward' : 'back';
  if (reduceMotion() || !document.startViewTransition) return paint();
  document.startViewTransition(paint);
}

/** True while the Join Whiteboard page is showing instead of the launcher or a window. */
let joining = false;

function route() {
  const r = currentRoute();
  const id = r.kind === 'app' ? r.id : null;
  joining = r.kind === 'join';
  if (r.kind === 'join') joinPage.show(r.code);
  else joinPage.hide();
  if (id && !manager.apps.has(id)) {
    navigate(null, true);
    return;
  }
  if (id) {
    const m = manager.apps.get(id)!.manifest;
    // The stage must be measurable before a window is placed in it.
    stage.hidden = false;
    windows.ensure({ id, name: m.name, icon: base + m.icon, accent: m.accent });
    windows.setFocused(id);
    recent = touchRecent(recent, id, Date.now());
    saveRecent(recent);
    seen = markSeen(seen, m);
  } else {
    // The launcher is the desktop: showing it tucks every window away.
    windows.minimizeAll();
    windows.setFocused(null);
  }
  void manager.open(id);
}

$('#join-link').addEventListener('click', (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || (e as MouseEvent).button !== 0) return;
  e.preventDefault();
  navigateJoin();
});

$('#brand').addEventListener('click', (e) => {
  e.preventDefault();
  navigate(null);
});
addEventListener('popstate', route);

// ── Quick launcher (Cmd/Ctrl + K) and window shortcuts ───────────────────────
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';
$('#quick-key').textContent = `${MOD} K`;

const snapActive = (zone: SnapZone) => manager.active && windows.snap(manager.active, zone);
const toggleMax = () => manager.active && windows.toggleMaximize(manager.active);
const minimizeActive = () => manager.active && windows.minimize(manager.active);
const closeActive = () => manager.active && void closeWindow(manager.active);

function quickItems(): QuickItem[] {
  const byRecent = new Map(recent.map((r, i) => [r.id, i]));
  const apps: QuickItem[] = [...manager.apps.values()]
    .sort((a, b) => (byRecent.get(a.manifest.id) ?? 99) - (byRecent.get(b.manifest.id) ?? 99))
    .map((r) => ({
      id: `app:${r.manifest.id}`,
      group: 'Apps' as const,
      label: r.manifest.name,
      icon: r.manifest.icon,
      hint: r.state === 'suspended' ? 'Paused' : r.state === 'active' ? 'Open' : `v${r.manifest.version}`,
      keywords: [r.manifest.description, ...(r.manifest.keywords ?? [])].join(' '),
      run: () => navigate(r.manifest.id),
    }));
  const commands: QuickItem[] = [];
  const focused = manager.active;
  if (focused && !windows.compact) {
    const max = windows.mode(focused) === 'maximized';
    commands.push(
      { id: 'win:left', group: 'Windows', label: 'Snap window to the left', hint: `${MOD} Alt ←`, keywords: 'tile half', run: () => snapActive('left') },
      { id: 'win:right', group: 'Windows', label: 'Snap window to the right', hint: `${MOD} Alt →`, keywords: 'tile half', run: () => snapActive('right') },
      { id: 'win:max', group: 'Windows', label: max ? 'Restore window' : 'Maximize window', hint: `${MOD} Alt ↑`, keywords: 'fullscreen full screen', run: toggleMax },
    );
  }
  if (focused) {
    commands.push(
      { id: 'win:min', group: 'Windows', label: 'Minimize window', hint: `${MOD} Alt ↓`, keywords: 'hide', run: minimizeActive },
      { id: 'win:close', group: 'Windows', label: 'Close window', keywords: 'quit', run: closeActive },
    );
  }
  if (windows.visible().length > 1 && !windows.compact) commands.push({ id: 'win:tile', group: 'Windows', label: 'Tile windows side by side', keywords: 'arrange', run: () => windows.tile() });
  commands.push(
    { id: 'home', group: 'Bohrified', label: 'Show Bohrified home', keywords: 'launcher desktop', run: () => navigate(null) },
    { id: 'join', group: 'Bohrified', label: 'Join a whiteboard', keywords: 'student code session tutor live', run: () => navigateJoin() },
    { id: 'settings', group: 'Bohrified', label: 'Open settings', keywords: 'preferences appearance theme', run: () => $('#gear').click() },
  );
  return [...apps, ...commands];
}

const quick = createQuickLauncher($<HTMLDialogElement>('#quick'), quickItems, base);
$('#quick-open').addEventListener('click', () => quick.open());

/** Run a shell shortcut, whether it was typed in the shell or forwarded from an app. */
function runShortcut(name: ShellShortcut) {
  if (name === 'quick-launcher') return quick.toggle();
  if (sheet.open || quick.isOpen || !manager.active || windows.compact) return;
  if (name === 'snap-left') snapActive('left');
  else if (name === 'snap-right') snapActive('right');
  else if (name === 'toggle-maximize') toggleMax();
  else minimizeActive();
}

addEventListener(
  'keydown',
  (e) => {
    const name = shellShortcut(e);
    if (name) {
      e.preventDefault();
      runShortcut(name);
      return;
    }
    // "/" jumps to search from the launcher, like many web apps.
    if (e.key === '/' && manager.active === null && !sheet.open && !quick.isOpen && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)) {
      e.preventDefault();
      search.focus();
    }
  },
  true,
);

// Diagnostics / memory-pressure hook (e.g. from DevTools or a test harness).
declare global {
  interface Window {
    __bohr?: { manager: LifecycleManager; windows: WindowManager; unmountSuspended: () => Promise<void>; diagnostics: () => Promise<import('./diagnostics').Diagnostics> };
  }
}
const diagnostics = async () => (await import('./diagnostics')).collect(manager, appMetrics);
window.__bohr = { manager, windows, unmountSuspended: () => manager.unmountSuspended(), diagnostics };

// Diagnostics load only when the panel is opened, and are never polled.
const diag = $<HTMLDetailsElement>('#diag');
diag.addEventListener('toggle', async () => {
  if (!diag.open) return;
  const mod = await import('./diagnostics');
  $('#diag-out').textContent = mod.format(mod.collect(manager, appMetrics));
});
$('#diag-copy').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  try {
    await navigator.clipboard.writeText($('#diag-out').textContent ?? '');
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = 'Select the text and copy';
  }
  setTimeout(() => (btn.textContent = 'Copy report'), 1500);
});

paint();
route();
performance.mark('bohr:shell-ready');

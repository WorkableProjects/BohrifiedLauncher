import './styles.css';
import type { AppSetting, LifecycleState, SharedSettings } from '@bohrified/app-sdk';
import { localStore } from '@bohrified/persistence';
import { applyTheme, isThemePref, type ThemePref } from '@bohrified/ui';
import { el } from '@bohrified/utilities';
import { LifecycleManager, type AppRecord } from './lifecycle';
import { registry } from './registry';
import { currentAppId, navigate } from './router';

/**
 * Bohrified shell: a launcher page, a thin bar for switching between open
 * apps, and a stage the apps mount into. Only this file, the registry
 * metadata and the lifecycle manager load at startup.
 */

const base = import.meta.env.BASE_URL;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const bar = $('#tabs');
const home = $('#home');
const grid = $('#apps');
const stage = $<HTMLElement>('#stage');
const status = $('#status');

// Shared settings: owned by Bohrified, applied to the shell and sent to every app.
const prefs = localStore();
const loadSettings = (): SharedSettings => {
  const theme = prefs.get<unknown>('theme', 'system');
  return { theme: isThemePref(theme) ? theme : 'system' };
};
let settings = loadSettings();
let stopTheme = applyTheme(settings.theme);

const manager = new LifecycleManager(registry, { stage, baseUrl: base, settings, onChange: () => render() });

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

const isOpen = (r: AppRecord) => r.state === 'loading' || r.state === 'ready' || r.state === 'active' || r.state === 'suspended' || r.state === 'crashed';

const icon = (r: AppRecord, size: number) => el('img', { src: base + r.manifest.icon, alt: '', width: size, height: size, className: 'app-icon', draggable: false });

function renderCards() {
  grid.replaceChildren(
    ...[...manager.apps.values()].map((r) => {
      const label = STATE_LABEL[r.state];
      const card = el(
        'a',
        { href: `${base}app/${r.manifest.id}`, className: 'card', dataset: { app: r.manifest.id } },
        icon(r, 56),
        el('div', { className: 'card-text' }, el('h2', { textContent: r.manifest.name }), el('p', { textContent: r.manifest.description })),
      );
      card.style.setProperty('--accent', r.manifest.accent);
      if (label) card.append(el('span', { className: `badge badge-${r.state}`, textContent: label }));
      card.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(r.manifest.id);
      });
      // Warm the app's adapter module on intent; the heavy app code still waits for open.
      card.addEventListener('pointerenter', () => void r.manifest.load().catch(() => {}), { once: true });
      return card;
    }),
  );
}

function renderTabs() {
  const open = [...manager.apps.values()].filter(isOpen);
  bar.replaceChildren(
    ...open.map((r) => {
      const active = manager.active === r.manifest.id;
      const tab = el(
        'div',
        { className: `tab${active ? ' on' : ''}`, dataset: { state: r.state } },
        el('button', { type: 'button', className: 'tab-open', title: `${r.manifest.name} — ${STATE_LABEL[r.state] ?? ''}`, onclick: () => navigate(r.manifest.id) }, icon(r, 18), el('span', { textContent: r.manifest.name })),
        el('button', {
          type: 'button',
          className: 'tab-close',
          title: `Close ${r.manifest.name}`,
          ariaLabel: `Close ${r.manifest.name}`,
          textContent: '×',
          onclick: () => {
            if (manager.active === r.manifest.id) navigate(null);
            void manager.close(r.manifest.id);
          },
        }),
      );
      if (active) tab.setAttribute('aria-current', 'page');
      return tab;
    }),
  );
}

/** Loading and crash screens sit over the active app's slot, never over the bar. */
function renderStatus() {
  const rec = manager.active ? manager.apps.get(manager.active) : null;
  if (!rec || (rec.state !== 'loading' && rec.state !== 'ready' && rec.state !== 'crashed')) {
    status.hidden = true;
    status.replaceChildren();
    return;
  }
  status.hidden = false;
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
    status.replaceChildren(el('div', { className: 'opening', ariaLive: 'polite' }, icon(rec, 72), el('span', { textContent: `Opening ${rec.manifest.name}…` })));
  }
}

function render() {
  const onHome = manager.active === null;
  home.hidden = !onHome;
  stage.hidden = onHome;
  document.body.dataset.view = onHome ? 'home' : 'app';
  $('#brand').setAttribute('aria-current', onHome ? 'page' : 'false');
  const rec = manager.active ? manager.apps.get(manager.active) : null;
  document.title = rec ? `${rec.manifest.name} · Bohrified` : 'Bohrified';
  renderCards();
  renderTabs();
  renderStatus();
}

function route() {
  const id = currentAppId();
  if (id && !manager.apps.has(id)) {
    navigate(null, true);
    return;
  }
  void manager.open(id);
}

$('#brand').addEventListener('click', (e) => {
  e.preventDefault();
  navigate(null);
});
addEventListener('popstate', route);

// Diagnostics / memory-pressure hook (e.g. from DevTools or a test harness).
declare global {
  interface Window {
    __bohr?: { manager: LifecycleManager; unmountSuspended: () => Promise<void> };
  }
}
window.__bohr = { manager, unmountSuspended: () => manager.unmountSuspended() };

render();
route();

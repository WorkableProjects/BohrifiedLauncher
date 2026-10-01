import { sessionStore } from '@bohrified/persistence';
import { el } from '@bohrified/utilities';

/**
 * Desktop-style windows for Bohrified.
 *
 * Each open app gets one window inside the stage. The window manager owns
 * only geometry and chrome (title bar, controls, resize handles, snapping);
 * the lifecycle manager still decides what is running. The focused window
 * is the one active app: every other window, visible or minimized, is
 * suspended by the lifecycle manager and shows a "Paused" cover until it is
 * focused again, so background windows never keep a runtime alive.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SnapZone = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type WindowMode = 'normal' | 'maximized' | 'snapped';

/** Persisted for the current session only (per tab). */
interface Saved {
  rect: Rect;
  mode: WindowMode;
  zone: SnapZone | null;
  minimized: boolean;
}

export interface WindowInfo {
  id: string;
  name: string;
  icon: string;
  accent: string;
}

export interface WindowHooks {
  /** The user asked for a window to become the focused one (click, drag, resume). */
  onFocusRequest(id: string): void;
  onMinimize(id: string): void;
  onClose(id: string): void;
  /** Anything the tabs or commands show changed. */
  onChange(): void;
}

export const MIN_W = 320;
export const MIN_H = 240;
/** Below this stage width windows are always maximized: there is no room for a desktop. */
export const COMPACT_W = 720;
const EDGE = 12;
const TITLE_H = 40;
const KEEP = 96;

const saved = sessionStore('bohr:windows:');

/** The rectangle a snap zone fills, for a stage of `w` × `h`. */
export function zoneRect(zone: SnapZone, w: number, h: number): Rect {
  const hw = Math.round(w / 2);
  const hh = Math.round(h / 2);
  switch (zone) {
    case 'left':
      return { x: 0, y: 0, w: hw, h };
    case 'right':
      return { x: hw, y: 0, w: w - hw, h };
    case 'top-left':
      return { x: 0, y: 0, w: hw, h: hh };
    case 'top-right':
      return { x: hw, y: 0, w: w - hw, h: hh };
    case 'bottom-left':
      return { x: 0, y: hh, w: hw, h: h - hh };
    case 'bottom-right':
      return { x: hw, y: hh, w: w - hw, h: h - hh };
  }
}

/**
 * Which zone a pointer at (`x`, `y`) in the stage asks for: edges snap to
 * halves, corners to quarters, the top edge maximizes (returned as 'max').
 */
export function zoneAt(x: number, y: number, w: number, h: number): SnapZone | 'max' | null {
  const l = x <= EDGE;
  const r = x >= w - EDGE;
  const t = y <= EDGE / 2;
  const b = y >= h - EDGE;
  if ((l || r) && (t || b)) return `${t ? 'top' : 'bottom'}-${l ? 'left' : 'right'}` as SnapZone;
  if (l) return 'left';
  if (r) return 'right';
  if (t) return 'max';
  return null;
}

/** Keep a rectangle inside the stage, with its title bar always reachable. */
export function clampRect(r: Rect, w: number, h: number): Rect {
  const rw = Math.min(Math.max(r.w, MIN_W), Math.max(w, MIN_W));
  const rh = Math.min(Math.max(r.h, MIN_H), Math.max(h, MIN_H));
  return {
    w: rw,
    h: rh,
    x: Math.min(Math.max(r.x, KEEP - rw), Math.max(w - KEEP, 0)),
    y: Math.min(Math.max(r.y, 0), Math.max(h - TITLE_H, 0)),
  };
}

/** Evenly tile `n` windows: side by side up to three, then a grid. */
export function tileRects(n: number, w: number, h: number): Rect[] {
  if (n <= 0) return [];
  const cols = n <= 3 ? n : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const rects: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    // The last row may have fewer windows: they share its full width.
    const inRow = Math.min(cols, n - r * cols);
    const y0 = Math.round((r * h) / rows);
    const y1 = Math.round(((r + 1) * h) / rows);
    const x0 = Math.round((c * w) / inRow);
    const x1 = Math.round(((c + 1) * w) / inRow);
    rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return rects;
}

interface Win {
  info: WindowInfo;
  el: HTMLElement;
  body: HTMLElement;
  maxBtn: HTMLButtonElement;
  /** The free-floating rectangle, kept while maximized or snapped so Restore returns to it. */
  rect: Rect;
  mode: WindowMode;
  zone: SnapZone | null;
  minimized: boolean;
}

const svg = (d: string) =>
  `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  min: svg('<path d="M2.5 9h7"/>'),
  max: svg('<rect x="2.5" y="2.5" width="7" height="7" rx="1.2"/>'),
  restore: svg('<rect x="2.5" y="4" width="5.5" height="5.5" rx="1"/><path d="M4.5 4V3.2c0-.4.3-.7.7-.7h3.3c.4 0 .7.3.7.7v3.3c0 .4-.3.7-.7.7H8"/>'),
  close: svg('<path d="M3 3l6 6M9 3l-6 6"/>'),
};

const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
type Handle = (typeof HANDLES)[number];

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class WindowManager {
  private readonly wins = new Map<string, Win>();
  /** Back-to-front. */
  private readonly stack: string[] = [];
  private focused: string | null = null;
  private readonly preview = el('div', { className: 'snap-preview', hidden: true, ariaHidden: 'true' });
  private cascade = 0;

  constructor(private readonly stage: HTMLElement, private readonly hooks: WindowHooks) {
    stage.append(this.preview);
    new ResizeObserver(() => this.relayoutAll()).observe(stage);
  }

  // ── Queries ─────────────────────────────────────────────────────────────
  has(id: string) {
    return this.wins.has(id);
  }
  /** Open window ids in the order they were opened. */
  ids() {
    return [...this.wins.keys()];
  }
  isMinimized(id: string) {
    return this.wins.get(id)?.minimized ?? false;
  }
  mode(id: string) {
    return this.wins.get(id)?.mode ?? 'normal';
  }
  zone(id: string) {
    return this.wins.get(id)?.zone ?? null;
  }
  /** Where an app mounts. */
  body(id: string) {
    return this.wins.get(id)?.body ?? null;
  }
  /** Visible (not minimized) windows, front first. */
  visible() {
    return [...this.stack].reverse().filter((id) => !this.wins.get(id)!.minimized);
  }
  get compact() {
    return this.size().w < COMPACT_W;
  }

  // ── Create / destroy ────────────────────────────────────────────────────
  /** Create the window for an app, or return the existing one's body. */
  ensure(info: WindowInfo): HTMLElement {
    const existing = this.wins.get(info.id);
    if (existing) return existing.body;

    const { w: sw, h: sh } = this.size();
    const prior = saved.get<Saved | null>(info.id, null);
    const rect = prior?.rect ? clampRect(prior.rect, sw, sh) : this.initialRect(sw, sh);
    const win = this.build(info, rect);
    win.mode = prior?.mode ?? 'normal';
    win.zone = prior?.zone ?? null;
    win.minimized = prior?.minimized ?? false;
    win.el.dataset.min = String(win.minimized);
    this.wins.set(info.id, win);
    this.stack.push(info.id);
    this.stage.append(win.el);
    this.layout(win);
    this.hooks.onChange();
    return win.body;
  }

  private initialRect(sw: number, sh: number): Rect {
    const w = Math.max(MIN_W, Math.round(sw * 0.84));
    const h = Math.max(MIN_H, Math.round(sh * 0.86));
    const step = (this.cascade++ % 6) * 28;
    return clampRect({ x: Math.round((sw - w) / 2) - 40 + step, y: Math.round((sh - h) / 2) + step - 10, w, h }, sw, sh);
  }

  destroy(id: string) {
    const win = this.wins.get(id);
    if (!win) return;
    this.wins.delete(id);
    this.stack.splice(this.stack.indexOf(id), 1);
    if (this.focused === id) this.focused = null;
    win.el.remove(); // its saved geometry stays, so reopening puts it back

    this.hooks.onChange();
  }

  // ── Focus / minimize ────────────────────────────────────────────────────
  /** Mark `id` as the focused window and bring it to the front (null: none is focused). */
  setFocused(id: string | null) {
    this.focused = id;
    const win = id ? this.wins.get(id) : null;
    if (id && win) {
      if (win.minimized) this.setMinimized(win, false);
      const at = this.stack.indexOf(id);
      if (at !== this.stack.length - 1) {
        this.stack.splice(at, 1);
        this.stack.push(id);
      }
    }
    this.stack.forEach((wid, z) => {
      const w = this.wins.get(wid)!;
      const on = wid === id;
      w.el.style.zIndex = String(z + 1);
      w.el.classList.toggle('focused', on);
      w.el.dataset.focus = String(on);
      w.body.inert = !on; // The cover stands in for a suspended app.
    });
    this.hooks.onChange();
  }

  minimize(id: string) {
    const win = this.wins.get(id);
    if (!win || win.minimized) return;
    this.setMinimized(win, true);
    this.hooks.onMinimize(id);
  }

  minimizeAll() {
    for (const win of this.wins.values()) this.setMinimized(win, true);
  }

  private setMinimized(win: Win, minimized: boolean) {
    win.minimized = minimized;
    win.el.dataset.min = String(minimized);
    this.save(win);
    this.hooks.onChange();
  }

  // ── Layout ──────────────────────────────────────────────────────────────
  private size() {
    // A hidden stage measures 0: fall back to what it will be once shown (below the shell bar).
    return { w: this.stage.clientWidth || innerWidth, h: this.stage.clientHeight || Math.max(innerHeight - 44, MIN_H) };
  }

  /** Where a window sits right now, whatever its mode. */
  private current(win: Win): Rect {
    const { w, h } = this.size();
    if (this.compact || win.mode === 'maximized') return { x: 0, y: 0, w, h };
    if (win.mode === 'snapped' && win.zone) return zoneRect(win.zone, w, h);
    return clampRect(win.rect, w, h);
  }

  private layout(win: Win, animate = false) {
    const r = this.current(win);
    const s = win.el.style;
    if (animate && !reduceMotion()) {
      win.el.classList.add('animating');
      setTimeout(() => win.el.classList.remove('animating'), 360);
    }
    s.left = `${r.x}px`;
    s.top = `${r.y}px`;
    s.width = `${r.w}px`;
    s.height = `${r.h}px`;
    const mode = this.compact ? 'maximized' : win.mode;
    win.el.dataset.mode = mode;
    // Windows that touch the screen edges lose their rounded corners and shadow.
    win.el.classList.toggle('flush', mode !== 'normal');
    const maxLabel = `${mode === 'maximized' ? 'Restore' : 'Maximize'} ${win.info.name}`;
    win.maxBtn.innerHTML = mode === 'maximized' ? ICON.restore : ICON.max;
    win.maxBtn.title = maxLabel;
    win.maxBtn.ariaLabel = maxLabel;
    win.maxBtn.hidden = this.compact;
  }

  private relayoutAll() {
    if (!this.stage.clientWidth) return;
    for (const win of this.wins.values()) this.layout(win);
  }

  private save(win: Win) {
    saved.set(win.info.id, { rect: win.rect, mode: win.mode, zone: win.zone, minimized: win.minimized } satisfies Saved);
  }

  private setMode(win: Win, mode: WindowMode, zone: SnapZone | null = null, animate = true) {
    win.mode = mode;
    win.zone = zone;
    this.layout(win, animate);
    this.save(win);
    this.hooks.onChange();
  }

  maximize(id: string) {
    const win = this.wins.get(id);
    if (win) this.setMode(win, 'maximized');
  }
  restore(id: string) {
    const win = this.wins.get(id);
    if (win) this.setMode(win, 'normal');
  }
  toggleMaximize(id: string) {
    const win = this.wins.get(id);
    if (win) this.setMode(win, win.mode === 'maximized' ? 'normal' : 'maximized');
  }
  snap(id: string, zone: SnapZone) {
    const win = this.wins.get(id);
    if (win) this.setMode(win, 'snapped', zone);
  }

  /** Arrange every visible window side by side (or in a grid), oldest on the left. */
  tile() {
    const ids = this.ids().filter((id) => !this.wins.get(id)!.minimized);
    if (!ids.length) return;
    const { w, h } = this.size();
    const rects = tileRects(ids.length, w, h);
    ids.forEach((id, i) => {
      const win = this.wins.get(id)!;
      win.rect = rects[i];
      this.setMode(win, 'normal');
    });
  }

  // ── Chrome ──────────────────────────────────────────────────────────────
  private build(info: WindowInfo, rect: Rect): Win {
    const { id, name } = info;
    const control = (cls: string, label: string, html: string, onclick: () => void) =>
      el('button', { type: 'button', className: `win-btn ${cls}`, title: label, ariaLabel: label, innerHTML: html, onclick });
    const minBtn = control('win-min', `Minimize ${name}`, ICON.min, () => this.minimize(id));
    const maxBtn = control('win-max', `Maximize ${name}`, ICON.max, () => this.toggleMaximize(id));
    const closeBtn = control('win-close', `Close ${name}`, ICON.close, () => this.hooks.onClose(id));

    const title = el(
      'div',
      { className: 'win-title' },
      el('img', { src: info.icon, alt: '', width: 18, height: 18, className: 'app-icon', draggable: false }),
      el('span', { textContent: name }),
    );
    const bar = el('div', { className: 'win-bar' }, title, el('div', { className: 'win-controls' }, minBtn, maxBtn, closeBtn));
    const body = el('div', { className: 'win-body' });
    const cover = el(
      'button',
      { type: 'button', className: 'win-cover', ariaLabel: `Resume ${name}`, onclick: () => this.hooks.onFocusRequest(id) },
      el('img', { src: info.icon, alt: '', width: 48, height: 48, className: 'app-icon', draggable: false }),
      el('b', { textContent: name }),
      el('span', { textContent: 'Paused · click to resume' }),
    );
    const root = el('section', { className: 'win', role: 'group', ariaLabel: name, dataset: { app: id, focus: 'false', min: 'false', mode: 'normal' } });
    root.style.setProperty('--accent', info.accent);
    root.append(bar, body, cover, ...HANDLES.map((h) => el('i', { className: `rz rz-${h}`, dataset: { h } })));

    const win: Win = { info, el: root, body, maxBtn, rect, mode: 'normal', zone: null, minimized: false };

    // Any press inside a background window focuses it (capture: before the app sees it).
    root.addEventListener('pointerdown', () => {
      if (this.focused !== id) this.hooks.onFocusRequest(id);
    }, true);
    bar.addEventListener('dblclick', (e) => {
      if (!(e.target as HTMLElement).closest('.win-controls') && !this.compact) this.toggleMaximize(id);
    });
    bar.addEventListener('pointerdown', (e) => this.startDrag(win, e));
    root.querySelectorAll<HTMLElement>('.rz').forEach((h) => h.addEventListener('pointerdown', (e) => this.startResize(win, h.dataset.h as Handle, e)));
    return win;
  }

  private startDrag(win: Win, e: PointerEvent) {
    if (e.button !== 0 || this.compact || (e.target as HTMLElement).closest('.win-controls')) return;
    const bar = e.currentTarget as HTMLElement;
    const stage = this.stage.getBoundingClientRect();
    const start = this.current(win);
    const grab = { x: e.clientX - stage.left, y: e.clientY - stage.top };
    // Grabbing a maximized or snapped window restores its floating size under the pointer.
    const floating = win.mode === 'normal' ? start : { ...win.rect, w: Math.min(win.rect.w, stage.width), h: Math.min(win.rect.h, stage.height) };
    const offset = { x: Math.round(floating.w * ((grab.x - start.x) / Math.max(start.w, 1))), y: grab.y - start.y };
    let moved = false;
    let target: SnapZone | 'max' | null = null;
    bar.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const px = ev.clientX - stage.left;
      const py = ev.clientY - stage.top;
      if (!moved) {
        if (Math.hypot(px - grab.x, py - grab.y) < 4) return;
        moved = true;
        this.stage.classList.add('dragging');
        win.el.classList.add('moving');
        win.mode = 'normal';
        win.zone = null;
        win.rect = { ...floating };
      }
      win.rect = clampRect({ ...win.rect, x: px - offset.x, y: py - offset.y }, stage.width, stage.height);
      this.layout(win);
      target = zoneAt(px, py, stage.width, stage.height);
      this.showPreview(target, stage.width, stage.height);
    };
    const end = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', end);
      bar.removeEventListener('pointercancel', end);
      this.stage.classList.remove('dragging');
      win.el.classList.remove('moving');
      this.showPreview(null, 0, 0);
      if (!moved) return;
      if (target === 'max') this.setMode(win, 'maximized');
      else if (target) this.setMode(win, 'snapped', target);
      else this.setMode(win, 'normal', null, false);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  private showPreview(zone: SnapZone | 'max' | null, w: number, h: number) {
    this.preview.hidden = !zone;
    if (!zone) return;
    const r = zone === 'max' ? { x: 0, y: 0, w, h } : zoneRect(zone, w, h);
    Object.assign(this.preview.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  }

  private startResize(win: Win, handle: Handle, e: PointerEvent) {
    if (e.button !== 0 || this.compact || win.mode === 'maximized') return;
    const node = e.currentTarget as HTMLElement;
    const stage = this.stage.getBoundingClientRect();
    const from = this.current(win);
    const sx = e.clientX;
    const sy = e.clientY;
    node.setPointerCapture(e.pointerId);
    this.stage.classList.add('dragging');
    win.mode = 'normal';
    win.zone = null;
    win.rect = { ...from };

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      let { x, y, w, h } = from;
      if (handle.includes('e')) w = Math.max(MIN_W, Math.min(from.w + dx, stage.width - from.x));
      if (handle.includes('s')) h = Math.max(MIN_H, Math.min(from.h + dy, stage.height - from.y));
      if (handle.includes('w')) {
        x = Math.min(Math.max(from.x + dx, 0), from.x + from.w - MIN_W);
        w = from.w + (from.x - x);
      }
      if (handle.includes('n')) {
        y = Math.min(Math.max(from.y + dy, 0), from.y + from.h - MIN_H);
        h = from.h + (from.y - y);
      }
      win.rect = { x, y, w, h };
      this.layout(win);
    };
    const end = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
      this.stage.classList.remove('dragging');
      this.setMode(win, 'normal', null, false);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  }
}

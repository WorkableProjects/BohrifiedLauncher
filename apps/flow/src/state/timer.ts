import { useSyncExternalStore } from 'react';
import { ui } from './ui';

/**
 * Session timer state, kept outside the Timer component so a running
 * countdown survives the board being unmounted while Flow is suspended in
 * Bohrified. Only a single timeout (for the chime) runs meanwhile.
 */

export interface TimerState {
  mode: 'up' | 'down';
  duration: number;
  /** Elapsed ms banked before the current run. */
  base: number;
  /** performance.now() when the current run started. */
  startedAt: number;
  running: boolean;
  fired: boolean;
}

let state: TimerState = { mode: 'down', duration: 5 * 60_000, base: 0, startedAt: 0, running: false, fired: false };
const listeners = new Set<() => void>();
let doneTimer = 0;

const set = (patch: Partial<TimerState>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};

export const timerElapsed = (s = state) => s.base + (s.running ? performance.now() - s.startedAt : 0);

/** Soft two-note chime via WebAudio — no asset needed. */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* audio unavailable */ }
}

export const timer = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  start() {
    if (state.running) return;
    set({ running: true, startedAt: performance.now() });
    if (state.mode === 'down' && !state.fired) {
      clearTimeout(doneTimer);
      doneTimer = window.setTimeout(() => {
        set({ running: false, fired: true, base: state.duration });
        chime();
      }, Math.max(0, state.duration - state.base));
    }
  },
  pause() {
    if (!state.running) return;
    clearTimeout(doneTimer);
    set({ running: false, base: timerElapsed() });
  },
  reset() {
    clearTimeout(doneTimer);
    set({ running: false, base: 0, fired: false });
  },
  setMode(mode: TimerState['mode']) {
    timer.reset();
    set({ mode });
  },
  setDuration(duration: number) {
    set({ duration });
  },
};

export function useTimer(): TimerState {
  return useSyncExternalStore(timer.subscribe, timer.get, timer.get);
}

// Closing the timer resets it, as when its state lived in the component.
let wasOpen = ui.get().timerOpen;
ui.subscribe(() => {
  const open = ui.get().timerOpen;
  if (wasOpen && !open) timer.reset();
  wasOpen = open;
});

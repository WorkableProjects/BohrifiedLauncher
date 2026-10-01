import { useSyncExternalStore } from 'react';
import { connectBohr } from '@bohrified/app-sdk/client';
import { releaseImages } from './engine/renderer';
import { board } from './state/board';
import { isPristine, saveCurrent } from './state/lessons';
import { ui } from './state/ui';
import { percentile } from '@bohrified/app-sdk';

/**
 * Flow's side of the Bohrified lifecycle. Standalone, none of this runs.
 *
 *  • suspend — commit any open text edit, save the lesson, then Root stops
 *    rendering the board/home: canvases, the controller's rAF loop and
 *    listeners, tiles, WebGL glass and live sync are all torn down by their
 *    React cleanups. Decoded images are dropped. The document stays in the
 *    board store, so resuming is a re-render, not a reload.
 *  • unmount — save; the launcher then removes the frame, which frees the rest.
 *  • session — which lesson is open, so a remount reopens it.
 *  • settings — Bohrified's shared appearance drives Flow's.
 */

/** Runtime numbers for Bohrified's diagnostics, sent while active (cheap: a few counters every few seconds). */
let metricsTimer = 0;
let lastFrames = 0;
function sendMetrics() {
  const perf = window.__flowPerf;
  const work = perf ? perf.work.slice(-300) : [];
  bohr?.reportMetrics({
    canvases: document.querySelectorAll('canvas').length,
    elements: board.page.elements.length,
    pages: board.doc.pages.length,
    frames: perf?.frames ?? 0,
    frameP95Ms: Math.round(percentile(work, 95) * 100) / 100,
    framesSinceLast: (perf?.frames ?? 0) - lastFrames,
  });
  lastFrames = perf?.frames ?? 0;
}
const startMetrics = () => {
  clearInterval(metricsTimer);
  sendMetrics();
  metricsTimer = window.setInterval(sendMetrics, 5000);
};
const stopMetrics = () => {
  clearInterval(metricsTimer);
  metricsTimer = 0;
};

let suspended = false;
let onBoard = false;
const listeners = new Set<() => void>();

const setSuspended = (v: boolean) => {
  suspended = v;
  listeners.forEach((fn) => fn());
};

/** What "Continue with Flow" shows in the launcher. */
const activity = () => {
  if (!onBoard || isPristine(board.doc)) return null;
  const pages = board.doc.pages.length;
  return { title: board.doc.title, detail: `${pages} page${pages === 1 ? '' : 's'}` };
};

const session = () => ({ lesson: onBoard ? (isPristine(board.doc) ? 'new' : board.doc.id) : undefined });

async function flush() {
  // Blurring the text editor commits it.
  (document.activeElement as HTMLElement | null)?.blur?.();
  await saveCurrent();
  bohr?.saveSession(session());
  bohr?.setActivity(activity());
}

export const bohr = connectBohr({
  activate: () => {
    setSuspended(false);
    startMetrics();
  },
  suspend: async () => {
    await flush();
    setSuspended(true);
    releaseImages();
    stopMetrics();
    // One last report so diagnostics shows the released state (0 canvases).
    requestAnimationFrame(sendMetrics);
  },
  unmount: async () => {
    stopMetrics();
    await flush();
  },
  settings: ({ theme }) => {
    if (ui.get().appearance !== theme) ui.set({ appearance: theme });
  },
});

if (bohr) {
  board.subscribe((c) => {
    if (c.type !== 'replace') return;
    bohr.saveSession(session());
    bohr.setActivity(activity());
  });
}

/** Root reports which screen is showing, for the session. */
export function reportScreen(screen: string) {
  onBoard = screen === 'board';
  bohr?.saveSession(session());
  bohr?.setActivity(activity());
}

/** True while Bohrified has Flow suspended: render nothing expensive. */
export function useSuspended() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => suspended,
    () => false,
  );
}

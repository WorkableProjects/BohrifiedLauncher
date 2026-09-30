import { useSyncExternalStore } from 'react';
import { connectBohr } from '@bohrified/app-sdk/client';
import { releaseImages } from './engine/renderer';
import { board } from './state/board';
import { isPristine, saveCurrent } from './state/lessons';
import { ui } from './state/ui';

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

let suspended = false;
let onBoard = false;
const listeners = new Set<() => void>();

const setSuspended = (v: boolean) => {
  suspended = v;
  listeners.forEach((fn) => fn());
};

const session = () => ({ lesson: onBoard ? (isPristine(board.doc) ? 'new' : board.doc.id) : undefined });

async function flush() {
  // Blurring the text editor commits it.
  (document.activeElement as HTMLElement | null)?.blur?.();
  await saveCurrent();
  bohr?.saveSession(session());
}

export const bohr = connectBohr({
  activate: () => setSuspended(false),
  suspend: async () => {
    await flush();
    setSuspended(true);
    releaseImages();
  },
  unmount: flush,
  settings: ({ theme }) => {
    if (ui.get().appearance !== theme) ui.set({ appearance: theme });
  },
});

if (bohr) board.subscribe((c) => c.type === 'replace' && bohr.saveSession(session()));

/** Root reports which screen is showing, for the session. */
export function reportScreen(screen: string) {
  onBoard = screen === 'board';
  bohr?.saveSession(session());
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

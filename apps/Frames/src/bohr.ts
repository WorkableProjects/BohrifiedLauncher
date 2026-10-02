import { connectBohr } from '@bohrified/app-sdk/client';
import { applyAppearance, prefs, setTheme } from './state/prefs';
import { assets, doc, saveNow } from './state/session';
import { ui } from './state/ui';
import { clearPool } from './render/canvas';

/**
 * Frames' side of the Bohrified lifecycle (does nothing standalone).
 *
 *  • suspend — save, stop the editor/presenter loops and release decoded
 *    images, video and scratch canvases. The document stays in memory, so
 *    resuming is a re-render.
 *  • unmount — save; the launcher then removes the frame.
 *  • settings — Bohrified's shared appearance drives Frames'.
 */

let suspended = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  suspended = v;
  listeners.forEach((f) => f());
};
export const onSuspendChange = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
export const isSuspended = () => suspended;

let metricsTimer = 0;

function metrics() {
  const s = assets.stats();
  bohr?.reportMetrics({
    canvases: document.querySelectorAll('canvas').length,
    slides: doc.deck.slides.length,
    images: s.images,
    megapixels: s.megapixels,
    history: doc.historySize,
  });
}

const session = () => ({ deck: ui.get().screen === 'editor' ? doc.deck.id : undefined });

function report() {
  const u = ui.get();
  if (u.screen === 'editor') {
    bohr?.setActivity({ title: doc.deck.title, detail: `${doc.deck.slides.length} slide${doc.deck.slides.length === 1 ? '' : 's'}` });
  } else bohr?.setActivity(null);
  bohr?.saveSession(session());
}

export const bohr = connectBohr({
  activate: () => {
    set(false);
    clearInterval(metricsTimer);
    metrics();
    metricsTimer = window.setInterval(metrics, 5000);
  },
  suspend: async () => {
    await saveNow();
    ui.set({ presenting: null, preview: null });
    set(true);
    clearInterval(metricsTimer);
    assets.release();
    clearPool();
    requestAnimationFrame(metrics);
  },
  unmount: async () => {
    clearInterval(metricsTimer);
    await saveNow();
  },
  settings: ({ theme }) => {
    if (prefs.get().theme !== theme) {
      setTheme(theme);
      applyAppearance(theme);
    }
  },
});

if (bohr) {
  ui.subscribe(report);
  doc.subscribe(report);
}

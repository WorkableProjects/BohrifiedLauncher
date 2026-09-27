/**
 * Canvas transitions. The board canvas still holds the previous frame when
 * a page, paper or appearance change is announced (repaints wait for the
 * next animation frame), so we lift a snapshot of it into an overlay and
 * animate that away over the freshly painted board.
 */

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export type CanvasTransition = { kind: 'slide'; direction: 1 | -1 } | { kind: 'fade' };

let current: HTMLCanvasElement | null = null;

export function transitionCanvas(scene: HTMLCanvasElement, above: Element, t: CanvasTransition) {
  if (reducedMotion() || !scene.width || !scene.height || typeof scene.animate !== 'function') return;
  // A transition already in flight hands over to the new one.
  current?.remove();
  const snap = document.createElement('canvas');
  snap.width = scene.width;
  snap.height = scene.height;
  const ctx = snap.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(scene, 0, 0);
  snap.setAttribute('aria-hidden', 'true');
  snap.className = 'pointer-events-none absolute inset-0 h-full w-full';
  above.after(snap);
  current = snap;

  const done = () => {
    snap.remove();
    if (current === snap) current = null;
  };

  if (t.kind === 'slide') {
    // The old page glides off toward where it sits in the lesson…
    snap
      .animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-t.direction * 64}px)`, opacity: 0 }], { duration: 340, easing: EASE, fill: 'forwards' })
      .finished.then(done, done);
    // …while the new one settles into place beneath it.
    scene.animate([{ transform: 'scale(1.012)' }, { transform: 'none' }], { duration: 420, easing: EASE });
  } else {
    snap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: EASE, fill: 'forwards' }).finished.then(done, done);
  }
}

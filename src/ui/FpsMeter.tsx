import { useEffect, useState } from 'react';

/**
 * Frame instrumentation. The controller reports the CPU cost of each frame
 * it renders; we also track real rAF cadence. Visible with `?fps`, and
 * exposed as `window.__flowPerf` for the automated benchmark.
 */

interface PerfStats {
  frames: number;
  /** Controller render cost per frame (ms). */
  work: number[];
  reset(): void;
}

const stats: PerfStats = {
  frames: 0,
  work: [],
  reset() {
    this.frames = 0;
    this.work = [];
  },
};

declare global {
  interface Window {
    __flowPerf?: PerfStats;
  }
}
window.__flowPerf = stats;

export function frameSink(ms: number) {
  stats.frames++;
  stats.work.push(ms);
  if (stats.work.length > 5000) stats.work.splice(0, 2500);
}

export function FpsMeter() {
  const enabled = new URLSearchParams(location.search).has('fps');
  const [fps, setFps] = useState(0);
  const [work, setWork] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let frames = 0;
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        const recent = stats.work.slice(-60);
        setWork(recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0);
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div className="sheet pointer-events-none fixed bottom-24 left-4 z-50 rounded-xl! px-3 py-1.5 font-mono text-caption text-label tabular-nums">
      {fps} fps · {work.toFixed(2)} ms/frame
    </div>
  );
}

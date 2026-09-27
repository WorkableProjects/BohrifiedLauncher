#!/usr/bin/env node
/**
 * Canvas performance benchmark.
 *
 *   npm run build && npm run perf
 *
 * Boots `vite preview`, opens Flow in Chromium and measures per-frame
 * render cost (the controller's own timing) and rAF cadence for:
 *   1. inking a long 240 Hz stroke,
 *   2. panning and zooming a board with 2,000 strokes,
 *   3. committing strokes incrementally on that heavy board.
 *
 * Budget: p95 render work under 8 ms (half a 60 Hz frame, a full 120 Hz frame).
 * Uses Playwright's bundled Chromium (PLAYWRIGHT_BROWSERS_PATH / CHROMIUM_PATH).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4179;
const BUDGET_MS = 8;
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error('preview timeout')), 15000);
});

const stats = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  const q = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
  return { n: a.length, p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +q(1).toFixed(2) };
};

const results = {};
let failed = false;
const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, // DPR 1 by default: headless Chromium rasterizes on the CPU, so at DPR 2 fill rate
  // (not Flow) dominates. Set DPR=2 to see the Retina worst case.
  deviceScaleFactor: Number(process.env.DPR ?? 1) });
  // Measure the canvas pipeline itself; glass is GPU work benchmarked separately on real hardware.
  await page.addInitScript(() => localStorage.setItem('flow:prefs:v1', JSON.stringify({ liquidGlass: false, tool: 'pen' })));
  await page.goto(`http://localhost:${PORT}/?bench`);
  await page.waitForFunction(() => !!window.__flowBoard && !!window.__flowPerf);
  await page.waitForTimeout(500);

  // 1. Long stroke at 240 Hz, dispatched in-page (no IPC latency).
  results.ink = await page.evaluate(async () => {
    const el = document.querySelector('[data-testid=board]');
    window.__flowPerf.reset();
    const opts = (x, y) => ({ bubbles: true, pointerId: 7, pointerType: 'pen', pressure: 0.5 + 0.4 * Math.sin(x / 50), clientX: x, clientY: y, button: 0, buttons: 1, isPrimary: true });
    el.dispatchEvent(new PointerEvent('pointerdown', opts(200, 450)));
    const frames = [];
    let last = performance.now();
    for (let i = 0; i < 1200; i++) {
      const x = 200 + i * 0.9, y = 450 + Math.sin(i / 20) * 180;
      el.dispatchEvent(new PointerEvent('pointermove', opts(x, y)));
      if (i % 4 === 3) {
        await new Promise(requestAnimationFrame);
        const n = performance.now();
        frames.push(n - last);
        last = n;
      }
    }
    el.dispatchEvent(new PointerEvent('pointerup', opts(1280, 450)));
    return { work: window.__flowPerf.work.slice(), frames };
  });

  // 2. Heavy board: 2,000 strokes of ~60 points.
  await page.evaluate(() => {
    const b = window.__flowBoard;
    const els = [];
    for (let s = 0; s < 2000; s++) {
      const ox = (s % 50) * 60 - 1500, oy = Math.floor(s / 50) * 40 - 800;
      const pts = [];
      for (let i = 0; i < 60; i++) pts.push(ox + i * 0.8, oy + Math.sin(i / 6 + s) * 12, 0.5);
      els.push({ id: 'b' + s, type: 'stroke', tool: 'pen', points: pts, color: s % 3 ? 'label' : 'blue', size: 3, pressure: false });
    }
    b.addElements(els);
  });
  const camRun = (mode) => page.evaluate(async (mode) => {
    const b = window.__flowBoard;
    b.setCamera({ x: -1400, y: -700, z: 0.6 });
    // Let the cache warm and settle at rest first.
    for (let i = 0; i < 40; i++) await new Promise(requestAnimationFrame);
    window.__flowPerf.reset();
    const frames = [];
    let last = performance.now();
    for (let i = 0; i < 180; i++) {
      if (mode === 'pan') b.setCamera({ x: -1400 + i * 8, y: -700 + Math.sin(i / 20) * 200, z: 0.6 });
      else {
        const z = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(i / 30));
        b.setCamera({ x: -700 + i * 4 - 720 / z, y: -450 / z, z });
      }
      await new Promise(requestAnimationFrame);
      const n = performance.now();
      frames.push(n - last);
      last = n;
    }
    return { work: window.__flowPerf.work.slice(), frames };
  }, mode);
  results.pan = await camRun('pan');
  results.zoom = await camRun('zoom');

  // 3. Commit strokes on the heavy board (incremental append path).
  results.commit = await page.evaluate(async () => {
    const b = window.__flowBoard;
    b.setCamera({ x: -720, y: -450, z: 1 });
    await new Promise(requestAnimationFrame);
    window.__flowPerf.reset();
    for (let s = 0; s < 60; s++) {
      const pts = [];
      for (let i = 0; i < 80; i++) pts.push(-300 + i * 4, -200 + s * 6 + Math.sin(i / 5) * 5, 0.5);
      b.addElements([{ id: 'c' + s, type: 'stroke', tool: 'pen', points: pts, color: 'red', size: 3, pressure: false }]);
      await new Promise(requestAnimationFrame);
    }
    return { work: window.__flowPerf.work.slice(), frames: [] };
  });

  for (const [name, r] of Object.entries(results)) {
    const w = stats(r.work);
    const f = r.frames.length ? stats(r.frames) : null;
    const ok = w.p95 <= BUDGET_MS;
    failed ||= !ok;
    console.log(`${ok ? '✓' : '✗'} ${name.padEnd(8)} render work p50 ${w.p50} ms · p95 ${w.p95} ms · max ${w.max} ms (${w.n} frames)` + (f ? ` · frame interval p50 ${f.p50} ms` : ''));
  }
} finally {
  await browser.close();
  server.kill();
}
if (failed) {
  console.error(`\nOver budget: p95 render work must stay under ${BUDGET_MS} ms.`);
  process.exit(1);
}

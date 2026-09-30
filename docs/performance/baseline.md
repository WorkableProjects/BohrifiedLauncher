# Performance baseline

Recorded 2026-09-30 on macOS with Google Chrome (headless), 1280×800.

## Phase 0: the apps before integration

**Flow 1.0.56** (Vite 8, React 19, TypeScript), unchanged source:

| Check | Result |
|---|---|
| `npm run build` | ✓ 356 modules, 437 ms |
| `npm test` (vitest) | ✓ 27/27 |
| `npm run e2e` | 25 ✓, 1 ✗ ("rich text keeps formatting"), then stopped at the Reset Profile step: `getByRole('button', { name: 'Settings' })` matches 2 buttons. Both failures were already there before integration. |
| `npm run perf` (2,000-stroke board) | ink p95 0.4 ms · pan p95 1.4 ms · zoom p95 1.4 ms · commit p95 0.6 ms |

Flow production bundle (initial load):

| Asset | Size | gzip |
|---|---|---|
| `index.js` | 532.1 kB | 170.6 kB |
| `index.css` | 41.8 kB | 8.7 kB |
| MathJax (`svg` + ~15 small chunks, loaded on first equation) | ~1.8 MB | ~620 kB |

**Rubricable 1.1**: a single 26.8 kB HTML page with no build step. It loaded the XLSX library (~900 kB) from a CDN at startup, but only the export buttons use it, and those are currently hidden.

Standalone memory figures were not recorded for either app. The Bohrified figures below serve as the reference from now on.

## After integration (Bohrified)

Taken from `npm run build && npm run test:lifecycle`. [`latest.json`](latest.json) holds the most recent run, and the 60-switch row comes from `SWITCHES=60 npm run test:lifecycle`. Heap is the page's JS heap after a forced GC. The same-origin app frames share the launcher's isolate, so they're included. Canvas and GPU memory are native, so they're tracked by counting live canvases instead.

| Metric | Value |
|---|---|
| Launcher initial bundle | 11.2 kB JS (4.3 kB gzip) + 5.7 kB CSS, including shared settings. The frame adapter (2.2 kB) and app manifests load on first open. |
| Launcher DOMContentLoaded | 32–100 ms |
| Launcher JS heap | 1.4 MB |
| Flow cold open (first launch, from click to `active`) | ~270 ms |
| Flow warm open (from suspended) | ~70 ms |
| Flow remount (after unmount, reopening the lesson) | ~160 ms |
| Rubricable cold open | ~150 ms |
| Warm switch, median / max | 66 / 71 ms |
| Heap: Flow active | 6.9 MB |
| Heap: Flow suspended (Rubricable active) | 7.2 MB, with Flow canvases 9 → 0 |
| Heap over 60 switches | 8.1 → 8.6 MB, flat after ~40 switches (JIT warm-up, no leak) |
| Heap: all apps unmounted | 2.4 MB |

Flow's own bundle grew by ~2.5 kB (the lifecycle bridge). Rubricable now loads XLSX only on first export.

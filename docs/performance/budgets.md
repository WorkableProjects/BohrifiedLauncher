# Performance budgets (Bohrified 1.2)

Budgets live in code (`packages/app-sdk/src/budgets.ts`) so tests and the in-app diagnostics use the same numbers. They're ceilings on a mid-range laptop in Chrome, there to catch regressions.

| Budget | Limit | Where it's checked |
|---|---|---|
| Launcher ready (navigation → cards on screen, no app code loaded) | 1000 ms | `test:lifecycle`, Diagnostics |
| Cold open (click → app active, first time) | 3000 ms | `test:lifecycle`, Diagnostics |
| Switch to a paused app | 1500 ms | `test:lifecycle`, Diagnostics |
| Reopen after unmount | 4000 ms | `test:lifecycle` |
| Launcher JS heap (no apps loaded) | 4 MB | `test:lifecycle` |
| Heap growth over 20+ repeated switches | 3 MB | `test:lifecycle` |
| Canvases in a paused Flow | 0 | `test:lifecycle`, Diagnostics |
| Paused apps kept mounted | 2 (then least recently used is unmounted) | lifecycle unit tests, Diagnostics |
| Flow frame work while drawing (p95) | 8 ms | Diagnostics, `apps/flow` `npm run perf` |

## Diagnostics

Settings → **Diagnostics** shows a snapshot taken when you open it (never polled): startup timings, each app's state and load/mount/activate times, JS heap where the browser exposes it, what apps report about themselves (Flow: canvases, elements, pages, frame p95), and each budget with ✓/✗. **Copy report** puts it on the clipboard for a bug report. `__bohr.diagnostics()` returns the same data for scripts.

Apps report numbers with `connectBohr(...).reportMetrics({...})` (or `ctx.setMetrics` for in-process apps). Flow sends a few counters every 5 seconds while active, and once more after suspending.

## Keeping startup light

- The launcher loads only the shell, the window manager, the registry metadata and lifecycle. App code loads on first open.
- Diagnostics (`launcher/src/diagnostics.ts`) is a dynamic import, loaded when the panel opens.
- Flow's MathJax and Rubricable's XLSX library load on first use.
- Join Whiteboard's viewer is Flow's read-only board in a frame that exists only while joined.

# Bohrified architecture

## Integration report (what was found before merging)

| | Flow 1.0.56 (at integration) | Rubricable 1.1 |
|---|---|---|
| Runtime / build | React 19 + TypeScript, Vite 8, Tailwind 4 | One vanilla HTML/JS page, no build |
| Entry / routing | `src/main.tsx`; query-string routes (`?lesson=`, `?view=present`, `?bench`) | `index.html`; tabs toggled in-page |
| State | Module singletons: `board` (BoardStore), `ui` store, canvas `controller` instance | Global `S` object, in memory only |
| Persistence | IndexedDB `flow` (lessons + summaries); localStorage `flow:prefs:v1` | localStorage `rbl-theme`, `rbl-ask`. Rubrics were never saved |
| Global CSS | Tailwind preflight, tokens on `:root`, `data-appearance` / `data-device` on `<html>` | Bare-element styles (`body`, `header`, `button`, `table`…) and `data-theme` on `<html>` |
| Globals / listeners | window `keydown`/`keyup`/`blur`/`pointerdown`, document `copy`/`cut`/`paste`/`selectionchange`/`visibilitychange`, window `drop`/`dragover`/`pagehide`, portals into `#overlay` | document `input`/`click`/`keydown` (Escape), `matchMedia` listener |
| Loops / timers | Controller rAF loop (only when dirty), FPS meter rAF, glass rAF, Timer interval, toast timeouts, 46 CSS glitter animations on Home | None |
| Graphics / audio | 2 full-screen canvases (one `desynchronized`), 256 px tile cache, a WebGL Liquid Glass context, decoded image cache, WebAudio chime | None |
| Workers / SW | None | None |
| Network | BroadcastChannel `flow-live-v1` (tutor ↔ student window), Google Fonts | XLSX from cdnjs |
| Env / secrets | None | None |
| Heavy code | MathJax (~1.8 MB, already lazy), app chunk 532 kB | XLSX 900 kB (now lazy) |
| Tests | vitest unit tests, Playwright e2e + perf scripts | None |

**Conflicts, if both apps shared one document:** Flow's global keyboard shortcuts (single-letter tools, ⌘Z, Backspace) against Rubricable's text fields; Tailwind preflight against Rubricable's bare-element CSS; `data-theme` vs `data-appearance` on `<html>`; Rubricable's global `$`/`S`/`store` identifiers; two document-level input/click delegates. There were **no** storage-key collisions (`flow*`, `rbl-*`, and the launcher's `bohr:*`) and no service workers.

**Decision:** each app runs in its own **same-origin iframe** behind a shared contract. The frame is the app boundary. Globals, CSS, listeners and framework stay isolated with no rewrite, and unmounting (removing the frame) lets the browser reclaim everything: JS heap, canvases, the WebGL context, listeners. New apps can use the same frame adapter or implement the contract directly in the launcher's document.

## Layout

```text
bohrified/
├── launcher/                 # the shell: registry, routing, lifecycle, launcher UI
│   └── src/{main,registry,lifecycle,router,windows,library,quick}.ts
├── apps/
│   ├── flow/                 # Flow (still runs standalone: npm run dev -w apps/flow)
│   │   ├── bohr.app.ts       # Flow's BohrApp (frame adapter + session → URL)
│   │   ├── bohr.settings.ts  # Flow's preferences, shown in Bohrified's settings
│   │   └── src/bohr.ts       # Flow's side of the lifecycle protocol
│   └── rubricable/
│       ├── bohr.app.ts
│       ├── bohr.settings.ts
│       └── index.html        # still opens standalone
├── packages/
│   ├── app-sdk/              # contract types, frameApp() host adapter, connectBohr() client
│   ├── persistence/          # never-throwing namespaced JSON storage (local / session)
│   ├── ui/                   # design tokens + shared theme (applyTheme, ThemePref)
│   └── utilities/            # serialQueue, withTimeout, observable, el()
├── tests/lifecycle.e2e.mjs   # launcher/lifecycle Definition-of-Done test
├── scripts/{dev,build}.mjs
└── docs/
```

The shared packages hold only code that more than one piece already uses. The apps keep their own UI: Flow's Apple-style React components and Rubricable's page styles stay theirs, and the launcher uses the shared tokens.

## Lifecycle

```text
REGISTERED ─open→ LOADING ─mount→ READY → ACTIVE ⇄ SUSPENDED ─(LRU / close / memory pressure)→ UNMOUNTED
                                                  any ─fatal error→ CRASHED ─reload/reopen→ LOADING
```

`LifecycleManager` (`launcher/src/lifecycle.ts`) runs transitions one at a time, so rapid switching can't interleave them. Switching away **suspends**. More than `maxSuspended` (2) suspended apps → the least recently used is **unmounted**. `window.__bohr.unmountSuspended()` is the memory-pressure hook. There are no idle timeouts, per the plan: add thresholds after measuring.

### Flow

| State | What Flow holds |
|---|---|
| ACTIVE | Everything: canvases, controller rAF + listeners, ResizeObserver, tile cache, WebGL glass, TutorSync, shortcuts |
| SUSPENDED | Suspend commits any open text edit, saves the lesson to IndexedDB, then `Root` renders nothing. Every React cleanup runs, which destroys the controller (rAF, listeners, observer, tiles), disposes the glass, closes BroadcastChannel, and stops the FPS meter and glitter. The decoded image cache is cleared. Left in memory: the document in `board`, prefs, and the session timer (one timeout). |
| UNMOUNTED | Frame removed, so nothing is left in memory. The lesson is in IndexedDB, and the session (`bohr:session:flow` in sessionStorage) reopens it via `?lesson=<id>`. |

The session timer moved from component state into `src/state/timer.ts`, so a running countdown keeps going (and chimes) while you're in another app. It still resets when closed or when you leave the lesson, as before. TutorSync now sends a snapshot when it's created, so an open student view catches up after Flow resumes.

### Rubricable

It has no loops or heavy runtime, so suspend just hides the frame. While embedded it keeps its rubric in sessionStorage (`rbl-session`), so an unmount or a reload doesn't lose work. Standalone behavior is unchanged. XLSX now loads on first export.

## Shared settings

Bohrified owns the settings that apply everywhere. They're stored in localStorage `bohr:theme` and edited from the ⚙ sheet in the shell bar.

- **Appearance** (System / Light / Dark) is applied to the shell before first paint and sent to every mounted app (`{ type: 'settings' }`) after each load and on every change. Flow maps it to its own appearance preference. Rubricable maps it to its theme. Each app's own toggle still works until the next shared change.
- **Memory:** "Close paused apps" calls `unmountSuspended()`, which unmounts every paused app. Work is saved first.

The settings message is part of the contract (`SharedSettings`, `AppInstance.applySettings`, `connectBohr({ settings })`), so a future app gets the theme without launcher changes.

### App settings

The same sheet also has a section for each app's own preferences. The app currently on screen comes first. An app lists them in `apps/<id>/bohr.settings.ts` (an `AppSettings`: toggles, choices, text fields and actions, each with `get`/`set` or `run`), and the registry attaches that list to the manifest as `settings`. The file only reads and writes the app's existing localStorage keys (the apps share the launcher's origin), so no app code loads and the app doesn't need to be open.

| App | Settings | Stored in |
|---|---|---|
| Flow | Device, Liquid Glass, Hold to snap shapes, Snap dots to rings, First name, Reset profile | `flow:prefs:v1` (merged, so other fields are kept) |
| Rubricable | Ask assignment type on open | `rbl-ask` |

**Live sync:** a write from the launcher fires a `storage` event in every other same-origin document, including a mounted app's frame. Flow's `ui` store and Rubricable's page listen for their own keys and update in place. The launcher watches each app's `storageKeys` the same way, so the open sheet stays current when an app or another tab makes a change. The apps' own settings panels still work.

## Navigation, errors, persistence

- **Routes:** `/` launcher, `/app/<id>` app (History API). Apps keep their own routes inside their frame. Production hosting needs a fallback to `index.html` for `/app/*`; `dist/404.html` covers static hosts.
- **Errors:** a load failure or a fatal error report (`connectBohr().reportError(e, true)`; Flow reports from a React error boundary) moves the app to CRASHED. The launcher shows Reload / Back over that app's slot. The bar and the other apps keep working. Uncaught errors inside a frame are logged but not treated as fatal.
- **Persistent vs runtime state:** persistent data stays where each app already kept it (IndexedDB / localStorage, same origin, so nothing needed migrating). Launcher-owned data goes through `@bohrified/persistence`: localStorage `bohr:theme`, and sessionStorage `bohr:session:<id>`. No secrets exist, and none were added to the launcher.

## Launcher and windows (Bohrified 1.2)

- **Windows** (`launcher/src/windows.ts`). Each open app has one window in the stage; `WindowManager` owns geometry and chrome only (move, resize, minimize, maximize, snap zones, tiling) and remembers geometry per tab in `sessionStorage` (`bohr:windows:<id>`). Screens narrower than 720 px always show windows maximized.
- **Focus = active.** The focused window is the one `ACTIVE` app. Every other window, visible or minimized, is `SUSPENDED` by the lifecycle manager and shows a *Paused* cover until it is clicked, so background windows hold no canvases, loops or WebGL. The URL (`/app/<id>`) is the focused window; `/` means no window is focused and every window is minimized (the launcher is the desktop).
- **Closing** a window unmounts its app first (so it can save), then removes the window. Crashes stay inside the window's frame; the crash screen is drawn over that window only.
- **Library** (`launcher/src/library.ts`). `bohr:recent` (used apps, newest first), `bohr:pins`, `bohr:activity:<id>` (what the user was doing), `bohr:seen` (versions already opened, for *New* / *Updated*). The first visit seeds `bohr:seen` so nothing is flagged.
- **Continue with [App].** Apps report what the user is doing with `setActivity({ title, detail })` (SDK client / `AppContext`). The launcher shows it next to the most recent app. This is a hint, not state restoration: apps still reopen through their own persistence.
- **Shortcuts.** `shellShortcut()` in the SDK maps Cmd/Ctrl + K and Cmd/Ctrl + Alt + arrows. The shell handles them directly; `connectBohr()` (and Rubricable's inline script) forward them from inside an app frame as `shortcut` messages.
- **Quick launcher** (`launcher/src/quick.ts`): a combobox/listbox dialog over apps and window commands.

## Adding an app

1. Put the app in `apps/<id>/`.
2. Add `apps/<id>/bohr.app.ts` exporting a `BohrApp`: `frameApp({ title, src })` for an existing web app, or a custom `{ mount(host, ctx) }` that returns `{ activate, suspend, unmount }`.
3. If it has preferences worth showing in Bohrified's settings sheet, add `apps/<id>/bohr.settings.ts` (see Flow's) and listen for `storage` events on those keys in the app.
4. If it holds expensive runtime, call `connectBohr({ suspend, activate, unmount, settings })` inside it and pass `protocol: true`. Apps without the client can still listen for the `settings` message, as Rubricable does.
5. Add a manifest entry to `launcher/src/registry.ts` (with a `version`, optional `keywords` for search, and `settings` if you added them), add a build step in `scripts/build.mjs` (plus a dev proxy/middleware in `launcher/vite.config.ts` if it has its own server), and add a check to `tests/lifecycle.e2e.mjs`.

No launcher-core changes are needed.

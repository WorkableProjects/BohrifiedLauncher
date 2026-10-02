# Changelog

## Flow 1.3.0 (October 2026)

### Flow
- **Join Whiteboard works on Netlify and locally.** Netlify can't host WebSocket servers, so live sessions now also run over HTTP: a Netlify Function (`netlify/functions/live.mjs`, state in Netlify Blobs) serves `/api/live`, and Flow's viewer and tutor poll it. Nothing to deploy or configure. `npm run dev` still uses the local WebSocket relay, and `VITE_LIVE_SESSION_URL` can point at a `ws(s)://` relay or an `http(s)://` endpoint (the relay serves `/api/live` too).
- Same rules both ways: the first tutor owns the code and key, students can only watch, sessions expire when idle, pause / end / resync behave as before.

## 1.2.0 (October 2026)

**Bohrified 1.2** is the desktop-like shell; **Flow 1.2** the tutoring whiteboard with a chemistry toolkit; **Rubricable 1.2** the grading app with dependable decimals and exports; **App SDK 1.2** the shared foundations.

### Bohrified (launcher)
- **Continue with [App]**, Recent and Pinned apps, search, arrow-key navigation, Cmd/Ctrl + K quick launcher (also from inside apps), app version/description and New/Updated indicators.
- **Windows:** apps open in movable, resizable windows with minimize, maximize/restore, close, focus, snapping (halves, quarters, maximize), tiling and session-remembered geometry. Only the focused window runs; the rest stay suspended behind a Paused cover. Crashes stay inside their window.
- **Join Whiteboard** page (`/join`, `/join/<CODE>`) with connection state, session identity and Leave / Rejoin. Netlify routing and configuration documented in [docs/live-sessions.md](docs/live-sessions.md).
- **Design Language 1.2:** shared tokens for typography, semantic colour, spacing, concentric radii, glass and motion; Text size setting; 44 px targets; Reduce Motion and Reduce Transparency respected.
- **Diagnostics** (Settings): startup, app state and timings, memory, app-reported metrics, and performance budgets.

### Flow
- **Chemistry Tools:** periodic table (CA Chemistry Reference Sheet), element details and tiles, linked Bohr / orbital / Lewis / configuration tools with ions and blank worksheets.
- **Tutoring:** student view with pause, end and viewer count; live sessions through a relay; spotlight; align, distribute, snap-to-objects, nudging; page drag-reorder (undoable); labelled undo/redo.

### Rubricable
- Saved rubrics with autosave, decimal-safe scoring and CSV / clipboard / XLSX exports, input validation and accessible status messages.

### App SDK and packages
- `setActivity`, `setMetrics`, shell shortcuts, live-session helpers, performance budgets, design tokens (`@bohrified/ui`).

### Removed
- The Elements sheet (replaced by Chemistry Tools). No workspace or full app state restoration feature was built; the existing pause/suspend lifecycle and per-app persistence are unchanged.

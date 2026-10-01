# Bohrified

One launcher for peer tutoring apps.

## Versions

- **Bohrified** (launcher, "Bf") — 1.2.0
- **Flow** (whiteboard "Fl") — 1.2.0
- **Rubricable** (GC Rubric Maker, "Rb") — 1.2.0
- **App SDK / shared packages** — 1.2.0

## Using Bohrified 1.2

- **Continue with [App]** on the launcher reopens the app you used last, with what you were doing.
- **Pin** apps with the star on a card; **Recent** apps appear above the full list. Press `/` to search.
- **Cmd/Ctrl + K** opens the quick launcher from anywhere, including inside an app.
- Apps open in **windows**: drag the title bar, resize from any edge, double-click to maximize.
  Drag to the left/right edge to snap to a half, to a corner for a quarter, to the top to maximize.
  `Cmd/Ctrl + Alt + ←/→` snaps, `↑` maximizes or restores, `↓` minimizes. "Tile windows" is in the quick launcher.
- Only the focused window runs. Other windows show **Paused** and keep their place; click one to resume it.

**Also in 1.2:** Flow's **Chemistry Tools** (periodic table and linked models), tutoring tools (alignment, snapping, spotlight, page reordering, undo labels), **live sessions** with a Join Whiteboard page ([docs/live-sessions.md](docs/live-sessions.md)), Rubricable's saved rubrics and decimal-safe exports, Bohrified's design tokens, and diagnostics with performance budgets ([docs/performance/budgets.md](docs/performance/budgets.md)). See [CHANGELOG.md](CHANGELOG.md).

## Getting started

Requires Node 20.19+.

```bash
git clone https://github.com/WorkableProjects/BohrifiedLauncher.git
cd BohrifiedLauncher
npm install
npm run dev
```

Open http://localhost:5173.

## Commands

```bash
npm run dev             # Start Bohrified and Flow
npm run build           # Build all apps
npm run preview         # Preview the production build
npm run typecheck       # Type-check all packages and apps
npm run test:lifecycle  # Run launcher lifecycle checks
npm run test:launcher   # Unit tests for the launcher (library, search, window geometry)
npm run test:launcher:e2e  # Launcher + window-manager browser test (needs a build)
npm run test            # All unit tests (Flow, launcher, packages, Rubricable, relay)
npm run relay           # Live-session relay for Join Whiteboard (also started by npm run dev)
npm run dev:flow        # Run Flow independently
npm run test:flow       # Test Flow
```

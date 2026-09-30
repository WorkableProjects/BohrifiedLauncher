# Bohrified

One launcher for peer tutoring apps.

## Versions

- **Bohrified** (launcher, "Bf") — 1.1
- **Flow** (whiteboard "Fl") — 1.1
- **Rubricable** (GC Rubric Maker, "Rb") — 1.0

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
npm run dev:flow        # Run Flow independently
npm run test:flow       # Test Flow
```

# Bohrified

One launcher for the peer tutoring apps. It currently hosts **Flow** (whiteboard) and **Rubricable** (rubric builder).

## Getting started

Requires Node 20.19+ (Vite 8).

```bash
git clone https://github.com/WorkableProjects/BohrifiedLauncher.git
cd BohrifiedLauncher
npm install        # one install at the root sets up every workspace (launcher, apps/flow, packages/*)
npm run dev        # http://localhost:5173
```

The root `package.json` declares npm **workspaces**. `npm install` reads it together with the single root `package-lock.json`, installs every dependency once into the root `node_modules`, and links the internal packages (`@bohrified/app-sdk`, `…/persistence`, `…/ui`, `…/utilities`). No per-app install is needed.

| Command | What it does |
|---|---|
| `npm run dev` | Launcher on :5173; Flow's dev server runs on :5174 behind it (same origin, with HMR) |
| `npm run build` | Production build into `dist/`: launcher + `apps/flow` + `apps/rubricable` |
| `npm run preview` | Serve `dist/` on :4173 |
| `npm run typecheck` | Type-check every package and app |
| `npm run test:lifecycle` | After build: launcher, lifecycle, memory and crash checks (needs Chrome or Chromium) |
| `npm run dev:flow` / `npm run test:flow` | Flow on its own |

Rubricable still opens on its own too: `apps/rubricable/index.html`.

**Deploying:** Netlify is configured in `netlify.toml`: connect the repo and it builds with `npm run build`, publishes `dist/`, and rewrites `/app/*` to the shell. Any other static host works too if `/app/*` falls back to `index.html`; `dist/404.html` covers hosts without rewrites, such as GitHub Pages.

## Docs

- Architecture, lifecycle, shared settings, adding an app: [docs/architecture.md](docs/architecture.md)
- Measurements: [docs/performance/baseline.md](docs/performance/baseline.md)
- Plan: [.dev/BOHRIFIED_DEVELOPMENT_PLAN.md](.dev/BOHRIFIED_DEVELOPMENT_PLAN.md)

`apps/flow` and `apps/rubricable` were imported with `git subtree`, so their full histories are kept in this repo.

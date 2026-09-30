# Bohrified — Claude Code Development Plan

## 1. Goal

Build **Bohrified**, a single central launcher/workspace for the peer-tutoring apps used this year and next.

Immediate priorities:
- Merge the existing **Flow** whiteboard app and the second tutoring app into one project.
- Make switching/opening apps feel instant.
- Keep RAM usage low, especially when an app is inactive.
- Make adding future tutoring apps require minimal launcher changes.
- Preserve the existing behavior/data of both apps during integration.

**Do not rewrite either app from scratch. Do not redesign everything before integration works.**

---

## 2. Inspect Before Modifying

Claude Code must first inspect both codebases and produce a short integration report covering:

- Framework/runtime, build tool, entry points, routing, state management, persistence.
- Package/dependency differences.
- Global CSS, globals, event listeners, timers, workers, service workers.
- Canvas/WebGL/WebAudio resources and large assets.
- Environment variables and external services.
- Existing tests/build commands.
- Likely startup cost and memory-heavy areas.

Identify conflicts before merging: duplicate dependencies, routers, global shortcuts, storage keys, service-worker scopes, singleton services, or incompatible build assumptions.

**Do not flatten both projects blindly. Preserve clear app boundaries.**

---

## 3. Target Architecture

Use a monorepo-style structure where practical:

```text
bohrified/
├── launcher/                 # Bohrified shell
├── apps/
│   ├── flow/
│   └── second-app/
├── packages/
│   ├── app-sdk/             # app lifecycle contract
│   ├── ui/                  # genuinely shared components
│   ├── persistence/
│   └── utilities/
├── tests/
└── scripts/
```

Bohrified owns **navigation, app registration, lifecycle, shared settings, error isolation, and common infrastructure**.

Each app owns its own **business logic, screens, document model, and app-specific state**.

### App registry

Future apps should be declaratively registered, conceptually like:

```ts
{
  id: 'flow',
  name: 'Flow',
  icon: FlowIcon,
  loader: () => import('../apps/flow')
}
```

Use the actual framework/build system rather than copying this literally.

Adding an app should normally mean: create app → implement contract → add registry entry → add tests.

---

## 4. Fast Launching / Code Splitting

Bohrified startup must load **only the shell and lightweight app metadata**.

Do not initialize every application at startup.

Use lazy loading/code splitting for heavy app code and dependencies. Candidates include canvas engines, editors, image/PDF tooling, collaboration libraries, and math/LaTeX engines.

Desired flow:

```text
Bohrified starts
→ shell appears immediately
→ user selects app
→ app chunk loads/restores
→ expensive runtime initializes
→ app becomes interactive
```

Use caching for repeat launches, but distinguish **disk/cache persistence from live RAM**. Do not create a large in-memory cache without profiling evidence.

---

## 5. Flow RAM + Lifecycle Management

Flow is the primary resource-management case.

**Hiding Flow is not enough.** A hidden app may still retain canvas/GPU memory, workers, listeners, timers, image buffers, network connections, and undo history.

Implement explicit lifecycle states such as:

```text
REGISTERED → READY → ACTIVE → SUSPENDED → UNMOUNTED
```

### ACTIVE

Flow may own its full interactive runtime:
- Canvas/rendering resources.
- Pointer/keyboard listeners.
- Resize observers.
- Animation loops.
- Workers.
- Collaboration/network resources.
- Decoded image/GPU resources.

### SUSPENDED

For normal app switching:
- Stop animation frames/timers.
- Detach unnecessary listeners/observers.
- Pause/stop workers that are not needed.
- Release expensive rendering resources where safe.
- Preserve only cheap session/document state needed for fast restoration.

### UNMOUNTED

For prolonged inactivity or memory pressure:
- Tear down almost all runtime resources.
- Terminate workers and close connections where appropriate.
- Dispose rendering/GPU resources.
- Preserve user data/session state in serializable persistence.
- Recreate runtime on next activation.

Use a **suspend → unmount** policy rather than an arbitrary timeout. Add thresholds only after measuring real memory behavior.

Every resource creation must have an obvious cleanup path:

```text
start/create/subscribe/addEventListener
        ↓
stop/dispose/unsubscribe/removeEventListener
```

Centralize cleanup in lifecycle/resource managers where practical.

---

## 6. State, Navigation, and Isolation

Separate:

**Persistent state:** documents, user content, preferences, recent files, important settings.

**Runtime state:** canvas contexts, workers, animation state, decoded assets, temporary selections, render caches.

Runtime state must be safe to destroy and reconstruct.

Use one top-level Bohrified navigation system, for example:

```text
/                → launcher
/app/flow        → Flow
/app/second-app  → second app
/app/<future>    → future app
```

Each app may have its own internal routes beneath its app boundary.

Wrap each app in an error boundary so one app failure does not take down the launcher. Users must still be able to navigate away if an app crashes.

Do not move secrets into client-side launcher code during the merge.

---

## 7. Implementation Phases

### Phase 0 — Baseline

Before architectural changes:
- Both apps build and run.
- Existing tests pass.
- Record bundle/startup data.
- Record available memory measurements.
- Save results in `docs/performance/baseline.md`.

### Phase 1 — Combine Build/Repository

Bring both codebases under one repository/build workflow while keeping each app independently runnable. Resolve dependency and configuration conflicts without large refactors.

### Phase 2 — Build Bohrified Shell

Create the launcher, registry, top-level routing, shared error handling, and app lifecycle manager.

### Phase 3 — Integrate Apps

Move Flow and the second app behind the shared app contract. Preserve their existing behavior and data model.

### Phase 4 — Optimize

Add lazy loading, lifecycle cleanup, caching, session restoration, and Flow suspend/unmount behavior.

### Phase 5 — Verify

Run repeated app transitions and memory tests. Fix leaks before extracting broad shared abstractions.

### Phase 6 — Expand

Only after both apps are stable, add the shared UI/design system and future tutoring apps.

---

## 8. Required Tests / Definition of Done

Claude Code should create automated or repeatable tests for:

| Test | Verify |
|---|---|
| Fresh launcher | shell loads without initializing all apps |
| Flow launch | Flow becomes interactive quickly |
| Flow → second app | Flow releases expensive resources |
| Second app → Flow | Flow restores correctly |
| Repeated switching | no continuous memory growth/leak |
| Large Flow document | acceptable activation + memory behavior |
| Flow unmount/remount | data is preserved and runtime rebuilds correctly |
| App crash | launcher remains usable |
| Future app registration | new app requires no launcher-core rewrite |

Track at minimum:
- launcher startup time;
- app activation time;
- initial bundle size;
- active/suspended/unmounted memory;
- memory after 10–20 repeated switches.

### Final success criteria

Bohrified is ready for expansion when:
1. Both existing apps work from one launcher.
2. Apps are not fully initialized at launcher startup.
3. Flow releases substantial inactive runtime resources without losing work.
4. Repeated switching does not show unbounded memory growth.
5. App failures are isolated from the shell.
6. A new tutoring app can be registered without restructuring Bohrified.

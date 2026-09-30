# Bohrified — October Development Plan

**Goal:** Turn Bohrified from a launcher into a cohesive tutoring workspace while keeping apps fast, isolated, and memory-efficient.

## Version Targets

| Product | Current | October Target |
|---|---:|---:|
| **Bohrified Launcher** | 1.1 | **1.2** |
| **Flow** | 1.1 | **1.2** |
| **Rubricable** | 1.1 | **1.2** |
| **App SDK / shared infrastructure** | 1.1 | **1.2** |

> Do not bump versions for removed/abandoned features. All completed October release work should use the new target versions above.

---

# Phase 1 — Bohrified Launcher 1.2
### Make the launcher feel like the home of the suite

- Add **Continue with [App]** as the main resume action.
  - Example: `Continue with Flow`
  - Show the last-used app and useful recent context.
- Add **Recent Apps** and **Favorites/Pinned Apps**.
- Add app search/filtering.
- Add keyboard navigation and **Cmd/Ctrl + K** quick launcher.
- Add app metadata: icon, name, version, description, and update/new indicator.
- Keep the existing lifecycle behavior: apps can be **paused/suspended while Bohrified remains open** instead of forcing full close/reopen behavior.
- Remove the previously proposed full “true app state restoration” feature; use the existing persistence/lifecycle system only where needed.

**Release:** `Bohrified 1.2`

---

# Phase 2 — Window Management 1.2
### Make Bohrified behave more like Windows/macOS

Replace the previous “workspace” concept with **desktop-style window management**.

- Apps open in movable, resizable windows inside Bohrified.
- Support minimize, maximize/restore, close, and focus/bring-to-front.
- Allow multiple app windows where appropriate.
- Add window snapping/tiling behavior for common layouts.
- Remember useful window geometry during the current session.
- Prevent inactive apps from wasting memory: background windows should remain **paused/suspended** through the lifecycle manager.
- Preserve crash isolation so one app cannot take down the launcher.

**Release:** `Bohrified 1.2`

---

# Phase 3 — Flow 1.2: Chemistry Toolkit
### Turn existing chemistry models into a connected toolkit

Build on the existing Bohr model, QMM mode, orbital diagrams, Lewis dots, and electron configuration tools.

- Add a searchable/clickable **Periodic Table**. (ENSURE TO ATTACH CA DEPT VERSION INTO CLAUDE FOR THIS!!!)
- Element detail view should include available educational data used by the app.
- Allow an element to be inserted directly into the Flow canvas.
- Make chemistry representations more interactive where practical:
  - Electron count changes update related representations.
  - Orbital diagrams remain aligned with Aufbau, Hund, and Pauli rules.
  - Lewis-dot representations respond to valence-electron changes.
- Group chemistry tools into a consistent **Chemistry Tools** area.

**Release:** `Flow 1.2`

---

# Phase 4 — Flow 1.2: Tutoring Tools
### Improve live teaching without adding unnecessary controls

- Add a **student/tutor presentation flow**.
- Add temporary focus/spotlight-style interactions without introducing a laser pointer.
- Add better selection, multi-select, duplicate, copy/paste, alignment, and snapping behavior.
- Improve page duplication, naming, reordering, and navigation.
- Improve undo/redo visibility and interaction.
- Keep animations purposeful and interruptible.

**Release:** `Flow 1.2`

---

# Phase 5 — Tutoring Join / Session Flow 1.2
### Refine the session system around a dedicated join experience

Instead of building a broad shared workspace system, keep the tutoring flow focused:

- Add a **separate Join Whiteboard page** in Bohrified.
- Student enters a tutor/session code or link.
- The page connects directly to the tutor’s Flow whiteboard.
- Show connection state, tutor/session identity, and a clear leave/rejoin action.
- Student mode should prevent accidental editing while still showing tutor updates.
- Keep this architecture compatible with the existing live-sync/resync work.
- Refine the existing tutoring/session concept rather than expanding it into a large cross-app workspace model.

### Netlify / deployment option

Because Bohrified is hosted on **Netlify**, include a simple deployment/configuration path for the join system:

- Environment/config option for the live-session backend URL.
- Production vs. local-development configuration.
- Netlify-safe routing for the dedicated join page.
- Document the required environment variables and deployment steps.
- Keep secrets out of the frontend repository.

**Release:** `Bohrified 1.2` + `Flow 1.2`

---

# Phase 6 — Rubricable 1.2
### Continue the move toward practical grading

- Improve rubric persistence and editing reliability.
- Make exports consistently preserve decimal scoring.
- Polish assignment/quiz/unit-test flows and custom point handling.
- Improve empty states, editing feedback, and error handling.

**Release:** `Rubricable 1.2`

---

# Phase 7 — Bohrified Design Language 1.2
### New visual language: Apple-inspired, adapted for Bohrified

Base the shared design language on the attached **“Apple Design Language”** guide. The guide emphasizes content-first design, clarity, deference, depth, hierarchy, harmony, and consistency.

### Core rules

- **Content first:** controls should step back and avoid competing with the lesson, rubric, or whiteboard.
- **Clarity:** legible typography, precise icons, and obvious control purpose.
- **Depth:** use layers and motion to communicate hierarchy and location.
- **Hierarchy:** navigation and controls live on their own layer above content.
- **Harmony:** use rounded/concentric corner relationships throughout the suite.
- **Consistency:** shared foundations across Bohrified, Flow, and Rubricable.

### Material

Use **Liquid Glass-style translucency** for navigation and controls, not for the actual content canvas/rubric content. Do not stack glass on glass; keep text bold/high-contrast.

### Typography

- Use `-apple-system, Inter, sans-serif` on the web.
- Use semantic text styles rather than arbitrary fixed font sizes.
- Support scalable text sizing where practical.
- Keep large display text distinct from smaller text styles.

### Color

- Use one primary **tint/accent** for interactive controls within each app.
- Use semantic color roles instead of hard-coding colors everywhere.
- Support light/dark token swaps.
- Default semantic roles should follow the supplied guide for label, secondary label, background, secondary background, separator, and tint.

### Layout & shape

- Minimum interactive target: **44 × 44**.
- Use a consistent **4/8 pt spacing rhythm**.
- Maintain consistent side insets.
- Use concentric corner-radius relationships for nested UI.

### Icons & motion

- Use a consistent line/icon weight next to matching text.
- Prefer springs/physical motion over linear easing.
- Motion must be brief, purposeful, and interruptible.
- Respect Reduce Motion and Reduce Transparency.

### Shared tokens

Centralize the design tokens so all apps consume the same values for typography, semantic colors, spacing, radii, glass, and motion. The source guide provides a token model covering these areas.

**Release:** `Bohrified 1.2 / Flow 1.2 / Rubricable 1.2`

---

# Phase 8 — Performance, Lifecycle & Reliability 1.2
### Keep the suite fast while adding features

- Keep the existing **pause/suspend/resume** lifecycle architecture.
- Add lightweight diagnostics for:
  - launcher startup
  - app mount/suspend state
  - memory usage where available
  - Flow canvas/render workload
- Define practical performance budgets for startup, switching, and suspended-app memory.
- Expand lifecycle tests for launch, switch, suspend, resume, eviction, and crash isolation.
- Test Flow persistence/export and Rubricable scoring/export behavior.
- Avoid loading heavy app code until it is needed.
- Keep XLSX/export dependencies lazy where possible.

**Release:** `App SDK 1.2`

---

# Phase 9 — Final Integration & Release 1.2
### Make all three apps feel like one product

- Verify shared design tokens/components across all apps.
- Verify window management + lifecycle suspension work together.
- Verify **Continue with [App]** works after switching/suspending apps.
- Verify Join Whiteboard routing works on Netlify and locally.
- Run full build, typecheck, unit/E2E, and lifecycle tests.
- Update all package/app version strings, in-app version displays, README references, and release metadata to the correct **1.2** versions.
- Remove dead code and documentation for removed features.

## October Definition of Done

**Bohrified 1.2** is the desktop-like shell: launcher, recent apps, Continue with [App], windows, and lifecycle management.

**Flow 1.2** is the tutoring whiteboard + chemistry toolkit with stronger live-teaching interactions.

**Rubricable 1.2** is the flexible grading/feedback app with reliable decimal scoring and exports.

**App SDK 1.2** provides the shared lifecycle, window, design-token, and integration foundations.

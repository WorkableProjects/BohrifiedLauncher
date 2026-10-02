# Frames

Bohrified's presentation app: simple slides, deep customization, cinematic motion. Opens from the Bohrified launcher (`/app/frames`) and also runs standalone (`npm run dev -w apps/Frames`).

## Layout

| Folder | What's there |
|---|---|
| `src/model` | The document model (`types.ts`), factories, immutable edit operations, theme tokens |
| `src/anim` | Animation engine: easing (bezier, springs), keyframe tracks, motion paths, timeline compiler, presets |
| `src/render` | Canvas renderer shared by the editor, presenter, thumbnails and export (text layout, shapes, charts, tables, icons, media cache) |
| `src/transitions` | Transition registry (incl. Morph/Magic Move and the broadcast set) and the runner |
| `src/present` | `Player` runtime, fullscreen presenter, presenter/audience windows |
| `src/editor` | Stage (canvas interaction, snapping, guides), toolbar, slide strip, inspector, timeline, shortcuts |
| `src/io` | IndexedDB persistence, `.frames` projects, PPTX/PDF import, PDF/PNG/JPG/video/HTML export, library (styles, brand kits, components, templates) |
| `src/templates` | Built-in presentation templates and slide recipes |
| `src/player` | Entry for the standalone player inlined into "Web page" exports (`npm run player`) |

One renderer and one animation engine serve editing, presenting and exporting, so what you edit is what you present and export.

## Bohrified integration

- `bohr.app.ts`: frame adapter; the session reopens the last presentation after an unmount.
- `bohr.settings.ts`: every preference in Bohrified's settings sheet, generated from `src/state/prefsSchema.ts` (the same list the in-app Preferences use). Both sides write `frames:prefs:v1` and follow `storage` events, so changes show up on the other side at once. Appearance is Bohrified's shared `bohr:theme`, which Frames reads and can set.
- Suspend saves, stops loops and releases canvases and decoded media.

## Tests

`npm test -w apps/Frames` (unit), `npm run build && npm run test:frames:e2e` (through the launcher: create, edit, animate, present, export, preference and theme sync, suspend).

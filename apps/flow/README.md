# Flow

A fast whiteboard for online tutoring, built to Apple's design language. Floating Liquid Glass toolbars, very little chrome, pressure-sensitive ink, and clean vector shapes.

```bash
npm install
npm run dev -- --host        # http://localhost:5173
npm run build      # typecheck + production build
npm test           # unit tests (store/history, geometry, shape recognition, rich text, presets, dot snapping)
npm run e2e        # end-to-end smoke test in Chromium (after build)
npm run perf       # canvas benchmark in Chromium (after build)
```

## Features

**Home & onboarding**
- Welcome screen with **Recent Lessons** (thumbnails, last edited, page count, search, delete), a **New Lesson** button, **Start with** paper templates, and **Open File…**
- First launch asks for your **first name** (Home greets you with it), then **Tablet/Phone or Desktop/Laptop** (pre-selected from the pointer type) and tunes the UI: touch-first means no hover-only controls and pinch to zoom; desktop means a zoom bar, shortcut hints and the student-view window. You can change either anytime in Settings, or **Reset Profile** (Home › Settings) to run the welcome again; lessons are kept
- Lessons autosave to an on-device library (IndexedDB). Untouched new lessons aren't kept. Deep links: `?lesson=new`, `?lesson=<id>`

**Drawing**
- Pen with real stylus pressure (simulated for mouse/touch), highlighter, whole-stroke eraser, laser pointer with a fading trail
- Shapes: rectangle, ellipse, triangle, line, arrow. Optional fill. Hold ⇧ to constrain
- **Dot tool** (`D`): tap to place solid dots in three quick sizes (or any size from 4–40 px) and any color. Made for Bohr models: with **Snap** on, a dot tapped near a circle lands exactly on it, and a ghost shows where it will go
- **Hold to snap:** draw a rough line, circle, rectangle or triangle and pause. It becomes a clean vector shape, as in Apple Notes
- **Rich text** boxes and sticky notes (one Text tool, two kinds): **bold**, *italic* and underline right on the canvas, from the floating format bar or ⌘B / ⌘I / ⌘U, and on selected text from the selection bar
- Images (button, paste or drag-and-drop), select / marquee / move / scale, duplicate, z-order
- Infinite canvas: pinch or ⌘-scroll to zoom, two-finger or space-drag to pan. Palm rejection once a stylus is detected

**Apps** (top-right ▦ menu)
- **Timer**, **Screen Hider**, **LaTeX Equation**, **Chemistry Tools** and **Text**, in one place
- **Chemistry Tools:** one place for the chemistry resources. A searchable, clickable **Periodic Table** (from the California Standards Test Chemistry Reference Sheet, with its names and masses) shows each element's atomic number, mass, group and period, category, energy levels, valence electrons and electron configuration, and can drop an element tile on the board. The **Bohr Model**, **Orbital Diagram**, **Lewis Dot** and **Configuration** tools all draw the same element: change the element or its electron count (ions included) and every tool updates. Orbital arrows follow the Aufbau, Hund and Pauli rules (with the textbook exceptions such as Cr and Cu), and Lewis dots follow the valence electrons. *Blank worksheet* inserts the empty template for a student to fill in. Everything inserts as ordinary editable shapes and text.
- **LaTeX Equation:** type TeX, watch it typeset live, insert it as a vector object. Move, resize (it stays sharp at any zoom), and double-click or tap **Edit** to change it. MathJax loads only when the sheet first opens

**For tutoring**
- **Lesson pages** with thumbnails, reorder, duplicate and rename
- **Paper per page:** blank, dots, grid, lined (with margin), and **graph paper with labelled x/y axes**
- **Screen Hider:** an overhead-projector style shade. Drag it to reveal worked steps one at a time (`C`)
- **Session timer:** countdown presets or stopwatch, with a soft chime
- **Student view:** opens a clean, chrome-free window that mirrors the board live (page, camera, ink as it's drawn, laser). Share that single window in Zoom, Meet or Teams
- Export a page as PNG, copy it to the clipboard, and save or open `.flow` lesson files

**Design** (from the Apple Design Language guide)
- Role-named tokens (`--label`, `--bg-2`, `--tint`…). Dark mode is a token swap, and drawing colors are semantic tokens that adapt too
- Liquid Glass only on the control layer, never on content, and no glass-on-glass: menus render in a separate sheet layer
- 44 pt targets, concentric radii, a 4/8 spacing rhythm, SF type ramp (`-apple-system`, Inter as fallback)
- Spring easing (`cubic-bezier(.32,.72,0,1)`). Honors Reduce Motion and Reduce Transparency
- **Mobile performance:** with the Mobile device selected, decorative motion is dropped (no Home ⇄ Board circle reveal, no canvas page slide or crossfade, no Home glitter), WebGL Liquid Glass is off and glass blur is lighter. Toolbars, the tool bubble and menus stay
- **Motion:** the selected tool is a single liquid bubble that flows between buttons (leading edge first, trailing edge catching up). Pages slide, paper and appearance changes crossfade, menus and sheets animate out as well as in
- **Material:** toolbar glass has soft blur and gentle rim refraction, with no specular highlights or white glow and only a trace of shadow, so it sits in the canvas rather than floating over it
- **Contextual layout:** a compact shelf above the dock changes with the tool (colors and weights for ink, kinds for shapes, Text / Sticky for text, colors, sizes and Snap for dots, sizes for the eraser) and swaps places with the selection bar, which adds formatting for text and Edit for equations
- **Brand:** primary accent `#FF6083` is the app tint; secondary accent `#FFD3D6` backs tinted controls. The logo has light and dark artwork; on Home it fills the window height as a fixed background (50%, running off the left edge) on a page tinted to match its tile (`#FFD8DA` / `#070005`), with a barely-visible glitter

## Version

Current release: **1.1.0** (shown at the bottom of Home).

**1.1**
- Chemistry Tools: the Bohr model has a **QMM** toggle (quantum mechanical model) that removes the `p =` and `n =` labels and the electrons on orbits
- Elements: new chemistry models: **Orbital Diagram** (boxes and up/down arrows, any range from 1s to 7p, filled by Aufbau, Hund's rule and Pauli), **Lewis Dot** (symbol plus 0–8 valence dots) and **Configuration** (`1s² 2s² 2p⁶ …` as editable text)
- Accent color (Settings, and Home): the UI is white in Light and black in Dark, and you pick the accent: Flow pink, blue, purple, green, orange, Mono (black / white) or any custom color
- Keyboard shortcuts moved out of Settings into their own sheet (Share & export menu, or press `?`)

## Architecture

```
src/
  engine/        framework-free core
    types.ts       immutable document model (elements, pages, camera)
    store.ts       BoardStore: ops-based undo/redo + change events (also the sync unit)
    geometry.ts    camera math, bounds, hit-testing, transforms
    freehand.ts    perfect-freehand → Path2D, cached per element
    renderer.ts    element + background painting
    richtext.ts    rich text spans: marks registry, wrap/measure, editor HTML ⇄ spans
    latex.ts       lazy MathJax: TeX → self-contained SVG
    presets.ts     Elements presets (Bohr model) and dot-to-ring snapping
    tiles.ts       tiled raster cache for the committed scene
    recognize.ts   hold-to-snap shape recognition
    sync.ts        BroadcastChannel tutor ↔ student view
    persistence.ts IndexedDB lesson library, .flow files, image import
  canvas/
    controller.ts  pointer input, tools, frame loop (outside React)
    transitions.ts page slide / crossfade from a snapshot of the last frame
    BoardCanvas.tsx / TextEditor.tsx (contenteditable rich text, presets)
  home/          Home (welcome + recents) and first-run onboarding
  state/         UI prefs, lesson lifecycle, actions
  ui/            glass toolbars, bubble, Apps, equation sheet, format bar, inspector, pages, timer, curtain
  icons/         SF Symbols → <Icon>, generated by scripts/build-icons.mjs
  vendor/liquidglass/   WebGL Liquid Glass (see its README)
```

### Performance design
- **Out of React:** the hot path (pointer → ink → pixels) never re-renders React. The controller owns two canvases and a single rAF loop that runs only when something is dirty.
- **Two layers:** *scene* holds committed content, *live* holds in-progress ink, previews, selection and laser. The live layer uses a `desynchronized` 2D context for low-latency ink and `getCoalescedEvents()` for full-rate (120–240 Hz) stylus samples.
- **Tiled scene cache:** canvas 2D defers rasterization, so repainting thousands of paths on every pan frame is expensive. The scene is cut into 256 px device tiles per scale. Panning and zooming only blit cached bitmaps. New tiles rasterize under a per-frame time budget, with other scales standing in until they're ready. While moving, tiles use √2-quantized scales. At rest they re-render at the exact scale, so ink stays crisp. Committing a stroke paints it straight into the existing tiles.
- **Region-aware glass:** the WebGL glass refreshes only the bars that sit over changed pixels, so ink far from a toolbar costs the GPU nothing.

`npm run perf` (headless Chromium, 1440×900, a board with 2,000 strokes; budget is p95 < 8 ms render work per frame):

| scenario | p50 | p95 | frame cadence |
|---|---|---|---|
| 240 Hz ink stroke | 0.3 ms | 0.5 ms | 60 fps |
| pan heavy board | 2.5 ms | 4.8 ms | 60 fps |
| zoom heavy board | 1.4 ms | 7.4 ms | 60 fps |
| commit strokes | 0.8 ms | 0.9 ms | – |

Headless Chromium rasterizes on the CPU, so `DPR=2 npm run perf` becomes fill-rate bound there. That's expected; on real hardware GPU compositing handles Retina fill rate.

## Credits
- Liquid Glass: [ybouane/liquidglass](https://github.com/ybouane/liquidglass) (MIT)
- Icons: SF Symbols exported by [brendanballon/sfsymbols-svg](https://github.com/brendanballon/sfsymbols-svg). SF Symbols are © Apple and licensed for use on Apple platforms; swap `scripts/build-icons.mjs` to another icon set before shipping elsewhere.
- Equations: [MathJax](https://github.com/mathjax/MathJax-src) (Apache-2.0)
- Ink: [perfect-freehand](https://github.com/steveruizok/perfect-freehand) (MIT)

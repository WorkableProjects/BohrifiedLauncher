# **Frames — Bohrified Exclusive**

> **Goal:** Build Frames as Bohrified’s presentation/slide application: the simplicity of Google Slides, the creative freedom of Canva, and the cinematic/professional animation quality of Keynote — with a distinctly Bohrified interface.

**Target:** Claude Code / Opus 5.5  
**Architecture:** Bohrified-exclusive module  
**Repository:** `WorkableProjects/BohrifiedLauncher`

---

## **Phase 1 — Bohrified Integration**

* Add **Frames** directly into the Bohrified launcher ecosystem.  
* Frames must launch instantly from Bohrified.  
* Reuse Bohrified's existing:  
  * Navigation  
  * Window/layout system  
  * Theme system  
  * Preferences infrastructure  
  * Keyboard shortcuts  
  * File/project handling where practical.  
* Do **not** duplicate launcher functionality inside Frames.  
* Treat Frames as a first-class Bohrified application.

### **Global Preference Rule**

**Always sync Frames preferences with Bohrified Launcher Settings.**

Any setting changed inside Frames must immediately be reflected in Bohrified Settings, and vice versa.

Examples:

* Appearance  
* Theme  
* Animations  
* Interface density  
* Default slide size  
* Export preferences  
* Keyboard shortcuts  
* Presentation behavior

---

## **Phase 2 — Core Slides Editor**

Create a clean, immediately understandable editor inspired by Google Slides.

### **Main Layout**

* **Top toolbar**  
  * Undo / redo  
  * Add  
  * Text  
  * Image  
  * Shape  
  * Line  
  * Media  
  * Tables  
  * Charts  
  * Arrange  
  * Animate  
  * Present  
  * Export  
* **Left sidebar**  
  * Slide thumbnails  
  * Add/delete/duplicate slides  
  * Drag to reorder  
  * Sections  
  * Optional speaker notes indicator  
* **Center canvas**  
  * Accurate slide editing  
  * Zoom  
  * Guides  
  * Alignment  
  * Snap  
  * Multi-select  
  * Grouping  
* **Right inspector**  
  * Context-sensitive properties  
  * Position / size  
  * Typography  
  * Fill / border  
  * Effects  
  * Animation  
  * Layout

Keep the default interface **simple**. Advanced controls should appear progressively rather than overwhelming the user.

---

## **Phase 3 — Canva-Level Customization**

Frames should allow significantly deeper customization than traditional slide editors.

### **Elements**

Support:

* Text  
* Rich text  
* Images  
* SVG  
* Shapes  
* Lines  
* Icons  
* Video  
* Audio  
* Tables  
* Charts  
* Frames/masks  
* Groups  
* Backgrounds

### **Rich Text**

Support:

* Multiple fonts  
* Font weights  
* Font size  
* Color  
* Highlight  
* Opacity  
* Letter spacing  
* Line height  
* Alignment  
* Lists  
* Superscript/subscript  
* Links  
* Mixed formatting within one text object

### **Image Tools**

* Drag/drop import  
* Crop  
* Mask  
* Rounded corners  
* Object positioning  
* Transparency  
* Filters  
* Basic adjustments  
* Replace image without losing layout  
* Copy/paste images

---

## **Phase 4 — Layout & Design System**

Make professional design possible without forcing users to manually position everything.

Implement:

* Smart guides  
* Grid  
* Snap-to-object  
* Snap-to-center  
* Equal spacing  
* Alignment/distribution  
* Rulers  
* Margins  
* Safe areas  
* Layer ordering  
* Lock/hide elements  
* Group/ungroup  
* Duplicate  
* Copy/paste styling  
* Reusable styles  
* Slide layouts  
* Master-style templates

Add a lightweight **design system** for:

* Colors  
* Typography  
* Spacing  
* Corner radius  
* Shadows  
* Effects

---

## **Phase 5 — Animation Engine**

This is the defining feature of Frames.

Do **not** build animation as a collection of basic PowerPoint-style effects.

Build a reusable animation engine capable of:

* Entrance  
* Exit  
* Emphasis  
* Motion  
* Transformation  
* Camera movement  
* Object-to-object transitions  
* Timeline-based animation

Every object should be animatable.

### **Advanced Animation**

Support:

* Position  
* Scale  
* Rotation  
* Opacity  
* Blur  
* Color  
* Size  
* Crop  
* Path movement  
* 3D-style movement where practical  
* Multiple properties simultaneously  
* Custom easing  
* Spring physics  
* Bezier paths  
* Staggering  
* Sequencing  
* Delays  
* Duration

---

## **Phase 6 — Keynote-Style Transitions**

Create transitions that feel **cinematic rather than generic**.

Include:

* Morph  
* Magic Move-style object continuity  
* Push  
* Zoom  
* Camera pan  
* Camera zoom  
* Perspective movement  
* Blur transition  
* Depth transition  
* Split/reveal  
* Wipe variations  
* Shape transitions  
* Dynamic object transitions

### **Signature Frames Transitions**

Create distinctive transitions inspired by professional broadcasts/esports.

Examples:

**Replay → Live**

* Screen compresses/zooms like a broadcast replay window.  
* Replay frame moves aside.  
* UI elements sweep away.  
* Live content expands into the viewport.

**Broadcast Cut**

* Fast directional camera movement.  
* Graphic overlay wipes through the frame.  
* New slide resolves underneath.

**Scoreboard**

* Information panels slide into broadcast-style positions before transitioning into the next slide.

**Camera Rush**

* Aggressive zoom through an object or graphic into the next scene.

**Signal**

* Brief digital distortion/glitch followed by a clean transition.

These should be **professional and configurable**, not gimmicky.

---

## **Phase 7 — Timeline & Motion Editor**

Add an optional advanced animation workspace.

Users should be able to:

* See all animated objects  
* Scrub a timeline  
* Adjust duration  
* Reorder animations  
* Add keyframes  
* Edit easing  
* Preview individual animations  
* Synchronize multiple objects  
* Create animation groups

Default users should **not need to open the timeline** to create simple animations.

---

## **Phase 8 — Templates & Reusable Components**

Create a Frames template system.

Support:

* Presentation templates  
* Slide templates  
* Layout templates  
* Animation presets  
* Transition presets  
* Reusable elements  
* Brand kits  
* Custom component libraries

A user should be able to save an entire visual style and reuse it across presentations.

---

## **Phase 9 — Import / Export**

### **Import**

Prioritize:

* Images  
* SVG  
* PDF  
* Common presentation formats where practical  
* Existing Frames projects

### **Export**

Support:

* PNG  
* JPG  
* PDF  
* Video  
* Animated presentation format  
* Individual slide export  
* Full presentation export

Maintain visual fidelity between editor, presentation mode, and export.

---

## **Phase 10 — Presentation Mode**

Build a dedicated presentation experience.

Include:

* Fullscreen presentation  
* Presenter controls  
* Slide navigation  
* Previous/next  
* Progress  
* Speaker notes  
* Animation playback  
* Remote-friendly controls  
* Keyboard shortcuts  
* Presentation timer  
* Blank screen  
* Jump-to-slide

Transitions must run at presentation-quality frame rates.

---

## **Phase 11 — Performance**

Frames must remain responsive with large presentations.

Prioritize:

* Lazy rendering  
* GPU-accelerated animation where appropriate  
* Efficient image handling  
* Asset caching  
* Virtualized slide thumbnails  
* Efficient undo/redo  
* Lightweight inactive slides  
* Cleanup of unused media/resources

**Bohrified-exclusive requirement:** opening Frames must not unnecessarily load unrelated Bohrified applications into memory.

---

## **Phase 12 — UX Polish**

The final experience should feel:

**Simple by default → Powerful when needed → Professional at all times.**

Focus on:

* Smooth interactions  
* Contextual inspectors  
* Minimal clutter  
* Consistent Bohrified UI  
* High-quality microanimations  
* Fast keyboard workflows  
* Excellent empty states  
* Clear error handling  
* No unnecessary dialogs

Avoid feature bloat in the primary toolbar.

---

## **Phase 13 — Testing & Finalization**

Test:

* Creating presentations  
* Editing slides  
* Rich text  
* Images/media  
* Large presentations  
* Animation playback  
* Complex transitions  
* Export  
* Presentation mode  
* Keyboard shortcuts  
* Undo/redo  
* Preferences synchronization  
* Bohrified launcher integration  
* Theme synchronization  
* Performance/memory usage

### **Definition of Done**

Frames is complete when a user can:

1. Open Frames instantly from Bohrified.  
2. Create a presentation without learning the interface.  
3. Build highly customized slides.  
4. Import and manipulate media.  
5. Create professional animations without touching the advanced timeline.  
6. Build advanced animations through the timeline when desired.  
7. Use cinematic/keynote-style transitions.  
8. Create esports/broadcast-style presentation transitions.  
9. Present fullscreen with smooth playback.  
10. Export the finished presentation.  
11. Change Frames preferences from either **Frames or Bohrified Settings** and have them remain synchronized.

---

# **Core Product Principle**

**Frames should make ordinary presentations effortless and extraordinary presentations possible.**

Do not simply recreate Google Slides, Canva, or Keynote.

Use their strongest interaction patterns as foundations, then build a presentation system where **motion, visual design, and storytelling are first-class features.**


# Flow — Version 1.1

## Overview

Version 1.1 focuses on refining Flow's interaction language, improving Liquid Glass behavior, reorganizing utility tools, and introducing richer text/equation functionality.

---

## 1. Animation & Interaction

### Button Animations

Implement a **moving bubble / Liquid Glass animation** when switching between tools within the same pane.

Example:

* Pen → Eraser
* Select → Highlight
* Other tools within the same tool group

The active Liquid Glass element should **fluidly move** between buttons rather than appearing/disappearing as a static selection state.

### Page & Layout Transitions

Add smooth animations when:

* Changing pages
* Switching line types
* Changing tools
* Changing layout configurations
* Switching between related interaction states

Animations should feel:

* Fluid
* Responsive
* Lightweight
* Native to the Liquid Glass design language

Avoid excessive or distracting motion.

---

## 2. Liquid Glass Refinement

### Remove White Shadow

Remove the white/bright shadow currently appearing behind the interaction menus.

> **Important:** This applies specifically to the **Canvas** interface.

The current shadow makes the interaction menu/pill appear less like Liquid Glass and more like a traditional floating UI element.

### Desired Result

The interaction pill should have:

* True translucent depth
* Subtle background material
* Natural blur
* Soft edge definition
* Minimal/no artificial white drop shadow
* Better integration with the canvas underneath

The material should feel like it is **part of the interface**, rather than sitting above it.

---

# 3. Apps Menu

Introduce an **Apps** icon in the top-right pane.

The Apps menu should become the centralized location for secondary utilities.

### Move Existing Tools

Move the following tools into **Apps**:

* TIMER
* Screen Hider

### Add New Tools

Add:

* LaTeX Equation
* Text

The Apps menu should be expandable/collapsible while maintaining the same Liquid Glass interaction language as the rest of Flow.

---

# 4. LaTeX Equation Tool

Add a dedicated **LaTeX Equation** tool under Apps.

### Flow

```text
Apps
 └── LaTeX Equation
       ├── Equation Input
       ├── Rendered Equation
       └── Insert into Canvas
```

### Behavior

Users should be able to:

1. Open Apps.
2. Select **LaTeX Equation**.
3. Enter a LaTeX expression.
4. Preview the rendered equation.
5. Insert the equation onto the canvas.
6. Move, resize, and interact with the resulting equation as a canvas object.

### Example

Input:

```latex
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
```

Output:

A properly rendered mathematical equation that can be placed directly onto the canvas.

---

# 5. Text / Sticky Tool

Replace the existing basic **Text/Sticky** functionality with a richer **Rich Text** system.

## Rich Text Formatting

Support:

* **Bold**
* *Italic*
* <u>Underline</u>

The text editor should allow formatting without requiring users to leave the canvas.

### Future-Compatible Architecture

The text system should be structured so additional formatting can be added later, including:

* Font size
* Font family
* Text color
* Alignment
* Bulleted lists
* Numbered lists
* Links
* Code formatting
* Strikethrough

These do not necessarily need to ship in Version 1.1, but the implementation should not prevent them from being added later.

---

# 6. Home Screen Logo

Replace the current home-screen logo with the **new logo provided as a PNG in the project root**.

### Color Direction

Update the logo/brand treatment using:

**Primary Accent**

```text
#FF6083
```

**Secondary Accent**

```text
#FFD3D6
```

### Usage

Use the new logo consistently across:

* Home screen
* Relevant branding surfaces
* Loading/launch states where applicable
* Any Flow-specific empty states where the logo is displayed

Do not alter the supplied logo's proportions or distort it.

---

# 7. Layout Improvements

Introduce more varied and intentional layouts for interface items.

Layouts should adapt depending on:

* Tool category
* Number of available actions
* Available screen space
* Canvas state
* Pane size
* Interaction context

Avoid forcing every tool/action into an identical layout.

### Principles

**Contextual**

Controls should appear where they make the most sense for the current task.

**Compact**

Secondary controls should remain unobtrusive.

**Spatial**

Use grouping, spacing, and positioning to communicate relationships between controls.

**Consistent**

Even when layouts differ, they should share the same Flow visual language.

---

# 8. Design Language

Version 1.1 should reinforce the following visual principles:

### Liquid

Transitions should feel continuous rather than discrete.

### Material

Glass elements should feel like translucent materials with depth, not flat white cards.

### Deference

Controls should stay visually secondary to the canvas.

### Motion

Animation should communicate state changes and spatial relationships.

### Clarity

Every animation and layout change should have a functional purpose.

---

# 9. Implementation Checklist

## Animation

* [ ] Implement moving Liquid Glass bubble between tools
* [ ] Animate Pen → Eraser transitions
* [ ] Animate other same-pane tool changes
* [ ] Add page transition animations
* [ ] Add line-type transition animations
* [ ] Add layout transition animations
* [ ] Ensure animations remain performant

## Liquid Glass

* [ ] Remove white shadow behind Canvas interaction menus
* [ ] Refine translucency
* [ ] Refine blur/material effect
* [ ] Preserve depth without traditional drop shadows
* [ ] Ensure pills visually integrate with the canvas

## Apps

* [ ] Create Apps icon in top-right pane
* [ ] Move TIMER into Apps
* [ ] Move Screen Hider into Apps
* [ ] Add LaTeX Equation
* [ ] Add Text/Rich Text
* [ ] Implement Apps open/close animation

## LaTeX

* [ ] Add LaTeX input
* [ ] Add equation preview
* [ ] Render equations correctly
* [ ] Insert equations onto canvas
* [ ] Make equations movable
* [ ] Make equations resizable
* [ ] Preserve equation quality when scaled

## Rich Text

* [ ] Replace basic Text/Sticky functionality
* [ ] Add Bold
* [ ] Add Italic
* [ ] Add Underline
* [ ] Ensure formatting works directly on canvas
* [ ] Architect for future formatting options

## Branding

* [ ] Replace home-screen logo with root PNG
* [ ] Apply `#FF6083`
* [ ] Apply `#FFD3D6` accents
* [ ] Preserve logo proportions
* [ ] Verify branding across relevant surfaces

## Layout

* [ ] Introduce contextual layouts
* [ ] Improve grouping of related controls
* [ ] Support different item arrangements
* [ ] Ensure responsive behavior
* [ ] Maintain consistent Flow design language

---

# 10. Version 1.1 Success Criteria

Flow 1.1 should feel like a **natural evolution of the existing interface**, rather than a collection of new features.

The primary goals are:

1. **More fluid interaction**
2. **More convincing Liquid Glass**
3. **Cleaner Canvas UI**
4. **Better organization through Apps**
5. **More capable text editing**
6. **Native LaTeX support**
7. **More flexible layouts**
8. **Updated Flow branding**

The final result should feel cohesive: interactions, animations, layouts, and materials should all communicate the same underlying design system.

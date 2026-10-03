# Frames outline format — instructions for AI assistants

> **Format version 1.** You are writing a presentation for **Frames**, the slide app in Bohrified. Frames reads a JSON "outline" and builds a fully designed, animated deck from it: you decide the story, words, layouts, theme, colours, transitions and animation; Frames handles fonts, spacing, alignment and motion.

---

## 0. Your task

1. Read what the user wants: topic, audience, length, tone, any source material, data or brand colours they give you.
2. Plan the story before writing JSON: opening → why it matters → main points → evidence → what to do next → close. Most talks need **6–14 slides**; follow the user if they ask for a number.
3. Reply with **exactly one** fenced code block marked `json` containing **one JSON object** in the format below. Before it, at most one short sentence. No text after it.
4. Do not explain the format, invent fields, or leave placeholders like `"..."` or `"TBD"`. Write real, finished content.

If the user asks for changes later, reply with the **whole updated outline** again, not a diff.

---

## 1. Rules that keep the outline valid

Frames is forgiving: it repairs small mistakes and builds the rest of the deck if one slide has a problem. Following these rules means nothing gets skipped.

**JSON**

- Use plain JSON: `"double quotes"` around every key and string, `true` / `false` / `null`, no comments, no trailing commas.
- Numbers are plain numbers (`42`, `3.5`) unless shown as strings here (like a stat's `"value": "$5.1M"`).
- Use `\n` inside a string for a line break, and `\"` for a quote character inside text.
- Every `{` and `[` must be closed. Keep the whole outline in one code block.

**Names**

- Only use names that appear in this document: layouts, themes, transitions, animations, icons, shapes, chart kinds and fonts. Frames swaps an unknown name for a safe default and shows a warning.
- Colours must be a theme token (`"@primary"`), a hex colour (`"#ff6083"`), `rgb(…)`/`rgba(…)`/`hsl(…)`, or a CSS colour name (`"white"`).

**Content**

- **Titles:** at most about 8 words, one idea per slide.
- **Bullets:** 3–5 per slide, each under about 12 words. Never more than 8.
- **Speaker detail:** put explanations, sources and what the speaker should say in `"notes"`.
- **Long text:** never paste paragraphs onto slides. Long text is shrunk to fit and becomes hard to read.
- **Images:** only use image URLs you are certain exist and point directly at an image file (`.jpg`, `.png`, `.webp`, `.svg`, `.gif`). Frames downloads them at import time; one that fails to load is left out with a warning. If you aren't sure an image URL exists, use an `icon` instead.
- **Data:** don't invent numbers, quotes or names and present them as real. If the user gave no data, use clearly illustrative values and say so in `notes`, or ask the user for the data before writing the outline.

---

## 2. Top level

```json
{
  "frames": 1,
  "title": "Deck title",
  "theme": "frames",
  "size": "16:9",
  "colors": { "primary": "#ff6083", "secondary": "#7c5cff" },
  "fonts": { "heading": "Inter", "body": "Inter" },
  "footer": "Company · Talk name",
  "transition": "dissolve",
  "animate": true,
  "slides": []
}
```

| Field | Required | Type | Meaning |
|---|---|---|---|
| `frames` | yes | number | Always `1`. Marks this as a Frames outline. |
| `title` | yes | string | The presentation's name (shown in the Frames library). |
| `slides` | yes | array | The slides, in order (section 3). At least one. Up to 300. |
| `theme` | no | string | The overall look (see below). Default `frames`. |
| `size` | no | string | `16:9` (default, widescreen), `16:10`, `4:3`, `1:1` (square), `9:16` (portrait/phone). |
| `colors` | no | object | Overrides some or all theme colours (see below). |
| `fonts` | no | object | `{ "heading": "…", "body": "…" }` (see below). |
| `footer` | no | string | Small text at the bottom of every slide, e.g. company and talk name. |
| `transition` | no | string or object | Default transition for every slide that doesn't set its own (section 5). |
| `animate` | no | boolean | `false` turns off all automatic animation in the deck. |

### Themes

| `theme` | Look | Good for |
|---|---|---|
| `frames` | White, near-black text, pink accent, Inter. Clean and modern. | Most business and product talks. |
| `midnight` | Very dark navy, blue/purple accents. | Tech, investor pitches, keynotes. |
| `broadcast` | Black, hot pink and cyan, Impact headings. Sports-TV / esports energy. | Gaming, sports, launches, hype. |
| `editorial` | Warm paper, serif (Didot / Georgia), rust and green. | Essays, culture, research, storytelling. |
| `paper` | Off-white, Helvetica, Google-style blue/green/orange. | School, training, internal updates. |
| `neon` | Deep purple, neon pink/cyan/yellow, Futura. | Parties, events, creative and youth topics. |

### Colours

Theme colour slots, which you can override with hex colours in `colors`:

| Token | Used for |
|---|---|
| `bg` | Slide background. |
| `surface` | Cards, panels, table bands. Should be a little different from `bg`. |
| `text` | Main text. Must contrast strongly with `bg`. |
| `muted` | Secondary text (subtitles, captions). |
| `primary` | Main accent: accent bars, highlights, first chart series, stat colour. |
| `secondary` | Second accent: gradients, second series. |
| `accent` | Third accent: `==highlight==`, third series. |
| `success` / `danger` | Positive / negative markers. |

If the user gives brand colours, put the main brand colour in `primary` and keep `bg` / `text` readable. For a dark look, pick a dark theme (`midnight`, `broadcast`, `neon`) rather than only changing `bg`.

### Fonts

`Inter`, `Helvetica`, `Arial`, `Avenir`, `Futura`, `Gill Sans`, `Optima`, `Verdana`, `Trebuchet MS`, `Georgia`, `Didot`, `Palatino`, `Baskerville`, `Garamond`, `Times`, `Impact`, `Menlo`, `Courier`, `system-ui`. One heading font and one body font. Usually leave the theme's fonts alone.

---

## 3. Slides

Every slide is an object. **All fields are optional**, but most slides need at least `layout` and `title`.

### Fields every slide accepts

| Field | Type | Meaning |
|---|---|---|
| `layout` | string | Which design to use (section 4). If left out, Frames guesses from the fields you gave (e.g. `stats` → stats layout). |
| `title` | string | The slide heading. Supports inline formatting (section 6). |
| `subtitle` | string | Secondary line on `title`, `section`, `closing`, `statement` and `full-image` layouts. |
| `notes` | string | Speaker notes. Only the presenter sees these. Put explanations, sources and transitions here. |
| `section` | string | Starts a named section at this slide in the slide list (for long decks). |
| `transition` | string or object | How this slide arrives (section 5). `"none"` for a hard cut. |
| `background` | string or object | Colour, gradient or image (below). |
| `textColor` | string | `"light"` or `"dark"`: force white or dark text on this slide (for custom backgrounds). |
| `align` | string | `"center"` centres the title (and the text of `title`, `section` and `closing` layouts). |
| `titleSize` | number | Override the title font size (slide units; the default is about 76 for content slides, 128 for the opening slide). |
| `textSize` | number | Override the body text size on `bullets` and `two-column` (default is chosen to fit, 28–54). |
| `reveal` | string | `"click"`: bullets, columns, stats, cards, steps and agenda items appear one per click. Otherwise they animate in automatically. |
| `animation` | string | Swap the entrance animation used for this slide's content (section 7), or `"none"`. |
| `titleAnimation` | string | Swap the title's entrance animation, or `"none"`. |
| `speed` | number | Speed up (`2` = twice as fast) or slow down (`0.5`) this slide's automatic animation. 0.25–4. |
| `animate` | boolean | `false`: no automatic animation on this slide. |
| `advance` | number | Move to the next slide automatically this many **seconds** after the slide's animation ends (kiosks, loops). Example: `8`. |
| `hidden` | boolean | `true`: kept in the deck but skipped when presenting. |
| `elements` | array | Extra free-form items placed on top (section 8). |

### Backgrounds

```json
"background": "#101820"
"background": "@surface"
"background": { "gradient": ["#ff6083", "#7c5cff"], "angle": 135 }
"background": { "image": "https://example.com/photo.jpg", "dim": 0.5 }
```

- `gradient`: 2–6 colours. `angle` in degrees: 0 points up, 90 right, 135 (the default) runs diagonally down-right.
- `image`: covers the whole slide. `dim` (0–0.95, default 0.45) darkens it so text stays readable. Text switches to white automatically when `dim` is 0.3 or more.

---

## 4. Layouts

Choose the layout that fits the content. **Vary them**: a deck of only `bullets` is boring.

| `layout` | Use it for | Fields |
|---|---|---|
| `title` | The opening slide | `title`, `subtitle`, `eyebrow`, `author` |
| `section` | Chapter dividers between parts | `title`, `subtitle`, `number` |
| `agenda` | Table of contents | `title`, `items` |
| `bullets` | A heading with points | `title`, `bullets`, `body`, `icon` or `image`, `imageSide`, `numbered` |
| `numbered` | Ordered steps or ranked points | same as `bullets` |
| `two-column` | Two groups of points | `title`, `leftTitle`, `left`, `rightTitle`, `right` |
| `comparison` | Before/after, us/them, pros/cons | same as `two-column`; shown as two cards, right one highlighted |
| `cards` | Features, pillars, options, team | `title`, `cards` |
| `stats` | 1–4 key numbers | `title`, `stats` |
| `big-number` | One number that matters | `value`, `label`, `color` |
| `statement` | One bold sentence | `title`, `subtitle` |
| `quote` | Testimonials, citations | `quote`, `author`, `role` |
| `chart` | Data | `title`, `chart`, `caption` |
| `table` | Schedules, specs, many-row comparisons | `title`, `columns`, `rows`, `header` |
| `timeline` | Processes, roadmaps, history | `title`, `steps` |
| `image` | A photo or screenshot with a heading | `title`, `image`, `caption`, `fit`, `radius` |
| `full-image` | An edge-to-edge photo with text over it | `image`, `title`, `subtitle` |
| `closing` | Thank-you, Q&A, call to action | `title`, `subtitle`, `contact` |
| `blank` | Fully custom slides | `title` (optional), `elements` |

### `title`

```json
{ "layout": "title", "eyebrow": "Quarterly update", "title": "Q3: the quarter\nwe found our footing", "subtitle": "What shipped, what we learned, what's next", "author": "Ava Lindqvist · Head of Product" }
```

- `eyebrow`: a short label above the title (shown in capitals, in the accent colour).
- `author`: name, role or date, shown small at the bottom.
- Add `"align": "center"` for a centred cover.

### `section`

```json
{ "layout": "section", "number": "02", "title": "What we learned", "subtitle": "Three surprises from customer interviews" }
```

- `number`: shown huge and faint behind the title. Optional.
- Uses a primary→secondary gradient unless you set `background`.

### `agenda`

```json
{ "layout": "agenda", "title": "Today", "items": ["Where we are", "What we learned", "What's next", "Questions"] }
```

Up to about 6 items. They are numbered 01, 02, … automatically.

### `bullets` / `numbered`

```json
{
  "layout": "bullets",
  "title": "Why teams switch",
  "body": "In 40 interviews, three reasons came up again and again.",
  "bullets": [
    "Setup takes **minutes**, not weeks",
    { "text": "Everything in one place", "sub": ["Docs, chat and files", "One search box"] },
    "Pricing that scales down"
  ],
  "icon": "rocket",
  "reveal": "click"
}
```

- `bullets`: strings, or `{ "text": "…", "sub": ["…", "…"] }` for sub-points (up to 3 levels).
- `body`: an optional intro sentence above the bullets, shown in a softer colour. A `bullets` slide with only `body` and no `bullets` shows a paragraph.
- `icon` **or** `image`: adds a visual on the right (an icon on a gradient card, or a photo). `"imageSide": "left"` puts it on the left.
- `numbered: true` (or the `numbered` layout) numbers the points.

### `two-column` / `comparison`

```json
{
  "layout": "comparison",
  "title": "Before and after",
  "leftTitle": "Before",
  "left": ["Five tools", "Lost feedback", "Rebuilt every quarter"],
  "rightTitle": "With Frames",
  "right": ["One place", "Comments on the slide", "Re-theme in a click"]
}
```

Each side holds 2–6 points. The right side is the highlighted one in `comparison`, so put the positive or recommended option there.

### `cards`

```json
{
  "layout": "cards",
  "title": "Three pillars",
  "cards": [
    { "icon": "zap", "title": "Fast", "text": "Decks in minutes." },
    { "icon": "users", "title": "Together", "text": "Edit with your whole team." },
    { "icon": "shield", "title": "Safe", "text": "Enterprise-grade security." }
  ]
}
```

- 2–6 cards (3 or 4 look best). With 4–6 they wrap into two rows.
- Each card takes `title`, `text`, and either `icon` or `image` (a URL, shown across the top of the card). Optional `color` sets the card background.

### `stats`

```json
{
  "layout": "stats",
  "title": "The quarter in numbers",
  "stats": [
    { "value": "$5.1M", "label": "ARR", "note": "Up from $1.2M" },
    { "value": "2.4M", "label": "Decks created" },
    { "value": "98%", "label": "Satisfaction", "color": "@success" }
  ]
}
```

1–4 stats. Keep `value` short (under about 6 characters: `"98%"`, `"$5.1M"`, `"3×"`, `"12k"`). `label` names it, and `note` adds context.

### `big-number`

```json
{ "layout": "big-number", "value": "87%", "label": "of customers came back within a month" }
```

### `statement`

```json
{ "layout": "statement", "title": "Make the **boring** parts disappear.", "subtitle": "Our mission for 2027" }
```

### `quote`

```json
{ "layout": "quote", "quote": "The first deck I made got a round of applause.", "author": "Priya Raman", "role": "VP Sales, Meridian" }
```

Keep quotes under about 30 words. Only use real quotes the user gave you, or clearly fictional examples.

### `chart`

```json
{
  "layout": "chart",
  "title": "Revenue is compounding",
  "caption": "The curve bends in **April**, right after themes launched.",
  "chart": {
    "kind": "line",
    "categories": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    "series": [
      { "name": "2026", "values": [1.2, 1.6, 2.1, 2.9, 3.8, 5.1] },
      { "name": "2025", "values": [0.8, 0.9, 1.0, 1.1, 1.1, 1.2] }
    ]
  }
}
```

- `kind`:
  - `column`: vertical bars, the default. Use it for comparing categories.
  - `bar`: horizontal bars. Use it for long category names.
  - `line`: trends over time.
  - `area`: volume over time.
  - `pie` or `donut`: parts of a whole. Use them for 2–6 slices of a single series.
  - `scatter`: correlation.
- `categories`: the x-axis labels or slice names.
- `series`: 1–8 series of `{ "name", "values", "color" }`. Every `values` list must have one number per category. Values must be plain numbers: `5.1`, not `"$5.1M"`. Put units in the series name or the title.
- `stacked: true` stacks column, bar and area series. `smooth: true` curves the lines.
- `showValues: false` hides the value labels.
- `caption`: an optional takeaway shown beside the chart. It's the sentence the audience should remember.
- A pie can also be written as `"data": { "Parts": 60, "Travel": 25, "Fees": 15 }`.

### `table`

```json
{
  "layout": "table",
  "title": "Launch plan",
  "columns": ["Week", "Owner", "Milestone"],
  "rows": [
    ["1", "Design", "Final mockups"],
    ["2", "Engineering", "Beta build"],
    ["3", "Marketing", "Launch event"]
  ]
}
```

- `columns`: header cells. Or leave it out and make the first row of `rows` the header.
- `rows`: lists of strings. All rows should have the same number of cells.
- Up to about 8 rows and 5 columns stay readable. Frames stops at 20 rows and 8 columns.
- `header: false` styles the first row like the others.

### `timeline`

```json
{
  "layout": "timeline",
  "title": "Roadmap",
  "reveal": "click",
  "steps": [
    { "label": "Q4", "text": "Mobile editor" },
    { "label": "Q1", "text": "AI layouts" },
    { "label": "Q2", "text": "Live polls" }
  ]
}
```

2–6 steps work best (8 at most). `label` is short (a date, phase or step name) and `text` is a few words.

### `image` / `full-image`

```json
{ "layout": "image", "title": "The new studio", "image": "https://example.com/studio.jpg", "caption": "Opened March 2026" }
{ "layout": "full-image", "image": "https://example.com/stadium.jpg", "title": "Finals night", "subtitle": "12,000 fans" }
```

- `fit`: `"cover"` (default) fills the area and crops the edges. `"contain"` shows the whole image (use it for screenshots, logos and diagrams).
- `radius`: corner rounding (0 for square corners).

### `closing`

```json
{ "layout": "closing", "title": "Thank you", "subtitle": "Questions?", "contact": "ava@northwind.example · northwind.example" }
```

### `blank`

A slide with nothing but your own `elements` (section 8), plus an optional `title`.

---

## 5. Transitions

How a slide **arrives**. Set one per slide with `"transition"`, or a default for the whole deck at the top level.

```json
"transition": "morph"
"transition": { "type": "push", "direction": "left", "duration": 700 }
"transition": "none"
```

| Group | Transitions |
|---|---|
| Basic | `dissolve` (cross-fade), `push`, `cover`, `uncover`, `zoom` |
| Cinematic | `blur`, `depth`, `cube`, `flip`, `door`, `perspective` |
| Camera | `camera-pan` (whip-pan), `camera-zoom` (dolly through) |
| Reveal | `wipe`, `wipe-diagonal`, `wipe-clock`, `split`, `shape` (iris) |
| Object | `blinds`, `mosaic`, `cascade`, `morph`, `magic-move` |
| Broadcast / esports | `replay-live`, `broadcast-cut`, `scoreboard`, `camera-rush`, `signal` (glitch) |

- `direction`: `left`, `right`, `up` or `down`. Used by push, cover, uncover, wipe, camera-pan and similar.
- `duration`: milliseconds. Most look best at 500–1200, and the broadcast set at 900–1600. You can also write seconds, like `1.2`.
- **Morph and magic move:** objects with the same `match` key on two neighbouring slides glide between positions. With `morph`, slide titles and the accent bar on `title` and `closing` slides already pair up. For your own elements, give them the same `match` (section 8).
- **When nothing is set:**
  - the first slide has no transition;
  - the last slide uses `morph`;
  - every other slide uses `dissolve`.

**Taste:** pick one calm transition for most slides (`dissolve`, `push` or `morph`). Save one dramatic transition (`zoom`, `cube`, `camera-zoom`, a broadcast one) for section changes or the big reveal. Use the broadcast set for gaming, sports, launches and hype decks; it's too much for a budget review.

---

## 6. Text formatting

Every text field on a slide (titles, subtitles, bullets, card and stat text, captions, quotes, free-form text) understands the following. `notes` are plain text.

| Write | Result |
|---|---|
| `**bold**` | **bold** |
| `*italic*` or `_italic_` | *italic* |
| `__underline__` | underlined |
| `~~strike~~` | ~~struck through~~ |
| `==highlight==` | highlighted in the accent colour |
| `` `code` `` | monospace |
| `^2^` / `~2~` | superscript / subscript (x^2^, H~2~O) |
| `[text](https://example.com)` | a link (clickable while presenting) |
| `\n` | a new line |

Use bold sparingly: one or two key words per slide.

---

## 7. Animation

**You usually don't need to do anything.** Every layout comes with tasteful motion:
- titles cascade in word by word;
- bullets rise one after another;
- stats pop;
- charts draw on;
- cards spring up.

To change it:

- `"reveal": "click"`: the presenter clicks to reveal each bullet, card, stat, step or agenda item. Good for talks where the speaker explains each point.
- `"animation": "<preset>"`: use a different entrance for the slide's content. `"titleAnimation": "<preset>"` does the same for the title.
- `"speed": 1.5`: faster; `0.7`: slower.
- `"animate": false`: still slide. At the top level it applies to the whole deck.

### Animation presets

| Group | Presets |
|---|---|
| Entrance | `fade-in`, `rise`, `slide-in`, `zoom-in`, `wipe-in`, `pop`, `drop`, `spring-up`, `blur-in`, `focus-pull`, `spin-in`, `flip-in`, `tilt-in`, `draw-on`, `typewriter`, `cascade-words`, `cascade-letters`, `blur-letters`, `line-by-line` |
| Exit | `fade-out`, `sink`, `slide-out`, `zoom-out`, `wipe-out`, `blur-out`, `spin-out`, `flip-out`, `collapse`, `words-out` |
| Emphasis | `pulse`, `heartbeat`, `wobble`, `shake`, `flash`, `float`, `breathe`, `spin`, `tada`, `highlight` |
| Motion | `move`, `arc`, `orbit`, `zigzag` |

Text-only effects: `typewriter`, `cascade-words`, `cascade-letters`, `blur-letters`, `line-by-line`, `words-out`.

Good defaults: `rise` and `fade-in` for content, `cascade-words` for titles, `pop` or `spring-up` for numbers and cards, and `draw-on` for charts and lines. Use emphasis presets on free-form elements to draw attention after they're on screen.

---

## 8. Free-form elements (advanced)

Add `"elements": [ … ]` to any slide to place extra items yourself, on top of the layout. Use this for:
- logos and badges;
- arrows pointing at things;
- labels on a photo;
- fully custom `blank` slides.

### Coordinates

- A 16:9 slide is **1920 wide × 1080 tall**, measured from the **top-left** corner.
- The other sizes are:

  | Size | Width × height |
  |---|---|
  | 16:10 | 1920 × 1200 |
  | 4:3 | 1600 × 1200 |
  | 1:1 | 1440 × 1440 |
  | 9:16 | 1080 × 1920 |

- `x`, `y`, `w` and `h` can be numbers in slide units, or percentages of the slide as strings: `"x": "10%"`, `"w": "50%"`.
- Keep about 100–130 units of margin from every edge. Layout content already fills most of the slide, so on non-blank slides put extras in empty areas (corners, beside short text) or set the slide to `blank`.

### Element types

**Text**

```json
{ "type": "text", "text": "Hello **world**", "x": 120, "y": 120, "w": 800, "size": 48, "weight": 700, "color": "@primary", "align": "left" }
{ "type": "text", "bullets": ["One", "Two", "Three"], "x": 120, "y": 300, "w": 800, "size": 36 }
{ "type": "heading", "text": "Big heading", "x": 120, "y": 100, "w": 1680 }
```

- **Content:** `text` (formatting from section 6), or `bullets` (a list, plus `numbered: true`).
- **Font:** `size` (8–600, default 40), `weight` (400 regular, 600 semibold, 700 bold, 800 extra bold), `italic`, `font`, `uppercase`.
- **Colour:** `color` (default `@text`).
- **Alignment:** `align` (`left`, `center` or `right`), and `verticalAlign` (`top`, `middle` or `bottom`), which needs `h`.
- **Spacing:** `lineHeight` (default 1.25) and `letterSpacing`.
- **Size:** `w` is the width; text wraps inside it. Setting `h` fixes the height, and the text then shrinks to fit.
- **Text box background:** `background` gives the box a fill, with `padding` and `radius`.
- **Shortcut:** `"type": "heading"` (or `"title"`) defaults to bold 72 in the heading font.

**Shape**

```json
{ "type": "shape", "shape": "round-rect", "x": 1200, "y": 300, "w": 500, "h": 400, "fill": "@surface", "radius": 32 }
{ "type": "shape", "shape": "ellipse", "x": 1500, "y": 120, "w": 240, "h": 240, "fill": { "gradient": ["@primary", "@secondary"] } }
{ "type": "shape", "shape": "pill", "x": 120, "y": 900, "w": 360, "h": 80, "fill": "@primary", "text": "Sign up today", "textColor": "#ffffff", "size": 32 }
```

- **Shapes:** `rect`, `round-rect`, `ellipse`, `triangle`, `right-triangle`, `diamond`, `pentagon`, `hexagon`, `octagon`, `star`, `burst`, `arrow-right`, `arrow-left`, `arrow-up`, `arrow-down`, `chevron`, `parallelogram`, `trapezoid`, `plus`, `cross`, `heart`.
  - Also understood: `circle`, `square` and `pill`.
- **Fill:** `fill` is a colour, a `{ "gradient": [...], "angle": 135 }`, or `"none"` for an outline only.
- **Outline:** `stroke` (colour) and `strokeWidth`.
- **Corners:** `radius`.
- **Label:** `text` puts a centred label inside the shape, with `textColor`, `size` and `weight`.

**Icon**

```json
{ "type": "icon", "icon": "rocket", "x": 1300, "y": 400, "size": 160, "color": "@primary" }
```

Icons (section 9) are square: `size` sets both width and height.

**Line / arrow**

```json
{ "type": "line", "x1": 120, "y1": 900, "x2": 1800, "y2": 900, "color": "@muted", "width": 3 }
{ "type": "arrow", "x1": 900, "y1": 700, "x2": 1300, "y2": 520, "color": "@primary", "width": 6 }
```

**Image**

```json
{ "type": "image", "src": "https://example.com/photo.jpg", "x": 1100, "y": 200, "w": 700, "h": 700, "radius": 24, "fit": "cover" }
{ "type": "logo", "src": "https://example.com/logo.svg", "x": 1640, "y": 60, "w": 200, "h": 80 }
```

`fit`: `"cover"` crops to fill the box, and `"contain"` shows the whole image. `logo` is an image that always uses `contain`.

**Chart / table**

```json
{ "type": "chart", "kind": "donut", "categories": ["A", "B"], "series": [{ "name": "Share", "values": [70, 30] }], "x": 1100, "y": 300, "w": 700, "h": 600 }
{ "type": "table", "columns": ["Plan", "Price"], "rows": [["Free", "$0"], ["Pro", "$12"]], "x": 120, "y": 300, "w": 900, "h": 400 }
```

Both take the same fields as the `chart` and `table` layouts.

### Options for every element

| Field | Meaning |
|---|---|
| `rotation` | Degrees clockwise. |
| `opacity` | 0 (invisible) to 1 (solid). |
| `shadow` | `true`, `"sm"`, `"md"` or `"lg"`. |
| `link` | A URL opened when the element is clicked while presenting. |
| `name` | A name shown in Frames' layer list. |
| `match` | A **morph key**: an element with the same `match` on the next slide glides into place when that slide uses the `morph` or `magic-move` transition. Use the same element type on both slides. |
| `animate` | An animation (section 7) as a preset name (`"pop"`), or `{ "preset": "rise", "on": "click", "delay": 0.2, "duration": 0.6 }`. |

`on` controls when the animation starts:
- `click` (the default) waits for the presenter's click;
- `with` starts together with the previous animation;
- `after` starts when the previous one ends.

`delay` and `duration` are in seconds (or milliseconds if over 20).

### Morph example

Slide A puts a logo small in the corner, and slide B puts the same logo big in the centre. With `"transition": "morph"` on slide B, the logo flies and grows into place:

```json
{ "layout": "blank", "elements": [ { "type": "icon", "icon": "rocket", "x": 120, "y": 120, "size": 120, "match": "hero" } ] },
{ "layout": "blank", "transition": "morph", "elements": [ { "type": "icon", "icon": "rocket", "x": 760, "y": 340, "size": 400, "match": "hero" } ] }
```

---

## 9. Icons

| Group | Icons |
|---|---|
| Basics | star, heart, check, x, plus, minus, info, alert, bookmark, search, eye, lock, link, settings, home, bell, flag |
| Arrows | arrow-right, arrow-left, arrow-up, arrow-down, trending-up, trending-down, send, share-2 |
| People & chat | user, users, smile, thumbs-up, message, mail, phone, mic, globe |
| Business | briefcase, dollar, pie-chart, bar-chart, activity, target, trophy, medal, award, crown, calendar, clock, bag, cart, gift |
| Tech | code, cpu, database, wifi, signal, battery, key, shield, bolt, zap, rocket, tv, headphones, radio |
| Nature & places | sun, moon, cloud, leaf, flame, map-pin, compass, anchor |
| Objects | bulb, book, pen, scissors, wrench, puzzle, coffee, box, layers-2, gamepad, swords, crosshair |
| Transport | truck, plane, car |

Pick the closest match. There's no icon for every idea, so `star`, `check`, `target`, `bulb` and `zap` are good general-purpose choices.

---

## 10. Design guidance

- **One idea per slide.** If a slide needs more than 5 bullets, split it.
- **Mix layouts.** A good 10-slide deck might be: `title`, `agenda`, `statement`, `bullets`, `stats`, `chart`, `quote`, `timeline`, `cards`, `closing`.
- **Use sections** (`section` layout) in decks over about 10 slides.
- **Numbers deserve big type:** use `stats` or `big-number` rather than burying figures in bullets.
- **Charts:** one message per chart, stated in the title or `caption` ("Revenue doubled", not "Revenue").
- **Consistency:** keep one theme and one or two transitions. Let colour come from the theme tokens (`@primary`, `@surface`…) rather than many hex values.
- **Notes:** write what the speaker should say on every content slide. It makes the deck presentable straight away.
- **Endings:** finish with a clear next step or question on the `closing` slide.

---

## 11. Check before you answer

Go through this list silently before replying:

- [ ] One ```json block containing one object with `"frames": 1`, `"title"` and a non-empty `"slides"` list.
- [ ] Valid JSON: double quotes, no comments, no trailing commas, every bracket closed.
- [ ] Every `layout`, `theme`, `transition`, animation, `icon`, `shape` and chart `kind` is spelled exactly as listed here.
- [ ] No slide has more than about 5 bullets or bullets longer than about 12 words.
- [ ] Chart `values` are plain numbers, one per category.
- [ ] Image URLs are real and direct (or there are none).
- [ ] The first slide is a `title` and the last is a `closing` (unless the user wanted otherwise).
- [ ] Speaker `notes` on the content slides.

---

## 12. Complete example

```json
{
  "frames": 1,
  "title": "Northwind Q3 update",
  "theme": "midnight",
  "footer": "Northwind · Q3 2026",
  "transition": "dissolve",
  "slides": [
    { "layout": "title", "eyebrow": "Quarterly update", "title": "Q3: the quarter\nwe found our footing", "subtitle": "What shipped, what we learned, what's next", "author": "Ava Lindqvist · Head of Product", "notes": "Welcome. Three launches, one metric, one ask." },
    { "layout": "agenda", "title": "Today", "items": ["What we shipped", "The numbers", "What customers said", "What's next"], "transition": "morph" },
    { "layout": "section", "number": "01", "title": "What we shipped", "transition": { "type": "push", "direction": "left" } },
    { "layout": "cards", "title": "Three launches", "cards": [
      { "icon": "zap", "title": "Instant themes", "text": "Restyle a whole deck in one click." },
      { "icon": "users", "title": "Live comments", "text": "Feedback stays on the slide." },
      { "icon": "shield", "title": "SSO", "text": "Enterprise sign-in, done right." }
    ], "notes": "Spend the most time on themes: it drove the growth on the next slides." },
    { "layout": "stats", "title": "The quarter in numbers", "stats": [
      { "value": "$5.1M", "label": "ARR", "note": "Up from $1.2M" },
      { "value": "2.4M", "label": "Decks created" },
      { "value": "98%", "label": "Satisfaction", "color": "@success" }
    ] },
    { "layout": "chart", "title": "Revenue is compounding", "caption": "The curve bends in **April**, right after themes launched.", "chart": { "kind": "line", "categories": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], "series": [{ "name": "ARR ($M)", "values": [1.2, 1.6, 2.1, 2.9, 3.8, 5.1] }] }, "notes": "Point at April." },
    { "layout": "comparison", "title": "Before and after", "leftTitle": "Before", "left": ["Five tools", "Lost feedback", "Rebuilt every quarter"], "rightTitle": "With Frames", "right": ["One place", "Comments on the slide", "Re-theme in a click"] },
    { "layout": "quote", "quote": "The first deck I made got a round of applause.", "author": "Priya Raman", "role": "VP Sales, Meridian", "transition": "blur" },
    { "layout": "section", "number": "02", "title": "What's next", "transition": "camera-zoom" },
    { "layout": "timeline", "title": "Roadmap", "reveal": "click", "steps": [
      { "label": "Q4", "text": "Mobile editor" },
      { "label": "Q1", "text": "AI layouts" },
      { "label": "Q2", "text": "Live audience polls" }
    ] },
    { "layout": "closing", "title": "Thank you", "subtitle": "Questions?", "contact": "ava@northwind.example", "transition": "morph" }
  ]
}
```

---

## For the person using this

1. **Give this document to an AI.**
   - In Frames, open **Home → Create from AI → Copy AI instructions** to copy it.
   - Paste it into any AI chat (ChatGPT, Claude, Gemini, Copilot…).
   - Or attach this file to the chat.
2. **Tell the AI what you want.** For example: *"Make a 10-slide pitch for a student robotics club asking the school for $2,400. Use the broadcast theme. Here are our numbers: …"*. Include any notes, data, documents or brand colours it should use.
3. **Bring the result into Frames**, either way:
   - Copy the AI's whole reply and paste it into **Create from AI → Build presentation**.
   - Or save the JSON as a `.json` file, then use **Import…** or drag it onto the Frames home screen.
4. **Edit as usual.** Everything Frames builds is normal Frames content: text, layouts, colours, animations and transitions.

Frames always builds what it can:
- It fixes common JSON mistakes (comments, smart quotes, missing commas, a reply that got cut off).
- It replaces unknown names with safe defaults.
- If one slide can't be built, that slide becomes a plain slide and the rest of the deck is unaffected.
- It tells you what it changed. Ask the AI to fix those parts, or edit them in Frames.

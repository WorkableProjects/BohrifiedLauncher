/**
 * The Frames document model. Everything here is plain JSON (no classes, no
 * functions) so a deck can be stored in IndexedDB, exported, diffed by
 * immer patches for undo/redo, and replayed by the export player.
 *
 * Coordinates are in *slide units*: a 1920×1080 slide is 1920 wide whatever
 * the zoom, the window or the export scale.
 */

export type ID = string;

/** '#rgb' | '#rrggbb' | '#rrggbbaa' | 'rgb()/rgba()' | a design-system token such as '@primary'. */
export type Color = string;

// ── Paint ────────────────────────────────────────────────────────────────────

export interface GradStop {
  /** 0…1 along the gradient. */
  o: number;
  c: Color;
}

export type Fill =
  | { t: 'solid'; c: Color }
  | { t: 'linear'; angle: number; stops: GradStop[] }
  | { t: 'radial'; cx?: number; cy?: number; stops: GradStop[] }
  | { t: 'image'; asset: ID; fit: 'cover' | 'contain' | 'tile' };

export type DashStyle = 'solid' | 'dash' | 'dot';

export interface Stroke {
  c: Color;
  w: number;
  dash?: DashStyle;
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
}

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  c: Color;
}

export interface Effects {
  /** A custom shadow, or a design-system shadow token name ('sm' | 'md' | 'lg'). */
  shadow?: Shadow | string | null;
  /** Soft outer glow. */
  glow?: { c: Color; blur: number } | null;
  /** Gaussian blur in slide units. */
  blur?: number;
  blend?: GlobalCompositeOperation;
}

// ── Rich text ────────────────────────────────────────────────────────────────

export type Align = 'left' | 'center' | 'right' | 'justify';

/** One formatted span. Absent fields inherit from the element's `TextBase`. */
export interface Run {
  t: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  sup?: boolean;
  sub?: boolean;
  /** Text colour. */
  c?: Color;
  /** Highlight (background) colour. */
  hl?: Color;
  size?: number;
  font?: string;
  /** Numeric weight 100…900; overrides `b`. */
  w?: number;
  /** Letter spacing in slide units. */
  ls?: number;
  /** Text opacity 0…1. */
  o?: number;
  link?: string;
}

export interface Para {
  runs: Run[];
  align?: Align;
  list?: 'bullet' | 'number' | null;
  /** List nesting level (0…4). */
  level?: number;
  /** Line height multiplier. */
  lh?: number;
  /** Space before / after the paragraph, in slide units. */
  before?: number;
  after?: number;
}

export type RichDoc = Para[];

/** Defaults a text-bearing element applies where a run/paragraph says nothing. */
export interface TextBase {
  /** Font family, or '@heading' / '@body' / '@mono'. */
  font: string;
  size: number;
  weight: number;
  italic?: boolean;
  color: Color;
  align: Align;
  lh: number;
  ls: number;
}

// ── Elements ─────────────────────────────────────────────────────────────────

export type ShapeKind =
  | 'rect'
  | 'round-rect'
  | 'ellipse'
  | 'triangle'
  | 'right-triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'burst'
  | 'arrow-right'
  | 'arrow-left'
  | 'arrow-up'
  | 'arrow-down'
  | 'chevron'
  | 'parallelogram'
  | 'trapezoid'
  | 'plus'
  | 'cross'
  | 'heart'
  | 'cloud'
  | 'speech'
  | 'ring'
  | 'half-circle'
  | 'pill'
  | 'path';

export type Role = 'title' | 'subtitle' | 'body' | 'footer' | 'number' | 'image' | 'caption';

export interface Base {
  id: ID;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise, about the centre. */
  rot: number;
  opacity: number;
  locked?: boolean;
  hidden?: boolean;
  flipX?: boolean;
  flipY?: boolean;
  fx?: Effects;
  /** Magic Move key: elements sharing a key on adjacent slides morph into each other. */
  morph?: string;
  /** Layout placeholder role. */
  ph?: Role;
  /** Link opened when the element is clicked in a presentation. */
  link?: string;
  alt?: string;
}

export interface TextEl extends Base {
  type: 'text';
  doc: RichDoc;
  base: TextBase;
  pad: number;
  vAlign: 'top' | 'middle' | 'bottom';
  /** 'shrink' scales text down to fit; 'grow' extends the box height. */
  fit: 'none' | 'shrink' | 'grow';
  fill?: Fill | null;
  stroke?: Stroke | null;
  radius?: number;
}

export interface ShapeEl extends Base {
  type: 'shape';
  shape: ShapeKind;
  fill: Fill | null;
  stroke: Stroke | null;
  /** Corner radius for rect-like shapes; point count for stars; etc. (see render/shapes). */
  radius?: number;
  /** For `shape: 'path'`: SVG path data in a `vb` coordinate box. */
  d?: string;
  vb?: [number, number];
  /** Text inside the shape. */
  doc?: RichDoc;
  base?: TextBase;
  pad?: number;
  vAlign?: 'top' | 'middle' | 'bottom';
}

export type Arrowhead = 'none' | 'arrow' | 'triangle' | 'dot' | 'bar' | 'diamond';

export interface LineEl extends Base {
  type: 'line';
  stroke: Stroke;
  /** Runs top-left → bottom-right, or bottom-left → top-right when `up`. */
  up?: boolean;
  curve: 'straight' | 'curve' | 'elbow';
  start: Arrowhead;
  end: Arrowhead;
}

export interface ImageFilters {
  brightness?: number;
  contrast?: number;
  saturate?: number;
  blur?: number;
  grayscale?: number;
  sepia?: number;
  hue?: number;
}

export interface Crop {
  /** The visible part of the source image, as 0…1 fractions. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageEl extends Base {
  type: 'image';
  /** Null renders a drop target (a Canva-style frame waiting for an image). */
  asset: ID | null;
  crop: Crop;
  /** Mask shape; 'rect' with `radius` gives rounded corners. */
  mask: ShapeKind;
  radius: number;
  filters: ImageFilters;
  stroke?: Stroke | null;
  /** SVG recolouring: replaces the fill of single-colour vectors. */
  tint?: Color | null;
}

export interface IconEl extends Base {
  type: 'icon';
  icon: string;
  color: Color;
  /** Stroke width in a 24-unit box. */
  sw: number;
}

export interface VideoEl extends Base {
  type: 'video';
  asset: ID | null;
  crop: Crop;
  radius: number;
  loop: boolean;
  muted: boolean;
  autoplay: boolean;
  volume: number;
}

export interface AudioEl extends Base {
  type: 'audio';
  asset: ID | null;
  loop: boolean;
  autoplay: boolean;
  volume: number;
}

export interface TableCell {
  t: string;
  b?: boolean;
  i?: boolean;
  c?: Color;
  fill?: Color;
  align?: Align;
}

export interface TableEl extends Base {
  type: 'table';
  /** Column widths and row heights (the element's w/h are their sums). */
  cols: number[];
  rows: number[];
  cells: TableCell[][];
  header: boolean;
  banded: boolean;
  border: Stroke;
  headerFill: Color;
  bandFill: Color;
  base: TextBase;
  pad: number;
}

export type ChartKind = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter';

export interface ChartSeries {
  name: string;
  values: number[];
  color?: Color;
}

export interface ChartEl extends Base {
  type: 'chart';
  kind: ChartKind;
  categories: string[];
  series: ChartSeries[];
  legend: 'none' | 'top' | 'bottom' | 'right';
  grid: boolean;
  labels: boolean;
  stacked: boolean;
  smooth: boolean;
  title?: string;
  base: TextBase;
}

export interface GroupEl extends Base {
  type: 'group';
  /** Children in group-local coordinates (origin = the group's top-left). */
  children: El[];
}

export type El = TextEl | ShapeEl | LineEl | ImageEl | IconEl | VideoEl | AudioEl | TableEl | ChartEl | GroupEl;
export type ElType = El['type'];

// ── Animation ────────────────────────────────────────────────────────────────

export type Easing =
  | { k: 'preset'; name: string }
  | { k: 'bezier'; p: [number, number, number, number] }
  | { k: 'spring'; stiffness: number; damping: number; mass: number }
  | { k: 'steps'; n: number };

export type AnimKind = 'entrance' | 'exit' | 'emphasis' | 'motion' | 'transform' | 'camera';

/**
 * Animatable properties. Each has a default blend mode (see anim/engine):
 * x y rot rotX rotY w h blur cropX… add to the element; scale* opacity multiply;
 * color fill reveal progress path replace.
 */
export type TrackProp =
  | 'x'
  | 'y'
  | 'scale'
  | 'scaleX'
  | 'scaleY'
  | 'rot'
  | 'rotX'
  | 'rotY'
  | 'opacity'
  | 'blur'
  | 'w'
  | 'h'
  | 'color'
  | 'fill'
  | 'cropX'
  | 'cropY'
  | 'cropW'
  | 'cropH'
  | 'reveal'
  | 'progress'
  | 'path';

export interface Key {
  /** 0…1 through the animation. */
  t: number;
  v: number | string;
  /** Easing from this key to the next. */
  e?: Easing;
}

export interface Track {
  prop: TrackProp;
  keys: Key[];
  mode?: 'add' | 'mul' | 'set';
}

export interface PathNode {
  x: number;
  y: number;
  /** Bezier handles relative to the node. */
  ix?: number;
  iy?: number;
  ox?: number;
  oy?: number;
}

export type Trigger = 'click' | 'with' | 'after';

export interface Stagger {
  by: 'line' | 'word' | 'char' | 'child';
  /** ms between consecutive units. */
  each: number;
  from: 'start' | 'end' | 'center' | 'edges';
}

/** An animation on a slide. `el` is an element id, or '$camera' for the slide camera. */
export interface SlideAnim {
  id: ID;
  el: ID | '$camera';
  kind: AnimKind;
  /** Preset the tracks were built from; cleared when keyframes are edited by hand. */
  preset?: string;
  params?: Record<string, number | string>;
  name?: string;
  trigger: Trigger;
  /** ms, added to the trigger time. */
  delay: number;
  /** ms. */
  dur: number;
  ease: Easing;
  tracks: Track[];
  path?: PathNode[];
  /** Rotate the element to follow its path. */
  orient?: boolean;
  stagger?: Stagger;
  /** Repeat count for emphasis (Infinity is stored as 0 = forever). */
  repeat?: number;
  yoyo?: boolean;
  /** Pivot as 0…1 fractions of the element's box. */
  origin?: [number, number];
  /** Anims sharing a group id move together on the timeline. */
  group?: ID;
}

// ── Transitions ──────────────────────────────────────────────────────────────

export type Direction = 'left' | 'right' | 'up' | 'down';

export interface Transition {
  /** A transition id from transitions/registry. */
  type: string;
  dur: number;
  ease: Easing;
  dir?: Direction;
  /** Per-transition options (see each transition's `params`). */
  params?: Record<string, number | string | boolean>;
}

// ── Slide, layout, deck ──────────────────────────────────────────────────────

export interface Slide {
  id: ID;
  name?: string;
  layout?: ID;
  /** Overrides the layout/master background. */
  background?: Fill | null;
  elements: El[];
  notes: string;
  transition: Transition | null;
  anims: SlideAnim[];
  /** Starts a named section when set. */
  section?: string;
  /** Skipped when presenting. */
  hidden?: boolean;
  /** Advance automatically this many ms after the last animation (0/undefined = on click). */
  auto?: number;
  guides?: { v: number[]; h: number[] };
}

export interface Layout {
  id: ID;
  name: string;
  background?: Fill | null;
  /** Placeholders (`ph` set) and layout-level decoration. */
  elements: El[];
}

export interface Master {
  background: Fill;
  /** Decoration drawn on every slide (logo, footer rule, slide numbers…). */
  elements: El[];
}

// ── Design system ────────────────────────────────────────────────────────────

export interface ThemeColors {
  bg: Color;
  surface: Color;
  text: Color;
  muted: Color;
  primary: Color;
  secondary: Color;
  accent: Color;
  success: Color;
  danger: Color;
}

export interface DesignSystem {
  name: string;
  colors: ThemeColors;
  /** Swatches offered by every colour picker, beyond the named colours. */
  palette: Color[];
  fonts: { heading: string; body: string; mono: string };
  /** Type scale in slide units. */
  type: { display: number; title: number; heading: number; body: number; caption: number };
  /** Spacing scale in slide units (xs…xl). */
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  radius: { sm: number; md: number; lg: number };
  shadows: { sm: Shadow; md: Shadow; lg: Shadow };
  /** Named effects that styles and presets can reference. */
  effects: Record<string, Effects>;
}

/** A saved set of element properties, applied by copying (format painter / "Styles"). */
export interface StylePreset {
  id: ID;
  name: string;
  kind: 'text' | 'shape' | 'any';
  props: Partial<Pick<TextEl, 'base' | 'fill' | 'stroke' | 'radius' | 'fx' | 'opacity'>> & {
    run?: Partial<Run>;
  };
}

export interface AssetMeta {
  id: ID;
  name: string;
  kind: 'image' | 'svg' | 'video' | 'audio';
  mime: string;
  bytes: number;
  /** Intrinsic size for images/video. */
  w?: number;
  h?: number;
  /** Seconds, for video/audio. */
  dur?: number;
}

export interface Deck {
  /** Format version. */
  v: 1;
  id: ID;
  title: string;
  created: number;
  updated: number;
  size: { w: number; h: number };
  theme: DesignSystem;
  master: Master;
  layouts: Layout[];
  styles: StylePreset[];
  slides: Slide[];
  assets: Record<ID, AssetMeta>;
  /** Margin (as slide units) used by the margin and safe-area guides. */
  margin: number;
}

// ── Library (saved across decks) ─────────────────────────────────────────────

export interface BrandKit {
  id: ID;
  name: string;
  colors: Color[];
  fonts: { heading: string; body: string };
  logo?: ID | null;
  theme?: DesignSystem;
}

export interface SavedStyle {
  id: ID;
  name: string;
  created: number;
  /** A whole visual style: theme, master, layouts and style presets. */
  theme: DesignSystem;
  master: Master;
  layouts: Layout[];
  styles: StylePreset[];
  size: { w: number; h: number };
  /** Assets referenced by the master/layouts (stored inline so the style is portable). */
  assets?: Record<ID, { meta: AssetMeta; data: string }>;
}

export interface SavedComponent {
  id: ID;
  name: string;
  library: string;
  created: number;
  el: El;
  assets?: Record<ID, { meta: AssetMeta; data: string }>;
}

export interface SavedPreset {
  id: ID;
  name: string;
  created: number;
  kind: 'animation' | 'transition';
  anim?: Omit<SlideAnim, 'id' | 'el'>;
  transition?: Transition;
}

export interface SavedTemplate {
  id: ID;
  name: string;
  created: number;
  kind: 'presentation' | 'slide' | 'layout';
  deck?: Deck;
  slide?: Slide;
  layout?: Layout;
  theme?: DesignSystem;
  thumb?: string;
  assets?: Record<ID, { meta: AssetMeta; data: string }>;
}

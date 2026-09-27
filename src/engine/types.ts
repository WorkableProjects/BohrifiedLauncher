/**
 * Flow document model.
 *
 * Elements are immutable: every edit produces a new object. That lets the
 * renderer cache derived data (Path2D outlines, bounds) in WeakMaps keyed by
 * element identity, and makes undo/redo a matter of swapping references.
 */

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Semantic color token (resolved per theme) or a literal hex value. */
export type ColorToken =
  | 'label'
  | 'blue'
  | 'red'
  | 'green'
  | 'orange'
  | 'yellow'
  | 'purple'
  | 'pink'
  | 'teal'
  | 'brown'
  | (string & {});

interface ElementBase {
  id: string;
}

export interface StrokeElement extends ElementBase {
  type: 'stroke';
  tool: 'pen' | 'highlighter';
  /** Flat [x, y, pressure, x, y, pressure, ...] in world units. */
  points: number[];
  color: ColorToken;
  size: number;
  /** True when pressure came from real hardware (pen), not simulated. */
  pressure: boolean;
}

export type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse' | 'triangle' | 'polygon';

export interface ShapeElement extends ElementBase {
  type: 'shape';
  kind: ShapeKind;
  /** Bounding endpoints (line/arrow: start→end; others: opposite corners). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Closed polygon vertices, flat [x, y, ...]; only for kind 'polygon'. */
  pts?: number[];
  color: ColorToken;
  size: number;
  fill: boolean;
}

export interface TextElement extends ElementBase {
  type: 'text';
  x: number;
  y: number;
  text: string;
  color: ColorToken;
  fontSize: number;
  /** Sticky-note styling: rendered on a tinted card of fixed width. */
  note?: { w: number; h: number; tint: ColorToken };
}

export interface ImageElement extends ElementBase {
  type: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  /** data: URL, so documents are self-contained. */
  src: string;
}

export type BoardElement = StrokeElement | ShapeElement | TextElement | ImageElement;

export type Background = 'blank' | 'dots' | 'grid' | 'lined' | 'graph';

export interface Camera {
  /** World coordinate at the top-left of the viewport. */
  x: number;
  y: number;
  /** Zoom factor: screen px per world unit. */
  z: number;
}

export interface Page {
  id: string;
  name: string;
  background: Background;
  elements: BoardElement[];
  camera: Camera;
}

export interface FlowDocument {
  version: 1;
  id: string;
  title: string;
  pages: Page[];
  activePage: string;
  updatedAt: number;
}

export type Tool =
  | 'select'
  | 'hand'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'laser'
  | 'shape'
  | 'text'
  | 'note';

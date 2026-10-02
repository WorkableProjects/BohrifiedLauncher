import type { Direction, Easing } from '../model/types';
import type { AnyCanvas } from '../render/canvas';

export type TParam =
  | { id: string; label: string; type: 'range'; min: number; max: number; step: number; def: number }
  | { id: string; label: string; type: 'choice'; options: { value: string; label: string }[]; def: string }
  | { id: string; label: string; type: 'text'; def: string }
  | { id: string; label: string; type: 'toggle'; def: boolean }
  | { id: string; label: string; type: 'color'; def: string };

export type TCategory = 'Basic' | 'Cinematic' | 'Camera' | 'Reveal' | 'Shape' | 'Object' | 'Broadcast';

/** Everything a transition needs to draw one frame. All sizes are device pixels of the output canvas. */
export interface TG {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Device pixels per slide unit. */
  k: number;
  /** The outgoing slide in its final state, and the incoming slide in its first frame. */
  from: AnyCanvas;
  to: AnyCanvas;
  dir: Direction;
  params: Record<string, number | string | boolean>;
  accent: string;
  accent2: string;
  ink: string;
  bg: string;
  /** Slide titles, for broadcast graphics. */
  titles: { from: string; to: string };
  /** Magic Move: draws the matched objects at progress `p` (the base layers are `from` / `to`). */
  morph?: { baseFrom: AnyCanvas; baseTo: AnyCanvas; draw(ctx: CanvasRenderingContext2D, p: number): void; matched: number } | null;
  time: number;
}

export interface TransitionDef {
  id: string;
  name: string;
  category: TCategory;
  desc: string;
  params: TParam[];
  /** Offers the direction picker. */
  directional?: boolean;
  /** Needs the object-level morph plan. */
  morph?: boolean;
  dur: number;
  ease: Easing;
  draw(g: TG, p: number): void;
}

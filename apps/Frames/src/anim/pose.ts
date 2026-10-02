/** What animation does to an element at one instant. The renderer applies a Pose on top of the element's own properties. */

export interface ColorFx {
  /** Target colour ('' = none). */
  c: string;
  /** How far toward `c` the element's own colour has moved (0…1). */
  t: number;
}

export interface UnitPose {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  rot: number;
  opacity: number;
  blur: number;
}

export interface Pose {
  /** False once an exit animation has finished. */
  visible: boolean;
  /** Added to the element's position. */
  x: number;
  y: number;
  /** Multiplies the element's scale. */
  sx: number;
  sy: number;
  /** Added to rotation, in degrees. rotX/rotY are 3D-style tilts. */
  rot: number;
  rotX: number;
  rotY: number;
  opacity: number;
  /** Added to the element's blur. */
  blur: number;
  /** Added to the element's size. */
  dw: number;
  dh: number;
  color: ColorFx | null;
  fill: ColorFx | null;
  /** Added to the crop rectangle (fractions). */
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  /** 0…1 wipe reveal (1 = fully shown) and its direction. */
  reveal: number;
  revealDir: 'left' | 'right' | 'up' | 'down';
  /** 0…1 draw-on progress for charts and lines. */
  progress: number;
  /** Pivot for scale/rotation as fractions of the element's box. */
  ox: number;
  oy: number;
  /** Per-letter/word/line motion for staggered text animations. */
  unit?: (i: number, n: number) => UnitPose;
  unitBy?: 'line' | 'word' | 'char' | 'child';
}

export interface CameraPose {
  /** Pan, in slide units (positive looks right/down). */
  x: number;
  y: number;
  /** Zoom factor. */
  s: number;
  rot: number;
  blur: number;
  rotX: number;
  rotY: number;
}

export const identityPose = (): Pose => ({
  visible: true,
  x: 0, y: 0, sx: 1, sy: 1, rot: 0, rotX: 0, rotY: 0, opacity: 1, blur: 0, dw: 0, dh: 0,
  color: null, fill: null,
  cropX: 0, cropY: 0, cropW: 0, cropH: 0,
  reveal: 1, revealDir: 'right', progress: 1,
  ox: 0.5, oy: 0.5,
});

export const identityCamera = (): CameraPose => ({ x: 0, y: 0, s: 1, rot: 0, blur: 0, rotX: 0, rotY: 0 });
export const identityUnit = (): UnitPose => ({ dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, opacity: 1, blur: 0 });

export const isIdentityCamera = (c: CameraPose | null | undefined) =>
  !c || (c.x === 0 && c.y === 0 && c.s === 1 && c.rot === 0 && c.blur === 0 && c.rotX === 0 && c.rotY === 0);

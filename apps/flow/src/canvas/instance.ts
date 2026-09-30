import type { CanvasController } from './controller';

/** One board per window; UI reaches the live controller through here. */
let current: CanvasController | null = null;

export const setController = (c: CanvasController | null) => {
  current = c;
};

export const getController = () => current;

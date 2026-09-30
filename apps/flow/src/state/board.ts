import { useSyncExternalStore } from 'react';
import { BoardStore } from '../engine/store';

/** The single document store for this window. */
export const board = new BoardStore();

const subscribe = (fn: () => void) => board.subscribe(fn);

/** Subscribe a component to a derived slice of the board (return primitives or stable refs). */
export function useBoard<T>(selector: (b: BoardStore) => T): T {
  return useSyncExternalStore(subscribe, () => selector(board), () => selector(board));
}

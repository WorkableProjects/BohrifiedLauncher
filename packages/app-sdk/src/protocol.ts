/**
 * postMessage protocol between the launcher (parent) and an app running in
 * a same-origin iframe. Every message carries `bohr: 1` so apps can ignore
 * unrelated traffic.
 */

import type { AppActivity, SharedSettings, ShellShortcut } from './types';

export type HostCommand = 'activate' | 'suspend' | 'unmount';

export type HostMessage =
  | { bohr: 1; type: HostCommand; seq: number }
  /** Shared settings; sent after every load and on change. Not acknowledged. */
  | { bohr: 1; type: 'settings'; settings: SharedSettings };

export type AppMessage =
  | { bohr: 1; type: 'ready' }
  /** A command finished (e.g. suspend saved and released its runtime). */
  | { bohr: 1; type: 'ack'; seq: number }
  /** Small serializable state used to restore the app after an unmount. */
  | { bohr: 1; type: 'session'; data: unknown }
  | { bohr: 1; type: 'error'; message: string; fatal: boolean }
  /** What the user is working on, for "Continue with <App>" in the launcher. */
  | { bohr: 1; type: 'context'; context: AppActivity | null }
  /** Lightweight numbers about the app's runtime (canvases, elements, frame times) for the launcher's diagnostics. */
  | { bohr: 1; type: 'metrics'; data: Record<string, number> }
  /** A Bohrified shortcut pressed while focus is inside the app (see `shellShortcut`). */
  | { bohr: 1; type: 'shortcut'; name: ShellShortcut };

export const isBohrMessage = (d: unknown): d is { bohr: 1; type: string } =>
  typeof d === 'object' && d !== null && (d as { bohr?: unknown }).bohr === 1;

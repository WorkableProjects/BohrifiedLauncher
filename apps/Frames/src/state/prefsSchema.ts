/**
 * Frames' preferences: the one definition shared by the app and by
 * Bohrified's settings sheet (bohr.settings.ts). Kept free of app imports
 * because the launcher loads it at startup.
 *
 * Stored as JSON in localStorage `frames:prefs:v1`. The appearance (light /
 * dark / system) is not here: it is Bohrified's shared `bohr:theme`.
 */

export const PREFS_KEY = 'frames:prefs:v1';
export const THEME_KEY = 'bohr:theme';

export interface Prefs {
  /** Interface motion: full, calmer, or none. */
  animations: 'full' | 'reduced' | 'off';
  density: 'comfortable' | 'compact';
  /** Size of new presentations. */
  slideSize: '16:9' | '16:10' | '4:3' | '1:1' | '9:16';
  exportFormat: 'png' | 'jpg' | 'pdf' | 'video' | 'html' | 'frames';
  exportScale: '1' | '2';
  exportQuality: 'standard' | 'high';
  /** Which app's muscle memory the shortcuts follow. */
  shortcuts: 'frames' | 'keynote' | 'slides';
  snapObjects: boolean;
  smartGuides: boolean;
  showGrid: boolean;
  showRulers: boolean;
  presentTimer: boolean;
  presentNotes: boolean;
  presentProgress: boolean;
  /** Hide the pointer after a moment while presenting. */
  presentHideCursor: boolean;
  /** Cinematic transitions, or plain fades (kinder on slow machines). */
  presentTransitions: 'cinematic' | 'simple';
}

export const PREFS_DEFAULT: Prefs = {
  animations: 'full',
  density: 'comfortable',
  slideSize: '16:9',
  exportFormat: 'pdf',
  exportScale: '1',
  exportQuality: 'high',
  shortcuts: 'frames',
  snapObjects: true,
  smartGuides: true,
  showGrid: false,
  showRulers: true,
  presentTimer: true,
  presentNotes: false,
  presentProgress: true,
  presentHideCursor: true,
  presentTransitions: 'cinematic',
};

export type ThemePref = 'system' | 'light' | 'dark';

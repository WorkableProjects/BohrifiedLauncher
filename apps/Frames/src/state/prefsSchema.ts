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

export interface PrefMeta {
  id: keyof Prefs;
  kind: 'toggle' | 'choice';
  group: 'Interface' | 'Editing' | 'Export' | 'Presenting';
  label: string;
  description: string;
  options?: { value: string; label: string }[];
}

/** Labels and choices for every preference: the source for both Bohrified's sheet and Frames' own Preferences. */
export const PREFS_META: PrefMeta[] = [
  { id: 'animations', kind: 'choice', group: 'Interface', label: 'Interface animations', description: 'How much the Frames interface moves. Presentations are not affected.', options: [{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Calm' }, { value: 'off', label: 'Off' }] },
  { id: 'density', kind: 'choice', group: 'Interface', label: 'Interface density', description: 'Compact fits more on small screens.', options: [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }] },
  { id: 'slideSize', kind: 'choice', group: 'Interface', label: 'Default slide size', description: 'The shape of new presentations.', options: [{ value: '16:9', label: '16:9' }, { value: '16:10', label: '16:10' }, { value: '4:3', label: '4:3' }, { value: '1:1', label: '1:1' }, { value: '9:16', label: '9:16' }] },
  { id: 'shortcuts', kind: 'choice', group: 'Interface', label: 'Keyboard shortcuts', description: 'Follow the shortcuts of another presentation app.', options: [{ value: 'frames', label: 'Frames' }, { value: 'keynote', label: 'Keynote' }, { value: 'slides', label: 'Slides' }] },
  { id: 'snapObjects', kind: 'toggle', group: 'Editing', label: 'Snap to objects', description: 'Edges and centres snap to neighbouring objects.' },
  { id: 'smartGuides', kind: 'toggle', group: 'Editing', label: 'Smart guides', description: 'Show alignment and equal-spacing guides while you drag.' },
  { id: 'showGrid', kind: 'toggle', group: 'Editing', label: 'Grid', description: 'Show a grid on the slide, and snap to it.' },
  { id: 'showRulers', kind: 'toggle', group: 'Editing', label: 'Rulers', description: 'Show rulers around the slide; drag from one to add a guide.' },
  { id: 'exportFormat', kind: 'choice', group: 'Export', label: 'Export format', description: 'What Export suggests first.', options: [{ value: 'pdf', label: 'PDF' }, { value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'video', label: 'Video' }, { value: 'html', label: 'Web' }] },
  { id: 'exportQuality', kind: 'choice', group: 'Export', label: 'Export quality', description: 'Higher quality makes larger files.', options: [{ value: 'high', label: 'High' }, { value: 'standard', label: 'Standard' }] },
  { id: 'exportScale', kind: 'choice', group: 'Export', label: 'Image size', description: 'Export images at 1× or 2× the slide size.', options: [{ value: '1', label: '1×' }, { value: '2', label: '2×' }] },
  { id: 'presentTimer', kind: 'toggle', group: 'Presenting', label: 'Presentation timer', description: 'Show the elapsed time while presenting.' },
  { id: 'presentNotes', kind: 'toggle', group: 'Presenting', label: 'Show notes while presenting', description: 'Open the speaker notes strip when a presentation starts.' },
  { id: 'presentProgress', kind: 'toggle', group: 'Presenting', label: 'Progress bar', description: 'Show progress along the bottom edge while presenting.' },
  { id: 'presentHideCursor', kind: 'toggle', group: 'Presenting', label: 'Hide the pointer', description: 'Hide the pointer a moment after it stops moving.' },
  { id: 'presentTransitions', kind: 'choice', group: 'Presenting', label: 'Transitions', description: 'Cinematic transitions, or simple fades on slower computers.', options: [{ value: 'cinematic', label: 'Cinematic' }, { value: 'simple', label: 'Simple' }] },
];

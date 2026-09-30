import { jsonPrefs, type AppSettings } from '@bohrified/app-sdk';

/**
 * Flow's preferences in Bohrified's settings sheet. They live in Flow's own
 * `flow:prefs:v1` (see src/state/ui.ts), and a mounted Flow picks up changes
 * through its `storage` listener. Appearance isn't here: it's shared.
 */
const prefs = jsonPrefs('flow:prefs:v1', {
  device: null as 'mobile' | 'desktop' | null,
  name: null as string | null,
  liquidGlass: true,
  snapShapes: true,
  snapDots: true,
});

const settings: AppSettings = {
  storageKeys: [prefs.key],
  settings: [
    {
      kind: 'choice',
      id: 'device',
      label: 'Device',
      description: 'Mobile is touch-first and skips decorative motion.',
      options: [
        { value: 'mobile', label: 'Mobile' },
        { value: 'desktop', label: 'Desktop' },
      ],
      get: () => prefs.get().device ?? 'desktop',
      set: (v) => prefs.patch({ device: v === 'mobile' ? 'mobile' : 'desktop' }),
    },
    {
      kind: 'toggle',
      id: 'liquidGlass',
      label: 'Liquid Glass',
      description: 'WebGL refraction on toolbars (desktop only).',
      get: () => prefs.get().liquidGlass,
      set: (v) => prefs.patch({ liquidGlass: v }),
    },
    {
      kind: 'toggle',
      id: 'snapShapes',
      label: 'Hold to snap shapes',
      description: 'Hold the pen still at the end of a stroke to turn it into a shape.',
      get: () => prefs.get().snapShapes,
      set: (v) => prefs.patch({ snapShapes: v }),
    },
    {
      kind: 'toggle',
      id: 'snapDots',
      label: 'Snap dots to rings',
      description: 'Dots dropped near a circle land exactly on it.',
      get: () => prefs.get().snapDots,
      set: (v) => prefs.patch({ snapDots: v }),
    },
    {
      kind: 'text',
      id: 'name',
      label: 'First name',
      description: 'Shown in the welcome on Flow’s home.',
      placeholder: 'First name',
      maxLength: 40,
      get: () => prefs.get().name ?? '',
      set: (v) => prefs.patch({ name: v.trim().replace(/\s+/g, ' ') }),
    },
    {
      kind: 'action',
      id: 'resetProfile',
      label: 'Reset profile',
      description: 'Forget your name and device so the welcome runs again. Lessons are kept.',
      button: 'Reset',
      danger: true,
      confirm: 'Reset your Flow profile? Flow will forget your name and device choice and show the welcome again. Your lessons are kept.',
      run: () => prefs.patch({ name: null, device: null }),
    },
  ],
};

export default settings;

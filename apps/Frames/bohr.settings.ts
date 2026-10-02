import { jsonPrefs, type AppSetting, type AppSettings } from '@bohrified/app-sdk';
import { PREFS_DEFAULT, PREFS_KEY, PREFS_META, type Prefs } from './src/state/prefsSchema';

/**
 * Frames' preferences in Bohrified's settings sheet, generated from the same
 * list (PREFS_META) as Frames' own Preferences dialog, so the two always
 * agree. They live in Frames' own `frames:prefs:v1`; a mounted Frames follows
 * changes through its `storage` listener (src/state/prefs.ts), and changes
 * made inside Frames show up here the same way. Appearance isn't listed: it is
 * Bohrified's shared theme, which Frames follows and can also change.
 */
const prefs = jsonPrefs<Prefs>(PREFS_KEY, PREFS_DEFAULT);

const settings: AppSettings = {
  storageKeys: [prefs.key],
  settings: PREFS_META.map((m): AppSetting =>
    m.kind === 'toggle'
      ? { kind: 'toggle', id: m.id, label: m.label, description: m.description, get: () => !!prefs.get()[m.id], set: (v) => prefs.patch({ [m.id]: v } as Partial<Prefs>) }
      : { kind: 'choice', id: m.id, label: m.label, description: m.description, options: m.options ?? [], get: () => String(prefs.get()[m.id]), set: (v) => prefs.patch({ [m.id]: v } as Partial<Prefs>) },
  ),
};

export default settings;

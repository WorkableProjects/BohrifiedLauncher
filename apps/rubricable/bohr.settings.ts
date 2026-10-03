import { rawPref, type AppSettings } from '@bohrified/app-sdk';

/**
 * Rubricable's preferences in Bohrified's settings sheet. They live in its
 * own localStorage keys, and a mounted Rubricable picks up changes through
 * its `storage` listener (see index.html). Theme isn't here: it's shared.
 */
const ask = rawPref('rbl-ask', '1');
// Must match DECIMAL_MODES / DECIMAL_KEY in index.html.
const decimals = rawPref('rbl-decimals', 'full');
const DECIMALS = [
  { value: 'full', label: 'Full Decimals (.01 to .99)' },
  { value: 'short', label: 'Shorthand Decimals (.1 to .9)' },
  { value: 'logical', label: 'Logical Decimals (.25, .33, .5, .66, .75)' },
  { value: 'logical-short', label: 'Shorthand Logical Decimals (.25, .5, .75)' },
  { value: 'halves', label: 'Halves Only (.5)' },
  { value: 'none', label: 'No Decimals' },
] as const;

const settings: AppSettings = {
  storageKeys: [ask.key, decimals.key],
  settings: [
    {
      kind: 'toggle',
      id: 'askOnOpen',
      label: 'Ask assignment type on open',
      description: 'Show the Assignment / Quiz / Unit Test prompt at startup.',
      get: () => ask.get() !== '0',
      set: (v) => ask.set(v ? '1' : '0'),
    },
    {
      kind: 'choice',
      id: 'decimals',
      label: 'Decimals',
      description: 'Which decimals point values may use. Totals, splits and level points are rounded to match.',
      options: DECIMALS,
      get: () => (DECIMALS.some((o) => o.value === decimals.get()) ? decimals.get() : 'full'),
      set: (v) => decimals.set(v),
    },
  ],
};

export default settings;

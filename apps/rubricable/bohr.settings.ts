import { rawPref, type AppSettings } from '@bohrified/app-sdk';

/**
 * Rubricable's preferences in Bohrified's settings sheet. They live in its
 * own localStorage keys, and a mounted Rubricable picks up changes through
 * its `storage` listener (see index.html). Theme isn't here: it's shared.
 */
const ask = rawPref('rbl-ask', '1');

const settings: AppSettings = {
  storageKeys: [ask.key],
  settings: [
    {
      kind: 'toggle',
      id: 'askOnOpen',
      label: 'Ask assignment type on open',
      description: 'Show the Assignment / Quiz / Unit Test prompt at startup.',
      get: () => ask.get() !== '0',
      set: (v) => ask.set(v ? '1' : '0'),
    },
  ],
};

export default settings;

import type { AppManifest } from '@bohrified/app-sdk';

/**
 * Every Bohrified app, declared once. The launcher reads only this metadata
 * at startup; `load()` pulls in an app's code when it's first opened.
 *
 * To add an app: build it under apps/<id>/, export a BohrApp from
 * apps/<id>/bohr.app.ts, and add an entry here.
 */
export const registry: readonly AppManifest[] = [
  {
    id: 'flow',
    name: 'Flow',
    description: 'A fluid whiteboard for online tutoring: ink, shapes, pages, equations and a live student view.',
    icon: 'apps/flow/logo-192.png',
    accent: '#FF6083',
    load: () => import('../../apps/flow/bohr.app'),
  },
  {
    id: 'rubricable',
    name: 'Rubricable',
    description: 'Build graded rubrics with fair point splits and copy them into Google Classroom.',
    icon: 'icons/rubricable.svg',
    accent: '#4F46E5',
    load: () => import('../../apps/rubricable/bohr.app'),
  },
];

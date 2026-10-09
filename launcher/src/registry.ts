import type { AppManifest } from '@bohrified/app-sdk';
import flowSettings from '../../apps/flow/bohr.settings';
import framesSettings from '../../apps/Frames/bohr.settings';
import rubricableSettings from '../../apps/rubricable/bohr.settings';

/**
 * Every Bohrified app, declared once. The launcher reads only this metadata
 * at startup; `load()` pulls in an app's code when it's first opened.
 *
 * To add an app: build it under apps/<id>/, export a BohrApp from
 * apps/<id>/bohr.app.ts, and add an entry here. Its preferences, if any,
 * go in apps/<id>/bohr.settings.ts (shown in the settings sheet).
 */
export const registry: readonly AppManifest[] = [
  {
    id: 'flow',
    name: 'Flow',
    version: '1.3.0',
    keywords: ['whiteboard', 'tutoring', 'draw', 'ink', 'lesson', 'chemistry'],
    description: 'A fluid whiteboard for online tutoring: ink, shapes, pages, equations and a live student view.',
    icon: 'apps/flow/logo-192.png',
    accent: '#FF6083',
    load: () => import('../../apps/flow/bohr.app'),
    settings: flowSettings,
  },
  {
    id: 'rubricable',
    name: 'Rubricable',
    version: '1.2.1',
    keywords: ['rubric', 'grading', 'google classroom', 'feedback', 'points'],
    description: 'Build graded rubrics with fair point splits and copy them into Google Classroom.',
    icon: 'icons/rubricable.svg',
    accent: '#4F46E5',
    load: () => import('../../apps/rubricable/bohr.app'),
    settings: rubricableSettings,
  },
  {
    id: 'frames',
    name: 'Frames',
    version: '1.0.0',
    keywords: ['slides', 'presentation', 'deck', 'keynote', 'powerpoint', 'animation', 'transition', 'present'],
    description: 'Presentations with motion built in: simple slides, deep customization, cinematic animation and transitions.',
    icon: 'icons/frames.svg',
    accent: '#FF7A59',
    load: () => import('../../apps/Frames/bohr.app'),
    settings: framesSettings,
  },
  {
    id: 'oasis',
    name: 'Oasis',
    version: '1.0.0',
    keywords: ['sis', 'student', 'students', 'gradebook', 'grades', 'assignments', 'behavior', 'roster', 'bell schedule', 'attendance'],
    description: 'A simple tutoring student information system: classes, students, assignments, weighted grades, daily behavior and the bell schedule.',
    icon: 'icons/oasis.svg',
    accent: '#0D9488',
    load: () => import('../../apps/oasis/bohr.app'),
  },
];

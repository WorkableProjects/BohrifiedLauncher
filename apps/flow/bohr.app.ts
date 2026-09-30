import { frameApp } from '@bohrified/app-sdk';

/**
 * Flow behind the Bohrified contract. Flow runs in its own frame (its own
 * React root, Tailwind, singletons and listeners) and speaks the lifecycle
 * protocol through src/bohr.ts: suspend saves the lesson and releases the
 * canvas runtime; the session reopens the same lesson after an unmount.
 */
export default frameApp({
  title: 'Flow',
  protocol: true,
  src: (session) => {
    const lesson = (session as { lesson?: string } | null)?.lesson;
    return lesson ? `apps/flow/?lesson=${encodeURIComponent(lesson)}` : 'apps/flow/';
  },
});

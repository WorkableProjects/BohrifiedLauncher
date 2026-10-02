import { frameApp } from '@bohrified/app-sdk';

/**
 * Frames behind the Bohrified contract. It runs in its own frame (own React
 * root, canvases, loops) and speaks the lifecycle protocol through
 * src/bohr.ts: suspend saves and releases decoded media and canvases; the
 * session reopens the same presentation after an unmount.
 */
export default frameApp({
  title: 'Frames',
  protocol: true,
  src: (session) => {
    const deck = (session as { deck?: string } | null)?.deck;
    return deck ? `apps/frames/?deck=${encodeURIComponent(deck)}` : 'apps/frames/';
  },
});

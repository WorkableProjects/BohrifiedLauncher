import type { Deck } from '../model/types';
import { makeLight } from './t-light';
import { makeBroadcast } from './t-broadcast';
import { makeEditorial } from './t-editorial';
import { makeMidnight } from './t-midnight';
import { makeClassroom } from './t-classroom';

export interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  category: 'Business' | 'Creative' | 'Broadcast' | 'Education' | 'Minimal';
  make(): Deck;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  { id: 'frames-light', name: 'Frames Light', description: 'Clean, Keynote-minimal. White space, one pink accent and quiet motion.', category: 'Minimal', make: makeLight },
  { id: 'midnight-pitch', name: 'Midnight Pitch', description: 'A dark investor deck: gradient orbs, glass cards and cinematic reveals.', category: 'Business', make: makeMidnight },
  { id: 'broadcast', name: 'Broadcast', description: 'Esports and sports-network graphics: hard diagonals, scoreboard panels and signature broadcast transitions.', category: 'Broadcast', make: makeBroadcast },
  { id: 'editorial', name: 'Editorial', description: 'Warm paper, Didot headlines and thin rules. A magazine essay in slide form.', category: 'Creative', make: makeEditorial },
  { id: 'classroom', name: 'Classroom', description: 'A friendly lesson: rounded cards, step-by-step reveals, a vocabulary table and a quick check.', category: 'Education', make: makeClassroom },
];

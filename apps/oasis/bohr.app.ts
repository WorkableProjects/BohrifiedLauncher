import { frameApp } from '@bohrified/app-sdk';

/**
 * Oasis (Tutor SIS) behind the Bohrified contract. A single light page with
 * no loops, so suspending just hides it. Each tutor's data lives in
 * localStorage (see index.html); the sign-in lasts for the tab session.
 */
export default frameApp({
  title: 'Oasis',
  src: () => 'apps/oasis/',
});

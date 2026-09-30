import { frameApp } from '@bohrified/app-sdk';

/**
 * Rubricable behind the Bohrified contract. It's a single light page with
 * no loops or heavy runtime, so suspending just hides it; its rubric is
 * kept in sessionStorage (see index.html) so an unmount doesn't lose work.
 */
export default frameApp({
  title: 'Rubricable',
  src: () => 'apps/rubricable/',
});

/**
 * Top-level Bohrified navigation. The launcher owns `/` and `/app/<id>`;
 * each app keeps its own routes inside its boundary.
 *
 *   /            → launcher
 *   /app/<id>    → app <id>
 */

const base = import.meta.env.BASE_URL; // always ends with '/'

export function currentAppId(): string | null {
  const path = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname.replace(/^\//, '');
  const m = /^app\/([\w-]+)\/?/.exec(path);
  return m ? m[1] : null;
}

export const appPath = (id: string | null) => (id ? `${base}app/${id}` : base);

export function navigate(id: string | null, replace = false) {
  const url = appPath(id);
  if (url === location.pathname) return;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Top-level Bohrified navigation. The launcher owns these paths; each app
 * keeps its own routes inside its boundary.
 *
 *   /               → launcher
 *   /app/<id>       → app <id>
 *   /join           → Join Whiteboard (enter a session code)
 *   /join/<CODE>    → Join Whiteboard, connecting to that session
 */

const base = import.meta.env.BASE_URL; // always ends with '/'

export type Route = { kind: 'home' } | { kind: 'app'; id: string } | { kind: 'join'; code: string | null };

const relative = () => (location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname.replace(/^\//, ''));

export function currentRoute(): Route {
  const path = relative();
  const app = /^app\/([\w-]+)\/?/.exec(path);
  if (app) return { kind: 'app', id: app[1] };
  const join = /^join(?:\/([^/?#]*))?\/?$/.exec(path);
  if (join) return { kind: 'join', code: join[1] ? decodeURIComponent(join[1]) : null };
  return { kind: 'home' };
}

export function currentAppId(): string | null {
  const r = currentRoute();
  return r.kind === 'app' ? r.id : null;
}

export const appPath = (id: string | null) => (id ? `${base}app/${id}` : base);
export const joinPagePath = (code?: string | null) => `${base}join${code ? `/${code}` : ''}`;

function go(url: string, replace: boolean) {
  if (url === location.pathname) return;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  dispatchEvent(new PopStateEvent('popstate'));
}

export const navigate = (id: string | null, replace = false) => go(appPath(id), replace);
export const navigateJoin = (code?: string | null, replace = false) => go(joinPagePath(code), replace);

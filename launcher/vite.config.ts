import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const repo = fileURLToPath(new URL('..', import.meta.url));
/** Where the Flow dev server runs (scripts/dev.mjs starts it with base /apps/flow/). */
const FLOW_DEV = process.env.FLOW_DEV_URL ?? 'http://localhost:5174';
/** Where the Frames dev server runs (scripts/dev.mjs starts it with base /apps/frames/). */
const FRAMES_DEV = process.env.FRAMES_DEV_URL ?? 'http://localhost:5175';

/** Dev only: serve a single-page app (Rubricable, Oasis) as-is at /apps/<id>/. */
function singlePage(id: string): Plugin {
  const base = `/apps/${id}`;
  return {
    name: `bohrified:${id}`,
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path === base) {
          res.statusCode = 301;
          res.setHeader('Location', `${base}/`);
          return res.end();
        }
        if (path !== `${base}/` && path !== `${base}/index.html`) return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(readFileSync(new URL(`../apps/${id}/index.html`, import.meta.url)));
      });
    },
  };
}

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [singlePage('rubricable'), singlePage('oasis')],
  server: {
    port: 5173,
    fs: { allow: [repo] },
    proxy: {
      '/apps/flow': { target: FLOW_DEV, ws: true, changeOrigin: false },
      '/apps/frames': { target: FRAMES_DEV, ws: true, changeOrigin: false },
    },
  },
  // Preview serves the assembled dist/, so it must not inherit the dev proxy.
  preview: { proxy: {} },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});

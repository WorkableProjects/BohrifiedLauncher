import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const repo = fileURLToPath(new URL('..', import.meta.url));
/** Where the Flow dev server runs (scripts/dev.mjs starts it with base /apps/flow/). */
const FLOW_DEV = process.env.FLOW_DEV_URL ?? 'http://localhost:5174';
/** Where the Frames dev server runs (scripts/dev.mjs starts it with base /apps/frames/). */
const FRAMES_DEV = process.env.FRAMES_DEV_URL ?? 'http://localhost:5175';

/** Dev only: serve Rubricable's single page as-is at /apps/rubricable/. */
function rubricable(): Plugin {
  return {
    name: 'bohrified:rubricable',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path === '/apps/rubricable') {
          res.statusCode = 301;
          res.setHeader('Location', '/apps/rubricable/');
          return res.end();
        }
        if (path !== '/apps/rubricable/' && path !== '/apps/rubricable/index.html') return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(readFileSync(new URL('../apps/rubricable/index.html', import.meta.url)));
      });
    },
  };
}

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [rubricable()],
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

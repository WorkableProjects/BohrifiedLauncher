#!/usr/bin/env node
/**
 * Production build into dist/:
 *   dist/                   launcher shell (+ 404.html for static-host SPA fallback)
 *   dist/apps/flow/         Flow, built with base /apps/flow/
 *   dist/apps/frames/       Frames, built with base /apps/frames/
 *   dist/apps/rubricable/   Rubricable's page, as-is
 *
 * BASE_PATH sets where the site lives, e.g. `/BohrifiedLauncher/` for a GitHub
 * Pages project site (default `/`).
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const base = `/${(process.env.BASE_PATH ?? '').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

run(`npm run build -w launcher -- --base ${base}`);
run(`npm run build -w apps/flow -- --base ${base}apps/flow/ --outDir ../../dist/apps/flow --emptyOutDir`);
run(`npm run build -w apps/Frames -- --base ${base}apps/frames/ --outDir ../../dist/apps/frames --emptyOutDir`);
mkdirSync('dist/apps/rubricable', { recursive: true });
copyFileSync('apps/rubricable/index.html', 'dist/apps/rubricable/index.html');
// Hosts without rewrites (e.g. GitHub Pages) serve 404.html for /app/<id> deep links.
copyFileSync('dist/index.html', 'dist/404.html');
// GitHub Pages: serve files as-is (no Jekyll processing).
writeFileSync('dist/.nojekyll', '');
console.log(`\nBohrified built to dist/ (base ${base})`);

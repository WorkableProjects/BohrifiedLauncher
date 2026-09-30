#!/usr/bin/env node
/**
 * Production build into dist/:
 *   dist/                   launcher shell (+ 404.html for static-host SPA fallback)
 *   dist/apps/flow/         Flow, built with base /apps/flow/
 *   dist/apps/rubricable/   Rubricable's page, as-is
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('npm run build -w launcher');
run('npm run build -w apps/flow -- --base /apps/flow/ --outDir ../../dist/apps/flow --emptyOutDir');
mkdirSync('dist/apps/rubricable', { recursive: true });
copyFileSync('apps/rubricable/index.html', 'dist/apps/rubricable/index.html');
// Hosts without rewrites (e.g. GitHub Pages) serve 404.html for /app/<id> deep links.
copyFileSync('dist/index.html', 'dist/404.html');
console.log('\nBohrified built to dist/');

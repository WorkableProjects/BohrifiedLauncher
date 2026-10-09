#!/usr/bin/env node
/**
 * Production build into dist/:
 *   dist/                   launcher shell (+ 404.html for static-host SPA fallback)
 *   dist/apps/flow/         Flow, built with base /apps/flow/
 *   dist/apps/frames/       Frames, built with base /apps/frames/
 *   dist/apps/rubricable/   Rubricable's page, as-is
 *   dist/apps/oasis/        Oasis's page, as-is
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('npm run build -w launcher');
run('npm run build -w apps/flow -- --base /apps/flow/ --outDir ../../dist/apps/flow --emptyOutDir');
run('npm run build -w apps/Frames -- --base /apps/frames/ --outDir ../../dist/apps/frames --emptyOutDir');
mkdirSync('dist/apps/rubricable', { recursive: true });
copyFileSync('apps/rubricable/index.html', 'dist/apps/rubricable/index.html');
mkdirSync('dist/apps/oasis', { recursive: true });
copyFileSync('apps/oasis/index.html', 'dist/apps/oasis/index.html');
// Hosts without rewrites (e.g. GitHub Pages) serve 404.html for /app/<id> deep links.
copyFileSync('dist/index.html', 'dist/404.html');
console.log('\nBohrified built to dist/');

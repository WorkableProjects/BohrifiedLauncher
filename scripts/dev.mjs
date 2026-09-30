#!/usr/bin/env node
/**
 * Dev: the launcher on :5173, and Flow's own dev server on :5174 under
 * /apps/flow/ (the launcher proxies it, so everything is same-origin).
 * Rubricable is served straight from apps/rubricable by the launcher.
 */
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev', '-w', 'apps/flow', '--', '--base', '/apps/flow/', '--port', '5174', '--strictPort'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '-w', 'launcher'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => {
  stop();
  process.exitCode = code ?? 0;
}));

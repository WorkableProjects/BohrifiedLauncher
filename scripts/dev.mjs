#!/usr/bin/env node
/**
 * Dev: the launcher on :5173, Flow's own dev server on :5174 under /apps/flow/
 * and Frames' on :5175 under /apps/frames/ (the launcher proxies them, so
 * everything is same-origin).
 * Rubricable is served straight from apps/rubricable by the launcher.
 * With --host, the launcher and relay listen on the network so other devices can join.
 * The live-session relay runs on :8787 so Join Whiteboard works locally
 * (Flow and the launcher default to ws://localhost:8787 in development).
 */
import { spawn } from 'node:child_process';
import { lanAddresses } from './session-relay.mjs';

// --host (npm run dev:host): reachable from other devices on the network, not just this computer.
const lan = process.argv.includes('--host');

const procs = [
  spawn('npm', ['run', 'dev', '-w', 'apps/flow', '--', '--base', '/apps/flow/', '--port', '5174', '--strictPort'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '-w', 'apps/Frames', '--', '--base', '/apps/frames/', '--port', '5175', '--strictPort'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '-w', 'launcher', ...(lan ? ['--', '--host', '0.0.0.0'] : [])], { stdio: 'inherit' }),
  spawn(process.execPath, ['scripts/session-relay.mjs'], { stdio: 'inherit', env: { ...process.env, APP_PORT: '5173' } }),
];
if (lan) {
  const ips = lanAddresses();
  console.log(`\nOn the network: open Flow at ${ips.map((ip) => `http://${ip}:5173/`).join(' or ') || '(no network address found)'}`);
  console.log(`Students join at http://${ips[0] ?? '<this computer\'s IP>'}:5173/join/<CODE>  (live sessions use port 8787 on the same address)\n`);
}
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => {
  stop();
  process.exitCode = code ?? 0;
}));

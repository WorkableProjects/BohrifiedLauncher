#!/usr/bin/env node
/**
 * Host Bohrified on this computer for other devices (a school screen, a
 * student's laptop, a phone) on the same network:
 *
 *   npm run serve            # rebuilds if dist/ is missing or older than the code, then serves it + live sessions
 *   npm run serve -- --build # force a rebuild
 *   PORT=9000 npm run serve  # another port (default 8787)
 *
 * One port serves the app, the Join Whiteboard page and the live-session
 * relay, so a student opens  http://<this computer's IP>:8787/join/<CODE>.
 * Open Flow at that same address (not localhost) so the links it copies work
 * on other devices. For hot reload while developing, use `npm run dev:host`.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lanAddresses, startRelay } from './session-relay.mjs';

/** Newest modification time under the folders the build reads from (skipping dependencies and output). */
function newestSource() {
  let newest = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else newest = Math.max(newest, statSync(path).mtimeMs);
    }
  };
  for (const dir of ['launcher', 'apps', 'packages', 'scripts']) walk(dir);
  for (const f of ['package.json', 'package-lock.json']) newest = Math.max(newest, statSync(f).mtimeMs);
  return newest;
}

// A leftover dist/ from an older version must never be served: rebuild when it is missing or older than the code.
const built = existsSync('dist/index.html') ? statSync('dist/index.html').mtimeMs : 0;
if (process.argv.includes('--build') || built < newestSource()) {
  console.log(built ? 'Source changed since the last build: rebuilding…\n' : 'Building Bohrified…\n');
  execSync('npm run build', { stdio: 'inherit' });
}

const relay = await startRelay({ port: Number(process.env.PORT ?? 8787), host: process.env.HOST ?? '0.0.0.0', staticDir: 'dist' });
const ips = lanAddresses();
console.log(`\nBohrified is running. Open Flow on this computer at one of:\n`);
for (const ip of ips) console.log(`  http://${ip}:${relay.port}/`);
if (!ips.length) console.log('  (no network address found: connect to Wi-Fi or Ethernet)');
console.log(`\nStudents join at  http://${ips[0] ?? '<this computer\'s IP>'}:${relay.port}/join/<CODE>\n`);
console.log(`First test from the other device: open http://${ips[0] ?? '<IP>'}:${relay.port}/health. It should show {"ok":true,...}. If that doesn't load, it's the network or firewall, not Bohrified.\n`);
console.log('If other devices cannot connect, allow Node through this computer\'s firewall, and make sure both are on the same network.');
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => relay.close().then(() => process.exit(0)));

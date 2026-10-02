#!/usr/bin/env node
/**
 * Host Bohrified on this computer for other devices (a school screen, a
 * student's laptop, a phone) on the same network:
 *
 *   npm run serve            # builds if needed, then serves dist/ + live sessions
 *   PORT=9000 npm run serve  # another port (default 8787)
 *
 * One port serves the app, the Join Whiteboard page and the live-session
 * relay, so a student opens  http://<this computer's IP>:8787/join/<CODE>.
 * Open Flow at that same address (not localhost) so the links it copies work
 * on other devices. For hot reload while developing, use `npm run dev:host`.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lanAddresses, startRelay } from './session-relay.mjs';

if (!existsSync('dist/index.html') || process.argv.includes('--build')) execSync('npm run build', { stdio: 'inherit' });

const relay = await startRelay({ port: Number(process.env.PORT ?? 8787), host: process.env.HOST ?? '0.0.0.0', staticDir: 'dist' });
const ips = lanAddresses();
console.log(`\nBohrified is running. Open Flow on this computer at one of:\n`);
for (const ip of ips) console.log(`  http://${ip}:${relay.port}/`);
if (!ips.length) console.log('  (no network address found: connect to Wi-Fi or Ethernet)');
console.log(`\nStudents join at  http://${ips[0] ?? '<this computer\'s IP>'}:${relay.port}/join/<CODE>\n`);
console.log('If other devices cannot connect, allow Node through this computer\'s firewall, and make sure both are on the same network.');
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => relay.close().then(() => process.exit(0)));

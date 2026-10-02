#!/usr/bin/env node
/**
 * Host Bohrified on this computer for other devices (a school screen, a
 * student's laptop, a phone) on the same network:
 *
 *   npm run serve            # rebuilds if dist/ is missing or older than the code, then serves it + live sessions
 *   npm run serve -- --build # force a rebuild
 *   PORT=9000 npm run serve  # another port (default 8787)
 *   npm run tunnel           # same, plus a public https link for people on other networks
 *
 * One port serves the app, the Join Whiteboard page and the live-session
 * relay, so a student opens  http://<this computer's IP>:8787/join/<CODE>.
 * Open Flow at that same address (not localhost) so the links it copies work
 * on other devices. For hot reload while developing, use `npm run dev:host`.
 */
import { ensureBuild } from './ensure-build.mjs';
import { lanAddresses, startRelay } from './session-relay.mjs';

ensureBuild(process.argv.includes('--build'));

process.on('uncaughtException', (err) => console.error('serve: unexpected error (still running):', err));
process.on('unhandledRejection', (err) => console.error('serve: unexpected error (still running):', err));
const relay = await startRelay({ port: Number(process.env.PORT ?? 8787), host: process.env.HOST ?? '0.0.0.0', staticDir: 'dist' });
const ips = lanAddresses();
console.log(`\nBohrified is running. Open Flow on this computer at one of:\n`);
for (const ip of ips) console.log(`  http://${ip}:${relay.port}/`);
if (!ips.length) console.log('  (no network address found: connect to Wi-Fi or Ethernet)');
console.log(`\nStudents join at  http://${ips[0] ?? '<this computer\'s IP>'}:${relay.port}/join/<CODE>\n`);
console.log(`First test from the other device: open http://${ips[0] ?? '<IP>'}:${relay.port}/health. It should show {"ok":true,...}. If that doesn't load, it's the network or firewall, not Bohrified.\n`);
console.log('If other devices cannot connect, allow Node through this computer\'s firewall, and make sure both are on the same network.');
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => relay.close().then(() => process.exit(0)));

#!/usr/bin/env node
/**
 * Open a public link to Bohrified running on this computer, so someone on a
 * different network (the school screen, a teacher at home) can join without
 * any setup and without using the hosted site:
 *
 *   npm run tunnel             # builds if needed, serves, opens the tunnel, prints the link
 *   PORT=9000 npm run tunnel   # another local port (default 8787)
 *
 * It uses a free Cloudflare "quick tunnel" (no account): this computer opens an
 * outbound connection, and Cloudflare gives it a temporary https://….trycloudflare.com
 * address. Open Flow at that address, choose Student view → Start live session, and
 * share the link it shows (…/join/<CODE>). Sessions run through this computer's own relay.
 * The link works until you stop this command (Ctrl+C); each run gets a new one.
 */
import { ensureBuild } from './ensure-build.mjs';
import { startRelay } from './session-relay.mjs';

process.on('uncaughtException', (err) => console.error('tunnel: unexpected error (still running):', err));
process.on('unhandledRejection', (err) => console.error('tunnel: unexpected error (still running):', err));

let cloudflared;
try {
  cloudflared = await import('cloudflared');
} catch {
  console.error('The tunnel needs the "cloudflared" package. Run: npm install cloudflared   (it downloads Cloudflare\'s small tunnel program once)');
  process.exit(1);
}

ensureBuild(process.argv.includes('--build'));
const port = Number(process.env.PORT ?? 8787);
// Only the tunnel (running on this computer) needs to reach the server, so keep it off the network.
const relay = await startRelay({ port, host: process.env.HOST ?? '127.0.0.1', staticDir: 'dist' });

const { bin, install, Tunnel } = cloudflared;
const { existsSync } = await import('node:fs');
if (!existsSync(bin)) {
  console.log('Downloading the tunnel program (one time)…');
  await install(bin);
}

console.log('Opening the tunnel…');
// http2 (TCP) is allowed on far more networks than the default QUIC (UDP): hotspots, schools, hotels.
const tunnel = Tunnel.quick(`http://127.0.0.1:${relay.port}`, { '--protocol': 'http2', '--no-autoupdate': true });
const stop = () => {
  tunnel.stop();
  relay.close().then(() => process.exit(0));
};
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, stop);
tunnel.on('exit', (code) => {
  console.error(`\nThe tunnel closed (code ${code}). Run npm run tunnel again for a new link.`);
  relay.close().then(() => process.exit(code ?? 1));
});

// Show the link only once the tunnel is really connected: before that, Cloudflare answers "error 1033".
const url = await new Promise((resolve) => tunnel.once('url', resolve));
const connected = await Promise.race([
  new Promise((resolve) => tunnel.once('connected', () => resolve(true))),
  new Promise((resolve) => setTimeout(() => resolve(false), 45_000)),
]);
if (!connected) {
  console.error('\nCouldn\'t connect the tunnel (no response from Cloudflare after 45 s). Check this computer\'s internet connection, then run npm run tunnel again.');
  stop();
} else {
  console.log(`\nBohrified is public at:\n\n  ${url}\n`);
  console.log('1. On this computer, open Flow at that link (not localhost).');
  console.log('2. Student view → Start live session (choose Online).');
  console.log(`3. Share the link Flow shows, e.g. ${url}/join/<CODE>. It works from any network.\n`);
  console.log('Anyone with the link can open the app, so only share it with the people joining. Press Ctrl+C to close it.');
}

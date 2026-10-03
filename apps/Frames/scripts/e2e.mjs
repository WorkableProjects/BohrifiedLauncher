#!/usr/bin/env node
/**
 * Frames end-to-end test against the production build, through the Bohrified launcher.
 *   npm run build && npm run test:frames:e2e
 * Covers: launching from Bohrified, creating a presentation, editing text, adding a shape,
 * animating, presenting, exporting PDF/PNG/HTML, preference sync with the launcher's
 * settings, theme sync, and that suspending releases Frames' canvases.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const root = new URL('../../../', import.meta.url).pathname;
const PORT = 4193;
const executablePath = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'launcher/vite.config.ts', 'launcher', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && res());
  server.on('exit', (c) => rej(new Error(`preview exited ${c}`)));
  setTimeout(() => rej(new Error('preview timeout')), 15000);
});

let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };

const browser = await chromium.launch({ executablePath });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`);
  await page.locator('a.card[data-app="frames"]').waitFor();
  check('Frames is listed in the launcher', true);
  const t0 = Date.now();
  await page.locator('a.card[data-app="frames"]').click();
  await page.waitForFunction(() => window.__bohr.manager.apps.get('frames').state === 'active', null, { timeout: 20000 });
  check('Frames opens from Bohrified', true, `${Date.now() - t0} ms`);
  await page.locator('#status').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  const f = page.frameLocator('iframe[title="Frames"]');
  const frame = () => page.frame({ url: /\/apps\/frames\// });

  await f.getByRole('button', { name: 'Blank presentation' }).click();
  await f.getByTestId('editor').waitFor();
  check('A blank presentation opens in the editor', true);

  // Edit the title
  const stage = f.getByTestId('stage');
  const box = await stage.boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await f.getByTestId('text-editor').waitFor();
  await page.keyboard.type('Frames e2e');
  await page.keyboard.press('Escape');
  // Add a shape and animate it
  await f.locator('.topbar').getByRole('button', { name: 'Shape' }).click();
  await f.getByRole('button', { name: 'Star', exact: false }).first().click();
  await f.locator('.topbar').getByRole('button', { name: 'Animate' }).click();
  await f.getByRole('button', { name: /^Pop/ }).first().click();
  check('Animation added', await f.getByText('On this object').isVisible());
  await f.getByRole('button', { name: 'New slide' }).click();
  check('Second slide added', (await f.getByTestId('slide-item').count()) === 2);

  // Undo / redo
  await f.getByRole('button', { name: /^Undo/ }).click();
  check('Undo removes the slide', (await f.getByTestId('slide-item').count()) === 1);
  await f.getByRole('button', { name: /^Redo/ }).click();
  check('Redo restores it', (await f.getByTestId('slide-item').count()) === 2);

  // Present
  await f.locator('.topbar').getByRole('button', { name: /^Present/ }).click();
  await f.getByTestId('presenter').waitFor();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  check('Presentation mode runs', await f.getByTestId('player-canvas').isVisible());
  await page.keyboard.press('Escape');
  await f.getByTestId('presenter').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

  // Export
  for (const [label, ext] of [['PDF', '.pdf'], ['PNG', '.zip'], ['Web page', '.html']]) {
    await f.locator('.topbar').getByRole('button', { name: 'Export' }).click();
    await f.getByRole('button', { name: new RegExp(`^${label}`) }).click();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), f.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click()]);
    check(`Export ${label}`, dl.suggestedFilename().endsWith(ext), dl.suggestedFilename());
  }

  // Preference sync: Frames → launcher storage, launcher → Frames
  await f.locator('.topbar').getByRole('button', { name: 'Preferences' }).click();
  await f.getByRole('dialog').getByRole('group', { name: 'Interface density' }).getByRole('button', { name: 'Compact' }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('frames:prefs:v1') ?? '{}').density);
  check('A Frames preference is visible to Bohrified', stored === 'compact');
  await page.evaluate(() => {
    const s = window.__bohr.manager.apps.get('frames').manifest.settings.settings.find((x) => x.id === 'density');
    s.set('comfortable');
  });
  await page.waitForTimeout(300);
  check('A change from Bohrified settings reaches Frames', (await frame().evaluate(() => document.documentElement.dataset.density)) === 'comfortable');
  await f.getByRole('dialog').getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Dark' }).click();
  await page.waitForTimeout(400);
  check('Theme set in Frames reaches the launcher', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await page.keyboard.press('Escape');

  // Suspend releases canvases
  await page.locator('#brand').click();
  await page.waitForFunction(() => window.__bohr.manager.apps.get('frames').state === 'suspended', null, { timeout: 10000 });
  const canvases = await frame().evaluate(() => document.querySelectorAll('canvas').length);
  check('Suspended Frames holds no canvases', canvases === 0, `${canvases}`);
  check('No uncaught errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);

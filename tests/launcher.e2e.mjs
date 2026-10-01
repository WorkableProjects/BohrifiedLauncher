#!/usr/bin/env node
/**
 * Launcher + window-manager integration test (Bohrified 1.2), against the production build.
 *
 *   npm run build && npm run test:launcher:e2e
 *
 * Phase 1: Continue with <App>, recent + pinned apps, search, keyboard
 * navigation, Cmd/Ctrl + K, app metadata and the new/updated indicator.
 * Phase 2: movable / resizable / minimize / maximize / snap / tile windows,
 * remembered geometry, and background windows staying suspended.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4191;
const executablePath =
  process.env.CHROMIUM_PATH ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/pw-browsers/chromium', '/usr/bin/chromium'].find(existsSync);

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'launcher/vite.config.ts', 'launcher', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error('preview timeout')), 15000);
});

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    if (location.pathname.startsWith('/apps/flow/') && !localStorage.getItem('flow:prefs:v1')) {
      localStorage.setItem('flow:prefs:v1', JSON.stringify({ device: 'desktop', name: 'Test' }));
    }
    if (location.pathname.startsWith('/apps/rubricable/')) localStorage.setItem('rbl-ask', '0');
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const base = `http://localhost:${PORT}`;

  const state = (id) => page.evaluate((id) => window.__bohr.manager.apps.get(id).state, id);
  const waitState = (id, s) => page.waitForFunction(([id, s]) => window.__bohr.manager.apps.get(id).state === s, [id, s], { timeout: 20000 });
  const active = () => page.evaluate(() => window.__bohr.manager.active);
  const win = (id) => page.locator(`.win[data-app="${id}"]`);
  const box = async (id) => (await win(id).boundingBox());
  const stageBox = () => page.locator('#stage').boundingBox();
  const settle = () => page.locator('#status').waitFor({ state: 'hidden', timeout: 10000 });
  const flowCanvases = async () => (await page.frame({ url: /\/apps\/flow\// })?.evaluate(() => document.querySelectorAll('canvas').length)) ?? -1;
  const drag = async (from, to, steps = 8) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps });
    await page.mouse.up();
  };
  const bar = async (id) => {
    const b = await win(id).locator('.win-bar').boundingBox();
    return { x: b.x + 160, y: b.y + b.height / 2 };
  };

  // ── Phase 1: the launcher ─────────────────────────────────────────────────
  await page.goto(`${base}/`);
  await page.locator('a.card[data-app="flow"]').waitFor();
  check('no Continue before anything was used', await page.locator('#continue').isHidden());
  check('cards show name, version and description', (await page.locator('a.card[data-app="flow"]').innerText()).includes('Flow') && (await page.locator('a.card[data-app="flow"] .ver').innerText()) === 'v1.1.0' && (await page.locator('a.card[data-app="flow"] p').innerText()).length > 10);
  check('first visit shows no New / Updated noise', (await page.locator('.fresh:visible').count()) === 0);

  await page.locator('a.card[data-app="flow"]').click();
  await waitState('flow', 'active');
  await settle();
  const frame = () => page.frame({ url: /\/apps\/flow\// });
  await frame().getByRole('button', { name: 'New Lesson' }).click();
  await frame().getByTestId('board').waitFor();
  const board = await frame().getByTestId('board').boundingBox();
  await page.mouse.move(board.x + 300, board.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(board.x + 300 + i * 20, board.y + 300 + Math.sin(i) * 30, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  await page.locator('#brand').click();
  check('home is the desktop: Flow is paused', (await state('flow')) === 'suspended' && (await active()) === null);

  const cont = page.locator('#continue');
  await cont.waitFor({ state: 'visible' });
  check('Continue with Flow is the main action', (await cont.innerText()).includes('Continue with Flow'), (await cont.innerText()).replace(/\n/g, ' | '));
  check('Continue shows the lesson Flow reported', /page/.test(await cont.innerText()), '');
  await cont.click();
  await waitState('flow', 'active');
  check('Continue resumes the app', (await active()) === 'flow' && page.url().endsWith('/app/flow'));
  await settle();

  // Quick launcher from inside an app (focus is in Flow's iframe).
  await page.keyboard.press('Control+k');
  await page.locator('#quick[open]').waitFor();
  check('Ctrl+K opens the quick launcher from inside an app', true);
  await page.keyboard.type('rub');
  check('quick launcher filters', (await page.locator('#quick [role=option]').count()) === 1);
  await page.keyboard.press('Enter');
  await waitState('rubricable', 'active');
  await settle();
  check('Enter opens the match', (await active()) === 'rubricable' && !(await page.locator('#quick[open]').count()));
  check('the previous app was paused', (await state('flow')) === 'suspended');

  // Home: recent, pinned, search, keyboard.
  await page.locator('#brand').click();
  check('Continue now points at Rubricable', (await cont.innerText()).includes('Continue with Rubricable'));
  check('Recent lists the used apps', (await page.locator('#recent .chip').count()) === 2);
  await page.locator('.slot[data-app="flow"]').hover();
  await page.locator('.slot[data-app="flow"] .pin').click();
  check('pinning shows a Pinned row', (await page.locator('#pinned .chip').allInnerTexts()).join() === 'Flow');
  check('pinned apps leave the Recent row', (await page.locator('#recent .chip').allInnerTexts()).join() === 'Rubricable');
  await page.reload();
  await page.locator('a.card[data-app="flow"]').waitFor();
  check('pins and recents survive a reload', (await page.locator('#pinned .chip').count()) === 1 && (await cont.isVisible()), `${await page.locator('#pinned .chip').count()} pinned, continue ${await cont.isVisible()}`);

  await page.keyboard.press('/');
  check('"/" focuses search', await page.evaluate(() => document.activeElement?.id === 'search'));
  await page.keyboard.type('grad');
  check('search filters the app list', (await page.locator('.slot:not([hidden])').count()) === 1 && (await page.locator('.slot:not([hidden])').getAttribute('data-app')) === 'rubricable');
  check('Continue and chips step aside while searching', (await cont.isHidden()) && (await page.locator('#pinned').isHidden()));
  await page.keyboard.press('Escape');
  check('Escape clears search', (await page.locator('.slot:not([hidden])').count()) === 2);
  await page.keyboard.press('ArrowDown');
  check('arrow down moves from search into the apps', await page.evaluate(() => document.activeElement?.matches('a.card')));
  await page.keyboard.press('ArrowRight');
  check('arrow keys move between cards', await page.evaluate(() => document.activeElement?.dataset.app === 'rubricable'));

  // "Updated" indicator: pretend the user last saw an older Flow.
  await page.evaluate(() => localStorage.setItem('bohr:seen', JSON.stringify({ flow: '1.0.0', rubricable: '1.1.0' })));
  await page.reload();
  await page.locator('a.card[data-app="flow"]').waitFor();
  check('a version change shows Updated', (await page.locator('a.card[data-app="flow"] .fresh').innerText()) === 'Updated');
  check('unchanged apps show nothing', await page.locator('a.card[data-app="rubricable"] .fresh').isHidden());

  // ── Phase 2: windows ──────────────────────────────────────────────────────
  await page.locator('a.card[data-app="flow"]').click();
  await waitState('flow', 'active');
  await settle();
  check('opening clears the Updated indicator', (await page.evaluate(() => JSON.parse(localStorage.getItem('bohr:seen')).flow)) === '1.1.0');
  const stage = await stageBox();
  let b = await box('flow');
  check('apps open in a window inside Bohrified', b.width < stage.width && b.height < stage.height && (await win('flow').locator('.win-body iframe').count()) === 1, `${Math.round(b.width)}×${Math.round(b.height)} in ${stage.width}×${Math.round(stage.height)}`);
  check('window has minimize / maximize / close', (await win('flow').locator('.win-btn').count()) === 3);

  // Move.
  const before = await box('flow');
  const from = await bar('flow');
  await drag(from, { x: from.x + 90, y: from.y + 60 });
  b = await box('flow');
  check('title bar drags the window', Math.abs(b.x - before.x - 90) <= 2 && Math.abs(b.y - before.y - 60) <= 2, `dx ${Math.round(b.x - before.x)}, dy ${Math.round(b.y - before.y)}`);
  check('size is unchanged by moving', Math.abs(b.width - before.width) < 1);

  // Resize from the bottom-right corner.
  const rz = await win('flow').locator('.rz-se').boundingBox();
  await drag({ x: rz.x + 8, y: rz.y + 8 }, { x: rz.x - 92, y: rz.y - 62 });
  const r = await box('flow');
  check('corner handle resizes', Math.abs(b.width - r.width - 100) <= 3 && Math.abs(b.height - r.height - 70) <= 3, `${Math.round(b.width)}→${Math.round(r.width)}`);
  const free = await box('flow');

  // Maximize / restore.
  await win('flow').getByRole('button', { name: /^Maximize/ }).click();
  await page.waitForTimeout(450);
  b = await box('flow');
  check('maximize fills the desktop', Math.abs(b.width - stage.width) <= 1 && Math.abs(b.height - stage.height) <= 1);
  await win('flow').getByRole('button', { name: /^Restore/ }).click();
  await page.waitForTimeout(450);
  b = await box('flow');
  check('restore returns to the previous size and place', Math.abs(b.x - free.x) <= 2 && Math.abs(b.width - free.width) <= 2 && Math.abs(b.height - free.height) <= 2);
  await win('flow').locator('.win-bar').dblclick({ position: { x: 200, y: 20 } });
  await page.waitForTimeout(450);
  b = await box('flow');
  check('double-clicking the title bar maximizes', Math.abs(b.width - stage.width) <= 1);
  await win('flow').locator('.win-bar').dblclick({ position: { x: 200, y: 20 } });
  await page.waitForTimeout(450);

  // Snapping by drag.
  const s1 = await bar('flow');
  await page.mouse.move(s1.x, s1.y);
  await page.mouse.down();
  await page.mouse.move(stage.x + 2, s1.y, { steps: 10 });
  const previewShown = await page.locator('.snap-preview').isVisible();
  await page.mouse.up();
  await page.waitForTimeout(450);
  b = await box('flow');
  check('dragging to the left edge previews and snaps to the left half', previewShown && b.x <= 1 && Math.abs(b.width - stage.width / 2) <= 1 && Math.abs(b.height - stage.height) <= 1, `${Math.round(b.x)},${Math.round(b.width)}`);
  // Dragging out of a snap restores the floating size.
  const s2 = await bar('flow');
  await drag(s2, { x: s2.x + 200, y: s2.y + 120 });
  b = await box('flow');
  check('dragging out of a snap restores the floating size', Math.abs(b.width - free.width) <= 2, `${Math.round(b.width)} vs ${Math.round(free.width)}`);

  // Second window; background window pauses.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('rub');
  await page.keyboard.press('Enter');
  await waitState('rubricable', 'active');
  await settle();
  check('two apps, two windows', (await page.locator('.win').count()) === 2 && (await page.locator('.tab').count()) === 2);
  check('background window is suspended and releases its canvases', (await state('flow')) === 'suspended' && (await flowCanvases()) === 0);
  check('background window shows a Paused cover', await win('flow').locator('.win-cover').isVisible());
  check('the focused window is on top', await page.evaluate(() => +getComputedStyle(document.querySelector('.win[data-app="rubricable"]')).zIndex > +getComputedStyle(document.querySelector('.win[data-app="flow"]')).zIndex));

  // Keyboard snapping + tile.
  await page.keyboard.press('Control+Alt+ArrowRight');
  await page.waitForTimeout(450);
  b = await box('rubricable');
  check('Ctrl+Alt+→ snaps the focused window right', Math.abs(b.x - (stage.x + stage.width / 2)) <= 2 && Math.abs(b.width - stage.width / 2) <= 2);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('tile');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450);
  const f = await box('flow');
  const rb = await box('rubricable');
  check('Tile windows lays them side by side', Math.abs(f.width - stage.width / 2) <= 2 && Math.abs(rb.width - stage.width / 2) <= 2 && Math.abs(f.x - rb.x) > stage.width / 3, `${Math.round(f.x)} / ${Math.round(rb.x)}`);

  // Focus by clicking a background window's cover resumes it and pauses the other.
  await win('flow').locator('.win-cover').click();
  await waitState('flow', 'active');
  await settle();
  check('clicking a background window focuses and resumes it', (await active()) === 'flow' && (await state('rubricable')) === 'suspended' && page.url().endsWith('/app/flow'));
  check('resumed app restored its canvases', (await flowCanvases()) >= 2);

  // Minimize / restore keeps geometry; focus falls to the next window.
  const flowBefore = await box('flow');
  await win('flow').getByRole('button', { name: /^Minimize/ }).click();
  await waitState('rubricable', 'active');
  check('minimizing hands focus to the next window', (await active()) === 'rubricable' && (await win('flow').getAttribute('data-min')) === 'true' && (await state('flow')) === 'suspended');
  await page.locator('.tab-open:has-text("Flow")').click();
  await waitState('flow', 'active');
  await settle();
  const flowAfter = await box('flow');
  check('restoring from the taskbar keeps the window geometry', Math.abs(flowAfter.x - flowBefore.x) <= 1 && Math.abs(flowAfter.width - flowBefore.width) <= 1);

  // Show desktop, then close a window.
  await page.locator('#brand').click();
  check('Bohrified home minimizes every window', (await page.locator('.win[data-min="false"]').count()) === 0 && (await active()) === null);
  await page.locator('.tab-open:has-text("Flow")').click();
  await waitState('flow', 'active');
  await win('rubricable').getByRole('button', { name: /^Close/ }).click({ force: true }).catch(() => {});
  await page.locator('.tab:has-text("Rubricable") .tab-close').click();
  await waitState('rubricable', 'unmounted');
  check('closing a window releases its app and keeps the other', (await page.locator('.win').count()) === 1 && (await active()) === 'flow');
  await win('flow').getByRole('button', { name: /^Close/ }).click();
  await page.locator('#home').waitFor({ state: 'visible' });
  check('closing the last window returns to the launcher', (await page.locator('.win').count()) === 0 && (await active()) === null);

  // Geometry is remembered for the session.
  await page.locator('a.card[data-app="flow"]').click();
  await waitState('flow', 'active');
  await settle();
  const again = await box('flow');
  check('window geometry is remembered for the session', Math.abs(again.width - flowAfter.width) <= 2, `${Math.round(again.width)} vs ${Math.round(flowAfter.width)}`);

  // Compact screens maximize windows.
  await page.setViewportSize({ width: 600, height: 800 });
  await page.waitForTimeout(400);
  const small = await box('flow');
  check('narrow screens always show windows maximized', small.width >= 599 && (await win('flow').locator('.win-max').isHidden()));
  await page.setViewportSize({ width: 1280, height: 800 });

  check('no uncaught errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);

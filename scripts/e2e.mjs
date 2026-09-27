#!/usr/bin/env node
/**
 * End-to-end smoke test against the production build.
 *
 *   npm run build && npm run e2e
 *
 * Drives real pointer input through Chromium and checks the document model:
 * first-run onboarding, Home (new lesson, recents), ink, shape snapping,
 * erasing, undo/redo, pages, autosave, and the tutor → student-view live
 * sync over BroadcastChannel.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4180;
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
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
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/?bench`);

  // First launch: welcome sheet asks for the device type.
  const welcome = page.getByRole('dialog', { name: 'Welcome to Flow' });
  check('first launch asks mobile vs desktop', await welcome.isVisible());
  await page.getByRole('radio', { name: /Desktop or Laptop/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  check('device choice is applied', (await page.evaluate(() => document.documentElement.dataset.device)) === 'desktop' && !(await welcome.isVisible()));
  check('home shows empty recents', await page.getByText('No lessons yet').isVisible());

  await page.getByRole('button', { name: 'New Lesson' }).click();
  await page.waitForFunction(() => !!window.__flowBoard);
  await page.getByTestId('board').waitFor();
  const count = () => page.evaluate(() => window.__flowBoard.page.elements.length);
  const types = () => page.evaluate(() => window.__flowBoard.page.elements.map((e) => e.type === 'shape' ? e.kind : e.type));
  const draw = async (pts, holdMs = 0) => {
    await page.mouse.move(...pts[0]);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(...p, { steps: 3 });
    if (holdMs) await page.waitForTimeout(holdMs);
    await page.mouse.up();
  };

  // Student view opens first and waits for the tutor.
  const viewer = await ctx.newPage();
  await viewer.goto(`http://localhost:${PORT}/?view=present&bench`);
  await viewer.waitForFunction(() => !!window.__flowBoard);

  await page.keyboard.press('p');
  await draw(Array.from({ length: 30 }, (_, i) => [300 + i * 12, 300 + Math.sin(i / 3) * 30]));
  check('pen stroke commits', (await types()).join() === 'stroke');

  const circle = Array.from({ length: 48 }, (_, i) => [800 + Math.cos((i / 47) * Math.PI * 2) * 80, 400 + Math.sin((i / 47) * Math.PI * 2) * 60]);
  await draw(circle, 800);
  check('hold-to-snap turns a circle into an ellipse', (await types())[1] === 'ellipse', (await types()).join());

  await page.keyboard.press('r');
  await draw([[300, 500], [500, 650]]);
  check('rectangle tool', (await types())[2] === 'rect');

  await page.keyboard.press('e');
  await draw([[400, 250], [400, 360]]);
  check('eraser removes the crossed stroke', !(await types()).includes('stroke'), (await types()).join());

  await page.keyboard.press('Control+z');
  check('undo restores the erased stroke', (await types()).includes('stroke'));
  await page.keyboard.press('Control+Shift+z');
  check('redo erases again', !(await types()).includes('stroke'));

  await page.keyboard.press('t');
  await page.mouse.click(600, 200);
  await page.keyboard.type('Area = πr²');
  await page.keyboard.press('Escape');
  const text = await page.evaluate(() => window.__flowBoard.page.elements.find((e) => e.type === 'text')?.text);
  check('text tool', text === 'Area = πr²', String(text));

  await page.keyboard.press('v');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+d');
  const n = await count();
  check('select all + duplicate', n === 6, `${n} elements`);

  await viewer.waitForTimeout(300);
  const viewerCount = await viewer.evaluate(() => window.__flowBoard.page.elements.length);
  check('student view mirrors the board live', viewerCount === n, `${viewerCount} vs ${n}`);

  await page.getByRole('button', { name: 'New page' }).click();
  check('new page', (await page.evaluate(() => window.__flowBoard.doc.pages.length)) === 2);
  await viewer.waitForTimeout(300);
  check('student view follows page changes', (await viewer.evaluate(() => window.__flowBoard.doc.pages.length)) === 2);

  await page.getByRole('button', { name: 'All lessons' }).click();
  const card = page.getByRole('button', { name: /Untitled Lesson.*2 pages/ });
  await card.waitFor({ timeout: 5000 }).catch(() => {});
  check('lesson appears in Recent Lessons', await card.isVisible());
  check('onboarding does not reappear', !(await welcome.isVisible()));

  await page.getByRole('button', { name: 'New Lesson' }).click();
  await page.getByRole('button', { name: 'All lessons' }).click();
  await page.waitForTimeout(300);
  check('untouched new lessons are not kept', (await page.getByRole('button', { name: /^Untitled Lesson/ }).count()) === 1);

  await page.reload();
  await page.getByRole('button', { name: /Untitled Lesson.*2 pages/ }).click();
  await page.waitForFunction(() => window.__flowBoard.doc.pages.length === 2);
  const persisted = await page.evaluate(() => window.__flowBoard.doc.pages.map((p) => p.elements.length));
  check('lesson reopens from Recents after reload', persisted.join() === `${n},0`, persisted.join());

  check('no uncaught errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);

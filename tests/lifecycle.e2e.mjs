#!/usr/bin/env node
/**
 * Bohrified integration test (launcher + lifecycle), against the production build.
 *
 *   npm run build && npm run test:lifecycle
 *
 * Covers the plan's Definition of Done: fresh launcher loads no apps; Flow
 * launches; Flow → Rubricable releases Flow's canvases; back restores them;
 * unmount/remount keeps the lesson; a crash leaves the launcher usable;
 * repeated switching doesn't grow the heap. App features are not tested here
 * (each app keeps its own tests). Metrics go to docs/performance/latest.json.
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4190;
const SWITCHES = Number(process.env.SWITCHES ?? 20);
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
const metrics = {};

const browser = await chromium.launch({ executablePath, args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // Skip Flow's first-run questions; they aren't what this test is about.
  await ctx.addInitScript(() => {
    if (location.pathname.startsWith('/apps/flow/') && !localStorage.getItem('flow:prefs:v1')) {
      localStorage.setItem('flow:prefs:v1', JSON.stringify({ device: 'desktop', name: 'Test' }));
    }
    if (location.pathname.startsWith('/apps/rubricable/')) localStorage.setItem('rbl-ask', '0');
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const heapMB = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics: m } = await cdp.send('Performance.getMetrics');
    return +(m.find((x) => x.name === 'JSHeapUsedSize').value / 1048576).toFixed(1);
  };
  const state = (id) => page.evaluate((id) => window.__bohr.manager.apps.get(id).state, id);
  const waitState = (id, s) => page.waitForFunction(([id, s]) => window.__bohr.manager.apps.get(id).state === s, [id, s], { timeout: 20000 });
  const flowFrame = () => page.frame({ url: /\/apps\/flow\// });
  const flowCanvases = async () => (await flowFrame()?.evaluate(() => document.querySelectorAll('canvas').length)) ?? -1;
  const open = async (id) => {
    const t0 = Date.now();
    const tab = page.locator(`.tab-open:has-text("${id === 'flow' ? 'Flow' : 'Rubricable'}")`);
    if (id && (await tab.count())) await tab.click();
    else {
      await page.locator('#brand').click();
      if (id) await page.locator(`a.card[data-app="${id}"]`).click();
    }
    if (id) await waitState(id, 'active');
    const ms = Date.now() - t0;
    // The opening screen holds briefly on purpose (and would swallow clicks meant for the app).
    await page.locator('#status').waitFor({ state: 'hidden', timeout: 10000 });
    return ms;
  };

  // Fresh launcher: shell only.
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/`);
  await page.locator('a.card[data-app="flow"]').waitFor();
  metrics.launcherReadyMs = Date.now() - t0;
  metrics.launcherNav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), loadMs: Math.round(n.loadEventEnd) };
  });
  const scripts = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'script' || r.name.endsWith('.js')).map((r) => r.name));
  check('fresh launcher mounts no apps', (await page.locator('iframe').count()) === 0 && (await state('flow')) === 'registered' && (await state('rubricable')) === 'registered');
  check('fresh launcher loads no app code', !scripts.some((s) => s.includes('/apps/')), scripts.map((s) => s.split('/').pop()).join(', '));
  metrics.heapLauncherMB = await heapMB();

  // Flow launch.
  metrics.flowColdOpenMs = await open('flow');
  check('Flow opens at /app/flow', page.url().endsWith('/app/flow'));
  const frame = flowFrame();
  await frame.getByRole('button', { name: 'New Lesson' }).click();
  await frame.getByTestId('board').waitFor();
  await page.waitForTimeout(700); // Flow's own Home → Board reveal
  const board = frame.locator('[data-testid="board"]');
  const box = await board.boundingBox();
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 300 + i * 20, box.y + 300 + Math.sin(i) * 30, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(800); // autosave debounce
  check('Flow board is interactive', (await flowCanvases()) >= 2, `${await flowCanvases()} canvases`);
  metrics.heapFlowActiveMB = await heapMB();

  // Flow → Rubricable: Flow suspends and drops its runtime.
  metrics.rubricableColdOpenMs = await open('rubricable');
  check('Flow is suspended', (await state('flow')) === 'suspended');
  check('suspended Flow released its canvases', (await flowCanvases()) === 0, `${await flowCanvases()} canvases`);
  const lessonId = await page.evaluate(() => JSON.parse(sessionStorage.getItem('bohr:session:flow') ?? 'null')?.lesson);
  check('Flow saved a session with the lesson', !!lessonId && lessonId !== 'new', String(lessonId));
  metrics.heapFlowSuspendedMB = await heapMB();

  // Rubricable keeps its rubric across an unmount.
  const rub = page.frame({ url: /\/apps\/rubricable\// });
  await rub.locator('[data-f="name"]').first().fill('Accuracy');

  // Rubricable → Flow: restores the same lesson.
  metrics.flowWarmOpenMs = await open('flow');
  await flowFrame().getByTestId('board').waitFor();
  check('Flow restores its board', (await flowCanvases()) >= 2);

  // Repeated switching.
  const heap = [];
  const warm = [];
  for (let i = 0; i < SWITCHES; i++) {
    warm.push(await open(i % 2 ? 'flow' : 'rubricable'));
    if (i % 2) await flowFrame().getByTestId('board').waitFor();
    if (i % 4 === 3) heap.push(await heapMB());
  }
  metrics.switches = SWITCHES;
  metrics.warmSwitchMs = { median: warm.sort((a, b) => a - b)[warm.length >> 1], max: warm[warm.length - 1] };
  metrics.heapDuringSwitchingMB = heap;
  const growth = heap[heap.length - 1] - heap[0];
  check(`no continuous heap growth over ${SWITCHES} switches`, growth < 3, `${heap.join(' → ')} MB`);

  // Unmount / remount: runtime rebuilt, lesson preserved.
  await open(null);
  await page.evaluate(() => window.__bohr.unmountSuspended());
  check('unmountSuspended frees both apps', (await page.locator('iframe').count()) === 0 && (await state('flow')) === 'unmounted');
  metrics.heapAllUnmountedMB = await heapMB();
  metrics.flowRemountOpenMs = await open('flow');
  await flowFrame().getByTestId('board').waitFor();
  check('remounted Flow reopens the lesson on its board', (await flowCanvases()) >= 2 && flowFrame().url().includes(`lesson=${lessonId}`), flowFrame().url());
  await open('rubricable');
  check('Rubricable restores its rubric after unmount', (await page.frame({ url: /\/apps\/rubricable\// }).locator('[data-f="name"]').first().inputValue()) === 'Accuracy');

  // Shared settings: the Bohrified theme reaches the shell and both apps.
  await page.locator('#gear').click();
  await page.locator('[data-theme-set="dark"]').click();
  await page.waitForTimeout(300);
  const themes = {
    shell: await page.evaluate(() => document.documentElement.dataset.theme),
    flow: await flowFrame().evaluate(() => document.documentElement.dataset.appearance),
    rubricable: await page.frame({ url: /\/apps\/rubricable\// }).evaluate(() => document.documentElement.dataset.theme),
  };
  check('shared theme applies to the shell and every app', Object.values(themes).every((t) => t === 'dark'), JSON.stringify(themes));
  await page.locator('[data-theme-set="system"]').click();

  // App settings: controls in Bohrified's sheet reach the mounted apps live.
  const device = () => flowFrame().evaluate(() => document.documentElement.dataset.device);
  const deviceBefore = await device();
  await page.locator('[data-app="flow"][data-setting="device"] button', { hasText: 'Mobile' }).click();
  await page.locator('[data-app="rubricable"][data-setting="askOnOpen"] input').uncheck();
  await page.waitForTimeout(300);
  const rubricableAsk = await page.frame({ url: /\/apps\/rubricable\// }).evaluate(() => document.getElementById('askstart').checked);
  check('app settings in the sheet reach Flow and Rubricable', (await device()) === 'mobile' && rubricableAsk === false, `flow device ${await device()}, rubricable ask ${rubricableAsk}`);
  await page.locator('[data-app="flow"][data-setting="device"] button', { hasText: deviceBefore === 'mobile' ? 'Mobile' : 'Desktop' }).click();
  await page.locator('[data-app="rubricable"][data-setting="askOnOpen"] input').check();
  await page.getByRole('button', { name: 'Done' }).click();

  // Crash isolation: a fatal error inside Flow leaves the launcher working.
  await open('flow');
  await flowFrame()?.evaluate(() => parent.postMessage({ bohr: 1, type: 'error', message: 'Simulated crash', fatal: true }, location.origin));
  await waitState('flow', 'crashed');
  check('crash screen offers Reload / Back', await page.getByRole('button', { name: 'Reload app' }).isVisible());
  await page.getByRole('button', { name: 'Back to Bohrified' }).click();
  check('launcher stays usable after a crash', await page.locator('a.card[data-app="rubricable"]').isVisible());
  await open('flow');
  check('crashed app reopens', (await state('flow')) === 'active');

  // Registering a new app needs only a manifest.
  const extra = await page.evaluate(async () => {
    const LifecycleManager = window.__bohr.manager.constructor;
    const stage = document.createElement('div');
    const log = [];
    const m = new LifecycleManager(
      [{ id: 'demo', name: 'Demo', description: '', icon: '', accent: '#000', load: async () => ({ default: { mount: (host) => { host.textContent = 'demo'; return { activate: () => log.push('activate'), suspend: () => log.push('suspend'), unmount: () => log.push('unmount') }; } } }) }],
      { stage, baseUrl: '/', onChange: () => {} },
    );
    await m.open('demo');
    await m.open(null);
    await m.close('demo');
    return { log, state: m.apps.get('demo').state };
  });
  check('a new app registers from a manifest alone', extra.log.join() === 'activate,suspend,unmount' && extra.state === 'unmounted', extra.log.join());

  check('no uncaught errors in the launcher', errors.length === 0, errors.join(' | '));
  metrics.date = new Date().toISOString();
  writeFileSync('docs/performance/latest.json', JSON.stringify(metrics, null, 2) + '\n');
  console.log(metrics);
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);

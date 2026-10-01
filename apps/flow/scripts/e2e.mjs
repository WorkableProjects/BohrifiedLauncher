#!/usr/bin/env node
/**
 * End-to-end smoke test against the production build.
 *
 *   npm run build && npm run e2e
 *
 * Drives real pointer input through Chromium and checks the document model:
 * first-run onboarding, Home (new lesson, recents), ink, shape snapping,
 * erasing, undo/redo, rich text, Apps (Screen Hider, LaTeX), pages, autosave, and the tutor → student-view live
 * sync over BroadcastChannel.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4180;
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const server = spawn(process.execPath, [new URL('../../../node_modules/vite/bin/vite.js', import.meta.url).pathname, 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
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
  check('first launch asks for a first name', await page.getByRole('textbox', { name: 'First name' }).isVisible());
  await page.getByRole('textbox', { name: 'First name' }).fill('Caden');
  await page.getByRole('button', { name: 'Continue' }).click();
  check('then asks mobile vs desktop', await page.getByRole('radio', { name: /Desktop or Laptop/ }).isVisible());
  await page.getByRole('radio', { name: /Desktop or Laptop/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  check('device choice is applied', (await page.evaluate(() => document.documentElement.dataset.device)) === 'desktop' && !(await welcome.isVisible()));
  check('home shows empty recents', await page.getByText('No lessons yet').isVisible());
  check('home welcomes the user by name', await page.getByRole('heading', { name: 'Welcome, Caden.' }).isVisible());

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

  // Rich text: bold a word while typing, then check the stored spans.
  await page.mouse.click(600, 120);
  await page.keyboard.type('Rich ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('bold');
  await page.keyboard.press('Escape');
  const rich = await page.evaluate(() => window.__flowBoard.page.elements.find((e) => e.type === 'text' && e.text.startsWith('Rich')));
  check('rich text keeps formatting', rich?.text === 'Rich bold' && rich.spans?.some((s) => s.text === 'bold' && s.marks?.bold), JSON.stringify(rich?.spans));

  // Apps: Screen Hider toggles, LaTeX typesets and inserts a vector equation.
  await page.getByRole('button', { name: 'Apps' }).click();
  await page.getByRole('button', { name: /Screen Hider/ }).click();
  check('Screen Hider opens from Apps', await page.getByRole('slider', { name: 'Curtain position' }).isVisible());
  await page.getByRole('button', { name: /Screen Hider/ }).click();
  await page.getByRole('button', { name: /LaTeX Equation/ }).click();
  await page.getByRole('textbox', { name: 'LaTeX source' }).fill('\\frac{a}{b} = \\sqrt{x^2}');
  const insert = page.getByRole('button', { name: 'Insert', exact: true });
  await page.waitForFunction(() => !document.querySelector('[aria-label="LaTeX equation"] button:disabled'), null, { timeout: 15000 }).catch(() => {});
  await insert.click();
  const eq = await page.evaluate(() => window.__flowBoard.page.elements.find((e) => e.type === 'equation'));
  check('LaTeX equation is inserted as vector SVG', !!eq && eq.svg.startsWith('<svg') && eq.svg.includes('<path') && eq.w > 0, eq?.latex);
  await page.keyboard.press('Control+z');
  check('equation insert is undoable', !(await types()).includes('equation'));

  // Chemistry Tools: sodium from the periodic table → a Bohr model with 3 levels and its 11 electrons.
  const before = (await types()).filter((t) => t === 'ellipse').length;
  const chem = page.getByRole('dialog', { name: 'Chemistry Tools' });
  await page.getByRole('button', { name: 'Apps' }).click();
  await page.getByRole('button', { name: /Chemistry Tools/ }).click();
  check('Chemistry Tools opens on the periodic table', await chem.getByRole('group', { name: 'Periodic table of the elements' }).isVisible());
  await chem.getByRole('searchbox', { name: 'Search the periodic table' }).fill('sodium');
  await page.keyboard.press('Enter');
  check('searching selects the element and shows its details', await chem.getByRole('heading', { name: /Sodium/ }).isVisible() && (await chem.getByText('22.99').count()) > 0);
  await chem.getByRole('radio', { name: 'Bohr Model' }).click();
  await chem.getByRole('button', { name: 'Insert', exact: true }).click();
  const filled = await page.evaluate(() => {
    const els = window.__flowBoard.page.elements;
    return {
      rings: els.filter((e) => e.type === 'shape' && e.kind === 'ellipse').length,
      dots: els.filter((e) => e.type === 'dot').length,
      labels: els.filter((e) => e.type === 'text').map((e) => e.text),
    };
  });
  check('Chemistry Tools inserts sodium: 3 levels, 11 electrons, p = 11, n = 12', filled.rings - before === 4 && filled.dots === 11 && filled.labels.includes('p = 11') && filled.labels.includes('n = 12'), JSON.stringify(filled));
  await page.keyboard.press('Control+z');
  check('the whole model undoes in one step', (await page.evaluate(() => window.__flowBoard.page.elements.filter((e) => e.type === 'dot').length)) === 0);

  // Changing the electron count updates the other tools (Na⁺ has the neon configuration).
  await page.getByRole('button', { name: 'Apps' }).click();
  await page.getByRole('button', { name: /Chemistry Tools/ }).click();
  await chem.getByRole('radio', { name: 'Configuration' }).click();
  await chem.getByRole('button', { name: 'Fewer electrons' }).click();
  check('losing an electron makes the Na⁺ ion', (await chem.getByText(/Na⁺ · Sodium/).count()) > 0 && (await chem.getByText('1s² 2s² 2p⁶').count()) > 0);
  await chem.getByRole('radio', { name: 'Lewis Dot' }).click();
  check('the ion shows in Lewis Dot too (0 valence electrons)', (await chem.getByText(/0 valence/).count()) > 0);

  // The blank worksheet draws just the template: nucleus + 3 rings + empty p / n labels.
  await chem.getByRole('radio', { name: 'Bohr Model' }).click();
  await chem.getByRole('switch', { name: 'Blank worksheet' }).click();
  await chem.getByRole('button', { name: 'More electrons' }).click();
  await chem.getByRole('button', { name: 'Insert', exact: true }).click();
  const bohr = await page.evaluate(() => {
    const els = window.__flowBoard.page.elements;
    return { rings: els.filter((e) => e.type === 'shape' && e.kind === 'ellipse').length, labels: els.filter((e) => e.type === 'text' && /^[pn] =$/.test(e.text)).length };
  });
  check('blank worksheet inserts the empty Bohr template', bohr.rings - before === 4 && bohr.labels === 2, JSON.stringify(bohr));

  // Dot tool: a tap near the outer orbit lands exactly on it.
  const orbit = await page.evaluate(() => {
    const els = window.__flowBoard.page.elements.filter((e) => e.type === 'shape' && e.kind === 'ellipse');
    const o = els[els.length - 1];
    const cam = window.__flowBoard.page.camera;
    const cx = (o.x1 + o.x2) / 2, cy = (o.y1 + o.y2) / 2, r = (o.x2 - o.x1) / 2;
    return { sx: (cx + r - cam.x) * cam.z - 6, sy: (cy - cam.y) * cam.z + 3, cx, cy, r };
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await page.mouse.click(orbit.sx, orbit.sy);
  const dot = await page.evaluate(() => window.__flowBoard.page.elements.find((e) => e.type === 'dot'));
  check('dot tool snaps onto a Bohr orbit', !!dot && Math.abs(Math.hypot(dot.x - orbit.cx, dot.y - orbit.cy) - orbit.r) < 0.01, JSON.stringify(dot && { x: dot.x, y: dot.y }));
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');

  await page.keyboard.press('v');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+d');
  const n = await count();
  check('select all + duplicate', n === 8, `${n} elements`);

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

  // Reset Profile brings back the first-launch welcome.
  await page.getByRole('button', { name: 'All lessons' }).click().catch(() => {});
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Settings' }).last().click();
  await page.getByRole('button', { name: 'Reset Profile' }).click();
  check('Reset Profile shows the welcome again', await page.getByRole('textbox', { name: 'First name' }).isVisible());

  check('no uncaught errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures ? 1 : 0);

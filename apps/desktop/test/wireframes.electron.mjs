import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  out = join(root, 'test-artifacts', 'wireframes');
await mkdir(out, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.AURALIDE_DEV_SERVER_URL;
const app = await _electron.launch({ args: ['.'], cwd: root, env });
const results = [];
try {
  await app.firstWindow();
  const ready = app.waitForEvent('window');
  await app.evaluate(
    ({ BrowserWindow }, path) => {
      const w = new BrowserWindow({
        width: 1440,
        height: 1000,
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      return w.loadFile(path);
    },
    join(root, '../../docs/design/workspace-wireframes.html'),
  );
  const page = await ready;
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.waitForFunction(
    () => document.querySelector('#direction-heading')?.textContent?.length > 0,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const direction of ['a', 'b', 'c']) {
    await page.selectOption('#direction', direction);
    const states = [];
    for (const workspace of ['editor', 'design', 'aura', 'agent']) {
      await page.locator(`button[data-workspace="${workspace}"]`).click();
      assert.equal(await page.locator('#workspace').getAttribute('data-workspace'), workspace);
      assert.equal(await page.locator('button[aria-pressed="true"]').count(), 1);
      assert((await page.locator('#content').innerText()).length > 100);
      states.push(await page.locator('#content').innerHTML());
      if (direction === 'b' && workspace === 'agent') {
        assert.equal(
          await page
            .locator('.stage')
            .getByRole('heading', { name: 'Agent / Proposal review' })
            .count(),
          1,
        );
        assert.equal(await page.locator('.stage .slide').count(), 0);
      }
      if (direction === 'c' && workspace === 'aura')
        assert.equal(
          await page
            .getByRole('heading', { name: 'Diagnostics / Inspection', exact: true })
            .count(),
          1,
        );
      if (direction === 'c' && workspace === 'agent')
        assert.equal(
          await page
            .locator('.stage')
            .getByRole('heading', { name: 'Command results / Audit' })
            .count(),
          1,
        );
      results.push(`${direction}/${workspace}:PASS`);
    }
    assert.equal(new Set(states).size, 4, `distinct ${direction} workspace content`);
    await page.locator('button[data-workspace="editor"]').click();
    await page.selectOption('#theme', 'light');
    await page.screenshot({ path: join(out, `direction-${direction}.png`) });
  }
  await page.selectOption('#theme', 'dark');
  const dark = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
  await page.selectOption('#theme', 'light');
  const light = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
  assert.notEqual(dark, light);
  await page.selectOption('#theme', 'system');
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(
    await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor),
    dark,
  );
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(
    await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor),
    light,
  );
  await page.selectOption('#platform', 'macos');
  assert((await page.locator('#shortcut-guide').textContent()).includes('Cmd+'));
  await page.selectOption('#platform', 'windows');
  assert((await page.locator('#shortcut-guide').textContent()).includes('Ctrl+'));
  await page.locator('#direction').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#direction').inputValue(), 'b');
  await page.keyboard.press('Escape');
  await page.locator('#direction').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'theme');
  assert.notEqual(
    await page.locator('#theme').evaluate((el) => window.getComputedStyle(el).outlineStyle),
    'none',
  );
  await page.setViewportSize({ width: 960, height: 900 });
  for (const direction of ['a', 'b', 'c']) {
    await page.selectOption('#direction', direction);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }
  await page.screenshot({ path: join(out, 'narrow.png') });
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    views: results,
    themes: 'Light/Dark/System PASS',
    platformShortcuts: 'Ctrl/Cmd PASS',
    keyboardFocus: 'PASS',
    narrowViewport: '960x900 PASS',
    pageErrors: errors,
  };
  await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await app.close();
}

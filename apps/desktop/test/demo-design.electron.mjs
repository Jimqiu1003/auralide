/** Real Electron design review; no production source changes or real document writes. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';
import { format } from 'prettier';

const desktop = dirname(dirname(fileURLToPath(import.meta.url)));
const root = join(desktop, '../..');
const design = join(root, 'docs/design/demo-v02');
const output = join(desktop, 'test-artifacts/demo-v02-design');
const evidence = join(design, 'evidence');
const publishEvidence = process.argv.includes('--evidence');
const results = {
  baseline: '8891a983ec6adbff8ff05a99845ca89b4a08f0b7',
  host: process.platform,
  node: process.version,
  metrics: [],
  checks: [],
  errors: [],
};
await mkdir(output, { recursive: true });
if (publishEvidence) await mkdir(evidence, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.AURALIDE_DEV_SERVER_URL;
const app = await _electron.launch({
  args: ['.', `--user-data-dir=${join(output, 'profile')}`],
  cwd: desktop,
  env,
});
function contrast(first, second) {
  const luminance = (hex) => {
    const rgb = hex.trim().startsWith('#')
      ? hex
          .trim()
          .slice(1)
          .match(/../g)
          .map((v) => parseInt(v, 16))
      : hex
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number);
    return rgb
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
async function check(name, fn) {
  await fn();
  results.checks.push(name);
}
async function capture(page, name, curated = false) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))),
  );
  const file = `${name}.png`;
  await page.screenshot({ path: join(output, file) });
  if (publishEvidence && curated) await copyFile(join(output, file), join(evidence, file));
}
async function size(windowId, width, height) {
  await app.evaluate(
    ({ BrowserWindow }, input) =>
      BrowserWindow.fromId(input.id).setContentSize(input.width, input.height),
    { id: windowId, width, height },
  );
}
async function auxiliary(file) {
  const ready = app.waitForEvent('window');
  const id = await app.evaluate(async ({ BrowserWindow }, file) => {
    const window = new BrowserWindow({
      width: 1440,
      height: 900,
      show: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    await window.loadFile(file);
    return window.id;
  }, file);
  return { page: await ready, id };
}
async function select(page, id, modifiers) {
  await page.locator(`#stage [data-select="${id}"]`).click({ modifiers, position: { x: 8, y: 8 } });
  await page.waitForFunction(
    (id) =>
      document.querySelector(`#stage [data-select="${id}"]`)?.getAttribute('aria-pressed') ===
      'true',
    id,
  );
}
try {
  const baseline = await app.firstWindow();
  await baseline.getByTestId('slide-preview').waitFor();
  const mainId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id);
  results.electron = await app.evaluate(() => ({
    version: process.versions.electron,
    arch: process.arch,
  }));
  const productionChanges = execFileSync(
    'git',
    [
      'diff',
      '8891a983',
      '--',
      'apps/desktop/src',
      'packages/core',
      'packages/agent',
      'packages/renderer',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(productionChanges, '', 'baseline runtime must be unchanged from PR #24');
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
  ]) {
    await size(mainId, width, height);
    await baseline.evaluate(() => window.scrollTo(0, 0));
    await capture(baseline, `baseline-${width}x${height}-editor`, true);
    results.metrics.push(
      await baseline.evaluate(() => ({
        variant: 'baseline',
        viewport: [window.innerWidth, window.innerHeight],
        pageHeight: document.documentElement.scrollHeight,
        auraY: document.querySelector('.aura-poc').getBoundingClientRect().y,
        canvas: {
          width: document.querySelector('[data-testid="slide-preview"]').getBoundingClientRect()
            .width,
          height: document.querySelector('[data-testid="slide-preview"]').getBoundingClientRect()
            .height,
        },
      })),
    );
    await baseline.getByTestId('demo-layer-item').first().click();
    await capture(baseline, `baseline-${width}x${height}-text`);
  }
  await baseline.getByTestId('demo-add-rectangle').click();
  await baseline.waitForFunction(
    () => document.querySelectorAll('[data-testid="demo-layer-item"]').length === 2,
  );
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
  ]) {
    await size(mainId, width, height);
    await baseline.getByTestId('demo-layer-item').last().click();
    await capture(baseline, `baseline-${width}x${height}-shape`);
  }
  await baseline.getByTestId('aura-render').click();
  await baseline.waitForFunction(() =>
    document.querySelector('[data-testid="aura-result"]')?.textContent?.includes('"slide-preview"'),
  );
  const nativeTab = JSON.parse(await baseline.getByTestId('aura-result').textContent()).value;
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
  ]) {
    await size(mainId, width, height);
    await baseline.locator('.aura-surface').scrollIntoViewIfNeeded();
    await capture(baseline, `baseline-${width}x${height}-aura`, width === 1280);
  }
  const nativeImage = await baseline.evaluate((input) => window.auralide.auraInvoke(input), {
    tool: 'preview.screenshot',
    input: { tabId: nativeTab.id, expectedRevision: nativeTab.revision },
  });
  assert(nativeImage.ok);
  const png = Buffer.from(nativeImage.value.base64, 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  await writeFile(join(output, 'baseline-aura-native.png'), png);
  if (publishEvidence) await writeFile(join(evidence, 'baseline-aura-native.png'), png);
  console.log('PR #24 exact baseline: captured Editor/Text/Shape/Aura at both sizes.');

  for (const variant of ['a1', 'a2', 'a3']) {
    const { page, id } = await auxiliary(join(design, `${variant}.html`));
    page.on('pageerror', (error) => results.errors.push(`${variant}: ${error}`));
    page.on('console', (message) => {
      if (message.type() === 'error') results.errors.push(`${variant}: ${message.text()}`);
    });
    const requests = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    await page.locator('.slide-frame').waitFor();
    await check(`${variant}/no production bridge`, async () =>
      assert.equal(await page.evaluate(() => typeof window.auralide), 'undefined'),
    );
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
    ])
      for (const theme of ['light', 'dark']) {
        await size(id, width, height);
        await page.reload();
        await page.locator('.slide-frame').waitFor();
        await page.selectOption('[data-theme-picker]', theme);
        const prefix = `${variant}-${theme}-${width}x${height}`;
        await page.waitForFunction(
          () => document.querySelector('.slide-frame').getBoundingClientRect().width > 700,
        );
        const metrics = await page.evaluate(() => {
          const rect = document.querySelector('.slide-frame').getBoundingClientRect();
          const body = document.documentElement;
          const panels = ['.left-panel', '.canvas-column', '.right-panel'].map((s) => {
            const r = document.querySelector(s).getBoundingClientRect();
            return { x: r.x, right: r.right, y: r.y, bottom: r.bottom };
          });
          const overflowControls = [...document.querySelectorAll('button, select, input')]
            .filter((e) => {
              if (!e.getClientRects().length) return false;
              const r = e.getBoundingClientRect();
              return r.left < -0.5 || r.right > window.innerWidth + 0.5;
            })
            .map((e) => e.getAttribute('aria-label') || e.textContent);
          return {
            viewport: [window.innerWidth, window.innerHeight],
            pageHeight: body.scrollHeight,
            pageWidth: body.scrollWidth,
            canvas: { width: rect.width, height: rect.height },
            panels,
            overflowControls,
          };
        });
        results.metrics.push({ variant, theme, ...metrics });
        await check(`${prefix}/layout`, async () => {
          assert.equal(metrics.pageHeight, height);
          assert.equal(metrics.pageWidth, width);
          assert(metrics.canvas.width >= 720, `canvas width ${metrics.canvas.width}`);
          assert(metrics.canvas.height >= 405);
          assert(
            metrics.panels[0].right <= metrics.panels[1].x &&
              metrics.panels[1].right <= metrics.panels[2].x,
          );
          assert.deepEqual(metrics.overflowControls, []);
        });
        await capture(page, `${prefix}-editor`, true);
        const colors = await page.evaluate(() => {
          const style = window.getComputedStyle(document.documentElement);
          return Object.fromEntries(
            [
              'text',
              'muted',
              'surface',
              'surface-soft',
              'canvas',
              'accent',
              'accent-text',
              'control-line',
              'selected',
              'focus',
            ].map((name) => [name, style.getPropertyValue('--' + name)]),
          );
        });
        await check(`${prefix}/contrast`, async () => {
          for (const background of ['surface', 'surface-soft', 'canvas', 'selected']) {
            assert(contrast(colors.text, colors[background]) >= 4.5);
            assert(contrast(colors.muted, colors[background]) >= 4.5);
          }
          assert(contrast(colors['accent-text'], colors.accent) >= 4.5);
          assert(contrast(colors['control-line'], colors.surface) >= 3);
          assert(contrast(colors.focus, colors.canvas) >= 3);
          assert(contrast('#111827', '#cf6a42') >= 4.5);
          assert(contrast('#b14c27', '#f6f3ec') >= 4.5);
        });
        await select(page, 'title');
        await check(`${prefix}/selection sync`, async () => {
          assert.equal(
            await page.locator('#layer-list [data-select="title"]').getAttribute('aria-pressed'),
            'true',
          );
          assert.equal(await page.locator('#content').inputValue(), '把想法，变成\n下一次出发。');
        });
        await capture(page, `${prefix}-text`, theme === 'light' && width === 1440);
        await select(page, 'orange');
        await capture(page, `${prefix}-shape`, theme === 'light' && width === 1440);
        await page.locator('nav [data-workspace="aura"]').click();
        await page.locator('iframe').waitFor();
        await page.frameLocator('iframe').locator('svg').waitFor();
        await check(`${prefix}/Aura isolation`, async () => {
          assert.equal(await page.locator('iframe').getAttribute('sandbox'), '');
          assert.equal(await page.locator('#stage').isVisible(), false);
          assert(
            (await page.frameLocator('iframe').locator('svg').textContent()).includes('把想法'),
          );
        });
        await capture(page, `${prefix}-aura`, theme === 'light' && width === 1440);
        await page.locator('.aura-foot [data-workspace="editor"]').click();
        assert.equal(
          await page.locator('#layer-list [data-select="orange"]').getAttribute('aria-pressed'),
          'true',
        );
        await page.locator('.title-actions [data-action="save"]').click();
        await capture(page, `${prefix}-save`, theme === 'light' && width === 1440);
        await page.locator('[data-action="cancel"]').click();
        await page.locator('.title-actions [data-action="open"]').click();
        await capture(page, `${prefix}-open`);
        await page.locator('[data-action="cancel"]').click();
      }
    await page.reload();
    await select(page, 'title');
    await page.locator('#content').fill('从这里，重新出发。');
    await page.locator('[data-theme-picker]').focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#content').inputValue(), '从这里，重新出发。');
    await page.locator('[data-inspector-tab="arrange"]').click();
    await page.locator('[name="x"]').fill('');
    await page.locator('[data-inspector-tab="design"]').click();
    await page.locator('[data-inspector-tab="arrange"]').click();
    assert.equal(await page.locator('[name="x"]').inputValue(), '');
    await page.locator('[name="x"]').fill('68');
    await page.locator('nav [data-workspace="aura"]').click();
    await page.locator('[data-aura-mode="lab"]').click();
    assert.equal(
      await page.locator('[data-aura-mode="lab"]').evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator('.aura-foot [data-workspace="editor"]').click();
    assert.equal(
      await page.locator('#stage').evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator('[data-inspector-tab="design"]').click();
    assert.equal(await page.locator('#content').inputValue(), '从这里，重新出发。');
    await page.locator('#property-form').evaluate((form) => form.requestSubmit());
    await check(`${variant}/property edit + actual thumbnail`, async () => {
      assert((await page.locator('#stage').textContent()).includes('从这里，重新出发。'));
      assert((await page.locator('#slide-list').innerHTML()).includes('从这里，重新出发。'));
    });
    await page.locator('[data-action="undo"]').click();
    assert((await page.locator('#stage').textContent()).includes('把想法，变成'));
    await page.locator('[data-action="redo"]').click();
    assert((await page.locator('#stage').textContent()).includes('从这里，重新出发。'));
    await page.locator('.title-actions [data-action="save"]').click();
    await page.locator('[data-action="confirm-save"]').click();
    await page.waitForFunction(() => !document.querySelector('#dialog').open);
    assert.equal(await page.locator('[data-save-state]').textContent(), '已保存到内存');
    await page.locator('#content').fill('保留未应用的草稿');
    await page.locator('.title-actions [data-action="save"]').click();
    await page.selectOption('#save-scenario', 'conflict');
    await page.locator('[data-action="confirm-save"]').click();
    await page.getByRole('heading', { name: '模拟版本冲突', exact: true }).waitFor();
    await capture(page, `${variant}-conflict`, true);
    assert.equal(await page.locator('#content').inputValue(), '保留未应用的草稿');
    await page.locator('[data-action="cancel"]').click();
    assert.equal(
      await page
        .locator('.title-actions [data-action="save"]')
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.locator('.title-actions [data-action="save"]').click();
    await page.selectOption('#save-scenario', 'failure');
    await page.locator('[data-action="confirm-save"]').click();
    await page.getByRole('heading', { name: '模拟保存失败', exact: true }).waitFor();
    assert.equal(await page.locator('#content').inputValue(), '保留未应用的草稿');
    await page.locator('[data-action="cancel"]').click();
    await page.locator('.title-actions [data-action="open"]').click();
    await page.locator('[data-action="confirm-open"]').click();
    assert((await page.locator('#stage').textContent()).includes('从这里，重新出发。'));
    results.checks.push(`${variant}/save success, failure, conflict, draft retention, reopen`);
    await select(page, 'title');
    await select(page, 'orange', ['Shift']);
    assert.equal(await page.locator('#stage [aria-pressed="true"]').count(), 2);
    await page.locator('#stage [data-select="title"]').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#stage [aria-pressed="true"]').count(), 0);
    await page.locator('#stage [data-select="orange"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await page.locator('#layer-list [data-select="orange"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page
        .locator('#stage [data-select="orange"] .object-focus')
        .evaluate((e) => window.getComputedStyle(e).stroke),
      'rgb(23, 41, 71)',
    );
    await page.locator('[name="radius"]').fill('');
    await page.locator('[data-inspector-tab="arrange"]').click();
    await page.locator('[data-inspector-tab="design"]').click();
    assert.equal(await page.locator('[name="radius"]').inputValue(), '');
    await page.locator('[name="radius"]').fill('8');
    await page.locator('[data-inspector-tab="arrange"]').click();
    await page.locator('[name="w"]').fill('300');
    await page.locator('#property-form').evaluate((form) => form.requestSubmit());
    assert.equal(await page.locator('[name="w"]').inputValue(), '300');
    await page.locator('[name="w"]').fill('0');
    assert.equal(
      await page.locator('#property-form').evaluate((form) => form.checkValidity()),
      false,
    );
    await page.keyboard.press('Escape');
    await page.selectOption('[data-theme-picker]', 'system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await page
        .locator('.title-actions [data-action="save"]')
        .evaluate((e) => window.getComputedStyle(e).transitionDuration),
      '0s',
    );
    await page.locator('[data-slide="1"]').click();
    assert((await page.locator('#stage').textContent()).includes('让创作回到内容本身'));
    await page.locator('[data-slide="2"]').click();
    assert((await page.locator('#stage').textContent()).includes('好的工具'));
    await page.locator('[data-slide="0"]').click();
    if (variant === 'a1') await page.locator('[data-left-tab="layers"]').click();
    await page.locator('#layer-list [data-select="title"]').click();
    assert.equal(
      await page.locator('#stage [data-select="title"]').getAttribute('aria-pressed'),
      'true',
    );
    await page.locator('#layer-list [data-select="title"]').press('Delete');
    assert.equal(
      await page.locator('#stage').evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator('.document-title').click();
    await page.locator('.menu-list [data-action="shortcuts"]').click();
    await page.keyboard.press('Escape');
    assert.equal(
      await page.locator('.document-title').evaluate((el) => el === document.activeElement),
      true,
    );
    results.checks.push(
      `${variant}/draft survives panel and workspace switches, Aura and delete focus, menu focus restoration, layer selection`,
    );
    await check(`${variant}/offline`, async () => assert.deepEqual(requests, []));
    results.checks.push(
      `${variant}/multiselect, nudge, keyboard selection, resize validation, themes, reduced motion, slides`,
    );
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).destroy(), id);
    console.log(`${variant}: screenshot matrix + interaction checks passed.`);
  }
  const { page: review, id: reviewId } = await auxiliary(join(design, 'index.html'));
  await check('review/three working prototype entries and screenshots', async () => {
    assert.equal(await review.locator('article').count(), 3);
    assert.equal(
      await review
        .locator('img')
        .evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)),
      true,
    );
  });
  await capture(review, 'comparison-1440x900');
  await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).destroy(), reviewId);
  assert.deepEqual(results.errors, []);
  results.pass = true;
} catch (error) {
  results.pass = false;
  results.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  const json = await format(JSON.stringify(results), { parser: 'json' });
  await writeFile(join(output, 'results.json'), json);
  if (publishEvidence) await writeFile(join(evidence, 'results.json'), json);
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  console.log(
    JSON.stringify({
      pass: results.pass,
      checks: results.checks.length,
      failure: results.failure,
      output,
    }),
  );
}

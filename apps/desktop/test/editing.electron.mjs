import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, 'test-artifacts');
await mkdir(artifacts, { recursive: true });
const directory = await mkdtemp(join(artifacts, 'editing-'));
const path = join(directory, 'edited.auralide.json');
const packaged = process.argv.includes('--portable');
await writeFile(
  join(artifacts, packaged ? 'portable-editing.json' : 'editing.json'),
  JSON.stringify({ passed: false, status: 'running' }),
);
const manifest = packaged
  ? JSON.parse(await readFile(join(artifacts, 'portable-build.json'), 'utf8'))
  : null;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.AURALIDE_DEV_SERVER_URL;
const checks = [];
const errors = [];
let app, page;
const check = (name, actual, expected = true) => {
  assert.deepEqual(actual, expected, name);
  checks.push(name);
  console.log('ok  ' + name);
};
const value = () => page.evaluate(() => window.auralide.getDocument());
const ready = () =>
  page.waitForFunction(
    () =>
      document.querySelector('[data-testid="demo-workspace"]')?.getAttribute('aria-busy') ===
      'false',
  );
const launch = async () => {
  app = await _electron.launch({
    ...(manifest ? { executablePath: manifest.executable } : {}),
    args: [
      ...(manifest ? [] : ['.', '--auralide-visual-test']),
      '--user-data-dir=' + join(directory, 'profile'),
    ],
    cwd: root,
    env,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.getByTestId('document-text-input').waitFor();
  await ready();
};
const close = async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await app.close().catch(() => undefined);
  app = undefined;
};
try {
  await launch();
  const identity = await app.evaluate(({ app }) => ({
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    packaged: app.isPackaged,
    version: app.getVersion(),
  }));
  check(
    'actual runtime is supported',
    ['win32/x64', 'darwin/arm64'].includes(`${identity.platform}/${identity.arch}`),
  );
  if (manifest) {
    check('actual packaged executable booted', identity.packaged);
    check('packaged version matches manifest', identity.version, manifest.version);
    const licenses = await readFile(join(manifest.directory, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
    check(
      'bundled runtime dependency notices retained',
      licenses.includes('react@') && licenses.includes('zod@'),
    );
    // A Chromium sandbox abort happens before any application code runs, so the app cannot report
    // it; the package must therefore ship the diagnostic launcher that turns the exit code into an
    // explanation (issue #32).
    const launcherPath = join(manifest.directory, '启动诊断.cmd');
    const launcher = await readFile(launcherPath, 'utf8');
    check(
      'package ships the startup diagnostic launcher',
      launcher.includes('AURALIDE_EXIT') && launcher.includes('-2147483645'),
    );
    check(
      'launcher explains the sandbox abort instead of failing silently',
      launcher.includes('STATUS_BREAKPOINT') && launcher.includes('pause'),
    );
  }
  await page.getByTestId('document-text-input').fill('Portable editing round trip');
  await page.getByTestId('document-apply').click();
  await ready();
  const font = page.getByLabel('字号（px）', { exact: true });
  await font.fill('48');
  await font.press('Tab');
  await page.waitForFunction(() =>
    window.auralide.getDocument().then((d) => d.slides[0].elements[0].style.fontSize === 48),
  );
  check(
    'font size committed through Core',
    (await value()).slides[0].elements[0].style.fontSize,
    48,
  );
  await page.getByRole('button', { name: '粗体', exact: true }).click();
  await ready();
  check('bold toggles through Core', (await value()).slides[0].elements[0].style.fontWeight, 400);
  await page.getByLabel('文字对齐', { exact: true }).selectOption('center');
  await ready();
  check(
    'paragraph alignment committed',
    (await value()).slides[0].elements[0].style.align,
    'center',
  );
  await page.getByLabel('文字颜色', { exact: true }).fill('#22cc88');
  await ready();
  check('text color committed', (await value()).slides[0].elements[0].style.color, '#22cc88');
  await page.getByRole('button', { name: '排列', exact: true }).click();
  const width = page.getByLabel('width（像素）', { exact: true });
  await width.fill('640');
  await width.press('Tab');
  await page.waitForFunction(() =>
    window.auralide.getDocument().then((d) => d.slides[0].elements[0].geometry.width === 640),
  );
  check(
    'width editing commits geometry',
    (await value()).slides[0].elements[0].geometry.width,
    640,
  );
  const beforeInvalid = await value();
  await page.getByLabel('width（像素）', { exact: true }).fill('0');
  await page.getByLabel('width（像素）', { exact: true }).press('Tab');
  check('invalid geometry preserves document', await value(), beforeInvalid);
  await page.getByTestId('demo-add-rectangle').click();
  await ready();
  const shapeId = (await value()).slides[0].elements[1].id;
  await page.getByRole('button', { name: '置于底层', exact: true }).click();
  await ready();
  check(
    'paint-order action reorders stable objects',
    (await value()).slides[0].elements[0].id,
    shapeId,
  );
  await page.getByTestId('document-undo').click();
  await ready();
  check('document undo restores paint order', (await value()).slides[0].elements[1].id, shapeId);
  await page.getByTestId('document-redo').click();
  await ready();
  check('document redo reapplies paint order', (await value()).slides[0].elements[0].id, shapeId);
  await page.getByTestId('demo-add-slide').click();
  await ready();
  const beforePlayback = await value();
  await page.getByRole('button', { name: '当前页演示', exact: true }).click();
  const presentation = page.getByRole('dialog', { name: '幻灯片演示', exact: true });
  await presentation.waitFor();
  check(
    'presentation starts on current slide',
    await presentation.locator('output').textContent(),
    '2 / 2',
  );
  await presentation.getByRole('button', { name: '上一页', exact: true }).click();
  check(
    'presentation previous navigation',
    await presentation.locator('output').textContent(),
    '1 / 2',
  );
  await presentation.press('ArrowRight');
  check(
    'presentation keyboard navigation',
    await presentation.locator('output').textContent(),
    '2 / 2',
  );
  await presentation.press('Escape');
  await presentation.waitFor({ state: 'hidden' });
  check('presentation does not edit document', await value(), beforePlayback);
  await page.getByRole('button', { name: '从头演示', exact: true }).click();
  await presentation.waitFor();
  check(
    'presentation can start from first slide',
    await presentation.locator('output').textContent(),
    '1 / 2',
  );
  await presentation.press('Escape');
  await presentation.waitFor({ state: 'hidden' });
  await page.locator('[data-workspace="aura"]').click();
  await page.getByText('预览已就绪', { exact: true }).waitFor();
  await page.getByRole('button', { name: '当前页演示', exact: true }).click();
  await presentation.waitFor();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
      ),
  );
  const guestVisibility = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]
      .contentView.children.filter((view) => 'webContents' in view)
      .map((view) => view.getVisible()),
  );
  check(
    'presentation suspends every native Aura guest',
    guestVisibility.length > 0 && guestVisibility.every((visible) => !visible),
  );
  await presentation.press('Escape');
  await presentation.waitFor({ state: 'hidden' });
  await page.locator('[data-workspace="editor"]').click();
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, path);
  await page.getByTestId('document-save').click();
  await ready();
  const saved = JSON.parse(await readFile(path, 'utf8'));
  check(
    'real file preserves formatted and reordered content',
    saved.slides,
    (await value()).slides,
  );
  await close();
  await launch();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, path);
  await page.getByTestId('document-open').click();
  await ready();
  check('actual restart and reopen preserves edited slides', (await value()).slides, saved.slides);
  const status = await page.evaluate(() => window.auralide.getDocumentStatus());
  check('reopen resets session-only history', status.canUndo || status.canRedo, false);
  await page.screenshot({ path: join(directory, 'reopened.png') });
  check('no renderer exceptions', errors, []);
  await close();
  await writeFile(
    join(artifacts, packaged ? 'portable-editing.json' : 'editing.json'),
    JSON.stringify(
      {
        passed: true,
        identity,
        manifest,
        checks,
        screenshot: join(directory, 'reopened.png'),
        document: path,
      },
      null,
      2,
    ),
  );
  console.log(`${packaged ? 'portable EXE' : 'editing'}: ${checks.length}/${checks.length} PASS`);
} finally {
  if (app) {
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
      )
      .catch(() => undefined);
    await app.close().catch(() => undefined);
  }
}

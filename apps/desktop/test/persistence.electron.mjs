import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, 'test-artifacts');
await mkdir(artifacts, { recursive: true });
const directory = await mkdtemp(join(artifacts, 'persistence-'));
const path = join(directory, 'roundtrip.auralide.json');
const corrupt = join(directory, 'corrupt.json');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.AURALIDE_DEV_SERVER_URL;
let app;
const checks = [];
await writeFile(
  join(artifacts, 'persistence.json'),
  JSON.stringify({ passed: false, status: 'running' }),
);
const check = (name, actual, expected) => {
  assert.deepEqual(actual, expected, name);
  checks.push(name);
};
const launch = async () => {
  app = await _electron.launch({ args: ['.'], cwd: root, env });
  const page = await app.firstWindow();
  await page.getByTestId('document-text-input').waitFor();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="document-revision"]')?.textContent !== '—',
  );
  // Only native user selection/confirmation is stubbed; IPC, session, disk I/O and renderer are real.
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    dialog.showMessageBoxSync = () => 0;
  }, path);
  return page;
};
const edit = async (page, text) => {
  await page.getByTestId('document-text-input').fill(text);
  await page.getByTestId('document-apply').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="document-status"]')?.textContent === '文本已更新',
  );
};
const closeSavedWindow = async (page) => {
  const closed = page.waitForEvent('close');
  await app
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    .catch(() => undefined);
  await closed;
  await app.close().catch(() => undefined);
  app = undefined;
};

try {
  let page = await launch();
  await edit(page, 'P2A saved once');
  await page.getByTestId('document-save').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="document-status"]')?.textContent?.startsWith('已保存 · '),
  );
  check(
    'first save persists Core edit',
    JSON.parse(await readFile(path, 'utf8')).slides[0].elements[0].text,
    'P2A saved once',
  );
  const firstBytes = await readFile(path, 'utf8');
  await edit(page, 'P2A survives application restart');
  await page.getByTestId('document-save').click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="document-status"]')
      ?.textContent?.includes('已保留恢复备份'),
  );
  const backup = (await readdir(directory)).find((name) => name.endsWith('.bak'));
  check(
    'resave retains exact previous file',
    await readFile(join(directory, backup), 'utf8'),
    firstBytes,
  );
  const saved = JSON.parse(await readFile(path, 'utf8'));
  check('resave increments through Core', saved.revision, 2);
  const invalid = await page.evaluate(() =>
    window.auralide.saveDocument({ expectedRevision: 2, path: 'C:/forbidden.json' }),
  );
  check('renderer cannot choose a file path', invalid.error?.code, 'invalid-input');
  const stale = await page.evaluate(() => window.auralide.saveDocument({ expectedRevision: 1 }));
  check('stale save refused', stale.error?.code, 'stale-revision');
  const forged = await app.evaluate(async ({ BrowserWindow }) => {
    const other = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
    });
    try {
      await other.loadURL('about:blank');
      return await other.webContents.executeJavaScript(
        `require('electron').ipcRenderer.invoke('auralide:save-document',{expectedRevision:2}).then(()=>false,()=>true)`,
      );
    } finally {
      other.destroy();
    }
  });
  check('file IPC from another window refused', forged, true);
  await edit(page, 'Unsaved value');
  await page.getByTestId('document-open').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="document-status"]')?.textContent?.includes('已取消'),
  );
  check(
    'declining discard retains current content',
    (await page.evaluate(() => window.auralide.getDocument())).slides[0].elements[0].text,
    'Unsaved value',
  );
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  await page.getByTestId('document-open').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="document-status"]')?.textContent?.startsWith('已打开 · '),
  );
  check(
    'reopen fences previous revision',
    Number(await page.getByTestId('document-revision').textContent()),
    4,
  );
  check(
    'reopen restores saved content',
    await page.getByTestId('document-text-input').inputValue(),
    'P2A survives application restart',
  );
  await closeSavedWindow(page);
  check('saved application window really closed', page.isClosed(), true);

  page = await launch();
  check(
    'new process begins with sample, no hidden file grant',
    Number(await page.getByTestId('document-revision').textContent()),
    0,
  );
  await page.getByTestId('document-open').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="document-status"]')?.textContent?.startsWith('已打开 · '),
  );
  check(
    'reopen after restart restores text',
    await page.getByTestId('document-text-input').inputValue(),
    'P2A survives application restart',
  );
  check(
    'saved revision respected after restart',
    Number(await page.getByTestId('document-revision').textContent()),
    3,
  );
  await page.locator('[data-workspace="aura"]').click();
  await page.waitForFunction(async () => {
    const result = await window.auralide.auraInvoke({ tool: 'browser.listTabs', input: {} });
    return result.ok && result.value.some((item) => item.mode === 'slide-preview');
  });
  const tabs = await page.evaluate(() =>
    window.auralide.auraInvoke({ tool: 'browser.listTabs', input: {} }),
  );
  const tab = tabs.value.find((item) => item.mode === 'slide-preview');
  const inspected = await page.evaluate(
    (tab) =>
      window.auralide.auraInvoke({
        tool: 'preview.inspectElement',
        input: { tabId: tab.id, elementId: 'el_title', expectedRevision: tab.revision },
      }),
    tab,
  );
  check(
    'reopened document drives actual HTML guest',
    inspected.value?.text,
    'P2A survives application restart',
  );
  await page.waitForFunction(async (tab) => {
    const result = await window.auralide.auraInvoke({
      tool: 'preview.getDiagnostics',
      input: { tabId: tab.id, expectedRevision: tab.revision },
    });
    return result.ok && result.value.visible;
  }, tab);
  const capture = await page.evaluate(
    (tab) =>
      window.auralide.auraInvoke({
        tool: 'preview.screenshot',
        input: { tabId: tab.id, expectedRevision: tab.revision },
      }),
    tab,
  );
  check('reopened HTML guest screenshot succeeds', capture.ok, true);
  const png = Buffer.from(capture.value.base64, 'base64');
  check('reopened HTML screenshot is PNG', png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  await writeFile(join(artifacts, 'p2a-html-preview.png'), png);
  await page.screenshot({ path: join(artifacts, 'p2a-reopened.png') });
  await writeFile(corrupt, '{');
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, corrupt);
  const before = await page.evaluate(() => window.auralide.getDocument());
  const refused = await page.evaluate(
    (revision) => window.auralide.openDocument({ expectedRevision: revision }),
    before.revision,
  );
  check('corrupt file refusal is typed', refused.error?.code, 'invalid-json');
  check(
    'corrupt open preserves live document',
    await page.evaluate(() => window.auralide.getDocument()),
    before,
  );
  await page.locator('[data-workspace="editor"]').click();
  await edit(page, 'Keep this unsaved edit');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  check('cancel close retains window', page.isClosed(), false);
  check(
    'cancel close retains unsaved text',
    await page.getByTestId('document-text-input').inputValue(),
    'Keep this unsaved edit',
  );
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await closeSavedWindow(page);
  check('explicit discard closes window', page.isClosed(), true);
  check(
    'discard does not overwrite saved file',
    JSON.parse(await readFile(path, 'utf8')).slides[0].elements[0].text,
    saved.slides[0].elements[0].text,
  );
  await writeFile(
    join(artifacts, 'persistence.json'),
    JSON.stringify(
      { passed: true, platform: process.platform, arch: process.arch, checks },
      null,
      2,
    ),
  );
  console.log(
    `persistence: ${checks.length}/${checks.length} PASS (${process.platform}/${process.arch})`,
  );
} finally {
  if (app !== undefined) {
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
      )
      .catch(() => undefined);
    await app.close().catch(() => undefined);
  }
}

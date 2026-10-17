import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, 'test-artifacts', 'shell');
await mkdir(artifacts, { recursive: true });
const directory = await mkdtemp(join(artifacts, 'files-'));
const sample = join(directory, 'studio.auralide.json');
const savedPath = join(directory, 'saved.auralide.json');
await copyFile(join(root, '../../docs/examples/studio-notes.auralide.json'), sample);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.AURALIDE_DEV_SERVER_URL;
await writeFile(
  join(artifacts, 'shell.json'),
  JSON.stringify({ passed: false, status: 'running' }),
);
const checks = [];
const errors = [];
let display;
let app;
let page;
const check = (name, actual, expected = true) => {
  assert.deepEqual(actual, expected, name);
  checks.push(name);
  console.log('ok  ' + name);
};
const status = async (text) =>
  page.waitForFunction(
    (text) =>
      document.querySelector('[data-testid="document-status"]')?.textContent?.includes(text),
    text,
  );
const documentValue = () => page.evaluate(() => window.auralide.getDocument());
const launch = async () => {
  app = await _electron.launch({
    args: ['.', '--auralide-visual-test', '--user-data-dir=' + join(directory, 'profile')],
    cwd: root,
    env,
  });
  page = await app.firstWindow();
  display = await app.evaluate(({ screen }) => {
    const { size, workAreaSize, scaleFactor } = screen.getPrimaryDisplay();
    return { size, workAreaSize, scaleFactor };
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.getByTestId('document-text-input').waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="demo-workspace"]')?.getAttribute('aria-busy') ===
      'false',
  );
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    dialog.showMessageBoxSync = () => 0;
  }, sample);
};
const edit = async (value) => {
  await page.getByTestId('document-text-input').fill(value);
  await page.getByTestId('document-apply').click();
  await status('文本已更新');
};
const open = async () => {
  await page.getByTestId('document-open').click();
  await status('已打开');
};
const changeWorkspace = async (name) => {
  await page.locator(`[data-workspace="${name}"]`).click();
  if (name === 'editor') await page.getByTestId('slide-preview').waitFor();
};
const preview = async () => {
  await page.waitForFunction(async () => {
    const tabs = await window.auralide.auraInvoke({ tool: 'browser.listTabs', input: {} });
    const tab = tabs.ok && tabs.value.find((item) => item.mode === 'slide-preview');
    if (!tab) return false;
    const state = await window.auralide.auraInvoke({
      tool: 'preview.getDiagnostics',
      input: { tabId: tab.id, expectedRevision: tab.revision },
    });
    return state.ok && state.value.visible;
  });
  const result = await page.evaluate(() =>
    window.auralide.auraInvoke({ tool: 'browser.listTabs', input: {} }),
  );
  return result.value.find((item) => item.mode === 'slide-preview');
};
const close = async () => {
  const closed = page.waitForEvent('close');
  await app
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    .catch(() => undefined);
  await closed;
  await app.close().catch(() => undefined);
  app = undefined;
};

try {
  await launch();
  check(
    'normal shell has no developer probes or iframe',
    await page
      .locator(
        '[data-testid="runtime-status"],[data-testid="ipc-ping-button"],[data-testid="aura-result"],iframe',
      )
      .count(),
    0,
  );
  await edit('Keep the local edit');
  check(
    'applying text returns keyboard focus to the editor',
    await page
      .getByTestId('document-text-input')
      .evaluate((element) => element === document.activeElement),
  );
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true });
  });
  await page.getByTestId('document-save').click();
  await status('已取消');
  check(
    'save cancellation preserves dirty Core content',
    (await documentValue()).slides[0].elements[0].text,
    'Keep the local edit',
  );
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, directory);
  await page.getByTestId('document-save').click();
  await status('已保留');
  check(
    'real filesystem failure preserves dirty state',
    (await page.evaluate(() => window.auralide.getDocumentStatus())).dirty,
  );
  check(
    'real filesystem failure preserves current content',
    (await documentValue()).slides[0].elements[0].text,
    'Keep the local edit',
  );
  await open();
  check(
    'native open reads three real slides',
    await page.getByTestId('demo-slide-item').count(),
    3,
  );
  await page.getByTestId('document-text-input').fill('Unapplied close draft');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  check('unapplied draft prevents close when discard declined', page.isClosed(), false);
  check(
    'unapplied close draft remains',
    await page.getByTestId('document-text-input').inputValue(),
    'Unapplied close draft',
  );
  await page.getByTestId('document-text-input').press('Escape');

  // The example is a real schema document; it enters main through the native open path.
  await page.getByRole('button', { name: '主标题', exact: true }).last().click();
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
    for (const theme of ['light', 'dark']) {
      await page.getByRole('combobox', { name: '主题' }).selectOption(theme);
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      const layout = await page.evaluate(() => {
        const rect = (selector) =>
          document.querySelector(selector).getBoundingClientRect().toJSON();
        return {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          canvas: rect('.slide-frame'),
          left: rect('.slide-rail'),
          right: rect('.right-panel'),
          stage: rect('.canvas-stage'),
        };
      });
      check(
        `${width}/${theme}: no full page scroll`,
        [layout.scrollWidth, layout.scrollHeight],
        [width, height],
      );
      check(
        `${width}/${theme}: canvas at least 720 by 405`,
        layout.canvas.width >= 720 && layout.canvas.height >= 405,
      );
      check(
        `${width}/${theme}: stable panels do not overlap canvas`,
        layout.canvas.x >= layout.left.right &&
          layout.canvas.right <= layout.right.x &&
          layout.canvas.y >= layout.stage.y &&
          layout.canvas.bottom <= layout.stage.bottom,
      );
      await page.screenshot({ path: join(artifacts, `a2-${theme}-${width}x${height}-editor.png`) });
      await changeWorkspace('aura');
      await preview();
      // CDP renderer screenshots omit sibling WebContentsViews; capture both real surfaces separately.
      await page.screenshot({
        path: join(artifacts, `a2-${theme}-${width}x${height}-aura-shell.png`),
      });
      await page.waitForFunction(
        async () => {
          const tabs = await window.auralide.auraInvoke({ tool: 'browser.listTabs', input: {} });
          const tab = tabs.value.find((item) => item.mode === 'slide-preview');
          const result = await window.auralide.auraInvoke({
            tool: 'preview.screenshot',
            input: { tabId: tab.id, expectedRevision: tab.revision },
          });
          return result.ok;
        },
        undefined,
        { timeout: 10000 },
      );
      const capture = await page.evaluate(async () => {
        const tabs = await window.auralide.auraInvoke({ tool: 'browser.listTabs', input: {} });
        const tab = tabs.value.find((item) => item.mode === 'slide-preview');
        return window.auralide.auraInvoke({
          tool: 'preview.screenshot',
          input: { tabId: tab.id, expectedRevision: tab.revision },
        });
      });
      check(`${width}/${theme}: native preview captured`, capture.ok);
      await writeFile(
        join(artifacts, `a2-${theme}-${width}x${height}-aura-guest.png`),
        Buffer.from(capture.value.base64, 'base64'),
      );
      await changeWorkspace('editor');
      check(
        `${width}/${theme}: Aura return preserves selected text`,
        await page.getByTestId('document-text-input').inputValue(),
        '把想法，变成\n下一次出发。',
      );
    }
  }
  await page.getByRole('combobox', { name: '主题' }).selectOption('system');
  for (const colorScheme of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme });
    await page.waitForFunction(
      (value) => document.documentElement.dataset.theme === value,
      colorScheme,
    );
    check(
      `System follows ${colorScheme}`,
      await page.evaluate(() => document.documentElement.dataset.theme),
      colorScheme,
    );
  }
  await page.getByRole('combobox', { name: '主题' }).selectOption('light');
  const title = page.locator('[data-element-id="el_cover_title"]');
  await title.focus();
  await page.keyboard.press('Enter');
  check(
    'keyboard SVG selection matches layer selection',
    await page
      .getByTestId('demo-layer-item')
      .filter({ hasText: '主标题' })
      .getAttribute('aria-pressed'),
    'true',
  );
  const layer = page.getByTestId('demo-layer-item').filter({ hasText: '暖橙色块' });
  await layer.click();
  await layer.press('ArrowRight');
  await page.waitForFunction(
    async () =>
      (await window.auralide.getDocument()).slides[0].elements.find(
        (item) => item.id === 'el_cover_orange',
      ).geometry.x === 917,
  );
  check(
    'keyboard nudge preserves layer focus',
    await layer.evaluate((element) => element === document.activeElement),
  );
  await layer.press('Shift+ArrowRight');
  await page.waitForFunction(
    async () =>
      (await window.auralide.getDocument()).slides[0].elements.find(
        (item) => item.id === 'el_cover_orange',
      ).geometry.x === 927,
  );
  check(
    'repeated keyboard nudge uses actual Core geometry',
    (await documentValue()).slides[0].elements.find((item) => item.id === 'el_cover_orange')
      .geometry.x,
    927,
  );
  const shapeBox = await page.locator('[data-element-id="el_cover_orange"]').boundingBox();
  const canvasBox = await page.getByTestId('slide-preview').boundingBox();
  await page.mouse.move(shapeBox.x + 16, shapeBox.y + 16);
  await page.mouse.down();
  await page.mouse.move(shapeBox.x + 36, shapeBox.y + 16);
  await page.mouse.up();
  const draggedX = Math.round(927 + 20 / (canvasBox.width / 1280));
  await page.waitForFunction(
    async (x) =>
      (await window.auralide.getDocument()).slides[0].elements.find(
        (item) => item.id === 'el_cover_orange',
      ).geometry.x === x,
    draggedX,
  );
  check(
    'pointer drag commits document-space coordinates through Core',
    (await documentValue()).slides[0].elements.find((item) => item.id === 'el_cover_orange')
      .geometry.x,
    draggedX,
  );
  await page.getByRole('button', { name: '排列', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="demo-workspace"]')?.getAttribute('aria-busy') ===
      'false',
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
      ),
  );
  const frame = await page.getByTestId('slide-preview').boundingBox();
  const shapePng = await page.screenshot({
    path: join(artifacts, 'a2-light-1440x900-shape.png'),
    scale: 'css',
  });
  const circleColor = await app.evaluate(
    ({ nativeImage }, input) => {
      const image = nativeImage.createFromBuffer(Buffer.from(input.png, 'base64'));
      const bytes = image.toBitmap();
      const offset = (Math.round(input.y) * image.getSize().width + Math.round(input.x)) * 4;
      return [bytes[offset + 2], bytes[offset + 1], bytes[offset]];
    },
    {
      png: shapePng.toString('base64'),
      x: frame.x + (1058 * frame.width) / 1280,
      y: frame.y + (208 * frame.height) / 720,
    },
  );
  check('moving a back layer preserves the visible front circle', circleColor, [241, 198, 167]);
  const slideCount = (await documentValue()).slides.length;
  await page.getByTestId('demo-add-slide').click();
  await page.waitForFunction(
    async (count) => (await window.auralide.getDocument()).slides.length === count,
    slideCount + 1,
  );
  await page.getByTestId('demo-delete-slide').click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  check(
    'cancel slide deletion retains real slide',
    (await documentValue()).slides.length,
    slideCount + 1,
  );
  await page.getByTestId('demo-delete-slide').click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.waitForFunction(
    async (count) => (await window.auralide.getDocument()).slides.length === count,
    slideCount,
  );
  check('confirmed slide deletion uses Core', (await documentValue()).slides.length, slideCount);
  await page.getByRole('button', { name: '格式', exact: true }).click();
  await page.getByTestId('demo-layer-item').filter({ hasText: '主标题' }).click();
  await changeWorkspace('aura');
  const tab = await preview();
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  const hidden = await page.evaluate(
    (tab) =>
      window.auralide.auraInvoke({
        tool: 'preview.getDiagnostics',
        input: { tabId: tab.id, expectedRevision: tab.revision },
      }),
    tab,
  );
  check('native guest hidden before shell modal', hidden.value.visible, false);
  await page.keyboard.press('Escape');
  check(
    'modal Escape restores file trigger focus',
    await page
      .getByRole('button', { name: '文件', exact: true })
      .evaluate((element) => element === document.activeElement),
  );
  await preview();
  const escaped = await app.evaluate(async ({ BrowserWindow, webContents }) => {
    const main = BrowserWindow.getAllWindows()[0];
    const guest = webContents
      .getAllWebContents()
      .find((item) => item.getURL().startsWith('data:text/html'));
    guest.focus();
    guest.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return webContents.getFocusedWebContents()?.id === main.webContents.id;
  });
  check('native guest Escape returns host focus', escaped);
  await changeWorkspace('editor');
  await page.getByRole('button', { name: '格式', exact: true }).click();
  await page.getByTestId('demo-layer-item').filter({ hasText: '主标题' }).click();
  await page.getByTestId('document-text-input').fill('跨工作区保留的草稿');
  await changeWorkspace('aura');
  await preview();
  await changeWorkspace('editor');
  check(
    'Aura round trip preserves unapplied text',
    await page.getByTestId('document-text-input').inputValue(),
    '跨工作区保留的草稿',
  );
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await page.getByTestId('document-open').click();
  await page.getByRole('button', { name: '继续选择文件' }).click();
  await status('已取消');
  check(
    'open cancellation keeps unapplied draft',
    await page.getByTestId('document-text-input').inputValue(),
    '跨工作区保留的草稿',
  );
  await page.getByTestId('document-save').click();
  await page.getByRole('button', { name: '应用文本并保存' }).click();
  await status('已保存');
  check(
    'save commits pending text through Dispatcher to actual file',
    JSON.parse(await readFile(sample, 'utf8')).slides[0].elements.find(
      (item) => item.id === 'el_cover_title',
    ).text,
    '跨工作区保留的草稿',
  );
  await copyFile(sample, savedPath);
  await edit('保存冲突也要保留');
  const externalBytes = (await readFile(sample, 'utf8')) + '\n';
  await writeFile(sample, externalBytes);
  await page.getByTestId('document-save').click();
  await status('保存已拒绝');
  check(
    'external file conflict keeps unsaved Core content',
    (await documentValue()).slides[0].elements.find((item) => item.id === 'el_cover_title').text,
    '保存冲突也要保留',
  );
  check(
    'conflict does not overwrite external bytes',
    await readFile(sample, 'utf8'),
    externalBytes,
  );
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, savedPath);
  await open();
  await close();
  check('saved application actually closed', page.isClosed());
  await launch();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, savedPath);
  await open();
  await page.getByTestId('demo-layer-item').filter({ hasText: '主标题' }).click();
  check(
    'fresh process reopens actual saved text',
    await page.getByTestId('document-text-input').inputValue(),
    '跨工作区保留的草稿',
  );
  await changeWorkspace('aura');
  const reopened = await preview();
  const inspected = await page.evaluate(
    (tab) =>
      window.auralide.auraInvoke({
        tool: 'preview.inspectElement',
        input: { tabId: tab.id, elementId: 'el_cover_title', expectedRevision: tab.revision },
      }),
    reopened,
  );
  check(
    'fresh process native Aura renders reopened file',
    inspected.value.text,
    '跨工作区保留的草稿',
  );
  check('no renderer exceptions', errors, []);
  await writeFile(
    join(artifacts, 'shell.json'),
    JSON.stringify(
      { passed: true, platform: process.platform, arch: process.arch, display, checks },
      null,
      2,
    ),
  );
  console.log(
    `shell: ${checks.length}/${checks.length} PASS (${process.platform}/${process.arch})`,
  );
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

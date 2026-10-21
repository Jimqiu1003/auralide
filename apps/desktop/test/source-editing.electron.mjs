import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';

const root = dirname(dirname(fileURLToPath(import.meta.url))),
  artifacts = join(root, 'test-artifacts', 'source-editing');
await mkdir(artifacts, { recursive: true });
const directory = await mkdtemp(join(artifacts, 'run-'));
const sourcePath = join(directory, 'source.html'),
  exportPath = join(directory, 'edited.html'),
  imagePath = join(directory, 'replacement.svg');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
await writeFile(join(directory, 'old.png'), png);
await writeFile(
  imagePath,
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#3159bc"/></svg>',
);
const original =
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}.slide{position:relative;width:1280px;height:720px;background:#f7f8fa}h1{position:absolute;left:80px;top:100px;margin:0;font:40px Arial;color:#172033}img{position:absolute;left:80px;top:250px;width:160px;height:160px}#dynamic{position:absolute;left:400px;top:250px;font:24px Arial}</style></head><body><main class="slide"><h1 id="heading">Original heading</h1><img src="old.png" alt="Original image"><p id="dynamic">Scripts disabled</p><span id="font-sample" style="position:absolute;left:400px;top:400px">FONT</span></main><script>globalThis.sourceExecuted=true;document.getElementById("dynamic").textContent="Dynamic playback preserved";</script></body></html>';
await writeFile(sourcePath, original);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.AURALIDE_DEV_SERVER_URL;
let app, page;
const checks = [],
  errors = [];
const check = (name, actual, expected = true) => {
  assert.deepEqual(actual, expected, name);
  checks.push(name);
  console.log('ok ' + name);
};
const launch = async () => {
  app = await _electron.launch({
    args: ['.', '--auralide-visual-test', '--user-data-dir=' + join(directory, 'profile')],
    cwd: root,
    env,
  });
  page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.waitForFunction(
    () =>
      window.auralide &&
      document.querySelector('[data-testid="demo-workspace"]')?.getAttribute('aria-busy') ===
        'false',
  );
};
const dialogs = async (open, save) =>
  app.evaluate(
    ({ dialog }, paths) => {
      dialog.showOpenDialog = async (_window, options) => ({
        canceled: paths.open === null,
        filePaths: paths.open
          ? [options.properties.includes('openDirectory') ? paths.directory : paths.open]
          : [],
      });
      dialog.showSaveDialog = async () => ({
        canceled: paths.save === null,
        filePath: paths.save ?? undefined,
      });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      dialog.showMessageBoxSync = () => 1;
    },
    { open, save, directory },
  );
const doc = () => page.evaluate(() => window.auralide.getDocument());
const request = () =>
  page.evaluate(async () => {
    const d = await window.auralide.getDocument(),
      s = d.slides[0],
      e = s.elements[0];
    return {
      expectedRevision: d.revision,
      expectedSourceRevision: e.sourceRevision,
      slideId: s.id,
      elementId: e.id,
    };
  });
const ready = () =>
  page.waitForFunction(
    () =>
      !document
        .querySelector('[data-testid="source-editor-status"]')
        ?.textContent.includes('正在') &&
      document
        .querySelector('[data-testid="source-editor-status"]')
        ?.textContent.includes('点击预览'),
  );
const native = async (action) =>
  app.evaluate(async ({ webContents }, action) => {
    const view = webContents
      .getAllWebContents()
      .find((c) => c.getURL().startsWith('data:text/html') && !c.isDestroyed());
    if (!view) throw new Error('No source view');
    if (action === 'security')
      return view.executeJavaScript(
        '({bridge:typeof window.auralide,node:typeof process,ran:globalThis.sourceExecuted===true})',
      );
    if (action === 'position')
      return view.executeJavaScript(
        '(()=>{const node=document.getElementById("heading"),r=node.getBoundingClientRect();return {left:node.style.left,top:node.style.top,x:r.x,y:r.y,translate:getComputedStyle(node).translate,fontSize:getComputedStyle(node).fontSize}})()',
      );
    if (action === 'image')
      return view.executeJavaScript(
        '({src:document.querySelector("img").src,loaded:document.querySelector("img").naturalWidth>0})',
      );
    if (action === 'fonts')
      return view.executeJavaScript(
        'document.fonts.ready.then(()=>Array.from(document.fonts).map(font=>({family:font.family,status:font.status})))',
      );
    if (action === 'capture') return (await view.capturePage()).toPNG().toString('base64');
  }, action);
const close = async () => {
  if (!app) return;
  await app
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
    .catch(() => {});
  await app.close().catch(() => {});
  app = undefined;
};
try {
  await launch();
  await dialogs(sourcePath, exportPath);
  const imported = await page.evaluate(async () =>
    window.auralide.importSourceHtml({
      expectedRevision: (await window.auralide.getDocument()).revision,
    }),
  );
  check('source import succeeds', imported.ok);
  if (!imported.ok) throw new Error(imported.error.message);
  await page.getByTestId('document-reload').click();
  await page.getByTestId('edit-source-elements').click();
  await ready();
  check(
    'internal editor is a real dialog',
    await page.getByTestId('source-editor-dialog').isVisible(),
  );
  check('source editing stays inert and unprivileged', await native('security'), {
    bridge: 'undefined',
    node: 'undefined',
    ran: false,
  });
  const picker = page.getByLabel('源码节点', { exact: true });
  await picker.selectOption({ label: 'h1 · Original heading' });
  await page.getByLabel('节点文字', { exact: true }).fill('Edited inside HTML');
  const stale = await request();
  await page.getByRole('button', { name: '应用节点文字', exact: true }).click();
  await ready();
  check(
    'text edit creates a new source revision',
    (await doc()).slides[0].elements[0].sourceRevision,
    1,
  );
  check(
    'stale source command is refused',
    (
      await page.evaluate(
        (request) =>
          window.auralide.editSource({
            ...request,
            change: { type: 'text', nodeId: 'node-2', text: 'must not apply' },
          }),
        stale,
      )
    ).ok,
    false,
  );
  await page.getByLabel('节点字号（px）', { exact: true }).fill('48');
  await page.getByLabel('节点字号（px）', { exact: true }).press('Tab');
  await ready();
  check('visual font size is preserved', (await native('position')).fontSize, '48px');
  await page.getByLabel('相对水平偏移（px）', { exact: true }).fill('24');
  await page.getByLabel('相对水平偏移（px）', { exact: true }).press('Tab');
  await ready();
  check('moving preserves original positioning', (await native('position')).left, '');
  check('offset is applied without layout rewrite', (await native('position')).x, 104);
  check('offset preserves an earlier font edit', (await native('position')).fontSize, '48px');
  const headingId = await picker.inputValue(),
    beforeDrag = await doc();
  const drag = await app.evaluate(async ({ BrowserWindow }) => {
    const child = BrowserWindow.getAllWindows()[0].contentView.children.find((child) =>
      child.webContents?.getURL().startsWith('data:text/html'),
    );
    const view = child.webContents,
      zoom = view.getZoomFactor(),
      point = await view.executeJavaScript(
        '(()=>{const r=document.getElementById("heading").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()',
      );
    const x = Math.round(point.x * zoom),
      y = Math.round(point.y * zoom),
      dx = Math.round(20 * zoom);
    view.focus();
    view.sendInputEvent({ type: 'mouseMove', x, y });
    view.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    view.sendInputEvent({ type: 'mouseMove', x: x + dx, y });
    view.sendInputEvent({ type: 'mouseUp', x: x + dx, y, button: 'left', clickCount: 1 });
    return { visible: child.getVisible(), delta: Math.round(dx / zoom) };
  });
  check('source guest is actually visible inside the modal', drag.visible);
  await page.waitForFunction(
    (revision) =>
      Number(document.querySelector('[data-testid="document-revision"]')?.textContent) > revision,
    beforeDrag.revision,
  );
  await ready();
  check('native pointer drag creates one command', (await doc()).revision, beforeDrag.revision + 1);
  check('native pointer selects the expected heading', await picker.inputValue(), headingId);
  check('native drag applies relative movement', (await native('position')).x, 104 + drag.delta);
  await app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .find((c) => c.getURL().startsWith('data:text/html'))
      .sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }),
  );
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === '源码节点',
  );
  check(
    'Tab returns from the native guest to the property controls',
    await picker.evaluate((node) => node === document.activeElement),
  );
  await picker.selectOption({ label: 'span · FONT' });
  await dialogs(join(root, 'test', 'fixtures', 'Ahem.ttf'), exportPath);
  await page.getByRole('button', { name: '为节点嵌入字体', exact: true }).click();
  await ready();
  check(
    'embedded source font really decodes',
    (await native('fonts')).some(
      (font) => font.family.startsWith('asset-') && font.status === 'loaded',
    ),
  );
  const imageId = await picker
    .locator('option')
    .filter({ hasText: /^img ·/ })
    .first()
    .getAttribute('value');
  await picker.selectOption(imageId);
  const beforeImage = (await doc()).slides[0].elements[0].assetId;
  await dialogs(imagePath, exportPath);
  await page.getByRole('button', { name: '替换内部图片', exact: true }).click();
  await ready();
  check(
    'image replacement is embedded',
    (await native('image')).src.startsWith('data:image/svg+xml;base64,'),
  );
  check('replacement image decodes', (await native('image')).loaded);
  await page.getByRole('button', { name: '撤销源码修改', exact: true }).click();
  await ready();
  check('undo restores the source asset', (await doc()).slides[0].elements[0].assetId, beforeImage);
  await page.getByRole('button', { name: '重做源码修改', exact: true }).click();
  await ready();
  check(
    'redo restores the replacement image',
    (await native('image')).src.startsWith('data:image/svg+xml;base64,'),
  );
  const current = await request(),
    beforeInvalid = await doc();
  const invalid = await page.evaluate(
    (request) =>
      window.auralide.editSource({
        ...request,
        change: { type: 'text', nodeId: 'node-999999', text: 'missing' },
      }),
    current,
  );
  check('missing source nodes refuse edits', invalid.ok, false);
  check('invalid node keeps Core unchanged', await doc(), beforeInvalid);
  const styled = await page.evaluate(
    ({ request, nodeId }) =>
      window.auralide.editSource({
        ...request,
        change: {
          type: 'style',
          nodeId,
          styles: {
            color: '#123456',
            backgroundColor: '#eeeeee',
            borderColor: '#334455',
            borderWidth: 2,
            borderStyle: 'solid',
            opacity: 0.7,
            width: 640,
            height: 90,
          },
        },
      }),
    { request: await request(), nodeId: headingId },
  );
  check('typed appearance edits are accepted', styled.ok);
  await page.getByRole('button', { name: '读取最新源码', exact: true }).click();
  await ready();
  check(
    'appearance edits preserve earlier geometry and font',
    (await native('position')).fontSize,
    '48px',
  );
  check(
    'appearance edits reach the inert source DOM',
    await app.evaluate(async ({ webContents }) =>
      webContents
        .getAllWebContents()
        .find((c) => c.getURL().startsWith('data:text/html'))
        .executeJavaScript(
          '(()=>{const node=document.getElementById("heading"),css=getComputedStyle(node);return [css.color,css.backgroundColor,node.style.borderWidth,css.borderStyle,css.opacity,css.width,node.style.height,Math.abs(parseFloat(css.borderWidth)-2)<=1/devicePixelRatio,Math.abs(parseFloat(css.height)-90)<=1/devicePixelRatio]})()',
        ),
    ),
    ['rgb(18, 52, 86)', 'rgb(238, 238, 238)', '2px', 'solid', '0.7', '640px', '90px', true, true],
  );
  await picker.selectOption(headingId);
  await page.getByLabel('节点文字', { exact: true }).fill('Unapplied node draft');
  await page.getByRole('button', { name: '关闭内部编辑', exact: true }).click();
  await page.getByTestId('edit-source-elements').click();
  await ready();
  check(
    'closing and reopening preserves node input',
    await page.getByLabel('节点文字', { exact: true }).inputValue(),
    'Unapplied node draft',
  );
  const conflict = await page.evaluate(
    ({ request, nodeId }) =>
      window.auralide.editSource({
        ...request,
        change: { type: 'text', nodeId, text: 'Externally updated heading' },
      }),
    { request: await request(), nodeId: headingId },
  );
  check('concurrent canonical text edit succeeds', conflict.ok);
  await page.getByRole('button', { name: '读取最新源码', exact: true }).click();
  await ready();
  check(
    'stale text draft is preserved',
    await page.getByLabel('节点文字', { exact: true }).inputValue(),
    'Unapplied node draft',
  );
  check(
    'stale text draft cannot overwrite newer source',
    await page.getByRole('button', { name: '应用节点文字', exact: true }).isDisabled(),
  );
  await page.getByRole('button', { name: '撤回节点文字输入', exact: true }).click();
  await page.getByLabel('节点文字', { exact: true }).fill('Edited inside HTML');
  await page.getByRole('button', { name: '应用节点文字', exact: true }).click();
  await ready();
  await page.getByRole('button', { name: '源码', exact: true }).click();
  const code = page.getByLabel('HTML 源码', { exact: true });
  check(
    'source tab reflects the canonical edit',
    (await code.inputValue()).includes('Edited inside HTML'),
  );
  const sourceBefore = await code.inputValue();
  await code.fill(sourceBefore.replace('Edited inside HTML', 'Source revision replacement'));
  await code.fill(sourceBefore.replace('</body>', '<img src="missing-picture.png"></body>'));
  const beforeFailure = await doc();
  await page.getByRole('button', { name: '应用源码并检查资源', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="source-editor-status"]')
      ?.textContent.includes('missing-picture.png'),
  );
  check('failed source collection preserves the document', await doc(), beforeFailure);
  check(
    'failed source input stays editable',
    (await code.inputValue()).includes('missing-picture.png'),
  );
  await page.getByRole('button', { name: '关闭内部编辑', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await ready();
  check(
    'file actions reopen unapplied source input',
    await page.getByTestId('source-editor-dialog').isVisible(),
  );
  check(
    'closing preserves failed source input',
    (await code.inputValue()).includes('missing-picture.png'),
  );
  await page.getByRole('button', { name: '撤回源码输入', exact: true }).click();
  await code.fill(sourceBefore.replace('Edited inside HTML', 'Source revision replacement'));
  await page.getByRole('button', { name: '应用源码并检查资源', exact: true }).click();
  await ready();
  check(
    'source replacement creates a new revision',
    (await doc()).slides[0].elements[0].sourceRevision > current.expectedSourceRevision,
  );
  await page.getByRole('button', { name: '可视编辑', exact: true }).click();
  await ready();
  await page.screenshot({ path: join(artifacts, 'source-editor.png') });
  await writeFile(
    join(artifacts, 'source-native.png'),
    Buffer.from(await native('capture'), 'base64'),
  );
  await app.evaluate(({ webContents }) => {
    const view = webContents
      .getAllWebContents()
      .find((c) => c.getURL().startsWith('data:text/html'));
    view.focus();
    view.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  });
  await page.getByTestId('source-editor-dialog').waitFor({ state: 'hidden' });
  check(
    'Escape restores the source editor invoker focus',
    await page
      .getByTestId('edit-source-elements')
      .evaluate((node) => node === document.activeElement),
  );
  check(
    'closing releases the native source guest',
    await app.evaluate(
      ({ webContents }) =>
        webContents
          .getAllWebContents()
          .filter((c) => c.getURL().startsWith('data:text/html') && !c.isDestroyed()).length,
    ),
    0,
  );
  const result = await page.evaluate(async () =>
    window.auralide.exportHtml({
      expectedRevision: (await window.auralide.getDocument()).revision,
    }),
  );
  check('edited source exports', result.ok);
  const html = await readFile(exportPath, 'utf8'),
    bundle = JSON.parse(html.match(/id="auralide-document">(.*?)<\/script>/s)[1]);
  check(
    'embedded font is retained in the exported bundle',
    Object.values(bundle.assets).some((asset) => asset.mime === 'font/ttf'),
  );
  check(
    'old unused image bytes are excluded from the export',
    Object.values(bundle.assets).some((asset) => asset.mime === 'image/png'),
    false,
  );
  check(
    'original source provenance remains in the bundle',
    Object.values(bundle.assets).some(
      (asset) =>
        asset.mime === 'text/html' && Buffer.from(asset.base64, 'base64').toString() === original,
    ),
  );
  await close();
  await launch();
  await dialogs(exportPath, exportPath);
  const reopened = await page.evaluate(async () =>
    window.auralide.openDocument({
      expectedRevision: (await window.auralide.getDocument()).revision,
    }),
  );
  check('edited HTML reopens after actual restart', reopened.ok);
  const playerPromise = app.waitForEvent('window');
  await page.evaluate(async () =>
    window.auralide.playDocument({
      expectedRevision: (await window.auralide.getDocument()).revision,
    }),
  );
  const player = await playerPromise;
  await player.getByRole('button', { name: '启用源 HTML 动态脚本' }).click();
  await player.frameLocator('iframe').getByText('Dynamic playback preserved').waitFor();
  check(
    'source dynamics survive visual edits and restart',
    await player.frameLocator('iframe').locator('#dynamic').innerText(),
    'Dynamic playback preserved',
  );
  check(
    'source revision replacement survives export/reopen',
    await player.frameLocator('iframe').locator('#heading').innerText(),
    'Source revision replacement',
  );
  check(
    'source styles and movement survive export/reopen',
    await player
      .frameLocator('iframe')
      .locator('#heading')
      .evaluate((node) => ({
        fontSize: window.getComputedStyle(node).fontSize,
        x: node.getBoundingClientRect().x,
        opacity: window.getComputedStyle(node).opacity,
      })),
    { fontSize: '48px', x: 104 + drag.delta, opacity: '0.7' },
  );
  await player.close();
  await page.getByTestId('document-reload').click();
  await page.getByTestId('edit-source-elements').click();
  await ready();
  await page.getByLabel('源码节点', { exact: true }).selectOption(headingId);
  await page.getByLabel('节点文字', { exact: true }).fill('Edited after restart');
  await page.getByRole('button', { name: '应用节点文字', exact: true }).click();
  await ready();
  await page.getByRole('button', { name: '关闭内部编辑', exact: true }).click();
  const secondPath = join(directory, 'edited-again.html');
  await dialogs(exportPath, secondPath);
  const second = await page.evaluate(async () =>
    window.auralide.exportHtml({
      expectedRevision: (await window.auralide.getDocument()).revision,
    }),
  );
  check('reopened HTML remains editable and exports again', second.ok);
  const secondHtml = await readFile(secondPath, 'utf8'),
    secondBundle = JSON.parse(secondHtml.match(/id="auralide-document">(.*?)<\/script>/s)[1]);
  check(
    'second export stores the post-restart edit',
    Buffer.from(
      secondBundle.assets[secondBundle.document.slides[0].elements[0].assetId].base64,
      'base64',
    )
      .toString()
      .includes('Edited after restart'),
  );
  check(
    'second export preserves font resources',
    Object.values(secondBundle.assets).some((asset) => asset.mime === 'font/ttf'),
  );
  check('no renderer exceptions', errors, []);
  await writeFile(
    join(artifacts, 'result.json'),
    JSON.stringify(
      { passed: true, checks, platform: process.platform, arch: process.arch, directory },
      null,
      2,
    ),
  );
} catch (error) {
  await page?.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {});
  await writeFile(
    join(artifacts, 'result.json'),
    JSON.stringify({ passed: false, checks, error: String(error), directory }, null, 2),
  );
  throw error;
} finally {
  await close();
}

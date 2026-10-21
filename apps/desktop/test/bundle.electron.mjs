import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron, chromium } from 'playwright-core';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, 'test-artifacts', 'bundle');
await mkdir(artifacts, { recursive: true });
const directory = await mkdtemp(join(artifacts, 'run-'));
const sourcePath = join(directory, 'source.html'),
  htmlPath = join(directory, 'exported.html'),
  jsonPath = join(directory, 'bundle.auralide.json');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
await writeFile(join(directory, 'picture.png'), png);
await writeFile(
  join(directory, 'theme.css'),
  '@import "colors.css"; body{margin:0} .card{width:1280px;height:720px;background-image:url(picture.png)}',
);
await writeFile(join(directory, 'colors.css'), 'h1{color:rgb(21,51,81)}');
await writeFile(join(directory, 'helper.js'), 'export const label="模块已离线运行";');
await writeFile(
  join(directory, 'main.js'),
  'import {label} from "./helper.js"; document.getElementById("state").textContent=label;globalThis.sourceRan=true;',
);
await writeFile(
  sourcePath,
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>离线动态演示</title><link rel="stylesheet" href="theme.css"></head><body><main class="card"><h1 id="heading">保留原有 HTML</h1><img src="picture.png" alt="测试图片"><p id="state">脚本未启用</p><button onclick="document.getElementById(\'state\').textContent=\'交互正常\'">源页面交互</button></main><script type="module" src="main.js"></script></body></html>',
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.AURALIDE_DEV_SERVER_URL;
let app, page, browser;
const checks = [],
  errors = [];
const check = (name, value, expected = true) => {
  assert.deepEqual(value, expected, name);
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
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.waitForFunction(
    () =>
      window.auralide &&
      document.querySelector('[data-testid="demo-workspace"]')?.getAttribute('aria-busy') ===
        'false',
  );
};
const dialogs = async (open, save) =>
  app.evaluate(
    ({ dialog }, values) => {
      dialog.showOpenDialog = async (_window, options) => ({
        canceled: values.open === null,
        filePaths: values.open
          ? [options.properties.includes('openDirectory') ? values.directory : values.open]
          : [],
      });
      dialog.showSaveDialog = async () => ({
        canceled: values.save === null,
        filePath: values.save ?? undefined,
      });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      dialog.showMessageBoxSync = () => 1;
    },
    { open, save, directory },
  );
const invoke = (operation) =>
  page.evaluate(
    async (operation) =>
      window.auralide[operation]({
        expectedRevision: (await window.auralide.getDocument()).revision,
      }),
    operation,
  );
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
  await dialogs(sourcePath, htmlPath);
  const imported = await invoke('importSourceHtml');
  check('dynamic HTML imports intact', imported.ok);
  if (!imported.ok) throw new Error(imported.error.message);
  check(
    'source is a structured component',
    imported.value.document.slides[0].elements[0].kind,
    'source',
  );
  check(
    'source bytes stay outside Core',
    JSON.stringify(imported.value.document).includes('base64'),
    false,
  );
  const assets = await page.evaluate(() => window.auralide.getDocumentAssets());
  check(
    'duplicate image is stored once',
    Object.values(assets).filter((a) => a.mime === 'image/png').length,
    1,
  );
  const dirty = await page.evaluate(() => window.auralide.getDocumentStatus());
  const exported = await invoke('exportHtml');
  check('single-file export succeeds', exported.ok);
  check(
    'export preserves dirty state',
    await page.evaluate(() => window.auralide.getDocumentStatus()),
    dirty,
  );
  const html = await readFile(htmlPath, 'utf8');
  check('export is below final 100 MiB limit', Buffer.byteLength(html) <= 100 * 1024 * 1024);
  check('export metadata includes all assets', html.includes('auralide-bundle-v2'));
  await dialogs(sourcePath, jsonPath);
  check('native bundle saves', (await invoke('saveDocumentAs')).ok);
  const saved = JSON.parse(await readFile(jsonPath, 'utf8'));
  check('native save keeps complete assets', saved.assets, assets);
  await close();
  await launch();
  await dialogs(htmlPath, jsonPath);
  const reopened = await invoke('openDocument');
  check('exported HTML reopens after real restart', reopened.ok);
  check(
    'source revision survives restart',
    reopened.value.document.slides[0].elements[0].sourceRevision,
    0,
  );
  check(
    'resource bytes survive restart',
    await page.evaluate(() => window.auralide.getDocumentAssets()),
    assets,
  );
  const before = await page.evaluate(() => window.auralide.getDocumentStatus());
  await dialogs(null, null);
  check('export cancellation is explicit', (await invoke('exportHtml')).error.code, 'cancelled');
  check(
    'cancel leaves document status unchanged',
    await page.evaluate(() => window.auralide.getDocumentStatus()),
    before,
  );
  const playerPromise = app.waitForEvent('window');
  check('playback opens', (await invoke('playDocument')).ok);
  const player = await playerPromise;
  player.on('console', (message) => {
    if (message.type() === 'error') console.log('player: ' + message.text().slice(0, 600));
  });
  await player.waitForSelector('iframe');
  const frame = player.frameLocator('iframe');
  await frame.getByText('脚本未启用').waitFor();
  check(
    'source frame is sandboxed without scripts by default',
    await player.locator('iframe').getAttribute('sandbox'),
    '',
  );
  check(
    'native player has no editor bridge',
    await player.evaluate(() => typeof window.auralide),
    'undefined',
  );
  await player.getByRole('button', { name: '启用源 HTML 动态脚本' }).click();
  await frame.getByText('模块已离线运行').waitFor();
  check(
    'source module graph runs offline',
    await frame.locator('#state').innerText(),
    '模块已离线运行',
  );
  check(
    'nested CSS is preserved offline',
    await frame.locator('#heading').evaluate((e) => window.getComputedStyle(e).color),
    'rgb(21, 51, 81)',
  );
  check(
    'embedded image actually decodes',
    await frame.locator('img').evaluate((e) => e.complete && e.naturalWidth > 0),
  );
  await frame.getByRole('button', { name: '源页面交互' }).click();
  check(
    'inline source interaction is preserved',
    await frame.locator('#state').innerText(),
    '交互正常',
  );
  const security = await frame.locator('body').evaluate(() => ({
    node: typeof process,
    require: typeof require,
    bridge: typeof window.auralide,
    opaque: window.location.origin,
  }));
  check(
    'source has no Node, require or editor bridge',
    { node: security.node, require: security.require, bridge: security.bridge },
    { node: 'undefined', require: 'undefined', bridge: 'undefined' },
  );
  await player.screenshot({ path: join(artifacts, 'offline-player.png') });
  await player.close();
  await page.getByTestId('document-reload').click();
  await page.getByText('素材与动态演示', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'bundle-editor.png') });
  if (process.platform === 'win32') {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ offline: true });
    const web = await context.newPage();
    const requests = [];
    web.on('request', (r) => {
      if (/^https?:/.test(r.url())) requests.push(r.url());
    });
    await web.goto(pathToFileURL(htmlPath).href);
    await web.getByRole('button', { name: '启用源 HTML 动态脚本' }).click();
    await web.frameLocator('iframe').getByText('模块已离线运行').waitFor();
    check(
      'real Windows browser plays file while offline',
      await web.frameLocator('iframe').locator('#state').innerText(),
      '模块已离线运行',
    );
    check('standalone deck makes no HTTP requests', requests, []);
    await web.screenshot({ path: join(artifacts, 'edge-offline.png') });
    await browser.close();
    browser = undefined;
  }
  await dialogs(null, null);
  check('new document resets the resource session', (await invoke('newDocument')).ok);
  const wav = Buffer.alloc(44 + 16000);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(16000, 40);
  const audioPath = join(directory, 'silence.wav'),
    videoPath = join(root, 'test', 'fixtures', 'bear-320x240.webm');
  await writeFile(audioPath, wav);
  for (const [kind, path] of [
    ['image', join(directory, 'picture.png')],
    ['audio', audioPath],
    ['video', videoPath],
  ]) {
    await dialogs(path, null);
    const result = await page.evaluate(async (kind) => {
      const doc = await window.auralide.getDocument();
      return window.auralide.insertAsset({
        expectedRevision: doc.revision,
        slideId: doc.slides[0].id,
        kind,
      });
    }, kind);
    check(`native ${kind} insertion is command-based`, result.ok);
  }
  await page.evaluate(async () => {
    let doc = await window.auralide.getDocument();
    const target = { kind: 'slide', slideId: doc.slides[0].id };
    for (const command of [
      {
        operation: 'element.add',
        target,
        payload: {
          element: {
            id: 'el_step',
            kind: 'text',
            text: '点击入场',
            geometry: { x: 80, y: 20, width: 600, height: 70 },
            entrance: { effect: 'fade', trigger: 'click', duration: 300 },
          },
        },
      },
      { operation: 'slide.updateProperties', target, payload: { transition: 'fade' } },
      {
        operation: 'slide.create',
        target: { kind: 'presentation' },
        payload: { id: 'slide_end', name: '结束' },
      },
    ]) {
      const result = await window.auralide.applyCommand({
        ...command,
        expectedRevision: doc.revision,
        origin: { kind: 'human' },
      });
      if (!result.ok) throw new Error(result.error.message);
      doc = result.value;
    }
  });
  const nativeWindow = app.waitForEvent('window');
  check('native dynamic player opens', (await invoke('playDocument')).ok);
  const native = await nativeWindow;
  native.on('console', (message) => {
    if (message.type() === 'error') console.log('native media: ' + message.text());
  });
  await native.waitForSelector('video');
  await native.waitForFunction(() =>
    [...document.querySelectorAll('audio,video')].every((e) => e.readyState >= 1),
  );
  check('native audio and video decode', await native.locator('audio,video').count(), 2);
  await native.emulateMedia({ reducedMotion: 'reduce' });
  check(
    'click entrance is initially hidden',
    await native.locator('[data-element-id="el_step"]').getAttribute('data-pending'),
    '',
  );
  await native.getByRole('button', { name: '下一步', exact: true }).click();
  check(
    'click reveals the element',
    await native.locator('[data-element-id="el_step"]').isVisible(),
  );
  check(
    'reduced motion skips native entrance animation',
    await native.locator('[data-element-id="el_step"]').evaluate((e) => e.getAnimations().length),
    0,
  );
  await native.locator('audio,video').evaluateAll(async (elements) => {
    for (const e of elements) {
      e.muted = true;
      await e.play();
    }
  });
  await native.getByRole('button', { name: '下一页', exact: true }).click();
  check(
    'page change pauses all native media',
    await native.locator('audio,video').evaluateAll((elements) => elements.every((e) => e.paused)),
  );
  await native.close();
  check('no editor page errors', errors, []);
  await writeFile(
    join(artifacts, 'result.json'),
    JSON.stringify(
      { passed: true, checks, platform: process.platform, arch: process.arch, directory },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile(
    join(artifacts, 'result.json'),
    JSON.stringify({ passed: false, checks, error: String(error), directory }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  await close();
}

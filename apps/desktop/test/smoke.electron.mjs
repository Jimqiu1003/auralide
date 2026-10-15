/**
 * Desktop smoke run: launches the real Electron window (production build and/or Vite dev server),
 * asserts the renderer, the preload boundary, the IPC allow/refuse paths and the per-mode CSP, and
 * leaves machine-readable evidence in `test-artifacts/`.
 *
 * Usage (from `apps/desktop`):
 *   node test/smoke.electron.mjs            # production  (requires a built dist/)
 *   node test/smoke.electron.mjs dev        # development (starts `vite` on 5173)
 *   node test/smoke.electron.mjs all
 *
 * Requires a desktop session: it opens a real window. ELECTRON_RUN_AS_NODE must not be set in the
 * environment (some CI/agent shells set it) — this script clears it for the child.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { _electron as electron } from 'playwright-core';

const appRoot = process.cwd();
const artifacts = join(appRoot, 'test-artifacts');
const devServerUrl = 'http://localhost:5173';
const checks = [];
const allChecks = [];
const failures = [];

delete process.env.ELECTRON_RUN_AS_NODE;

const check = (name, actual, expected) => {
  const pass = actual === expected;
  checks.push({ name, pass, actual, expected });
  if (!pass)
    failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  process.stdout.write(`${pass ? 'ok  ' : 'FAIL'} ${name} = ${JSON.stringify(actual)}\n`);
};

const checkTruthy = (name, actual) => {
  const pass = actual === true;
  checks.push({ name, pass, actual, expected: true });
  if (!pass) failures.push(`${name}: expected true, got ${JSON.stringify(actual)}`);
  process.stdout.write(`${pass ? 'ok  ' : 'FAIL'} ${name} = ${JSON.stringify(actual)}\n`);
};

async function waitForDevServer(url, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.startupError !== undefined) throw child.startupError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`vite exited before readiness (${child.exitCode ?? child.signalCode})`);
    }
    try {
      if (!child.ready) {
        await delay(100);
        continue;
      }
      const response = await fetch(url, { signal: globalThis.AbortSignal.timeout(2_000) });
      if (response.ok) {
        const text = await response.text();
        if (text.includes('<title>Auralide</title>')) return text;
      }
    } catch {
      /* not up yet */
    }
    await delay(250);
  }
  throw new Error(`vite dev server did not answer on ${url} within ${timeoutMs} ms`);
}

function startDevServer() {
  // Run vite's JS entry with the current Node binary: the workspace path contains spaces, and a
  // `.cmd` shim would need shell:true, which mangles them.
  const entry = join(appRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [entry, '--port', '5173', '--strictPort'], {
    cwd: appRoot,
  });
  let output = '';
  child.ready = false;
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
    child.ready = stripVTControlCharacters(output).includes(devServerUrl);
    process.stdout.write(`[vite] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));
  child.on('error', (error) => {
    child.startupError = error;
  });
  return child;
}

function stopDevServer(child) {
  if (child === undefined) return;
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  } else {
    child.kill('SIGTERM');
  }
}

async function securityProbes(app, page) {
  const probePreload = join(artifacts, 'security-probe.cjs');
  await writeFile(
    probePreload,
    "const { contextBridge, ipcRenderer } = require('electron'); contextBridge.exposeInMainWorld('securityProbe', { invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args) });\n",
  );
  const probes = await app.evaluate(async ({ BrowserWindow, ipcMain }, preload) => {
    const main = BrowserWindow.getAllWindows()[0];
    const prefs = main.webContents.getLastWebPreferences();
    const auxiliary = new BrowserWindow({
      show: false,
      webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    try {
      await auxiliary.loadURL(main.webContents.getURL());
      const invoke = async (channel) =>
        auxiliary.webContents.executeJavaScript(
          `window.securityProbe.invoke(${JSON.stringify(channel)}).then(() => 'unexpected-success', error => error.message)`,
        );
      const unknownChannel = await invoke('auralide:unknown');
      const wrongWindow = await invoke('auralide:runtime-info');

      // shortcut: Electron's private handler map tests frame/arity gates, replace if Electron changes it.
      const handlers = ipcMain._invokeHandlers;
      if (!(handlers instanceof Map)) throw new Error('Electron IPC handler test harness changed');
      const runtimeHandler = handlers.get('auralide:runtime-info');
      const event = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
      const refused = async (candidate, ...args) => {
        try {
          await runtimeHandler(candidate, ...args);
          return false;
        } catch {
          return true;
        }
      };
      const extraRuntimeArgument = await refused(event, { unexpected: true });
      const wrongFrame = await refused({
        ...event,
        senderFrame: { url: main.webContents.getURL() },
      });
      const redirect = { url: 'https://example.invalid/', isMainFrame: true, prevented: false };
      redirect.preventDefault = () => {
        redirect.prevented = true;
      };
      main.webContents.emit('will-redirect', redirect);
      return {
        unknownChannel,
        wrongWindow,
        wrongFrame,
        extraRuntimeArgument,
        redirectBlocked: redirect.prevented,
        contextIsolation: prefs.contextIsolation,
        nodeIntegration: prefs.nodeIntegration,
        sandbox: prefs.sandbox,
        webSecurity: prefs.webSecurity,
      };
    } finally {
      auxiliary.destroy();
    }
  }, probePreload);
  checkTruthy('unknown IPC channel rejected', /No handler registered/.test(probes.unknownChannel));
  checkTruthy('IPC from another window rejected', /refused/.test(probes.wrongWindow));
  checkTruthy('IPC from a non-main frame rejected', probes.wrongFrame);
  checkTruthy('runtime-info extra argument rejected', probes.extraRuntimeArgument);
  checkTruthy('external redirect rejected', probes.redirectBlocked);
  check('contextIsolation', probes.contextIsolation, true);
  check('nodeIntegration', probes.nodeIntegration, false);
  check('sandbox', probes.sandbox, true);
  check('webSecurity', probes.webSecurity, true);

  const originalUrl = page.url();
  const navigationBlocked = app.evaluate(
    ({ BrowserWindow }) =>
      new Promise((resolve) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        const timeout = setTimeout(() => resolve(false), 5_000);
        contents.once('will-frame-navigate', (event) => {
          clearTimeout(timeout);
          resolve(event.defaultPrevented);
        });
      }),
  );
  await page.evaluate(() => {
    window.location.href = 'https://example.invalid/';
  });
  checkTruthy('external navigation rejected', await navigationBlocked);
  check('application entry retained', page.url(), originalUrl);
  // Playwright keeps a cancelled navigation pending; reload the trusted entry before UI actions.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="runtime-status"]')?.textContent === 'ready',
  );
  check(
    'window.open denied',
    await page.evaluate(() => window.open('http://127.0.0.1:1/') === null),
    true,
  );
  check(
    'notification permission denied',
    await page.evaluate(() => window.Notification.requestPermission()),
    'denied',
  );
}

async function runMode(mode) {
  checks.length = 0;
  const failureStart = failures.length;
  process.stdout.write(`\n=== smoke: ${mode} ===\n`);
  const consoleMessages = [];
  const startupLines = [];
  let devServer;
  let app;
  let electronVersion = 'unknown';
  let servedHtml = '';
  let modeError = '';
  const started = Date.now();

  try {
    if (mode === 'dev') {
      devServer = startDevServer();
      servedHtml = await waitForDevServer(devServerUrl, devServer);
    }
    const env = { ...process.env, AURALIDE_DEV_SERVER_URL: mode === 'dev' ? devServerUrl : '' };
    app = await electron.launch({ args: ['.'], cwd: appRoot, env, timeout: 60_000 });
    electronVersion = await app.evaluate(() => process.versions.electron);
    app.process().stdout?.on('data', (chunk) => startupLines.push(String(chunk).trim()));
    const page = await app.firstWindow({ timeout: 60_000 });
    page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
    let pageError = '';
    page.on('pageerror', (error) => {
      pageError = String(error);
    });

    await page.waitForLoadState('domcontentloaded');
    check('window.url', page.url().startsWith(mode === 'dev' ? devServerUrl : 'file://'), true);
    check('window.title', await page.title(), 'Auralide');

    await page.waitForFunction(
      () => document.querySelector('[data-testid="runtime-status"]')?.textContent === 'ready',
      undefined,
      { timeout: 30_000 },
    );

    check(
      'runtime-status',
      await page.locator('[data-testid="runtime-status"]').textContent(),
      'ready',
    );
    check(
      'load-path',
      await page.locator('[data-testid="load-path"]').textContent(),
      mode === 'dev' ? 'development' : 'production',
    );
    checkTruthy(
      'app-version is set',
      ((await page.locator('[data-testid="app-version"]').textContent()) ?? 'unknown') !==
        'unknown',
    );
    check(
      'bridge-version',
      await page.locator('[data-testid="bridge-version"]').textContent(),
      '1.1.0',
    );

    // Renderer boundary: nothing but the frozen bridge is reachable.
    const exposed = await page.evaluate(() => ({
      require: typeof window.require,
      process: typeof window.process,
      module: typeof window.module,
      ipcRenderer: typeof window.ipcRenderer,
      keys: Object.keys(window.auralide ?? {})
        .sort()
        .join(','),
      frozen: Object.isFrozen(window.auralide),
    }));
    check('window.require', exposed.require, 'undefined');
    check('window.process', exposed.process, 'undefined');
    check('window.module', exposed.module, 'undefined');
    check('window.ipcRenderer', exposed.ipcRenderer, 'undefined');
    check(
      'bridge keys',
      exposed.keys,
      'applyCommand,bridgeVersion,getDocument,getRuntimeInfo,ping',
    );
    checkTruthy('bridge is frozen', exposed.frozen);

    // Allow-listed round trip.
    await page.locator('[data-testid="ipc-ping-button"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="ipc-ping-result"]')?.textContent?.startsWith('ok:'),
      undefined,
      { timeout: 15_000 },
    );
    check(
      'allow-listed ping',
      await page.locator('[data-testid="ipc-ping-result"]').textContent(),
      'ok: hello from the renderer',
    );

    // Refusal path, observed twice: from the UI, and with an extra field the strict schema rejects.
    await page.locator('[data-testid="ipc-invalid-button"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="ipc-invalid-result"]')
          ?.textContent?.startsWith('refused:'),
      undefined,
      { timeout: 15_000 },
    );
    check(
      'invalid ping refused',
      await page.locator('[data-testid="ipc-invalid-result"]').textContent(),
      'refused: invalid-payload',
    );
    const extraField = await page.evaluate(() => window.auralide?.ping({ message: 'x', extra: 1 }));
    check('unexpected field refused', extraField?.ok, false);
    check('unexpected field code', extraField?.code, 'invalid-payload');

    await securityProbes(app, page);

    await page.waitForFunction(
      () => document.querySelector('[data-testid="document-revision"]')?.textContent === '0',
    );
    check(
      'initial core text',
      await page.getByTestId('slide-text').textContent(),
      'Your ideas, structured.',
    );
    const updatedText = '<script>alert(1)</script> Core edit';
    await page.getByTestId('document-text-input').fill(updatedText);
    await page.getByTestId('document-apply').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="document-revision"]')?.textContent === '1',
    );
    check(
      'core command updates preview',
      await page.getByTestId('slide-text').textContent(),
      updatedText,
    );
    check('preview does not execute markup', await page.locator('svg script').count(), 0);
    const stale = await page.evaluate(async () => {
      const before = await window.auralide.getDocument();
      const slide = before.slides[0];
      const element = slide.elements[0];
      const response = await window.auralide.applyCommand({
        operation: 'element.updateText',
        target: { kind: 'element', slideId: slide.id, elementId: element.id },
        payload: { text: 'stale overwrite' },
        expectedRevision: 0,
        origin: { kind: 'human', id: 'smoke' },
      });
      return {
        response,
        unchanged: JSON.stringify(before) === JSON.stringify(await window.auralide.getDocument()),
      };
    });
    check('stale desktop command refused', stale.response.error?.code, 'stale-revision');
    checkTruthy('stale desktop command preserves document', stale.unchanged);

    await page.getByTestId('document-text-input').fill('Auralide, powered by Core.');
    await page.getByTestId('document-apply').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="document-revision"]')?.textContent === '2',
    );
    check(
      'consecutive edit updates preview',
      await page.getByTestId('slide-text').textContent(),
      'Auralide, powered by Core.',
    );
    await page.evaluate(async () => {
      const document = await window.auralide.getDocument();
      const slide = document.slides[0];
      await window.auralide.applyCommand({
        operation: 'element.updateText',
        target: { kind: 'element', slideId: slide.id, elementId: slide.elements[0].id },
        payload: { text: 'Changed through the command bridge' },
        expectedRevision: document.revision,
        origin: { kind: 'human' },
      });
    });
    await page.getByTestId('document-apply').click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="document-status"]')
        ?.textContent?.includes('stale-revision'),
    );
    check(
      'stale UI keeps its snapshot',
      await page.getByTestId('document-revision').textContent(),
      '2',
    );
    await page.getByTestId('document-reload').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="document-revision"]')?.textContent === '3',
    );
    check(
      'reload recovers the current text',
      await page.getByTestId('document-text-input').inputValue(),
      'Changed through the command bridge',
    );
    const finalText = 'Your ideas, structured. Now editable.';
    await page.getByTestId('document-text-input').fill(finalText);
    await page.getByTestId('document-apply').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="document-revision"]')?.textContent === '4',
    );
    check(
      'editing works after reload',
      await page.getByTestId('slide-text').textContent(),
      finalText,
    );
    check('no Vite error overlay', await page.locator('vite-error-overlay').count(), 0);

    const cspViolations = consoleMessages.filter((message) =>
      /Content Security Policy|Refused to (load|execute|connect)/i.test(message),
    );
    check('csp violations in console', cspViolations.length, 0);
    check('page errors', pageError, '');

    await page.screenshot({ path: join(artifacts, `${mode}.png`) });
    await page.setViewportSize({ width: 640, height: 900 });
    checkTruthy(
      'narrow viewport has no horizontal overflow',
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    );
    await page.screenshot({ path: join(artifacts, `${mode}-narrow.png`) });

    // The two policies must stay separated, whichever mode just ran.
    const builtHtml = await readFile(join(appRoot, 'dist', 'renderer', 'index.html'), 'utf8');
    const sourceHtml = await readFile(join(appRoot, 'src', 'renderer', 'index.html'), 'utf8');
    checkTruthy(
      'production csp is strict',
      builtHtml.includes("script-src 'self'") &&
        !builtHtml.includes("script-src 'self' 'unsafe-inline'") &&
        !builtHtml.includes('unsafe-eval'),
    );
    checkTruthy(
      'csp is injected, never hard-coded',
      sourceHtml.includes('<!--csp-->') && !sourceHtml.includes('unsafe-inline'),
    );
    if (mode === 'dev') {
      checkTruthy(
        'development csp matches the dev server',
        servedHtml.includes("script-src 'self' 'unsafe-inline'") &&
          servedHtml.includes('ws://localhost:5173'),
      );
    }
  } catch (error) {
    modeError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    allChecks.push(...checks.map((entry) => ({ mode, ...entry })));
    await writeFile(
      join(artifacts, `${mode}.json`),
      `${JSON.stringify(
        {
          mode,
          electronVersion,
          durationMs: Date.now() - started,
          startupLines,
          consoleMessages,
          checks,
          failures: failures.slice(failureStart),
          error: modeError,
          passed: modeError === '' && failures.length === failureStart,
        },
        null,
        2,
      )}\n`,
    );
    if (app !== undefined) await app.close().catch(() => undefined);
    stopDevServer(devServer);
  }
}

const requested = process.argv[2] ?? 'production';
const modes =
  requested === 'all' ? ['production', 'dev'] : [requested === 'dev' ? 'dev' : 'production'];

await mkdir(artifacts, { recursive: true });
for (const mode of modes) {
  try {
    await runMode(mode);
  } catch (error) {
    failures.push(`${mode}: ${error instanceof Error ? error.message : String(error)}`);
    process.stdout.write(`\nFAIL ${mode}: ${String(error)}\n`);
  }
}

process.stdout.write(
  `\nsmoke summary: ${allChecks.filter((c) => c.pass).length}/${allChecks.length} checks passed, artifacts in ${artifacts}\n`,
);
if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\nsmoke: PASS\n');
}

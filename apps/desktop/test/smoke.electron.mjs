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
import { _electron as electron } from 'playwright-core';

const appRoot = process.cwd();
const artifacts = join(appRoot, 'test-artifacts');
const devServerUrl = 'http://localhost:5173';
const checks = [];
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

async function waitForDevServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
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
  child.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));
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

async function runMode(mode) {
  process.stdout.write(`\n=== smoke: ${mode} ===\n`);
  const consoleMessages = [];
  const startupLines = [];
  let devServer;
  let app;
  const started = Date.now();

  try {
    if (mode === 'dev') {
      devServer = startDevServer();
    }
    const env = { ...process.env, AURALIDE_DEV_SERVER_URL: mode === 'dev' ? devServerUrl : '' };
    app = await electron.launch({ args: ['.'], cwd: appRoot, env, timeout: 60_000 });
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
      '1.0.0',
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
    check('bridge keys', exposed.keys, 'bridgeVersion,getRuntimeInfo,ping');
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

    const cspViolations = consoleMessages.filter((message) =>
      /Content Security Policy|Refused to (load|execute|connect)/i.test(message),
    );
    check('csp violations in console', cspViolations.length, 0);
    check('page errors', pageError, '');

    await page.screenshot({ path: join(artifacts, `${mode}.png`) });

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
      const servedHtml = await waitForDevServer(devServerUrl, 15_000);
      checkTruthy(
        'development csp matches the dev server',
        servedHtml.includes("script-src 'self' 'unsafe-inline'") &&
          servedHtml.includes('ws://localhost:5173'),
      );
    }

    await writeFile(
      join(artifacts, `${mode}.json`),
      `${JSON.stringify(
        {
          mode,
          electronVersion: app.electronVersion?.() ?? 'unknown',
          durationMs: Date.now() - started,
          startupLines,
          consoleMessages,
          checks,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
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
  `\nsmoke summary: ${checks.filter((c) => c.pass).length}/${checks.length} checks passed, artifacts in ${artifacts}\n`,
);
if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\nsmoke: PASS\n');
}

import { _electron as electron } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Windows x64 portable smoke is only run on the supported native runner.');
}
const executablePath = resolve('apps/desktop/dist/portable/Auralide-win32-x64/Auralide.exe');
if (!existsSync(executablePath)) throw new Error('Portable Auralide.exe was not packaged.');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ executablePath, env, timeout: 60000 });
  const page = await app.firstWindow({ timeout: 30000 });
  await page.getByTestId('demo-workspace').waitFor({ timeout: 30000 });
  await page.getByTestId('document-revision').waitFor();
  const runtime = await page.evaluate(() => window.auralide?.getRuntimeInfo());
  if (!runtime || runtime.platform !== 'win32') {
    throw new Error('Packaged main/preload failed to return Windows runtime identity.');
  }
  const initial = await page.getByTestId('slide-text').textContent();
  if (initial !== 'Your ideas, structured.') {
    throw new Error(`Packaged demo loaded unexpected Core content: ${initial}`);
  }
  process.stdout.write(
    `Portable Demo smoke PASS: ${runtime.appName} / Electron ${runtime.electronVersion}\n`,
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

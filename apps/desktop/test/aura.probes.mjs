import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function auraProbes(app, page, mode, artifacts, check) {
  const invoke = (request) => page.evaluate((input) => window.auralide.auraInvoke(input), request);
  const snapshot = () =>
    app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const views = window.contentView.children.filter(
        (view) => 'webContents' in view && view.webContents.getURL().startsWith('data:text/html'),
      );
      return views.map((view) => ({
        bounds: view.getBounds(),
        visible: view.getVisible(),
        isolated: view.webContents.session !== window.webContents.session,
        persistent: view.webContents.session.isPersistent(),
        preferences: (() => {
          const p = view.webContents.getLastWebPreferences();
          return {
            sandbox: p.sandbox,
            nodeIntegration: p.nodeIntegration,
            contextIsolation: p.contextIsolation,
            webSecurity: p.webSecurity,
            preload: p.preload ?? '',
          };
        })(),
      }));
    });
  const wait = async (probe, description) => {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      if (await probe()) return;
      await delay(100);
    }
    throw new Error(`Aura condition did not settle: ${description}`);
  };
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId('aura-render').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="aura-result"]')?.textContent?.includes('"slide-preview"'),
  );
  const rendered = JSON.parse(await page.getByTestId('aura-result').textContent());
  check('Aura render succeeds', rendered.ok, true);
  const tab = rendered.value;
  await wait(async () => (await snapshot())[0]?.visible === true, 'visible native preview');
  const views = await snapshot();
  check('Aura uses one native view', views.length, 1);
  check('Aura session isolated from editor', views[0].isolated, true);
  check('Aura session non-persistent', views[0].persistent, false);
  for (const key of ['sandbox', 'contextIsolation', 'webSecurity'])
    check(`Aura ${key}`, views[0].preferences[key], true);
  check('Aura nodeIntegration', views[0].preferences.nodeIntegration, false);
  check('Aura guest has no preload', views[0].preferences.preload, '');
  const guests = await app.evaluate(async ({ webContents }) => {
    const guest = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith('data:text/html'));
    return guest.executeJavaScript(
      `({bridge:typeof window.auralide,require:typeof window.require,process:typeof window.process,scripts:document.scripts.length})`,
    );
  });
  check('Aura guest has no editor bridge', guests.bridge, 'undefined');
  check('Aura guest has no require', guests.require, 'undefined');
  check('Aura guest has no process', guests.process, 'undefined');
  check('Aura guest has no scripts', guests.scripts, 0);
  const inspect = await invoke({
    tool: 'preview.inspectElement',
    input: { tabId: tab.id, elementId: 'el_title', expectedRevision: tab.revision },
  });
  check('Aura stable ID inspection succeeds', inspect.ok, true);
  check(
    'Aura inspection reads current Core text',
    inspect.value?.text,
    'Your ideas, structured. Now editable.',
  );
  const stale = await invoke({
    tool: 'preview.render',
    input: { slideId: tab.slideId, expectedRevision: tab.revision - 1 },
  });
  check('Aura stale render refuses conflict', stale.error?.code, 'revision-conflict');
  check(
    'Aura rejected render leaves Core revision unchanged',
    await page.evaluate(async () => (await window.auralide.getDocument()).revision),
    tab.revision,
  );
  const image = await invoke({
    tool: 'preview.screenshot',
    input: { tabId: tab.id, expectedRevision: tab.revision },
  });
  check('Aura screenshot succeeds', image.ok, true);
  if (!image.ok) throw new Error(JSON.stringify(image));
  const png = Buffer.from(image.value.base64, 'base64');
  check('Aura screenshot is a PNG', png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  await writeFile(join(artifacts, `${mode}-aura-preview.png`), png);
  const invalid = await invoke({
    tool: 'browser.executeJavaScript',
    input: { script: 'process.exit()' },
  });
  check('Aura arbitrary code tool refused', invalid.error?.code, 'invalid-input');
  const external = await invoke({ tool: 'browser.open', input: { url: 'https://example.com' } });
  check('Aura arbitrary website refused in POC', external.error?.code, 'invalid-input');
  const network = await app.evaluate(async ({ webContents }) => {
    const guest = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith('data:text/html'));
    return guest.executeJavaScript(`fetch('https://example.invalid/').then(()=>false,()=>true)`);
  });
  check('Aura guest network request refused', network, true);
  const initialWidth = views[0].bounds.width;
  await page.getByTestId('aura-width').focus();
  await page.getByTestId('aura-width').press('Home');
  await wait(async () => (await snapshot())[0]?.bounds.width < initialWidth, 'native split resize');
  check(
    'Aura split resize changes native bounds',
    (await snapshot())[0].bounds.width < initialWidth,
    true,
  );
  await page.getByTestId('aura-overlay').click();
  await page.getByRole('dialog').waitFor();
  check('Aura hidden beneath shell modal', (await snapshot())[0].visible, false);
  await page.getByRole('button', { name: 'Close overlay' }).click();
  await wait(async () => (await snapshot())[0]?.visible === true, 'view restored after overlay');
  check('Aura restored after shell modal', (await snapshot())[0].visible, true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await wait(async () => (await snapshot())[0]?.visible === false, 'minimized guest hidden');
  check('Aura hidden when minimized', (await snapshot())[0].visible, false);
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.restore();
    window.show();
  });
  await wait(async () => (await snapshot())[0]?.visible === true, 'restored guest visible');
  check('Aura restored after minimize', (await snapshot())[0].visible, true);
  await page.getByTestId('aura-lab').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="aura-result"]')?.textContent?.includes('"html-lab"'),
  );
  const lab = JSON.parse(await page.getByTestId('aura-result').textContent()).value;
  check('Aura lab and preview tabs coexist', (await snapshot()).length, 2);
  const separated = await app.evaluate(({ webContents }) => {
    const guests = webContents
      .getAllWebContents()
      .filter((contents) => contents.getURL().startsWith('data:text/html'));
    return guests.length === 2 && guests[0].session !== guests[1].session;
  });
  check('Aura modes use separate sessions', separated, true);
  const labDiagnostics = await invoke({
    tool: 'preview.getDiagnostics',
    input: { tabId: lab.id, expectedRevision: lab.revision },
  });
  check('Aura lab diagnostics succeeds', labDiagnostics.ok, true);
  check('Aura lab remains inert', labDiagnostics.value?.scriptCount, 0);
  await page.getByTestId('aura-close').click();
  await wait(async () => (await snapshot()).length === 1, 'active lab closed');
  await wait(
    async () =>
      (await page
        .getByRole('button', { name: 'slide-preview', exact: true })
        .getAttribute('aria-pressed')) === 'true',
    'renderer selects fallback tab',
  );
  check(
    'Aura closing active tab selects remaining preview',
    await page
      .getByRole('button', { name: 'slide-preview', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await wait(async () => (await snapshot())[0]?.visible === true, 'fallback preview visible');
  check('Aura fallback preview remains visible', (await snapshot())[0].visible, true);
  await page.getByTestId('document-text-input').fill('Changed after rendering preview.');
  await page.getByTestId('document-apply').click();
  await page.waitForFunction(
    (revision) =>
      Number(document.querySelector('[data-testid="document-revision"]')?.textContent) > revision,
    tab.revision,
  );
  await page.getByTestId('aura-diagnostics').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="aura-result"]')?.textContent?.includes('"stale":true'),
  );
  const staleDiagnostics = JSON.parse(await page.getByTestId('aura-result').textContent());
  check('Aura diagnostics button accepts current revision', staleDiagnostics.ok, true);
  check('Aura diagnostics reports stale preview', staleDiagnostics.value?.stale, true);
  check('Aura diagnostics retains render revision', staleDiagnostics.value?.revision, tab.revision);
  await page.getByTestId('aura-close').click();
  await wait(async () => (await snapshot()).length === 0, 'last preview closed');
  check('Aura close releases every native guest', (await snapshot()).length, 0);
  const listed = await invoke({ tool: 'browser.listTabs', input: {} });
  check('Aura close clears tab registry', listed.value?.length, 0);
}

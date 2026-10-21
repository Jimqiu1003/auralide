import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { scanSourceHtml } from '@auralide/html-bridge';
import type { SourceScan } from '@auralide/html-bridge';

/** Internal fixed DOM tools only; imported HTML is parsed in a detached document, never loaded. */
export async function sourceDomTool<T>(tool: string, input: unknown): Promise<T> {
  const isolated = session.fromPartition(`source-parser-${randomUUID()}`, { cache: false });
  const url =
    'data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src %27none%27">';
  isolated.setPermissionRequestHandler((_c, _p, cb) => cb(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.setDevicePermissionHandler(() => false);
  isolated.webRequest.onBeforeRequest((details, cb) =>
    cb({ cancel: details.url !== url || details.resourceType !== 'mainFrame' }),
  );
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      session: isolated,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (e) => e.preventDefault());
  window.webContents.on('will-attach-webview', (e) => e.preventDefault());
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await window.loadURL(url);
        return (await window.webContents.executeJavaScript(
          `(${tool})(${JSON.stringify(input)})`,
        )) as T;
      })(),
      new Promise<never>((_r, reject) => {
        timer = setTimeout(() => reject(new Error('源码解析超时。')), 12000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (!window.isDestroyed()) window.destroy();
    isolated.webRequest.onBeforeRequest(null);
    await isolated.clearStorageData();
  }
}
export const scanSource = (source: string): Promise<SourceScan> =>
  sourceDomTool(scanSourceHtml.toString(), source);

import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'node:crypto';

/** The exported player runs in its own unprivileged window, never the editor or Aura session. */
export async function openPlayback(html: string): Promise<void> {
  const isolated = session.fromPartition(`offline-player-${randomUUID()}`, { cache: false });
  isolated.setPermissionRequestHandler((_c, _p, cb) => cb(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.setDevicePermissionHandler(() => false);
  isolated.webRequest.onBeforeRequest((details, cb) =>
    cb({ cancel: !details.url.startsWith('data:') }),
  );
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#202228',
    webPreferences: {
      session: isolated,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    },
  });
  const deny = (event: Electron.Event): void => event.preventDefault();
  isolated.on('will-download', deny);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', deny);
  window.webContents.on('will-frame-navigate', (event) => {
    if (!event.url.startsWith('data:')) event.preventDefault();
  });
  window.webContents.on('will-redirect', deny);
  window.webContents.on('will-attach-webview', deny);
  window.on('closed', () => {
    isolated.removeListener('will-download', deny);
    isolated.webRequest.onBeforeRequest(null);
    void isolated.clearStorageData();
  });
  try {
    await window.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  } catch (error) {
    window.destroy();
    throw error;
  }
}

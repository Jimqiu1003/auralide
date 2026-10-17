import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import { presentationSchema } from '@auralide/core';
import { HTML_IMPORT_SCRIPT } from '@auralide/html-bridge';
import type { HtmlSnapshot, HtmlImportReport } from '@auralide/html-bridge';
import { PREVIEW_CSP } from '@auralide/renderer';
import { DocumentFileError, readTextFile } from './document-files.js';

const importPartition = `html-import-${randomUUID()}`;

/** Imported bytes never enter the editor/Aura session. No preload, script or resource capability. */
export const inspectHtmlFile = async (source: string): Promise<HtmlSnapshot> => {
  const isolated = session.fromPartition(importPartition, { cache: false });
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.setDevicePermissionHandler(() => false);
  const denyDownload = (event: Electron.Event): void => event.preventDefault();
  isolated.on('will-download', denyDownload);
  const url =
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(
      `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">${source}<style>*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}</style>`,
    );
  isolated.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: details.url !== url || details.resourceType !== 'mainFrame' }),
  );
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    useContentSize: true,
    enableLargerThanScreen: true,
    webPreferences: {
      session: isolated,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      backgroundThrottling: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-frame-navigate', (event) => event.preventDefault());
  window.webContents.on('will-redirect', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const inspected = await Promise.race([
      (async () => {
        await window.loadURL(url);
        return window.webContents.executeJavaScript(HTML_IMPORT_SCRIPT) as Promise<HtmlSnapshot>;
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Import timed out')), 12000);
      }),
    ]);
    const document = presentationSchema.parse(inspected.document);
    return { ...inspected, document };
  } catch {
    throw new DocumentFileError(
      'invalid-document',
      'HTML 无法安全转换、超出限制或不包含可编辑内容。',
    );
  } finally {
    clearTimeout(timer);
    if (!window.isDestroyed()) window.destroy();
    isolated.removeListener('will-download', denyDownload);
    isolated.webRequest.onBeforeRequest(null);
    await isolated.clearStorageData();
  }
};

export const retainHtmlSource = async (source: string, report: HtmlImportReport): Promise<void> => {
  const directory = join(app.getPath('userData'), 'html-imports');
  await fs.mkdir(directory, { recursive: true });
  const path = join(directory, `${report.sourceHash}.html`);
  try {
    await fs.writeFile(path, source, { flag: 'wx', mode: 0o400 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if ((await readTextFile(path)).stamp !== report.sourceHash)
      throw new DocumentFileError('file-changed', 'HTML 来源缓存已改变，导入已拒绝。');
  }
  const reportPath = join(directory, `${report.sourceHash}.json`);
  try {
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o400 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
};

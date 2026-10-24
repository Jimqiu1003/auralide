import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';

import type { LoadPath, PingResponse, RuntimeInfo } from '../shared/api.js';
import { IPC, IPC_ALLOW_LIST } from '../shared/channels.js';
import { describeIssues, pingRequestSchema } from '../shared/schemas.js';
import {
  dispatchDocumentCommand,
  endDocumentSession,
  editDocumentHistory,
  getDocument,
  getDocumentStatus,
  hasUnsavedChanges,
  isDocumentFileOperationPending,
  openDocumentFile,
  saveDocumentFile,
  newDocumentFile,
  exportHtmlFile,
} from './document-session.js';
import { inspectHtmlFile, retainHtmlSource } from './html-import.js';
import { applicationMenuTemplate } from './platform.js';
import { portableUserDataPath, startupRefusalMessage } from './startup.js';
import { BrowserController } from '../aura/browser-controller.js';
import { isTrustedRendererUrl, validateDevServerUrl } from './security.js';

/**
 * Main process: the trusted side of the runtime.
 *
 * Two load paths exist (see ADR-0002 §1) and they differ in exactly one thing: where the renderer
 * comes from. Security settings, the preload bridge, the IPC surface and the navigation guards are
 * shared, so development cannot quietly run with a weaker posture than production.
 */

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(currentDirectory, 'preload.cjs');
const rendererEntry = join(currentDirectory, '..', 'renderer', 'index.html');

/**
 * Portable builds carry their own state next to the executable (issue #32).
 *
 * Electron keeps the single-instance lock inside the user-data directory. When `%APPDATA%\Auralide`
 * holds leftover or locked state from an earlier run, `requestSingleInstanceLock()` returns false and
 * the app quits before showing anything — indistinguishable from "the EXE does nothing". Pointing a
 * portable copy at its own `user-data` directory removes that whole class of failure and matches what
 * "portable" should mean anyway.
 *
 * An explicit `--user-data-dir` on the command line still wins: Electron resolves it before this
 * module runs, and the switch check below keeps us from overriding it.
 */
if (app.isPackaged && !app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', portableUserDataPath(app.getPath('exe')));
}

/** Set by `scripts/launch.mjs --dev`; its presence is what selects the development load path. */
const devServerUrl = validateDevServerUrl(
  (process.env.AURALIDE_DEV_SERVER_URL ?? '').trim(),
  app.isPackaged,
);
const loadPath: LoadPath = devServerUrl === '' ? 'production' : 'development';

const trustedRendererUrl = devServerUrl || pathToFileURL(rendererEntry).href;
const isTrustedUrl = (url: string): boolean => isTrustedRendererUrl(url, trustedRendererUrl);

let mainWindow: BrowserWindow | null = null;
let aura: BrowserController | null = null;

/** Derives every fact the renderer is allowed to see from the running process, never from input. */
const runtimeInfo = (): RuntimeInfo => ({
  appName: app.getName(),
  appVersion: app.getVersion(),
  electronVersion: process.versions.electron ?? 'unknown',
  chromeVersion: process.versions.chrome ?? 'unknown',
  nodeVersion: process.versions.node,
  platform: process.platform,
  loadPath,
});

/**
 * Gate 1 of the IPC boundary: a message is only served when it comes from the application's own
 * window *and* from a frame inside the trusted URL space. Anything else rejects the caller's promise.
 */
const assertTrustedSender = (event: IpcMainInvokeEvent, channel: string): void => {
  const frameUrl = event.senderFrame?.url ?? '';
  const expectedSender = mainWindow?.webContents;
  const fromApplicationWindow =
    expectedSender !== undefined &&
    event.sender === expectedSender &&
    event.senderFrame === expectedSender.mainFrame;
  if (!fromApplicationWindow || !isTrustedUrl(frameUrl)) {
    throw new Error(
      `refused ${channel}: message did not come from the application window (frame=${frameUrl === '' ? 'unknown' : frameUrl})`,
    );
  }
};

/**
 * Gate 0 of the IPC boundary: only allow-listed channels get a handler. The parameter is typed
 * `string` on purpose — the check must stay a real runtime check, not something the compiler
 * already proved.
 */
const handle = <Args extends unknown[]>(
  channel: string,
  schema: z.ZodType<Args>,
  handler: (args: Args) => unknown,
): void => {
  if (!(IPC_ALLOW_LIST as readonly string[]).includes(channel)) {
    throw new Error(
      `refusing to register a handler for a non-allow-listed IPC channel: ${channel}`,
    );
  }
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    assertTrustedSender(event, channel);
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`invalid-payload: ${describeIssues(parsed.error.issues)}`);
    }
    return handler(parsed.data);
  });
};

/** Gate 2: the payload is validated here, and a refusal is a *value* the renderer can assert on. */
const handlePing = (payload: unknown): PingResponse => {
  const parsed = pingRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, code: 'invalid-payload', message: describeIssues(parsed.error.issues) };
  }
  return {
    ok: true,
    echo: parsed.data.message,
    handledAt: new Date().toISOString(),
    origin: `main:${process.pid}`,
  };
};

/** Trusted shell policy; Aura guests receive their separate deny-by-default policy. */
const guardContents = (contents: WebContents): void => {
  contents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame || !isTrustedUrl(event.url)) {
      event.preventDefault();
      console.log('[auralide] blocked navigation outside the application entry');
    }
  });
  contents.on('will-redirect', (event) => {
    if (!event.isMainFrame || !isTrustedUrl(event.url)) {
      event.preventDefault();
      console.log('[auralide] blocked redirect outside the application entry');
    }
  });

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    console.log('[auralide] blocked a webview attachment');
  });

  contents.setWindowOpenHandler(({ url }) => {
    // External links belong to the user's browser, never to the application shell.
    if (url.startsWith('https://')) {
      void shell.openExternal(url).catch((error: unknown) => {
        console.error(`[auralide] could not open external link: ${String(error)}`);
      });
    }
    return { action: 'deny' };
  });
};

/**
 * Creates the single application window. The `webPreferences` below are the security posture
 * described in ADR-0002 §2 and docs/architecture/security.md §3 — do not relax them to make
 * development work; development is meant to run under the same posture.
 */
const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1080,
    minHeight: 700,
    // CI's macOS work area is smaller than the required visual-review sizes.
    enableLargerThanScreen: !app.isPackaged && app.commandLine.hasSwitch('auralide-visual-test'),
    show: false,
    backgroundColor: '#101014',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
      allowRunningInsecureContent: false,
    },
  });

  guardContents(window.webContents);
  window.webContents.on('will-prevent-unload', (event) => {
    const answer = dialog.showMessageBoxSync(window, {
      type: 'warning',
      message: '仍有未应用的文本输入。放弃输入并关闭？',
      buttons: ['取消', '放弃输入并关闭'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (answer === 1) event.preventDefault();
  });
  aura = new BrowserController(window, getDocument);
  window.on('close', (event) => {
    if (isDocumentFileOperationPending()) {
      event.preventDefault();
      return;
    }
    if (
      hasUnsavedChanges() &&
      dialog.showMessageBoxSync(window, {
        type: 'warning',
        message: 'Discard unsaved changes and close?',
        buttons: ['Cancel', 'Discard and close'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      }) !== 1
    )
      event.preventDefault();
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      aura?.dispose();
      aura = null;
      mainWindow = null;
      endDocumentSession();
    }
  });

  const load =
    loadPath === 'development' ? window.loadURL(devServerUrl) : window.loadFile(rendererEntry);
  void load.catch((error: unknown) => {
    console.error(`[auralide] failed to load the renderer: ${String(error)}`);
  });

  return window;
};

/**
 * Starts the application only once per user-data directory.
 *
 * A refusal here used to be a silent `app.quit()`: exit code 0, no window, no dialog, nothing a user
 * could act on (issue #32). It now reports the reason on stderr, writes it into the user-data
 * directory for support, and shows the user what happened instead of vanishing.
 */
const startApplication = (): void => {
  if (app.requestSingleInstanceLock()) {
    app.on('second-instance', () => {
      if (mainWindow !== null) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
      }
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    void app.whenReady().then(() => {
      Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuTemplate(process.platform)));
      // No capability is granted by default, including to the application's own page.
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
        callback(false);
      });
      session.defaultSession.setPermissionCheckHandler(() => false);

      handle(IPC.runtimeInfo, z.tuple([]), () => runtimeInfo());
      handle(IPC.ping, z.tuple([z.unknown()]), ([payload]) => handlePing(payload));
      handle(IPC.getDocument, z.tuple([]), () => getDocument());
      handle(IPC.getDocumentStatus, z.tuple([]), () => getDocumentStatus());
      handle(IPC.editHistory, z.tuple([z.unknown()]), ([request]) => editDocumentHistory(request));
      const chooseSave = async (htmlOnly = false): Promise<string | null> => {
        if (mainWindow === null) return null;
        const result = await dialog.showSaveDialog(mainWindow, {
          title: htmlOnly ? '导出 HTML 演示文稿' : '保存演示文稿',
          defaultPath: htmlOnly ? 'presentation.html' : 'presentation.auralide.json',
          filters: htmlOnly
            ? [{ name: 'HTML 演示文稿', extensions: ['html', 'htm'] }]
            : [
                { name: 'Auralide 文档', extensions: ['json'] },
                { name: 'HTML 演示文稿', extensions: ['html', 'htm'] },
              ],
          properties: ['showOverwriteConfirmation'],
        });
        return result.canceled ? null : (result.filePath ?? null);
      };
      const confirmDiscard = async (): Promise<boolean> => {
        if (mainWindow === null) return false;
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          message: '当前文档有未保存的修改，是否放弃并继续？',
          buttons: ['取消', '放弃修改并继续'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        return result.response === 1;
      };
      for (const [channel, saveAs] of [
        [IPC.saveDocument, false],
        [IPC.saveDocumentAs, true],
      ] as const)
        handle(channel, z.tuple([z.unknown()]), ([request]) =>
          saveDocumentFile(request, () => chooseSave(), saveAs),
        );
      handle(IPC.newDocument, z.tuple([z.unknown()]), ([request]) =>
        newDocumentFile(request, confirmDiscard),
      );
      handle(IPC.exportHtml, z.tuple([z.unknown()]), ([request]) =>
        exportHtmlFile(request, () => chooseSave(true)),
      );
      for (const [channel, htmlOnly] of [
        [IPC.openDocument, false],
        [IPC.importHtml, true],
      ] as const)
        handle(channel, z.tuple([z.unknown()]), ([request]) =>
          openDocumentFile(
            request,
            async () => {
              if (mainWindow === null) return null;
              const result = await dialog.showOpenDialog(mainWindow, {
                title: htmlOnly ? '导入 HTML 演示文稿' : '打开演示文稿',
                filters: htmlOnly
                  ? [{ name: 'HTML 演示文稿', extensions: ['html', 'htm'] }]
                  : [
                      { name: '演示文稿（Auralide / HTML）', extensions: ['json', 'html', 'htm'] },
                      { name: 'Auralide 文档', extensions: ['json'] },
                      { name: 'HTML 演示文稿', extensions: ['html', 'htm'] },
                    ],
                properties: ['openFile'],
              });
              return result.canceled ? null : (result.filePaths[0] ?? null);
            },
            confirmDiscard,
            {
              inspect: inspectHtmlFile,
              retain: retainHtmlSource,
              confirm: async (report) => {
                if (mainWindow === null) return false;
                const result = await dialog.showMessageBox(mainWindow, {
                  type: 'warning',
                  message: `将 HTML 转换为 ${report.slideCount} 页、${report.elementCount} 个可编辑对象`,
                  detail: report.warnings.join('\n') + '\n原文件将保留；转换结果需要另行保存。',
                  buttons: ['取消', '接受转换并导入'],
                  defaultId: 0,
                  cancelId: 0,
                  noLink: true,
                });
                return result.response === 1;
              },
            },
          ),
        );
      handle(IPC.applyCommand, z.tuple([z.unknown()]), ([command]) =>
        dispatchDocumentCommand(command),
      );
      handle(
        IPC.auraInvoke,
        z.tuple([z.unknown()]),
        ([request]) =>
          aura?.invoke(request) ?? {
            ok: false,
            error: { code: 'runtime-error', message: 'Aura runtime unavailable.' },
          },
      );
      handle(
        IPC.auraBounds,
        z.tuple([z.unknown()]),
        ([bounds]) => aura?.setBounds(bounds) ?? false,
      );

      // One line of machine-readable startup evidence, also asserting which path was taken.
      process.stdout.write(
        `[auralide] startup loadPath=${loadPath} electron=${process.versions.electron} chrome=${process.versions.chrome} node=${process.versions.node} preload=${preloadPath} renderer=${loadPath === 'development' ? devServerUrl : rendererEntry}\n`,
      );

      mainWindow = createWindow();

      app.on('activate', () => {
        if (mainWindow === null && BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createWindow();
        }
      });
    });
    return;
  }

  reportStartupRefusal();
};

/**
 * Explains why the window never appeared, instead of exiting silently (issue #32).
 *
 * `requestSingleInstanceLock()` also fails when the lock cannot be *created* — a stale profile, a
 * permission problem, or a locked file — not only when a second copy is genuinely running. Those two
 * cases are indistinguishable from inside this process, so the message stays accurate for both and
 * gives the user something to act on. A real second launch sees this briefly and exits; a broken
 * profile sees it and knows the app is not simply broken.
 */
const reportStartupRefusal = (): void => {
  const message = startupRefusalMessage(app.getPath('userData'));

  process.stderr.write(
    `[auralide] startup refused: single-instance lock unavailable (${app.getPath('userData')})\n`,
  );
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(
      join(app.getPath('userData'), 'startup-refused.log'),
      `${new Date().toISOString()}\n${message}\n`,
    );
  } catch {
    // Logging is best effort: a failure to write must not prevent the dialog below.
  }

  // `dialog.showErrorBox` works before `ready`, which is the only reason this can still be shown.
  dialog.showErrorBox('Auralide 无法启动', message);
  app.exit(1);
};

startApplication();

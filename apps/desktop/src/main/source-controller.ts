import { randomUUID } from 'node:crypto';
import { session, WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import { assetUrl } from '@auralide/renderer';
import type { Assets } from '@auralide/renderer';
import { inspectSourceNode, installSourceSelection } from '@auralide/html-bridge';
import { z } from 'zod';
import { auraBoundsSchema, clipBounds } from '../aura/policy.js';
import type { AuraBounds } from '../aura/policy.js';
import type {
  SourceSelection,
  SourceSnapshot,
  SourceViewStatus,
} from '../shared/source-editing.js';

const messageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('select'), nodeId: z.string().regex(/^node-[0-9]+$/) }),
  z.strictObject({
    type: z.literal('move'),
    nodeId: z.string().regex(/^node-[0-9]+$/),
    offsetX: z.int().min(-1000000).max(1000000),
    offsetY: z.int().min(-1000000).max(1000000),
  }),
]);

/** Inert source editing is separate from Aura and the script-enabled playback session. */
export class SourceController {
  private view: WebContentsView | null = null;
  private snapshot: SourceSnapshot | null = null;
  private selection: SourceSelection | null = null;
  private move: SourceViewStatus['move'] = null;
  private sequence = 0;
  private escape = false;
  private focus = false;
  private bounds: AuraBounds = { x: 0, y: 0, width: 0, height: 0, visible: false };
  private readonly sync = (): void => {
    if (!this.view || !this.snapshot || this.window.isDestroyed()) return;
    const [width = 0, height = 0] = this.window.getContentSize(),
      zoom = this.window.webContents.getZoomFactor();
    const clipped = clipBounds(
      {
        ...this.bounds,
        x: Math.round(this.bounds.x * zoom),
        y: Math.round(this.bounds.y * zoom),
        width: Math.round(this.bounds.width * zoom),
        height: Math.round(this.bounds.height * zoom),
      },
      width,
      height,
    );
    this.view.setBounds(clipped);
    this.view.webContents.setZoomFactor(
      Math.max(
        0.1,
        Math.min(clipped.width / this.snapshot.width, clipped.height / this.snapshot.height),
      ),
    );
    this.view.setVisible(
      clipped.visible && clipped.width > 0 && clipped.height > 0 && !this.window.isMinimized(),
    );
  };
  constructor(private readonly window: BrowserWindow) {
    window.on('resize', this.sync);
    window.on('minimize', this.sync);
    window.on('restore', this.sync);
    window.on('show', this.sync);
    window.once('closed', this.dispose);
  }
  async open(snapshot: SourceSnapshot, assets: Assets): Promise<void> {
    this.close();
    this.snapshot = snapshot;
    const isolated = session.fromPartition('source-editor-' + randomUUID(), { cache: false });
    isolated.setPermissionRequestHandler((_c, _p, cb) => cb(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.setDevicePermissionHandler(() => false);
    const deny = (event: Electron.Event): void => event.preventDefault();
    isolated.on('will-download', deny);
    isolated.webRequest.onBeforeRequest((details, cb) =>
      cb({ cancel: !details.url.startsWith('data:') }),
    );
    const view = new WebContentsView({
      webPreferences: {
        session: isolated,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        webviewTag: false,
        navigateOnDragDrop: false,
        devTools: false,
      },
    });
    this.view = view;
    view.setVisible(false);
    this.window.contentView.addChildView(view);
    const contents = view.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', deny);
    contents.on('will-frame-navigate', deny);
    contents.on('will-redirect', deny);
    contents.on('will-attach-webview', deny);
    contents.once('destroyed', () => {
      isolated.removeListener('will-download', deny);
      isolated.webRequest.onBeforeRequest(null);
      void isolated.clearStorageData();
    });
    contents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && ['Escape', 'Tab'].includes(input.key)) {
        event.preventDefault();
        this.window.webContents.focus();
        if (input.key === 'Escape') {
          this.escape = true;
          this.bounds = { ...this.bounds, visible: false };
          this.sync();
        } else this.focus = true;
      }
    });
    contents.on('console-message', (event) => {
      if (
        this.view !== view ||
        !event.message.startsWith('auralide-source:') ||
        event.message.length > 1000
      )
        return;
      try {
        const parsed = messageSchema.safeParse(
          JSON.parse(event.message.slice('auralide-source:'.length)),
        );
        if (!parsed.success || !snapshot.nodes.some((node) => node.id === parsed.data.nodeId))
          return;
        if (parsed.data.type === 'select')
          void this.select(parsed.data.nodeId).catch(() => undefined);
        else {
          const data = parsed.data;
          void this.select(data.nodeId)
            .then(() => {
              if (this.view === view)
                this.move = {
                  nodeId: data.nodeId,
                  offsetX: data.offsetX,
                  offsetY: data.offsetY,
                  sequence: ++this.sequence,
                };
            })
            .catch(() => undefined);
        }
      } catch {
        /* Unrecognized guest messages never become an editing request. */
      }
    });
    const url = assetUrl(snapshot.assetId, assets);
    let html = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64').toString('utf8');
    html = html.replace(
      /<head(?:\s[^>]*)?>/i,
      (head) =>
        `${head}<meta http-equiv="Content-Security-Policy" content="script-src 'none';connect-src 'none';frame-src 'none';object-src 'none';base-uri 'none';form-action 'none'">`,
    );
    try {
      await contents.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
      if (this.view !== view || contents.isDestroyed()) throw new Error('源码预览已关闭。');
      await contents.executeJavaScript(`(${installSourceSelection.toString()})()`);
      this.sync();
    } catch (error) {
      if (this.view === view) this.close();
      throw error;
    }
  }
  async select(nodeId: string): Promise<SourceSelection> {
    const view = this.view;
    if (!view || !this.snapshot?.nodes.some((node) => node.id === nodeId))
      throw new Error('源码节点已失效，请重新选择。');
    const selected = (await view.webContents.executeJavaScript(
      `(${inspectSourceNode.toString()})(${JSON.stringify(nodeId)})`,
    )) as SourceSelection;
    if (this.view !== view) throw new Error('源码预览已改变。');
    this.selection = selected;
    return selected;
  }
  matches(revision: number, assetId: string): boolean {
    return (
      this.snapshot?.document.revision === revision &&
      this.snapshot.assetId === assetId &&
      !!this.view &&
      !this.view.webContents.isDestroyed()
    );
  }
  readStatus(): SourceViewStatus {
    const value = {
      selection: this.selection,
      move: this.move,
      escape: this.escape,
      focus: this.focus,
    };
    this.move = null;
    this.escape = false;
    this.focus = false;
    return value;
  }
  getSelection(): SourceSelection | null {
    return this.selection;
  }
  setBounds(input: unknown): boolean {
    const checked = auraBoundsSchema.safeParse(input);
    if (!checked.success) return false;
    this.bounds = checked.data;
    this.sync();
    return true;
  }
  close = (): void => {
    const view = this.view;
    this.view = null;
    this.snapshot = null;
    this.selection = null;
    this.move = null;
    this.escape = false;
    this.focus = false;
    if (view) {
      if (!this.window.isDestroyed()) this.window.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
  };
  dispose = (): void => {
    this.close();
    this.window.removeListener('resize', this.sync);
    this.window.removeListener('minimize', this.sync);
    this.window.removeListener('restore', this.sync);
    this.window.removeListener('show', this.sync);
    this.window.removeListener('closed', this.dispose);
  };
}

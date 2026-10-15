import { randomUUID } from 'node:crypto';

import { auraRequestSchema } from '@auralide/agent';
import type { AuraAuditEntry, AuraData, AuraDiagnostics, AuraElement, AuraErrorCode, AuraRequest, AuraResult, AuraTab } from '@auralide/agent';
import type { Presentation } from '@auralide/core';
import { session, WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';

import { auraBoundsSchema, clipBounds } from './policy.js';
import type { AuraBounds } from './policy.js';
import { LAB_HTML, renderSlideHtml } from './render.js';

interface Tab { readonly info: AuraTab; readonly view: WebContentsView }
const fail = (code: AuraErrorCode, message: string): AuraResult => ({ ok: false, error: { code, message } });
const success = (value: AuraData): AuraResult => ({ ok: true, value });
// Fixed inspection code only: no caller-supplied JavaScript or selector crosses this boundary.
const INSPECT = `Array.from(document.querySelectorAll('[data-element-id]')).slice(0,10000).map(el => {const r=el.getBoundingClientRect();return {id:el.getAttribute('data-element-id'),tag:el.tagName.toLowerCase(),text:(el.textContent||'').slice(0,2000),x:r.x,y:r.y,width:r.width,height:r.height}})`;
const DIAGNOSTICS = `({elementCount:document.querySelectorAll('[data-element-id]').length,scriptCount:document.scripts.length,title:document.title.slice(0,500)})`;

/** Main-owned guest runtime. Only the authenticated editor shell may invoke it. */
export class BrowserController {
  private readonly tabs = new Map<string, Tab>();
  private sequence = 0;
  private activeId: string | null = null;
  private disposed = false;
  private bounds: AuraBounds = { x: 0, y: 0, width: 0, height: 0, visible: false };
  private pending: Promise<unknown> = Promise.resolve();
  private readonly audit: AuraAuditEntry[] = [];
  private readonly sync = (): void => {
    if (this.disposed || this.window.isDestroyed()) return;
    const [width = 0, height = 0] = this.window.getContentSize();
    const zoom = this.window.webContents.getZoomFactor();
    const clipped = clipBounds({ ...this.bounds, x: Math.round(this.bounds.x * zoom), y: Math.round(this.bounds.y * zoom), width: Math.round(this.bounds.width * zoom), height: Math.round(this.bounds.height * zoom) }, width, height);
    for (const [id, tab] of this.tabs) {
      tab.view.setBounds({ x: clipped.x, y: clipped.y, width: clipped.width, height: clipped.height });
      tab.view.setVisible(id === this.activeId && clipped.visible && clipped.width > 0 && clipped.height > 0 && !this.window.isMinimized());
    }
  };

  constructor(private readonly window: BrowserWindow, private readonly getDocument: () => Presentation) {
    window.on('resize', this.sync);
    window.on('minimize', this.sync);
    window.on('restore', this.sync);
    window.on('show', this.sync);
    window.once('closed', this.dispose);
  }

  setBounds(input: unknown): boolean {
    const parsed = auraBoundsSchema.safeParse(input);
    if (!parsed.success || this.disposed) return false;
    this.bounds = parsed.data;
    this.sync();
    return true;
  }

  getAudit(): readonly AuraAuditEntry[] { return this.audit.map((entry) => ({ ...entry })); }

  invoke(input: unknown): Promise<AuraResult> {
    const parsed = auraRequestSchema.safeParse(input);
    if (!parsed.success) return Promise.resolve(fail('invalid-input', 'Invalid Aura tool input.'));
    const operation = this.pending.then(async () => {
      let result: AuraResult;
      try { result = await this.execute(parsed.data); }
      catch { result = fail('runtime-error', 'Aura runtime operation failed.'); }
      this.audit.push({ tool: parsed.data.tool, actor: 'human/desktop', timestamp: new Date().toISOString(), revision: this.getDocument().revision, outcome: result.ok ? 'ok' : result.error.code });
      if (this.audit.length > 50) this.audit.shift();
      return result;
    });
    this.pending = operation;
    return operation;
  }

  private async open(mode: AuraTab['mode'], html: string, revision: number, slideId: string | null): Promise<AuraResult> {
    const previous = [...this.tabs.values()].find((tab) => tab.info.mode === mode);
    if (previous !== undefined) this.close(previous.info.id);
    const id = `aura-${++this.sequence}`;
    const isolatedSession = session.fromPartition(`aura-${mode}-${randomUUID()}`, { cache: false });
    const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolatedSession.setPermissionCheckHandler(() => false);
    isolatedSession.setDevicePermissionHandler(() => false);
    isolatedSession.on('will-download', (event) => event.preventDefault());
    isolatedSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== url || details.resourceType !== 'mainFrame' }));
    const view = new WebContentsView({ webPreferences: { session: isolatedSession, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false, navigateOnDragDrop: false, devTools: false } });
    const contents = view.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.on('will-frame-navigate', (event) => event.preventDefault());
    contents.on('will-redirect', (event) => event.preventDefault());
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.on('render-process-gone', () => this.close(id));
    view.setVisible(false);
    const info: AuraTab = { id, mode, revision, slideId };
    this.tabs.set(id, { info, view });
    this.window.contentView.addChildView(view);
    try { await contents.loadURL(url); }
    catch { this.close(id); return fail('runtime-error', 'Preview could not be loaded.'); }
    if (this.disposed || contents.isDestroyed()) return fail('runtime-error', 'Preview was closed.');
    if (this.getDocument().revision !== revision) { this.close(id); return fail('revision-conflict', 'Document changed while loading preview.'); }
    this.activeId = id;
    this.sync();
    return success(info);
  }

  private close(id: string): void {
    const tab = this.tabs.get(id);
    if (tab === undefined) return;
    this.tabs.delete(id);
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(tab.view);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    if (this.activeId === id) this.activeId = [...this.tabs.keys()].at(-1) ?? null;
    this.sync();
  }

  private async execute(request: AuraRequest): Promise<AuraResult> {
    if (this.disposed || this.window.isDestroyed()) return fail('runtime-error', 'Aura runtime is closed.');
    const document = this.getDocument();
    if (request.tool === 'browser.listTabs') return success([...this.tabs.values()].map((tab) => tab.info));
    if (request.tool === 'browser.open') return this.open('html-lab', LAB_HTML, document.revision, null);
    if (request.tool === 'preview.render') {
      if (request.input.expectedRevision !== document.revision) return fail('revision-conflict', 'Document revision changed.');
      if (!document.slides.some((slide) => slide.id === request.input.slideId)) return fail('not-found', 'Slide not found.');
      return this.open('slide-preview', renderSlideHtml(document, request.input.slideId), document.revision, request.input.slideId);
    }
    const tab = this.tabs.get(request.input.tabId);
    if (tab === undefined) return fail('not-found', 'Tab not found.');
    if (request.tool === 'browser.close') { this.close(tab.info.id); return success(null); }
    if (request.tool === 'browser.activate') { this.activeId = tab.info.id; this.sync(); return success(tab.info); }
    if (request.input.expectedRevision !== document.revision || (request.tool !== 'preview.getDiagnostics' && tab.info.revision !== document.revision)) return fail('revision-conflict', 'Render the current document revision before inspection.');
    const contents = tab.view.webContents;
    let value: AuraData;
    if (request.tool === 'preview.inspectElement') {
      const elements = await contents.executeJavaScript(INSPECT) as AuraElement[];
      const element = elements.find((candidate) => candidate.id === request.input.elementId);
      if (element === undefined) return fail('not-found', 'Element not found in this preview.');
      value = element;
    } else if (request.tool === 'preview.getDiagnostics') {
      const diagnostics = await contents.executeJavaScript(DIAGNOSTICS) as Pick<AuraDiagnostics, 'elementCount' | 'scriptCount' | 'title'>;
      value = { ...diagnostics, tabId: tab.info.id, revision: tab.info.revision, mode: tab.info.mode, currentRevision: document.revision, stale: tab.info.revision !== document.revision, bounds: tab.view.getBounds(), minimized: this.window.isMinimized(), visible: tab.view.getVisible() };
    } else {
      const bounds = tab.view.getBounds();
      if (!tab.view.getVisible() || bounds.width <= 0 || bounds.height <= 0 || bounds.width > 4096 || bounds.height > 4096 || bounds.width * bounds.height > 8_000_000) return fail('permission-denied', 'Screenshot requires visible bounds within the POC pixel budget.');
      const image = await contents.capturePage();
      const png = image.toPNG();
      if (png.length > 8_000_000) return fail('permission-denied', 'Screenshot exceeds the POC byte budget.');
      value = { tabId: tab.info.id, revision: tab.info.revision, mimeType: 'image/png', base64: png.toString('base64') };
    }
    if (this.getDocument().revision !== document.revision || contents.isDestroyed()) return fail('revision-conflict', 'Document changed during inspection.');
    return success(value);
  }

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.window.removeListener('resize', this.sync);
    this.window.removeListener('minimize', this.sync);
    this.window.removeListener('restore', this.sync);
    this.window.removeListener('show', this.sync);
    this.window.removeListener('closed', this.dispose);
    for (const id of [...this.tabs.keys()]) this.close(id);
  };
}




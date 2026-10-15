import { EventEmitter } from 'node:events';

import { auraRequestSchema } from '@auralide/agent';
import { presentationSchema } from '@auralide/core';
import { PREVIEW_CSP, renderSlideHtml } from '@auralide/renderer';
import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { BrowserController } from '../src/aura/browser-controller.js';
import { auraBoundsSchema, clipBounds } from '../src/aura/policy.js';
import { LAB_HTML } from '../src/aura/render.js';

const guest = vi.hoisted(() => ({
  preferences: [] as Record<string, unknown>[],
  sessions: [] as string[],
}));
vi.mock('electron', async () => {
  const { EventEmitter: Events } = await import('node:events');
  return {
    session: {
      fromPartition: (partition: string) => {
        guest.sessions.push(partition);
        return {
          setPermissionRequestHandler: vi.fn(),
          setPermissionCheckHandler: vi.fn(),
          setDevicePermissionHandler: vi.fn(),
          on: vi.fn(),
          removeAllListeners: vi.fn(),
          webRequest: { onBeforeRequest: vi.fn() },
        };
      },
    },
    WebContentsView: class {
      private bounds = { x: 0, y: 0, width: 0, height: 0 };
      private visible = false;
      readonly webContents = Object.assign(new Events(), {
        setWindowOpenHandler: vi.fn(),
        setZoomFactor: vi.fn(),
        loadURL: vi.fn(async () => {}),
        isDestroyed: vi.fn(() => false),
        close: vi.fn(),
        executeJavaScript: vi.fn(async () => ({
          elementCount: 1,
          scriptCount: 0,
          title: 'Preview',
        })),
      });
      constructor(options: { webPreferences: Record<string, unknown> }) {
        guest.preferences.push(options.webPreferences);
      }
      setBounds(bounds: typeof this.bounds): void {
        this.bounds = bounds;
      }
      getBounds(): typeof this.bounds {
        return this.bounds;
      }
      setVisible(visible: boolean): void {
        this.visible = visible;
      }
      getVisible(): boolean {
        return this.visible;
      }
    },
  };
});
const document = () =>
  presentationSchema.parse({
    schemaVersion: '1.0',
    id: 'pres_test',
    title: 'Test',
    revision: 0,
    slideSize: { width: 1280, height: 720 },
    slides: [
      {
        id: 'slide_one',
        elements: [
          {
            id: 'el_one',
            kind: 'text',
            text: '</div><script>alert(1)</script>',
            geometry: { x: 1, y: 2, width: 300, height: 100 },
            style: { color: 'red;background:url(https://evil.test)' },
          },
        ],
      },
    ],
  });
const setup = () => {
  let doc = document();
  let minimized = false;
  const children: unknown[] = [];
  const window = Object.assign(new EventEmitter(), {
    getContentSize: () => [800, 600],
    isDestroyed: () => false,
    isMinimized: () => minimized,
    webContents: { getZoomFactor: () => 1 },
    contentView: {
      addChildView: (view: unknown) => children.push(view),
      removeChildView: (view: unknown) => children.splice(children.indexOf(view), 1),
    },
  });
  const controller = new BrowserController(window as unknown as BrowserWindow, () => doc);
  return {
    controller,
    children,
    window,
    advance: () => {
      doc = { ...doc, revision: doc.revision + 1 };
    },
    minimize: (value: boolean) => {
      minimized = value;
      window.emit(value ? 'minimize' : 'restore');
    },
  };
};

describe('Aura contract and inert rendering', () => {
  it('rejects arbitrary URLs, scripts, selectors, unknown fields and stale input shape', () => {
    for (const request of [
      { tool: 'browser.open', input: { url: 'https://example.com' } },
      { tool: 'preview.render', input: { slideId: 'slide_one', expectedRevision: -1 } },
      {
        tool: 'preview.inspectElement',
        input: { tabId: 'aura-1', elementId: 'el_one', expectedRevision: 0, script: 'alert(1)' },
      },
      { tool: 'browser.executeJavaScript', input: {} },
    ])
      expect(auraRequestSchema.safeParse(request).success).toBe(false);
  });
  it('escapes text and ids, refuses CSS injection, forbids scripts and asset fetches', () => {
    const html = renderSlideHtml(document(), 'slide_one');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('evil.test');
    expect(html).toContain('data-element-id="el_one"');
    expect(html).toContain(PREVIEW_CSP);
    expect(LAB_HTML).toContain("script-src 'none'");
    expect(() => renderSlideHtml(document(), 'slide_missing')).toThrow();
  });
  it('validates and clips native bounds', () => {
    expect(
      auraBoundsSchema.safeParse({ x: NaN, y: 0, width: 200, height: 200, visible: true }).success,
    ).toBe(false);
    expect(
      clipBounds({ x: 750, y: 650, width: 200, height: 200, visible: true }, 800, 600),
    ).toEqual({ x: 750, y: 600, width: 50, height: 0, visible: true });
  });
});

describe('Aura controller lifecycle', () => {
  it('bounds resources, separates sessions, hides overlays and disposes every guest', async () => {
    const { controller, children, minimize } = setup();
    controller.setBounds({ x: 500, y: 100, width: 500, height: 600, visible: true });
    expect(
      await controller.invoke({
        tool: 'preview.render',
        input: { slideId: 'slide_one', expectedRevision: 0 },
      }),
    ).toMatchObject({ ok: true, value: { id: 'aura-1' } });
    await controller.invoke({ tool: 'browser.open', input: { fixture: 'layout-basics' } });
    expect(children).toHaveLength(2);
    expect(guest.sessions.at(-1)).not.toBe(guest.sessions.at(-2));
    expect(guest.sessions.every((partition) => !partition.startsWith('persist:'))).toBe(true);
    expect(guest.preferences.at(-1)).toMatchObject({
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      webviewTag: false,
    });
    expect(guest.preferences.at(-1)).not.toHaveProperty('preload');
    const diagnostics = () =>
      controller.invoke({
        tool: 'preview.getDiagnostics',
        input: { tabId: 'aura-2', expectedRevision: 0 },
      });
    expect(await diagnostics()).toMatchObject({
      ok: true,
      value: { visible: true, bounds: { x: 500, y: 100, width: 300, height: 500 } },
    });
    minimize(true);
    expect(await diagnostics()).toMatchObject({
      ok: true,
      value: { visible: false, minimized: true },
    });
    minimize(false);
    controller.setBounds({ x: 0, y: 0, width: 400, height: 300, visible: false });
    expect(await diagnostics()).toMatchObject({ ok: true, value: { visible: false } });
    await controller.invoke({
      tool: 'preview.render',
      input: { slideId: 'slide_one', expectedRevision: 0 },
    });
    expect(children).toHaveLength(2);
    controller.dispose();
    expect(children).toHaveLength(0);
    expect(await controller.invoke({ tool: 'browser.listTabs', input: {} })).toMatchObject({
      ok: false,
      error: { code: 'runtime-error' },
    });
  });
  it('rejects stale render/inspection, reports stale diagnostics, and bounds audit metadata', async () => {
    const { controller, advance } = setup();
    await controller.invoke({ tool: 'unsafe-secret-request', input: { secret: 'do-not-log' } });
    expect(controller.getAudit()[0]).toMatchObject({
      tool: 'invalid-input',
      outcome: 'invalid-input',
    });
    expect(JSON.stringify(controller.getAudit())).not.toContain('do-not-log');
    await controller.invoke({
      tool: 'preview.render',
      input: { slideId: 'slide_one', expectedRevision: 0 },
    });
    advance();
    expect(
      await controller.invoke({
        tool: 'preview.render',
        input: { slideId: 'slide_one', expectedRevision: 0 },
      }),
    ).toMatchObject({ ok: false, error: { code: 'revision-conflict' } });
    expect(
      await controller.invoke({
        tool: 'preview.inspectElement',
        input: { tabId: 'aura-1', elementId: 'el_one', expectedRevision: 1 },
      }),
    ).toMatchObject({ ok: false, error: { code: 'revision-conflict' } });
    expect(
      await controller.invoke({
        tool: 'preview.getDiagnostics',
        input: { tabId: 'aura-1', expectedRevision: 1 },
      }),
    ).toMatchObject({ ok: true, value: { stale: true, currentRevision: 1, revision: 0 } });
    for (let i = 0; i < 55; i++) await controller.invoke({ tool: 'browser.listTabs', input: {} });
    expect(controller.getAudit()).toHaveLength(50);
    expect(controller.getAudit()[0]).toMatchObject({ actor: 'human/desktop', outcome: 'ok' });
    expect(JSON.stringify(controller.getAudit())).not.toContain('script');
    controller.dispose();
  });
});

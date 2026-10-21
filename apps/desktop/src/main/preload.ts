import { contextBridge, ipcRenderer } from 'electron';
import type { CommandEnvelope, CommandError, Presentation, Result } from '@auralide/core';
import type { AuraRequest, AuraResult } from '@auralide/agent';

import type { AuralideApi, PingRequest, PingResponse, RuntimeInfo } from '../shared/api.js';
import { BRIDGE_GLOBAL, BRIDGE_VERSION, IPC } from '../shared/channels.js';

/**
 * The preload bridge: the **only** capability the renderer receives.
 *
 * Rules this file must keep, because they are what makes the boundary meaningful:
 * - expose named operations, never `ipcRenderer` itself and never a generic `invoke(channel, ...)`;
 * - no `require`, no `process`, no filesystem, no shell;
 * - freeze the surface so renderer code cannot patch it;
 * - stay free of Node-only APIs other than the `electron` module the sandbox allows.
 *
 * Payload validation deliberately lives in the main process (see `src/shared/schemas.ts`), so this
 * file keeps no decision-making of its own.
 */
const api: AuralideApi = Object.freeze({
  bridgeVersion: BRIDGE_VERSION,
  getRuntimeInfo: (): Promise<RuntimeInfo> => ipcRenderer.invoke(IPC.runtimeInfo),
  ping: (request: PingRequest): Promise<PingResponse> => ipcRenderer.invoke(IPC.ping, request),
  getDocument: (): Promise<Presentation> => ipcRenderer.invoke(IPC.getDocument),
  getDocumentAssets: () => ipcRenderer.invoke(IPC.getDocumentAssets),
  openSourceEditor: (request: Parameters<AuralideApi['openSourceEditor']>[0]) =>
    ipcRenderer.invoke(IPC.openSourceEditor, request),
  selectSourceNode: (request: Parameters<AuralideApi['selectSourceNode']>[0]) =>
    ipcRenderer.invoke(IPC.selectSourceNode, request),
  getSourceSelection: (request: Parameters<AuralideApi['getSourceSelection']>[0]) =>
    ipcRenderer.invoke(IPC.getSourceSelection, request),
  editSource: (request: Parameters<AuralideApi['editSource']>[0]) =>
    ipcRenderer.invoke(IPC.editSource, request),
  replaceSourceAsset: (request: Parameters<AuralideApi['replaceSourceAsset']>[0]) =>
    ipcRenderer.invoke(IPC.replaceSourceAsset, request),
  closeSourceEditor: () => ipcRenderer.invoke(IPC.closeSourceEditor),
  sourceSetBounds: (request: Parameters<AuralideApi['sourceSetBounds']>[0]) =>
    ipcRenderer.invoke(IPC.sourceSetBounds, request),
  playDocument: (request: Parameters<AuralideApi['playDocument']>[0]) =>
    ipcRenderer.invoke(IPC.playDocument, request),
  importSourceHtml: (request: Parameters<AuralideApi['importSourceHtml']>[0]) =>
    ipcRenderer.invoke(IPC.importSourceHtml, request),
  insertAsset: (request: Parameters<AuralideApi['insertAsset']>[0]) =>
    ipcRenderer.invoke(IPC.insertAsset, request),
  getDocumentStatus: () => ipcRenderer.invoke(IPC.getDocumentStatus),
  editHistory: (request: Parameters<AuralideApi['editHistory']>[0]) =>
    ipcRenderer.invoke(IPC.editHistory, request),
  saveDocument: (request: Parameters<AuralideApi['saveDocument']>[0]) =>
    ipcRenderer.invoke(IPC.saveDocument, request),
  newDocument: (request: Parameters<AuralideApi['newDocument']>[0]) =>
    ipcRenderer.invoke(IPC.newDocument, request),
  saveDocumentAs: (request: Parameters<AuralideApi['saveDocumentAs']>[0]) =>
    ipcRenderer.invoke(IPC.saveDocumentAs, request),
  importHtml: (request: Parameters<AuralideApi['importHtml']>[0]) =>
    ipcRenderer.invoke(IPC.importHtml, request),
  exportHtml: (request: Parameters<AuralideApi['exportHtml']>[0]) =>
    ipcRenderer.invoke(IPC.exportHtml, request),
  openDocument: (request: Parameters<AuralideApi['openDocument']>[0]) =>
    ipcRenderer.invoke(IPC.openDocument, request),
  applyCommand: (command: CommandEnvelope): Promise<Result<Presentation, CommandError>> =>
    ipcRenderer.invoke(IPC.applyCommand, command),
  auraInvoke: (request: AuraRequest): Promise<AuraResult> =>
    ipcRenderer.invoke(IPC.auraInvoke, request),
  auraSetBounds: (bounds: Parameters<AuralideApi['auraSetBounds']>[0]): Promise<boolean> =>
    ipcRenderer.invoke(IPC.auraBounds, bounds),
});

contextBridge.exposeInMainWorld(BRIDGE_GLOBAL, api);

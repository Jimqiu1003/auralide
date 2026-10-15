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
  saveDocument: (request: Parameters<AuralideApi['saveDocument']>[0]) =>
    ipcRenderer.invoke(IPC.saveDocument, request),
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

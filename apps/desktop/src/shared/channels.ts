/**
 * IPC channel names shared by the main process and the preload bridge.
 *
 * The main process registers handlers **only** for the channels listed in `IPC_ALLOW_LIST`; anything
 * else in the process has no handler. Keep this module free of runtime dependencies so the preload
 * bundle stays tiny and auditable.
 */

export const IPC = {
  /** Returns version/platform information about the running application. */
  runtimeInfo: 'auralide:runtime-info',
  /** Validated echo used to prove the renderer can reach the main process safely. */
  ping: 'auralide:ping',
  getDocument: 'auralide:get-document',
  getDocumentStatus: 'auralide:get-document-status',
  applyCommand: 'auralide:apply-command',
  saveDocument: 'auralide:save-document',
  newDocument: 'auralide:new-document',
  saveDocumentAs: 'auralide:save-document-as',
  importHtml: 'auralide:import-html',
  exportHtml: 'auralide:export-html',
  openDocument: 'auralide:open-document',
  auraInvoke: 'auralide:aura-invoke',
  auraBounds: 'auralide:aura-bounds',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** The complete allow-list of channels that may have a handler in the main process. */
export const IPC_ALLOW_LIST: readonly IpcChannel[] = Object.freeze(Object.values(IPC));

/** Name of the single global the preload exposes to the renderer. */
export const BRIDGE_GLOBAL = 'auralide';

/** Version of the bridge surface itself; bumped when the exposed API shape changes. */
export const BRIDGE_VERSION = '1.5.0';

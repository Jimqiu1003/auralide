import type { Layer } from '@auralide/core';

/**
 * Layer declaration used by architecture tooling and boundary checks.
 *
 * P0 intentionally ships no product logic here (see docs/decisions/ADR-0001-foundation.md):
 * P1 adds the first real module behind this boundary.
 */
export const layer: Layer = 'agent';

export { auraRequestSchema } from './browser-contract.js';
export type { AuraRequest, AuraTab, AuraElement, AuraDiagnostics, AuraScreenshot, AuraData, AuraErrorCode, AuraResult, AuraAuditEntry } from './browser-contract.js';

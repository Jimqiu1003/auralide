import type { Layer } from '@auralide/core';

/**
 * Layer declaration used by architecture tooling and boundary checks.
 *
 * P0 intentionally ships no product logic here (see docs/decisions/ADR-0001-foundation.md):
 * P1 adds the first real module behind this boundary.
 */
export const layer: Layer = 'exporters';
export {
  addAsset,
  validateBundle,
  serializeBundle,
  readBundleJson,
  readBundleHtml,
  MAX_BUNDLE_BYTES,
  assertBundleSize,
} from './bundle.js';
export type { DocumentBundle } from './bundle.js';

export { exportPresentationHtml } from './html.js';

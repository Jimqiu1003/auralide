import type { Layer } from '@auralide/core';

/**
 * Layer declaration used by architecture tooling and boundary checks.
 *
 * P0 intentionally ships no product logic here (see docs/decisions/ADR-0001-foundation.md):
 * P1 adds the first real module behind this boundary.
 */
export const layer: Layer = 'renderer';
export { assetUrl, SOURCE_CSP } from './assets.js';
export type { Asset, Assets } from './assets.js';
export { PREVIEW_CSP, renderSlideHtml, renderSlideMarkup, escapeHtml } from './preview.js';

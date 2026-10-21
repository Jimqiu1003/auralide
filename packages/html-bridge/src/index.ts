import type { Layer } from '@auralide/core';

/**
 * Layer declaration used by architecture tooling and boundary checks.
 *
 * P0 intentionally ships no product logic here (see docs/decisions/ADR-0001-foundation.md):
 * P1 adds the first real module behind this boundary.
 */
export const layer: Layer = 'html-bridge';
export { scanSourceHtml } from './source.js';
export { patchSourceHtml, inspectSourceNode, installSourceSelection } from './source-edit.js';
export type { SourceScan, SourceReference } from './source.js';

export { HTML_IMPORT_SCRIPT } from './import.js';
export type { HtmlImportReport, HtmlSnapshot } from './import.js';

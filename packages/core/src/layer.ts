/**
 * Canonical architecture layers.
 *
 * The list is the shared vocabulary for layer declarations, boundary rules and future
 * diagnostics. Agent-facing and export layers sit outside the editing core.
 */
export const LAYERS = [
  'core',
  'renderer',
  'canvas',
  'editor-ui',
  'html-bridge',
  'agent',
  'exporters',
] as const;

/** Identifier of an architecture layer. */
export type Layer = (typeof LAYERS)[number];

/** Type guard for layer identifiers arriving from configuration or tooling. */
export const isLayer = (value: string): value is Layer =>
  (LAYERS as readonly string[]).includes(value);

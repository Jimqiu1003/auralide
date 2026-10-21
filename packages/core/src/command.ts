import { z } from 'zod';

import {
  coordinateSchema,
  editOriginSchema,
  elementSchema,
  geometrySchema,
  textStyleSchema,
  elementCommonPropertiesSchema,
} from './document.js';
import type { DeepReadonly } from './document.js';
import { elementIdSchema, slideIdSchema } from './ids.js';

/**
 * The command contract: the one validated interface through which the editor UI, the CLI and future
 * agents change a document (ADR-0002 §4).
 *
 * A command is plain JSON — `{ operation, target, payload, expectedRevision, origin }` — so the same
 * shape travels over IPC, a CLI invocation and a file. The dispatcher in `dispatcher.ts` is the only
 * code that turns one into a new document.
 */

/** Operations implemented in P1. */
export const COMMAND_OPERATIONS = [
  'slide.create',
  'slide.remove',
  'element.add',
  'element.move',
  'element.updateText',
  'element.remove',
  'element.updateProperties',
  'element.reorder',
  'slide.updateProperties',
] as const;
export type CommandOperation = (typeof COMMAND_OPERATIONS)[number];

/** Type guard for an operation name arriving from outside the package. */
export const isCommandOperation = (value: unknown): value is CommandOperation =>
  typeof value === 'string' && (COMMAND_OPERATIONS as readonly string[]).includes(value);

/** What a command acts on. The dispatcher proves the named object really exists. */
export const presentationTargetSchema = z.strictObject({ kind: z.literal('presentation') });
export const slideTargetSchema = z.strictObject({
  kind: z.literal('slide'),
  slideId: slideIdSchema,
});
export const elementTargetSchema = z.strictObject({
  kind: z.literal('element'),
  slideId: slideIdSchema,
  elementId: elementIdSchema,
});
export const commandTargetSchema = z.discriminatedUnion('kind', [
  presentationTargetSchema,
  slideTargetSchema,
  elementTargetSchema,
]);

export type PresentationTarget = DeepReadonly<z.output<typeof presentationTargetSchema>>;
export type SlideTarget = DeepReadonly<z.output<typeof slideTargetSchema>>;
export type ElementTarget = DeepReadonly<z.output<typeof elementTargetSchema>>;
export type CommandTarget = DeepReadonly<z.output<typeof commandTargetSchema>>;

/** Payload of an operation that takes no parameters. */
export const emptyPayloadSchema = z.strictObject({});
export type EmptyPayload = DeepReadonly<z.output<typeof emptyPayloadSchema>>;

/** `slide.create`: the new slide id is chosen by the caller (see `createIdGenerator`). */
export const slideCreatePayloadSchema = z.strictObject({
  id: slideIdSchema,
  name: z.string().min(1).max(200).optional(),
  backgroundColor: z.string().min(1).max(100).optional(),
});
export const slideUpdatePropertiesPayloadSchema = z.strictObject({
  transition: z.enum(['none', 'fade', 'slide']),
});
export type SlideCreatePayload = DeepReadonly<z.output<typeof slideCreatePayloadSchema>>;

/** `element.add`: appends a complete element (its id included) to a slide. */
export const elementAddPayloadSchema = z.strictObject({ element: elementSchema });
export type ElementAddPayload = DeepReadonly<z.output<typeof elementAddPayloadSchema>>;

/** `element.move`: absolute new position; the size is untouched. */
export const elementMovePayloadSchema = z.strictObject({
  x: coordinateSchema,
  y: coordinateSchema,
});
export type ElementMovePayload = DeepReadonly<z.output<typeof elementMovePayloadSchema>>;

/** `element.updateText`: replaces the text of a text element. */
export const elementUpdateTextPayloadSchema = z.strictObject({ text: z.string() });
const literalColor = z.string().regex(/^(#[0-9a-f]{3,8}|[a-z]{1,20})$/i);
export const elementUpdatePropertiesPayloadSchema = z
  .strictObject({
    ...elementCommonPropertiesSchema.shape,
    geometry: geometrySchema.optional(),
    style: textStyleSchema
      .extend({ color: literalColor.optional() })
      .refine(
        (value) =>
          Object.keys(value).length > 0 &&
          Object.values(value).every((field) => field !== undefined),
      )
      .optional(),
    fill: literalColor.optional(),
    stroke: literalColor.optional(),
  })
  .refine(
    (value) =>
      Object.keys(value).length > 0 && Object.values(value).every((field) => field !== undefined),
    'Defined properties are required.',
  );
export const elementReorderPayloadSchema = z.strictObject({ index: z.int().min(0) });
export type ElementUpdateTextPayload = DeepReadonly<
  z.output<typeof elementUpdateTextPayloadSchema>
>;

/**
 * The command envelope, minus the per-operation target and payload checks.
 *
 * Every command carries all five fields, including `payload` for parameterless operations, so one
 * wire format covers all of them. Unknown fields are rejected rather than ignored.
 */
export const commandEnvelopeSchema = z.strictObject({
  operation: z.string(),
  target: z.unknown(),
  payload: z.unknown(),
  expectedRevision: z.int().min(0),
  origin: editOriginSchema,
});
export type CommandEnvelope = DeepReadonly<z.output<typeof commandEnvelopeSchema>>;

/** Why a command was refused. */
export type CommandErrorCode =
  | 'target-not-found'
  | 'invalid-payload'
  | 'stale-revision'
  | 'unsupported-operation'
  | 'conflict'
  | 'nothing-to-undo'
  | 'nothing-to-redo';

/**
 * Discriminated command failure.
 *
 * `target-not-found`, `invalid-payload`, `stale-revision`, `unsupported-operation` and `conflict`
 * are the dispatcher's failure modes; `nothing-to-undo` / `nothing-to-redo` guard the history edge.
 */
export interface CommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
}

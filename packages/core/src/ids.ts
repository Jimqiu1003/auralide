import { z } from 'zod';

/**
 * Stable identifier contract.
 *
 * An entity id is a plain string that carries its entity kind as a prefix, so an id stays
 * self-describing in documents, logs and agent payloads. The Zod schemas brand the parsed value,
 * which turns "passed a slide id where an element id was expected" into a compile-time error.
 */
export const ID_PREFIXES = {
  presentation: 'pres',
  slide: 'slide',
  element: 'el',
} as const;

/** Entity kinds that own a stable id. */
export type IdKind = keyof typeof ID_PREFIXES;

/** Validates and brands a presentation document id (`pres_…`). */
export const presentationIdSchema = z
  .string()
  .startsWith(`${ID_PREFIXES.presentation}_`)
  .brand<'PresentationId'>();

/** Validates and brands a slide id (`slide_…`). */
export const slideIdSchema = z.string().startsWith(`${ID_PREFIXES.slide}_`).brand<'SlideId'>();

/** Validates and brands an element id (`el_…`). */
export const elementIdSchema = z
  .string()
  .startsWith(`${ID_PREFIXES.element}_`)
  .brand<'ElementId'>();

/** Identifier of a presentation document. */
export type PresentationId = z.output<typeof presentationIdSchema>;
/** Identifier of a slide inside a document. */
export type SlideId = z.output<typeof slideIdSchema>;
/** Identifier of an element inside a slide. */
export type ElementId = z.output<typeof elementIdSchema>;

/**
 * Produces the unique part of a generated id, without the kind prefix.
 *
 * Injecting the source keeps id generation deterministic for tests and for imports that must
 * reproduce ids, instead of forcing every caller onto a random or clock-based default.
 */
export type IdSuffixSource = () => string;

/** Typed id factory: one method per entity kind, never a loose "newId(kind)" string. */
export interface IdGenerator {
  readonly presentationId: () => PresentationId;
  readonly slideId: () => SlideId;
  readonly elementId: () => ElementId;
}

/**
 * Process-local default source.
 *
 * Uniqueness is only guaranteed inside one process; ids are compared within a single document,
 * so cross-process uniqueness is not required by P1 (documented in the package README).
 */
const defaultSuffixSource: IdSuffixSource = (() => {
  let counter = 0;
  return () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;
})();

/**
 * Builds the id factory used by the editor UI, the CLI and agents.
 *
 * The generated value is validated by the kind's schema, so a broken injected source fails loudly
 * instead of producing a document that the document schema would later reject.
 */
export const createIdGenerator = (
  nextSuffix: IdSuffixSource = defaultSuffixSource,
): IdGenerator => ({
  presentationId: () => presentationIdSchema.parse(`${ID_PREFIXES.presentation}_${nextSuffix()}`),
  slideId: () => slideIdSchema.parse(`${ID_PREFIXES.slide}_${nextSuffix()}`),
  elementId: () => elementIdSchema.parse(`${ID_PREFIXES.element}_${nextSuffix()}`),
});

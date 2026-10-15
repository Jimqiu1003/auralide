import { z } from 'zod';

import { elementIdSchema, presentationIdSchema, slideIdSchema } from './ids.js';
import { err, ok } from './result.js';
import type { Result } from './result.js';

/**
 * The structured presentation document: the source of truth that the canvas renders from, that the
 * command layer mutates, and that storage and agents exchange as JSON.
 *
 * HTML stays a rendering/export target (ADR-0001 §7); it is never the document model.
 *
 * Input is validated at the boundary and rejected rather than coerced or repaired: every object
 * schema is strict, so unknown keys fail, and no schema has a default or a transform.
 */

/** Version of the document format. Bumped when the shape changes; validated inside the schema. */
export const SCHEMA_VERSION = '1.0';

/** Largest permitted absolute `x` / `y` coordinate, in CSS pixels. */
export const MAX_COORDINATE = 1_000_000;

/** Largest permitted width or height, in CSS pixels. */
export const MAX_DIMENSION = 100_000;

/** Default slide size, in CSS pixels (1280×720). */
export const DEFAULT_SLIDE_SIZE = { width: 1280, height: 720 } as const;

/**
 * Deeply readonly view of a parsed value.
 *
 * A document is treated as an immutable value: it changes only through the dispatcher, which returns
 * a new state. This type stops a caller from editing the document it was handed.
 *
 * Primitives are matched first because a branded id (`string & $brand<…>`) is also a structural
 * object, and mapping over it would destroy its string behaviour.
 */
export type DeepReadonly<T> = T extends
  string | number | boolean | bigint | symbol | null | undefined
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/** A finite `x` / `y` coordinate. Rejects `NaN`, `Infinity` and absurd values. */
export const coordinateSchema = z.number().min(-MAX_COORDINATE).max(MAX_COORDINATE);

/** A positive width or height. Rejects zero, negative, `NaN`, `Infinity` and absurd values. */
export const dimensionSchema = z.number().gt(0).max(MAX_DIMENSION);

/** Axis-aligned box of an element, relative to its slide's top-left corner. */
export const geometrySchema = z.strictObject({
  x: coordinateSchema,
  y: coordinateSchema,
  width: dimensionSchema,
  height: dimensionSchema,
});
export type Geometry = DeepReadonly<z.output<typeof geometrySchema>>;

/** Optional text styling. Every field stays optional so a style can be refined incrementally. */
export const textStyleSchema = z.strictObject({
  fontSize: dimensionSchema.optional(),
  fontWeight: z.int().min(1).max(1000).optional(),
  color: z.string().min(1).max(100).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
});
export type TextStyle = DeepReadonly<z.output<typeof textStyleSchema>>;

/** Fields every element carries, whatever its kind. */
const elementCommonShape = {
  name: z.string().min(1).max(200).optional(),
  geometry: geometrySchema,
  rotation: z.number().min(-360).max(360).optional(),
  opacity: z.number().min(0).max(1).optional(),
  zIndex: z.int().optional(),
};

/** Text element. */
export const textElementSchema = z.strictObject({
  id: elementIdSchema,
  kind: z.literal('text'),
  text: z.string(),
  style: textStyleSchema.optional(),
  ...elementCommonShape,
});
export type TextElement = DeepReadonly<z.output<typeof textElementSchema>>;

/** Basic shape element. */
export const shapeElementSchema = z.strictObject({
  id: elementIdSchema,
  kind: z.literal('shape'),
  shape: z.enum(['rectangle', 'ellipse', 'line']),
  fill: z.string().min(1).max(100).optional(),
  stroke: z.string().min(1).max(100).optional(),
  ...elementCommonShape,
});
export type ShapeElement = DeepReadonly<z.output<typeof shapeElementSchema>>;

/** Image element. Stores a reference into the asset store, never the image bytes. */
export const imageElementSchema = z.strictObject({
  id: elementIdSchema,
  kind: z.literal('image'),
  assetId: z.string().min(1).max(500),
  alt: z.string().max(500).optional(),
  ...elementCommonShape,
});
export type ImageElement = DeepReadonly<z.output<typeof imageElementSchema>>;

/** Any element that can live on a slide. */
export const elementSchema = z.discriminatedUnion('kind', [
  textElementSchema,
  shapeElementSchema,
  imageElementSchema,
]);
export type Element = DeepReadonly<z.output<typeof elementSchema>>;
/** Discriminator of an element. */
export type ElementKind = z.output<typeof elementSchema>['kind'];

/** One slide. Element order is the paint order. */
export const slideSchema = z.strictObject({
  id: slideIdSchema,
  name: z.string().min(1).max(200).optional(),
  backgroundColor: z.string().min(1).max(100).optional(),
  elements: z.array(elementSchema),
});
export type Slide = DeepReadonly<z.output<typeof slideSchema>>;

/** Canvas size of every slide in the document. */
export const slideSizeSchema = z.strictObject({
  width: dimensionSchema,
  height: dimensionSchema,
});
export type SlideSize = DeepReadonly<z.output<typeof slideSizeSchema>>;

/** Who performed an edit. */
export const EDIT_ORIGIN_KINDS = ['human', 'agent', 'import', 'system'] as const;
export type EditOriginKind = (typeof EDIT_ORIGIN_KINDS)[number];

/** Recorded edit origin; agent edits must name their actor. */
export const editOriginSchema = z
  .strictObject({
    kind: z.enum(EDIT_ORIGIN_KINDS),
    id: z.string().min(1).max(200).optional(),
  })
  .refine((origin) => origin.kind !== 'agent' || origin.id !== undefined, {
    path: ['id'],
    message: 'Agent edits require an actor id.',
  });
export type EditOrigin = DeepReadonly<z.output<typeof editOriginSchema>>;

/** Monotonic document revision. Incremented by the dispatcher on every applied command. */
export const revisionSchema = z.int().min(0);
export type Revision = z.output<typeof revisionSchema>;

/** A whole presentation document. */
export const presentationSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: presentationIdSchema,
    title: z.string().max(500),
    revision: revisionSchema,
    slideSize: slideSizeSchema,
    slides: z.array(slideSchema),
  })
  .superRefine((document, context) => {
    const checkUndefined = (value: unknown, path: (string | number)[]): void => {
      if (value === undefined) {
        context.addIssue({ code: 'custom', path, message: 'Explicit undefined is not JSON data.' });
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value)) {
          checkUndefined(child, [...path, key]);
        }
      }
    };
    checkUndefined(document, []);

    const slideIds = new Set<string>();
    const elementIds = new Set<string>();

    document.slides.forEach((slide, slideIndex) => {
      if (slideIds.has(slide.id)) {
        context.addIssue({
          code: 'custom',
          path: ['slides', slideIndex, 'id'],
          message: 'Duplicate slide id.',
        });
      }
      slideIds.add(slide.id);
      slide.elements.forEach((element, elementIndex) => {
        if (elementIds.has(element.id)) {
          context.addIssue({
            code: 'custom',
            path: ['slides', slideIndex, 'elements', elementIndex, 'id'],
            message: 'Duplicate element id.',
          });
        }
        elementIds.add(element.id);
      });
    });
  });
export type Presentation = DeepReadonly<z.output<typeof presentationSchema>>;

/** Freeze owned values so a caller cannot edit a document or its history through a reference. */
export const freezeValue = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freezeValue(child);
    }
    Object.freeze(value);
  }
  return value;
};

/** Why a document could not be read. */
export type DocumentErrorCode = 'invalid-json' | 'invalid-document';

/** Discriminated failure of the document boundary. */
export interface DocumentError {
  readonly code: DocumentErrorCode;
  readonly message: string;
}

/** Serializes a document to its JSON wire/storage form. */
export const serializeDocument = (document: Presentation): string => JSON.stringify(document);

/**
 * Parses a document from its JSON form.
 *
 * Malformed JSON and documents that violate the schema are both typed failures; nothing is coerced,
 * repaired or partially accepted.
 */
export const parseDocument = (json: string): Result<Presentation, DocumentError> => {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return err({ code: 'invalid-json', message: 'Document is not valid JSON.' });
  }

  const parsed = presentationSchema.safeParse(value);
  if (!parsed.success) {
    return err({ code: 'invalid-document', message: z.prettifyError(parsed.error) });
  }

  return ok(freezeValue(parsed.data));
};

/** Finds a slide by id, or `undefined` when the document has no such slide. */
export const findSlide = (document: Presentation, slideId: string): Slide | undefined =>
  document.slides.find((slide) => slide.id === slideId);

/** Finds an element anywhere in the document, or `undefined` when no slide holds it. */
export const findElement = (document: Presentation, elementId: string): Element | undefined => {
  for (const slide of document.slides) {
    const element = slide.elements.find((candidate) => candidate.id === elementId);

    if (element !== undefined) {
      return element;
    }
  }

  return undefined;
};

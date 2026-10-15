/**
 * Public surface of `@auralide/core`: the document model, the command dispatcher and the shared
 * primitives they are built on. Everything else in `src` is an implementation detail.
 */

// Architecture layers.
export { isLayer, LAYERS } from './layer.js';
export type { Layer } from './layer.js';

// Result primitive shared by every Auralide layer.
export { err, isErr, isOk, mapResult, ok, unwrapOr } from './result.js';
export type { Result } from './result.js';

// Stable ids: schemas, brands and the injectable generator.
export {
  createIdGenerator,
  elementIdSchema,
  ID_PREFIXES,
  presentationIdSchema,
  slideIdSchema,
} from './ids.js';
export type {
  ElementId,
  IdGenerator,
  IdKind,
  IdSuffixSource,
  PresentationId,
  SlideId,
} from './ids.js';

// The structured document model and its JSON boundary.
export {
  DEFAULT_SLIDE_SIZE,
  EDIT_ORIGIN_KINDS,
  elementSchema,
  editOriginSchema,
  findElement,
  findSlide,
  geometrySchema,
  imageElementSchema,
  MAX_COORDINATE,
  MAX_DIMENSION,
  parseDocument,
  presentationSchema,
  revisionSchema,
  SCHEMA_VERSION,
  serializeDocument,
  shapeElementSchema,
  slideSchema,
  slideSizeSchema,
  coordinateSchema,
  dimensionSchema,
  textElementSchema,
  textStyleSchema,
} from './document.js';
export type {
  DeepReadonly,
  DocumentError,
  DocumentErrorCode,
  EditOrigin,
  EditOriginKind,
  Element,
  ElementKind,
  Geometry,
  ImageElement,
  Presentation,
  Revision,
  ShapeElement,
  Slide,
  SlideSize,
  TextElement,
  TextStyle,
} from './document.js';

// The command contract: operations, targets, payloads and typed failures.
export {
  COMMAND_OPERATIONS,
  commandEnvelopeSchema,
  commandTargetSchema,
  elementAddPayloadSchema,
  elementMovePayloadSchema,
  elementTargetSchema,
  elementUpdateTextPayloadSchema,
  emptyPayloadSchema,
  isCommandOperation,
  presentationTargetSchema,
  slideCreatePayloadSchema,
  slideTargetSchema,
} from './command.js';
export type {
  CommandEnvelope,
  CommandError,
  CommandErrorCode,
  CommandOperation,
  CommandTarget,
  ElementAddPayload,
  ElementMovePayload,
  ElementTarget,
  ElementUpdateTextPayload,
  EmptyPayload,
  PresentationTarget,
  SlideCreatePayload,
  SlideTarget,
} from './command.js';

// The dispatcher: the only path from a command to a new document.
export { applyCommand, canRedo, canUndo, createEditorState, redo, undo } from './dispatcher.js';
export type { CommandResult, EditorState, History, HistoryEntry } from './dispatcher.js';

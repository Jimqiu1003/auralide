import { z } from 'zod';

import {
  commandEnvelopeSchema,
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
import type {
  CommandError,
  CommandOperation,
  CommandTarget,
  ElementTarget,
  PresentationTarget,
  SlideTarget,
} from './command.js';
import { findElement, freezeValue, presentationSchema } from './document.js';
import type { EditOrigin, Element, Presentation, Slide, TextElement } from './document.js';
import { err, isErr, ok } from './result.js';
import type { Result } from './result.js';

/**
 * The command dispatcher: the single validated entry point that turns a command into a new document
 * (ADR-0002 §4).
 *
 * Guarantees the caller can rely on:
 *
 * 1. a command that fails validation leaves the state and the history byte-identical — the document
 *    it was given is never mutated, and no partially applied result exists;
 * 2. a successful command increments the document revision exactly once and records its origin;
 * 3. undo restores previous content and redo re-applies it, each advancing the revision,
 *    and a new command clears the redo stack.
 */

/**
 * One applied command, with the document snapshots needed to undo and redo it.
 *
 * Snapshots are used instead of inverse patches: P1 documents are small, and an exact restore is
 * worth more than the bytes a patch would save (revisit when documents get large).
 */
export interface HistoryEntry {
  /** 1-based position of the command in the history. */
  readonly sequence: number;
  /** Document revision this command produced. */
  readonly revision: number;
  readonly operation: CommandOperation;
  readonly target: CommandTarget;
  readonly origin: EditOrigin;
  readonly before: Presentation;
  readonly after: Presentation;
}

/**
 * The linear edit history over one document.
 *
 * `entries[0..cursor-1]` are applied, `entries[cursor..]` are undone and redoable.
 */
export interface History {
  readonly entries: readonly HistoryEntry[];
  readonly cursor: number;
}

/** What the dispatcher reads and returns. */
export interface EditorState {
  readonly document: Presentation;
  readonly history: History;
}

/** A successful command: the new state plus the history entry it produced. */
export interface CommandResult {
  readonly state: EditorState;
  readonly entry: HistoryEntry;
}

/** Wraps a parsed document in an empty history. */
export const createEditorState = (document: Presentation): EditorState =>
  freezeValue({
    document: presentationSchema.parse(document),
    history: { entries: [], cursor: 0 },
  });

/** True when there is an applied command to undo. */
export const canUndo = (state: EditorState): boolean => state.history.cursor > 0;

/** True when there is an undone command to redo. */
export const canRedo = (state: EditorState): boolean =>
  state.history.cursor < state.history.entries.length;

const invalidPayload = (message: string): CommandError => ({ code: 'invalid-payload', message });
const targetNotFound = (message: string): CommandError => ({ code: 'target-not-found', message });
const conflict = (message: string): CommandError => ({ code: 'conflict', message });

const nextRevision = (document: Presentation): Result<number, CommandError> =>
  document.revision < Number.MAX_SAFE_INTEGER
    ? ok(document.revision + 1)
    : err(conflict('Document revision has reached the safe integer limit.'));

/** A validated command with its target already resolved against the current document. */
type PendingCommand =
  | {
      readonly operation: 'slide.create';
      readonly target: PresentationTarget;
      readonly payload: z.output<typeof slideCreatePayloadSchema>;
      readonly origin: EditOrigin;
    }
  | {
      readonly operation: 'slide.remove';
      readonly target: SlideTarget;
      readonly payload: z.output<typeof emptyPayloadSchema>;
      readonly origin: EditOrigin;
      readonly slide: Slide;
    }
  | {
      readonly operation: 'element.add';
      readonly target: SlideTarget;
      readonly payload: z.output<typeof elementAddPayloadSchema>;
      readonly origin: EditOrigin;
      readonly slide: Slide;
    }
  | {
      readonly operation: 'element.move';
      readonly target: ElementTarget;
      readonly payload: z.output<typeof elementMovePayloadSchema>;
      readonly origin: EditOrigin;
      readonly slide: Slide;
      readonly element: Element;
    }
  | {
      readonly operation: 'element.updateText';
      readonly target: ElementTarget;
      readonly payload: z.output<typeof elementUpdateTextPayloadSchema>;
      readonly origin: EditOrigin;
      readonly slide: Slide;
      readonly element: TextElement;
    }
  | {
      readonly operation: 'element.remove';
      readonly target: ElementTarget;
      readonly payload: z.output<typeof emptyPayloadSchema>;
      readonly origin: EditOrigin;
      readonly slide: Slide;
    };

interface CommandContext {
  readonly document: Presentation;
  readonly target: unknown;
  readonly payload: unknown;
  readonly origin: EditOrigin;
}

const operationProbeSchema = z.object({ operation: z.string() });

/** Reads the operation name without accepting the rest of the envelope yet. */
const readOperation = (command: unknown): CommandOperation | undefined => {
  const probe = operationProbeSchema.safeParse(command);

  if (!probe.success) {
    return undefined;
  }

  return isCommandOperation(probe.data.operation) ? probe.data.operation : undefined;
};

const resolveSlide = (document: Presentation, slideId: string): Slide | undefined =>
  document.slides.find((slide) => slide.id === slideId);

const resolveElement = (
  document: Presentation,
  target: ElementTarget,
): Result<{ readonly slide: Slide; readonly element: Element }, CommandError> => {
  const slide = resolveSlide(document, target.slideId);

  if (slide === undefined) {
    return err(targetNotFound(`Slide "${target.slideId}" does not exist.`));
  }

  const element = slide.elements.find((candidate) => candidate.id === target.elementId);

  if (element === undefined) {
    return err(
      targetNotFound(`Element "${target.elementId}" does not exist in slide "${target.slideId}".`),
    );
  }

  return ok({ slide, element });
};

const resolveSlideCreate = (context: CommandContext): Result<PendingCommand, CommandError> => {
  const target = presentationTargetSchema.safeParse(context.target);

  if (!target.success) {
    return err(invalidPayload(`Invalid target: ${z.prettifyError(target.error)}`));
  }

  const payload = slideCreatePayloadSchema.safeParse(context.payload);

  if (!payload.success) {
    return err(invalidPayload(`Invalid payload: ${z.prettifyError(payload.error)}`));
  }

  return ok({
    operation: 'slide.create',
    target: target.data,
    payload: payload.data,
    origin: context.origin,
  });
};

const resolveSlideRemove = (context: CommandContext): Result<PendingCommand, CommandError> => {
  const target = slideTargetSchema.safeParse(context.target);

  if (!target.success) {
    return err(invalidPayload(`Invalid target: ${z.prettifyError(target.error)}`));
  }

  const slide = resolveSlide(context.document, target.data.slideId);

  if (slide === undefined) {
    return err(targetNotFound(`Slide "${target.data.slideId}" does not exist.`));
  }

  const payload = emptyPayloadSchema.safeParse(context.payload);

  if (!payload.success) {
    return err(invalidPayload(`Invalid payload: ${z.prettifyError(payload.error)}`));
  }

  return ok({
    operation: 'slide.remove',
    target: target.data,
    payload: payload.data,
    origin: context.origin,
    slide,
  });
};

const resolveElementAdd = (context: CommandContext): Result<PendingCommand, CommandError> => {
  const target = slideTargetSchema.safeParse(context.target);

  if (!target.success) {
    return err(invalidPayload(`Invalid target: ${z.prettifyError(target.error)}`));
  }

  const slide = resolveSlide(context.document, target.data.slideId);

  if (slide === undefined) {
    return err(targetNotFound(`Slide "${target.data.slideId}" does not exist.`));
  }

  const payload = elementAddPayloadSchema.safeParse(context.payload);

  if (!payload.success) {
    return err(invalidPayload(`Invalid payload: ${z.prettifyError(payload.error)}`));
  }

  return ok({
    operation: 'element.add',
    target: target.data,
    payload: payload.data,
    origin: context.origin,
    slide,
  });
};

const resolveElementMove = (context: CommandContext): Result<PendingCommand, CommandError> => {
  const target = elementTargetSchema.safeParse(context.target);

  if (!target.success) {
    return err(invalidPayload(`Invalid target: ${z.prettifyError(target.error)}`));
  }

  const located = resolveElement(context.document, target.data);

  if (isErr(located)) {
    return located;
  }

  const payload = elementMovePayloadSchema.safeParse(context.payload);

  if (!payload.success) {
    return err(invalidPayload(`Invalid payload: ${z.prettifyError(payload.error)}`));
  }

  return ok({
    operation: 'element.move',
    target: target.data,
    payload: payload.data,
    origin: context.origin,
    slide: located.value.slide,
    element: located.value.element,
  });
};

const resolveElementUpdateText = (
  context: CommandContext,
): Result<PendingCommand, CommandError> => {
  const target = elementTargetSchema.safeParse(context.target);

  if (!target.success) {
    return err(invalidPayload(`Invalid target: ${z.prettifyError(target.error)}`));
  }

  const located = resolveElement(context.document, target.data);

  if (isErr(located)) {
    return located;
  }

  if (located.value.element.kind !== 'text') {
    return err(
      conflict(
        `Element "${target.data.elementId}" is a ${located.value.element.kind} element, not text.`,
      ),
    );
  }

  const payload = elementUpdateTextPayloadSchema.safeParse(context.payload);

  if (!payload.success) {
    return err(invalidPayload(`Invalid payload: ${z.prettifyError(payload.error)}`));
  }

  return ok({
    operation: 'element.updateText',
    target: target.data,
    payload: payload.data,
    origin: context.origin,
    slide: located.value.slide,
    element: located.value.element,
  });
};

const resolveElementRemove = (context: CommandContext): Result<PendingCommand, CommandError> => {
  const target = elementTargetSchema.safeParse(context.target);

  if (!target.success) {
    return err(invalidPayload(`Invalid target: ${z.prettifyError(target.error)}`));
  }

  const located = resolveElement(context.document, target.data);

  if (isErr(located)) {
    return located;
  }

  const payload = emptyPayloadSchema.safeParse(context.payload);

  if (!payload.success) {
    return err(invalidPayload(`Invalid payload: ${z.prettifyError(payload.error)}`));
  }

  return ok({
    operation: 'element.remove',
    target: target.data,
    payload: payload.data,
    origin: context.origin,
    slide: located.value.slide,
  });
};

/** One resolver per operation: target shape → target existence → payload shape. */
const COMMAND_RESOLVERS: Readonly<
  Record<CommandOperation, (context: CommandContext) => Result<PendingCommand, CommandError>>
> = {
  'slide.create': resolveSlideCreate,
  'slide.remove': resolveSlideRemove,
  'element.add': resolveElementAdd,
  'element.move': resolveElementMove,
  'element.updateText': resolveElementUpdateText,
  'element.remove': resolveElementRemove,
};

const replaceSlide = (document: Presentation, next: Slide): Presentation => ({
  ...document,
  slides: document.slides.map((slide) => (slide.id === next.id ? next : slide)),
});

const replaceElement = (
  document: Presentation,
  slide: Slide,
  elementId: string,
  next: Element,
): Presentation =>
  replaceSlide(document, {
    ...slide,
    elements: slide.elements.map((element) => (element.id === elementId ? next : element)),
  });

/** Applies an already validated command. Pure: it never mutates `document`. */
const execute = (
  document: Presentation,
  command: PendingCommand,
): Result<Presentation, CommandError> => {
  switch (command.operation) {
    case 'slide.create': {
      const { id, name, backgroundColor } = command.payload;

      if (document.slides.some((slide) => slide.id === id)) {
        return err(conflict(`Slide "${id}" already exists in this document.`));
      }

      const slide: Slide = {
        id,
        elements: [],
        ...(name === undefined ? {} : { name }),
        ...(backgroundColor === undefined ? {} : { backgroundColor }),
      };

      return ok({ ...document, slides: [...document.slides, slide] });
    }
    case 'slide.remove': {
      // Model invariant (docs/architecture/command-protocol.md §3.2): the dispatcher refuses to
      // remove the document's only slide. An empty presentation stays a valid document, it is just
      // never reached by deleting the last slide.
      if (document.slides.length === 1) {
        return err(
          conflict(
            `Slide "${command.target.slideId}" is the document's only slide and cannot be removed.`,
          ),
        );
      }

      return ok({
        ...document,
        slides: document.slides.filter((slide) => slide.id !== command.target.slideId),
      });
    }
    case 'element.add': {
      const element = command.payload.element;
      const existing = findElement(document, element.id);

      if (existing !== undefined) {
        return err(conflict(`Element "${element.id}" already exists in this document.`));
      }

      return ok(
        replaceSlide(document, {
          ...command.slide,
          elements: [...command.slide.elements, element],
        }),
      );
    }
    case 'element.move': {
      const { x, y } = command.payload;
      const moved: Element = {
        ...command.element,
        geometry: { ...command.element.geometry, x, y },
      };

      return ok(replaceElement(document, command.slide, command.target.elementId, moved));
    }
    case 'element.updateText': {
      const updated: TextElement = { ...command.element, text: command.payload.text };

      return ok(replaceElement(document, command.slide, command.target.elementId, updated));
    }
    case 'element.remove':
      return ok(
        replaceSlide(document, {
          ...command.slide,
          elements: command.slide.elements.filter(
            (element) => element.id !== command.target.elementId,
          ),
        }),
      );
  }
};

/**
 * Validates, applies and records one command.
 *
 * The parameter is `unknown` on purpose: commands arrive as JSON from the renderer, the CLI and
 * agents, so this function is the trust boundary and rejects anything that does not match the
 * contract. `state` is never mutated; the caller adopts the returned state.
 */
export const applyCommand = (
  state: EditorState,
  command: unknown,
): Result<CommandResult, CommandError> => {
  const operation = readOperation(command);

  if (operation === undefined) {
    return err({
      code: 'unsupported-operation',
      message: 'A command must be an object with one of the supported "operation" values.',
    });
  }

  const envelope = commandEnvelopeSchema.safeParse(command);

  if (!envelope.success) {
    return err(invalidPayload(`Invalid command: ${z.prettifyError(envelope.error)}`));
  }

  const resolved = COMMAND_RESOLVERS[operation]({
    document: state.document,
    target: envelope.data.target,
    payload: envelope.data.payload,
    origin: envelope.data.origin,
  });

  if (isErr(resolved)) {
    return resolved;
  }

  if (envelope.data.expectedRevision !== state.document.revision) {
    return err({
      code: 'stale-revision',
      message: `Command expects revision ${envelope.data.expectedRevision} but the document is at revision ${state.document.revision}.`,
    });
  }

  const revision = nextRevision(state.document);
  if (isErr(revision)) {
    return revision;
  }

  const executed = execute(state.document, resolved.value);

  if (isErr(executed)) {
    return executed;
  }

  const parsed = presentationSchema.safeParse({ ...executed.value, revision: revision.value });
  if (!parsed.success) {
    return err(invalidPayload(`Invalid resulting document: ${z.prettifyError(parsed.error)}`));
  }
  const document: Presentation = parsed.data;
  const entry: HistoryEntry = {
    sequence: state.history.cursor + 1,
    revision: document.revision,
    operation,
    target: resolved.value.target,
    origin: resolved.value.origin,
    before: state.document,
    after: document,
  };

  return ok(
    freezeValue({
      state: {
        document,
        history: {
          // A new command invalidates everything that was undone: the redo stack is cleared.
          entries: [...state.history.entries.slice(0, state.history.cursor), entry],
          cursor: state.history.cursor + 1,
        },
      },
      entry,
    }),
  );
};

/** Reverts the newest applied command's content at a fresh revision. */
export const undo = (state: EditorState): Result<EditorState, CommandError> => {
  const entry = state.history.entries[state.history.cursor - 1];

  if (entry === undefined) {
    return err({ code: 'nothing-to-undo', message: 'The history holds no command to undo.' });
  }

  const revision = nextRevision(state.document);
  if (isErr(revision)) {
    return revision;
  }

  return ok(
    freezeValue({
      document: { ...entry.before, revision: revision.value },
      history: { entries: state.history.entries, cursor: state.history.cursor - 1 },
    }),
  );
};

/** Re-applies the newest undone command. */
export const redo = (state: EditorState): Result<EditorState, CommandError> => {
  const entry = state.history.entries[state.history.cursor];

  if (entry === undefined) {
    return err({ code: 'nothing-to-redo', message: 'The history holds no command to redo.' });
  }

  const revision = nextRevision(state.document);
  if (isErr(revision)) {
    return revision;
  }

  return ok(
    freezeValue({
      document: { ...entry.after, revision: revision.value },
      history: { entries: state.history.entries, cursor: state.history.cursor + 1 },
    }),
  );
};

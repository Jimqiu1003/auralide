import {
  applyCommand,
  commandEnvelopeSchema,
  createEditorState,
  err,
  ok,
  presentationSchema,
  revisionSchema,
} from '@auralide/core';
import type { CommandError, Presentation, Result } from '@auralide/core';
import { basename } from 'node:path';
import { z } from 'zod';

import type { FileOutcome, FileResult } from '../shared/document-files.js';
import {
  DocumentFileError,
  documentFileStamp,
  fileError,
  readDocumentFile,
  writeDocumentFile,
} from './document-files.js';

// shortcut: undo history is session-only; persistent history needs a reviewed recovery format.
const welcomeDocument = presentationSchema.parse({
  schemaVersion: '1.0',
  id: 'pres_welcome',
  title: 'Welcome to Auralide',
  revision: 0,
  slideSize: { width: 1280, height: 720 },
  slides: [
    {
      id: 'slide_welcome',
      name: 'Welcome',
      backgroundColor: '#171b2b',
      elements: [
        {
          id: 'el_title',
          kind: 'text',
          text: 'Your ideas, structured.',
          geometry: { x: 96, y: 240, width: 1088, height: 160 },
          style: { fontSize: 64, color: '#f4f4f5', fontWeight: 600 },
        },
      ],
    },
  ],
});
let state = createEditorState(welcomeDocument);
let savedDocument = state.document;
let fileBinding: { path: string; stamp: string } | null = null;
let fileOperation = false;
const fileRequestSchema = z.strictObject({ expectedRevision: revisionSchema });

export const getDocument = (): Presentation => state.document;

/** End a closed window's session without reviving discarded content on macOS activation. */
export const endDocumentSession = (): void => {
  state = createEditorState({
    ...welcomeDocument,
    revision: Math.min(Number.MAX_SAFE_INTEGER, state.document.revision + 1),
  });
  savedDocument = state.document;
  fileBinding = null;
};

export const dispatchDocumentCommand = (command: unknown): Result<Presentation, CommandError> => {
  if (fileOperation)
    return err({ code: 'conflict', message: 'A document file operation is in progress.' });
  const parsed = commandEnvelopeSchema.safeParse(command);
  if (!parsed.success) {
    return err({ code: 'invalid-payload', message: 'Invalid command envelope.' });
  }
  // This bridge serves the human UI; a future agent bridge must assert its own identity.
  const result = applyCommand(state, { ...parsed.data, origin: { kind: 'human', id: 'desktop' } });
  if (!result.ok) return result;
  state = result.value.state;
  return ok(state.document);
};

export const hasUnsavedChanges = (): boolean => state.document !== savedDocument;
export const isDocumentFileOperationPending = (): boolean => fileOperation;
const runFileOperation = async (
  input: unknown,
  action: () => Promise<FileOutcome>,
): Promise<FileResult> => {
  const parsed = fileRequestSchema.safeParse(input);
  if (!parsed.success)
    return err({
      code: 'invalid-input',
      message: 'Expected only a valid document revision; file paths are not accepted.',
    });
  if (fileOperation)
    return err({ code: 'busy', message: 'Another document file operation is in progress.' });
  if (parsed.data.expectedRevision !== state.document.revision)
    return err({
      code: 'stale-revision',
      message: 'Reload the document before opening or saving.',
    });
  fileOperation = true;
  try {
    return ok(await action());
  } catch (error) {
    return err(fileError(error));
  } finally {
    fileOperation = false;
  }
};

/** Only main's native dialog callback can grant a path; no renderer-supplied path is accepted. */
export const saveDocumentFile = (
  input: unknown,
  choose: () => Promise<string | null>,
): Promise<FileResult> =>
  runFileOperation(input, async () => {
    const path = fileBinding?.path ?? (await choose());
    if (path === null) throw new DocumentFileError('cancelled', 'Save cancelled.');
    const expectedStamp = fileBinding?.stamp ?? (await documentFileStamp(path));
    const written = await writeDocumentFile(path, state.document, expectedStamp);
    fileBinding = { path, stamp: written.stamp };
    savedDocument = state.document;
    return {
      document: state.document,
      fileName: basename(path),
      backupCreated: written.backupCreated,
      historyReset: false,
    };
  });

export const openDocumentFile = (
  input: unknown,
  choose: () => Promise<string | null>,
  confirmDiscard: () => Promise<boolean>,
): Promise<FileResult> =>
  runFileOperation(input, async () => {
    const path = await choose();
    if (path === null) throw new DocumentFileError('cancelled', 'Open cancelled.');
    const loaded = await readDocumentFile(path);
    const revision = Math.max(state.document.revision, loaded.document.revision);
    if (revision >= Number.MAX_SAFE_INTEGER)
      throw new DocumentFileError('revision-limit', 'Cannot open safely at the revision limit.');
    if (hasUnsavedChanges() && !(await confirmDiscard()))
      throw new DocumentFileError('cancelled', 'Unsaved changes were retained.');
    // Hydration resets session history and fences old commands/previews without changing content.
    const next = createEditorState({ ...loaded.document, revision: revision + 1 });
    state = next;
    savedDocument = next.document;
    fileBinding = { path, stamp: loaded.stamp };
    return {
      document: next.document,
      fileName: basename(path),
      backupCreated: false,
      historyReset: true,
    };
  });

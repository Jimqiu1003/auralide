import {
  applyCommand,
  commandEnvelopeSchema,
  createEditorState,
  canUndo,
  canRedo,
  undo,
  redo,
  err,
  ok,
  presentationSchema,
  revisionSchema,
} from '@auralide/core';
import type { CommandError, Presentation, Result } from '@auralide/core';
import { basename, resolve } from 'node:path';
import { exportPresentationHtml } from '@auralide/exporters';
import type { HtmlSnapshot, HtmlImportReport } from '@auralide/html-bridge';
import { z } from 'zod';

import type { FileOutcome, FileResult } from '../shared/document-files.js';
import type { DocumentStatus } from '../shared/api.js';
import {
  DocumentFileError,
  documentFileStamp,
  fileError,
  readDocumentFile,
  readTextFile,
  writeTextFile,
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
const samePath = (a: string, b: string): boolean =>
  process.platform === 'win32'
    ? resolve(a).toLowerCase() === resolve(b).toLowerCase()
    : resolve(a) === resolve(b);
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
export const editDocumentHistory = (input: unknown): Result<Presentation, CommandError> => {
  const parsed = z
    .strictObject({ direction: z.enum(['undo', 'redo']), expectedRevision: revisionSchema })
    .safeParse(input);
  if (!parsed.success) return err({ code: 'invalid-payload', message: 'Invalid history request.' });
  if (fileOperation)
    return err({ code: 'conflict', message: 'A document file operation is in progress.' });
  if (parsed.data.expectedRevision !== state.document.revision)
    return err({ code: 'stale-revision', message: 'Reload before changing document history.' });
  const result = parsed.data.direction === 'undo' ? undo(state) : redo(state);
  if (!result.ok) return result;
  state = result.value;
  return ok(state.document);
};
export const getDocumentStatus = (): DocumentStatus => ({
  revision: state.document.revision,
  dirty: hasUnsavedChanges(),
  fileName: fileBinding === null ? null : basename(fileBinding.path),
  canUndo: canUndo(state),
  canRedo: canRedo(state),
});
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
  saveAs = false,
): Promise<FileResult> =>
  runFileOperation(input, async () => {
    const path = saveAs ? await choose() : (fileBinding?.path ?? (await choose()));
    if (path === null) throw new DocumentFileError('cancelled', 'Save cancelled.');
    const expectedStamp =
      fileBinding && samePath(fileBinding.path, path)
        ? fileBinding.stamp
        : await documentFileStamp(path);
    const written = /\.html?$/i.test(path)
      ? await writeTextFile(path, exportPresentationHtml(state.document), expectedStamp)
      : await writeDocumentFile(path, state.document, expectedStamp);
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
  html?: {
    inspect: (source: string) => Promise<HtmlSnapshot>;
    confirm: (report: HtmlImportReport) => Promise<boolean>;
    retain: (source: string, report: HtmlImportReport) => Promise<void>;
  },
): Promise<FileResult> =>
  runFileOperation(input, async () => {
    const path = await choose();
    if (path === null) throw new DocumentFileError('cancelled', 'Open cancelled.');
    let loaded: { document: Presentation; stamp: string };
    let converted: HtmlSnapshot | undefined;
    let source: string | undefined;
    let report: HtmlImportReport | undefined;
    if (/\.html?$/i.test(path)) {
      if (!html) throw new DocumentFileError('invalid-document', 'HTML importer unavailable.');
      const file = await readTextFile(path);
      source = file.text;
      converted = await html.inspect(source);
      const checked = presentationSchema.parse(converted.document);
      loaded = { document: checked, stamp: file.stamp };
      report = {
        mode: converted.mode,
        sourceHash: file.stamp,
        slideCount: checked.slides.length,
        elementCount: checked.slides.reduce((sum, slide) => sum + slide.elements.length, 0),
        warnings: converted.warnings,
        mappings: converted.mappings,
      };
      if (converted.mode === 'converted' && !(await html.confirm(report)))
        throw new DocumentFileError('cancelled', 'HTML import declined.');
    } else loaded = await readDocumentFile(path);
    const revision = Math.max(state.document.revision, loaded.document.revision);
    if (revision >= Number.MAX_SAFE_INTEGER)
      throw new DocumentFileError('revision-limit', 'Cannot open safely at the revision limit.');
    if (hasUnsavedChanges() && !(await confirmDiscard()))
      throw new DocumentFileError('cancelled', 'Unsaved changes were retained.');
    // Hydration resets session history and fences old commands/previews without changing content.
    let next = createEditorState({ ...loaded.document, revision: revision + 1 });
    if (converted?.mode === 'converted') {
      next = createEditorState(
        presentationSchema.parse({
          ...loaded.document,
          id: 'pres_html_' + loaded.stamp.slice(0, 20),
          slides: [],
          revision: revision + 1,
        }),
      );
      for (const slide of loaded.document.slides) {
        const created = applyCommand(next, {
          operation: 'slide.create',
          target: { kind: 'presentation' },
          payload: {
            id: slide.id,
            ...(slide.name ? { name: slide.name } : {}),
            ...(slide.backgroundColor ? { backgroundColor: slide.backgroundColor } : {}),
          },
          expectedRevision: next.document.revision,
          origin: { kind: 'import', id: 'html' },
        });
        if (!created.ok)
          throw new DocumentFileError('invalid-document', 'HTML slide conversion refused.');
        next = createEditorState(created.value.state.document);
        for (const element of slide.elements) {
          const added = applyCommand(next, {
            operation: 'element.add',
            target: { kind: 'slide', slideId: slide.id },
            payload: { element },
            expectedRevision: next.document.revision,
            origin: { kind: 'import', id: 'html' },
          });
          if (!added.ok)
            throw new DocumentFileError('invalid-document', 'HTML object conversion refused.');
          next = createEditorState(added.value.state.document);
        }
      }
      if (html && source !== undefined && report) await html.retain(source, report);
      next = createEditorState(next.document);
    }
    state = next;
    if (converted?.mode === 'converted') fileBinding = null;
    else {
      savedDocument = next.document;
      fileBinding = { path, stamp: loaded.stamp };
    }
    return {
      document: next.document,
      fileName: basename(path),
      backupCreated: false,
      historyReset: true,
      ...(report ? { importReport: report } : {}),
    };
  });

/** Export is a derived snapshot; it never changes the active file or clears dirty state. */
export const exportHtmlFile = (
  input: unknown,
  choose: () => Promise<string | null>,
): Promise<FileResult> =>
  runFileOperation(input, async () => {
    const path = await choose();
    if (path === null) throw new DocumentFileError('cancelled', 'Export cancelled.');
    if (!/\.html?$/i.test(path))
      throw new DocumentFileError('invalid-input', '请选择 .html 或 .htm 文件。');
    if (fileBinding && samePath(path, fileBinding.path))
      throw new DocumentFileError('invalid-input', '这是当前文档，请使用保存，或导出到其他位置。');
    const stamp = await documentFileStamp(path);
    const written = await writeTextFile(path, exportPresentationHtml(state.document), stamp);
    return {
      document: state.document,
      fileName: basename(path),
      backupCreated: written.backupCreated,
      historyReset: false,
    };
  });

export const newDocumentFile = (
  input: unknown,
  confirmDiscard: () => Promise<boolean>,
): Promise<FileResult> =>
  runFileOperation(input, async () => {
    if (hasUnsavedChanges() && !(await confirmDiscard()))
      throw new DocumentFileError('cancelled', 'Unsaved changes retained.');
    if (state.document.revision >= Number.MAX_SAFE_INTEGER - 1)
      throw new DocumentFileError('revision-limit', 'Cannot create safely at revision limit.');
    const initial = createEditorState(
      presentationSchema.parse({
        schemaVersion: '1.0',
        id: 'pres_new',
        title: '未命名演示文稿',
        revision: state.document.revision + 1,
        slideSize: { width: 1280, height: 720 },
        slides: [],
      }),
    );
    const created = applyCommand(initial, {
      operation: 'slide.create',
      target: { kind: 'presentation' },
      payload: { id: 'slide_new', name: '幻灯片 1', backgroundColor: '#ffffff' },
      expectedRevision: initial.document.revision,
      origin: { kind: 'human', id: 'desktop' },
    });
    if (!created.ok) throw new DocumentFileError('invalid-document', 'New document refused.');
    state = createEditorState(created.value.state.document);
    fileBinding = null;
    return {
      document: state.document,
      fileName: '未命名演示文稿',
      backupCreated: false,
      historyReset: true,
    };
  });

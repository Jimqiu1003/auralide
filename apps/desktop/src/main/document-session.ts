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
import { basename, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  exportPresentationHtml,
  readBundleHtml,
  readBundleJson,
  serializeBundle,
  addAsset,
  validateBundle,
} from '@auralide/exporters';
import type { Asset, Assets } from '@auralide/renderer';
import { collectSource, MIME_BY_EXTENSION } from './resource-collector.js';
import { scanSource } from './source-dom.js';
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
  readResourceBytes,
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
let assets: Record<string, Asset> = {};
let fileBinding: { path: string; stamp: string; legacy?: boolean } | null = null;
let fileOperation = false;
const samePath = (a: string, b: string): boolean =>
  process.platform === 'win32'
    ? resolve(a).toLowerCase() === resolve(b).toLowerCase()
    : resolve(a) === resolve(b);
const fileRequestSchema = z.strictObject({ expectedRevision: revisionSchema });

export const getDocument = (): Presentation => state.document;
export const getDocumentAssets = (): Assets => assets;
export const playbackDocument = (
  input: unknown,
  play: (html: string) => Promise<void>,
): Promise<FileResult> =>
  runFileOperation(input, async () => {
    await play(exportPresentationHtml(state.document, assets));
    return {
      document: state.document,
      fileName: fileBinding ? basename(fileBinding.path) : state.document.title,
      backupCreated: false,
      historyReset: false,
    };
  });

/** End a closed window's session without reviving discarded content on macOS activation. */
export const endDocumentSession = (): void => {
  state = createEditorState({
    ...welcomeDocument,
    revision: Math.min(Number.MAX_SAFE_INTEGER, state.document.revision + 1),
  });
  savedDocument = state.document;
  fileBinding = null;
  assets = {};
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
  for (const slide of result.value.state.document.slides)
    for (const element of slide.elements) {
      if (
        'assetId' in element &&
        /^[a-f0-9]{64}$/.test(element.assetId) &&
        (!assets[element.assetId] ||
          !(element.kind === 'source'
            ? assets[element.assetId]!.mime === 'text/html'
            : assets[element.assetId]!.mime.startsWith(element.kind + '/')))
      )
        return err({
          code: 'invalid-payload',
          message: 'Referenced asset is not available in this document.',
        });
      if (
        element.kind === 'text' &&
        element.style?.fontAssetId &&
        !assets[element.style.fontAssetId]?.mime.startsWith('font/')
      )
        return err({
          code: 'invalid-payload',
          message: 'Referenced font is not available in this document.',
        });
    }
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
    if (error instanceof SyntaxError)
      return err({ code: 'invalid-json', message: '文档或封装清单不是有效 JSON。' });
    if (error instanceof Error && !('code' in error))
      return err({ code: 'invalid-document', message: error.message });
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
    const upgrading =
      fileBinding?.legacy &&
      (state.document.schemaVersion === '1.1' ||
        Object.keys(assets).length > 0 ||
        /\.html?$/i.test(fileBinding.path));
    const path = saveAs || upgrading ? await choose() : (fileBinding?.path ?? (await choose()));
    if (path === null) throw new DocumentFileError('cancelled', 'Save cancelled.');
    if (upgrading && fileBinding && samePath(path, fileBinding.path))
      throw new DocumentFileError('invalid-input', '请将新版封装另存为新文件，原版本将保留。');
    const expectedStamp =
      fileBinding && samePath(fileBinding.path, path)
        ? fileBinding.stamp
        : await documentFileStamp(path);
    const written = /\.html?$/i.test(path)
      ? await writeTextFile(path, exportPresentationHtml(state.document, assets), expectedStamp)
      : Object.keys(assets).length
        ? await writeTextFile(path, serializeBundle(state.document, assets), expectedStamp)
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
    let loadedAssets: Assets = {};
    let legacy = false;
    if (/\.html?$/i.test(path)) {
      const file = await readTextFile(path);
      const bundle = readBundleHtml(file.text);
      if (bundle) {
        loaded = { document: bundle.document, stamp: file.stamp };
        loadedAssets = bundle.assets;
        legacy = file.text.includes('auralide-html-v1');
      } else {
        if (Buffer.byteLength(file.text) > 20 * 1024 * 1024)
          throw new DocumentFileError(
            'too-large',
            '静态转换限制 20 MiB；更大的源 HTML 请使用保留动态效果的导入方式。',
          );
        if (!html) throw new DocumentFileError('invalid-document', 'HTML importer unavailable.');
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
      }
    } else {
      const file = await readTextFile(path);
      const bundle = readBundleJson(file.text);
      if (bundle) {
        loaded = { document: bundle.document, stamp: file.stamp };
        loadedAssets = bundle.assets;
      } else {
        loaded = await readDocumentFile(path);
        legacy = loaded.document.schemaVersion === '1.0';
      }
    }
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
    assets = { ...loadedAssets };
    if (converted?.mode === 'converted') fileBinding = null;
    else {
      savedDocument = next.document;
      fileBinding = { path, stamp: loaded.stamp, legacy };
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
    const written = await writeTextFile(
      path,
      exportPresentationHtml(state.document, assets),
      stamp,
    );
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
    assets = {};
    fileBinding = null;
    return {
      document: state.document,
      fileName: '未命名演示文稿',
      backupCreated: false,
      historyReset: true,
    };
  });

export const insertAssetFile = (
  input: unknown,
  choose: (kind: string) => Promise<string | null>,
): Promise<FileResult> => {
  const parsed = z
    .strictObject({
      expectedRevision: revisionSchema,
      slideId: z.string(),
      elementId: z.string().optional(),
      kind: z.enum(['image', 'audio', 'video', 'font']),
    })
    .safeParse(input);
  if (!parsed.success)
    return Promise.resolve(err({ code: 'invalid-input', message: 'Invalid media request.' }));
  const request = parsed.data;
  return runFileOperation({ expectedRevision: request.expectedRevision }, async () => {
    const slide = state.document.slides.find((s) => s.id === request.slideId);
    if (!slide) throw new Error('幻灯片已改变，请重新选择。');
    const path = await choose(request.kind);
    if (!path) throw new DocumentFileError('cancelled', '素材选择已取消。');
    const bytes = await readResourceBytes(path);
    const mime = MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? '';
    if (!mime.startsWith(request.kind + '/')) throw new Error('素材类型与插入类型不符。');
    if (
      mime === 'image/svg+xml' &&
      /<script\b|<foreignObject\b|(?:href|src)\s*=\s*["'](?!#|data:)|url\(/i.test(
        bytes.toString('utf8'),
      )
    )
      throw new Error('SVG 必须自包含且无脚本。');
    const nextAssets = { ...assets };
    const assetId = addAsset(nextAssets, bytes, mime);
    const target = slide.elements.find((e) => e.id === request.elementId);
    let command: unknown;
    if (request.kind === 'font') {
      if (target?.kind !== 'text') throw new Error('请先选择文字对象，再导入字体。');
      command = {
        operation: 'element.updateProperties',
        target: { kind: 'element', slideId: slide.id, elementId: target.id },
        payload: { style: { fontAssetId: assetId } },
      };
    } else if (request.elementId) {
      if (!target || target.kind !== request.kind) throw new Error('请先选择同类素材对象。');
      command = {
        operation: 'element.updateProperties',
        target: { kind: 'element', slideId: slide.id, elementId: target.id },
        payload: { assetId },
      };
    } else
      command = {
        operation: 'element.add',
        target: { kind: 'slide', slideId: slide.id },
        payload: {
          element: {
            id: 'el_asset_' + assetId.slice(0, 16) + '_' + state.document.revision,
            kind: request.kind,
            assetId,
            alt: basename(path),
            geometry: {
              x: 80,
              y: 80,
              width: Math.min(640, state.document.slideSize.width - 80),
              height:
                request.kind === 'audio' ? 80 : Math.min(360, state.document.slideSize.height - 80),
            },
          },
        },
      };
    const result = applyCommand(state, {
      ...(command as object),
      expectedRevision: state.document.revision,
      origin: { kind: 'human', id: 'desktop' },
    });
    if (!result.ok) throw new Error(result.error.message);
    validateBundle({
      format: 'auralide-bundle-v2',
      document: result.value.state.document,
      assets: nextAssets,
    });
    state = result.value.state;
    assets = nextAssets;
    return {
      document: state.document,
      fileName: basename(path),
      backupCreated: false,
      historyReset: false,
    };
  });
};

export const importSourceFile = (
  input: unknown,
  choose: () => Promise<string | null>,
  confirmDiscard: () => Promise<boolean>,
  grantDirectory: () => Promise<string | null>,
  allowRemote: () => Promise<boolean>,
): Promise<FileResult> =>
  runFileOperation(input, async () => {
    const path = await choose();
    if (!path) throw new DocumentFileError('cancelled', 'HTML 选择已取消。');
    const file = await readTextFile(path);
    if (readBundleHtml(file.text))
      throw new Error('这是 Auralide 导出文件，请使用“打开”恢复完整文档。');
    const collected = await collectSource(file.text, pathToFileURL(path), {
      scan: scanSource,
      grantDirectory,
      allowRemote,
    });
    if (hasUnsavedChanges() && !(await confirmDiscard()))
      throw new DocumentFileError('cancelled', '当前文档已保留。');
    if (state.document.revision >= Number.MAX_SAFE_INTEGER)
      throw new DocumentFileError('revision-limit', 'Revision limit reached.');
    const doc = presentationSchema.parse({
      schemaVersion: '1.1',
      id: 'pres_source_' + file.stamp.slice(0, 16),
      title: basename(path),
      revision: state.document.revision + 1,
      slideSize: { width: 1280, height: 720 },
      slides: [
        {
          id: 'slide_source',
          name: 'HTML 源演示',
          elements: [
            {
              id: 'el_source',
              kind: 'source',
              assetId: collected.assetId,
              originalAssetId: collected.originalAssetId,
              sourceRevision: 0,
              geometry: { x: 0, y: 0, width: 1280, height: 720 },
            },
          ],
        },
      ],
    });
    validateBundle({ format: 'auralide-bundle-v2', document: doc, assets: collected.assets });
    state = createEditorState(doc);
    assets = collected.assets;
    fileBinding = null;
    return {
      document: state.document,
      fileName: basename(path),
      backupCreated: false,
      historyReset: true,
    };
  });

import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { TextDecoder } from 'node:util';

import { parseDocument, presentationSchema, serializeDocument } from '@auralide/core';
import type { Presentation } from '@auralide/core';

import type { FileError, FileErrorCode } from '../shared/document-files.js';

const MAX_BYTES = 20 * 1024 * 1024;
export class DocumentFileError extends Error {
  constructor(
    readonly code: FileErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export const fileError = (error: unknown): FileError => {
  if (error instanceof DocumentFileError) return { code: error.code, message: error.message };
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'EACCES' || code === 'EPERM'
    ? { code: 'access-denied', message: 'Access to the selected file was denied.' }
    : code === 'ENOENT'
      ? { code: 'not-found', message: 'The selected file no longer exists.' }
      : {
          code: 'io-error',
          message: 'File operation failed. Your document remains available in memory.',
        };
};
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const readBytes = async (path: string): Promise<Buffer> => {
  const link = await fs.lstat(path);
  if (!link.isFile() || link.isSymbolicLink())
    throw new DocumentFileError(
      'access-denied',
      'Choose a regular document file, not a link or directory.',
    );
  const handle = await fs.open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.ino !== link.ino || stat.dev !== link.dev)
      throw new DocumentFileError('file-changed', 'The selected file changed while opening.');
    if (stat.size > MAX_BYTES)
      throw new DocumentFileError('too-large', 'P2A documents must be at most 20 MiB.');
    // Read at most the budget plus one byte, including when another process grows the file.
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, length);
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    if (length > MAX_BYTES)
      throw new DocumentFileError('too-large', 'P2A documents must be at most 20 MiB.');
    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
};
export const documentFileStamp = async (path: string): Promise<string | null> => {
  try {
    return hash(await readBytes(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
};
export const readDocumentFile = async (
  path: string,
): Promise<{ document: Presentation; stamp: string }> => {
  const bytes = await readBytes(path);
  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DocumentFileError('invalid-json', 'The selected document is not valid UTF-8 JSON.');
  }
  const parsed = parseDocument(json);
  if (!parsed.ok)
    throw new DocumentFileError(
      parsed.error.code,
      parsed.error.code === 'invalid-json'
        ? 'The selected document contains invalid JSON.'
        : 'The selected document does not match the supported schema.',
    );
  return { document: parsed.value, stamp: hash(bytes) };
};

/** Main-only adapter: callers must obtain the path through the native file dialog. */
export const writeDocumentFile = async (
  path: string,
  input: Presentation,
  expectedStamp: string | null,
): Promise<{ stamp: string; backupCreated: boolean }> => {
  const parsed = presentationSchema.safeParse(input);
  if (!parsed.success)
    throw new DocumentFileError('invalid-document', 'Cannot save an invalid document.');
  const bytes = Buffer.from(serializeDocument(parsed.data), 'utf8');
  if (bytes.length > MAX_BYTES)
    throw new DocumentFileError('too-large', 'P2A documents must be at most 20 MiB.');
  if ((await documentFileStamp(path)) !== expectedStamp)
    throw new DocumentFileError(
      'file-changed',
      'The file changed on disk. Open it again before saving.',
    );
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const backup = `${path}.${randomUUID()}.bak`;
  let created = false;
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    created = true;
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (expectedStamp !== null) await fs.copyFile(path, backup, constants.COPYFILE_EXCL);
    if ((await documentFileStamp(path)) !== expectedStamp)
      throw new DocumentFileError(
        'file-changed',
        'The file changed during save. It was not replaced.',
      );
    const after = await handle.stat();
    if (
      length > stat.size ||
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs ||
      after.ctimeMs !== stat.ctimeMs
    )
      throw new DocumentFileError('file-changed', 'The selected file changed while reading.');
    if (expectedStamp === null) {
      // Creating a new file must not overwrite a target that appeared after the last check.
      try {
        await fs.link(temporary, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw new DocumentFileError(
            'file-changed',
            'A file appeared at the selected location. It was not replaced.',
          );
        throw error;
      }
    } else {
      await fs.rename(temporary, path);
      created = false;
    }
    return { stamp: hash(bytes), backupCreated: expectedStamp !== null };
  } finally {
    if (created) await fs.unlink(temporary).catch(() => undefined);
  }
};

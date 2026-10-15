import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Presentation } from '@auralide/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  documentFileStamp,
  readDocumentFile,
  writeDocumentFile,
} from '../src/main/document-files.js';
import { getDocument } from '../src/main/document-session.js';

const directories: string[] = [];
const fixture = async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'auralide-storage-'));
  directories.push(directory);
  return { directory, path: join(directory, 'deck.auralide.json'), document: getDocument() };
};
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true });
});

describe('main-only snapshot storage', () => {
  it('round trips real files and retains exact old bytes in an exclusive backup', async () => {
    const { directory, path, document } = await fixture();
    const created = await writeDocumentFile(path, document, null);
    expect(created.backupCreated).toBe(false);
    expect((await readDocumentFile(path)).document).toEqual(document);
    const original = await fs.readFile(path);
    const replacement = { ...document, title: 'Saved again', revision: document.revision + 1 };
    expect((await writeDocumentFile(path, replacement, created.stamp)).backupCreated).toBe(true);
    const backup = (await fs.readdir(directory)).find((name) => name.endsWith('.bak'));
    expect(backup).toBeDefined();
    expect(await fs.readFile(join(directory, backup!))).toEqual(original);
    expect((await readDocumentFile(path)).document).toEqual(replacement);
    expect((await fs.readdir(directory)).some((name) => name.endsWith('.tmp'))).toBe(false);
  });
  it('rejects corrupt JSON, schema, directories, oversize files and invalid save state', async () => {
    const { path, document, directory } = await fixture();
    await fs.writeFile(path, '{');
    await expect(readDocumentFile(path)).rejects.toMatchObject({ code: 'invalid-json' });
    await fs.writeFile(path, Buffer.from([0xff, 0xfe]));
    await expect(readDocumentFile(path)).rejects.toMatchObject({ code: 'invalid-json' });
    await fs.writeFile(path, JSON.stringify({ ...document, schemaVersion: 'future' }));
    await expect(readDocumentFile(path)).rejects.toMatchObject({ code: 'invalid-document' });
    await expect(readDocumentFile(directory)).rejects.toMatchObject({ code: 'access-denied' });
    await fs.writeFile(path, Buffer.alloc(20 * 1024 * 1024 + 1));
    await expect(readDocumentFile(path)).rejects.toMatchObject({ code: 'too-large' });
    await expect(writeDocumentFile(path, {} as Presentation, null)).rejects.toMatchObject({
      code: 'invalid-document',
    });
    expect((await fs.stat(path)).size).toBe(20 * 1024 * 1024 + 1);
  });
  it('refuses external edits and replacement failures without destroying the target', async () => {
    const { path, directory, document } = await fixture();
    const saved = await writeDocumentFile(path, document, null);
    await fs.writeFile(path, 'external edit');
    await expect(writeDocumentFile(path, document, saved.stamp)).rejects.toMatchObject({
      code: 'file-changed',
    });
    expect(await fs.readFile(path, 'utf8')).toBe('external edit');
    const stamp = await documentFileStamp(path);
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(
      Object.assign(new Error('locked target'), { code: 'EACCES' }),
    );
    await expect(writeDocumentFile(path, document, stamp)).rejects.toMatchObject({
      code: 'EACCES',
    });
    expect(await fs.readFile(path, 'utf8')).toBe('external edit');
    expect((await fs.readdir(directory)).some((name) => name.endsWith('.tmp'))).toBe(false);
    const backup = (await fs.readdir(directory)).find((name) => name.endsWith('.bak'));
    expect(await fs.readFile(join(directory, backup!), 'utf8')).toBe('external edit');
  });
  it('does not clobber a new target appearing during exclusive creation', async () => {
    const { path, document } = await fixture();
    vi.spyOn(fs, 'link').mockImplementationOnce(async (_source, target) => {
      await fs.writeFile(target, 'unexpected file');
      throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    });
    await expect(writeDocumentFile(path, document, null)).rejects.toMatchObject({
      code: 'file-changed',
    });
    expect(await fs.readFile(path, 'utf8')).toBe('unexpected file');
  });
});

import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import {
  getDocument,
  openDocumentFile,
  dispatchDocumentCommand,
  saveDocumentFile,
  endDocumentSession,
} from '../src/main/document-session.js';

describe('bundle upgrade policy', () => {
  it('requires a new path for legacy model upgrades and leaves the original bytes intact', async () => {
    const directory = await fs.mkdtemp(join(os.tmpdir(), 'auralide-upgrade-'));
    const oldPath = join(directory, 'old.json'),
      newPath = join(directory, 'modern.json');
    const original = JSON.stringify({ ...getDocument(), schemaVersion: '1.0' });
    try {
      await fs.writeFile(oldPath, original);
      const loaded = await openDocumentFile(
        { expectedRevision: getDocument().revision },
        async () => oldPath,
        async () => true,
      );
      expect(loaded.ok).toBe(true);
      const doc = getDocument();
      const updated = dispatchDocumentCommand({
        operation: 'slide.updateProperties',
        target: { kind: 'slide', slideId: doc.slides[0]!.id },
        payload: { transition: 'fade' },
        expectedRevision: doc.revision,
        origin: { kind: 'human' },
      });
      expect(updated.ok).toBe(true);
      expect(getDocument().schemaVersion).toBe('1.1');
      expect(
        await saveDocumentFile({ expectedRevision: getDocument().revision }, async () => oldPath),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(await fs.readFile(oldPath, 'utf8')).toBe(original);
      expect(
        (await saveDocumentFile({ expectedRevision: getDocument().revision }, async () => newPath))
          .ok,
      ).toBe(true);
      expect(
        (JSON.parse(await fs.readFile(newPath, 'utf8')) as { schemaVersion: string }).schemaVersion,
      ).toBe('1.1');
    } finally {
      endDocumentSession();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});

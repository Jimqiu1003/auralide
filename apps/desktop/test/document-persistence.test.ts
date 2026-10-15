import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  dispatchDocumentCommand,
  getDocument,
  hasUnsavedChanges,
  openDocumentFile,
  saveDocumentFile,
} from '../src/main/document-session.js';

describe('application file policy', () => {
  it('gates paths/revisions, serializes edits, preserves failures and fences reopened state', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'auralide-session-'));
    try {
      const path = join(directory, 'deck.json');
      const before = getDocument();
      let dialogs = 0;
      const choose = async () => {
        dialogs++;
        return path;
      };
      expect(
        await saveDocumentFile({ expectedRevision: before.revision, path }, choose),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(
        await openDocumentFile({ expectedRevision: -1 }, choose, async () => true),
      ).toMatchObject({ ok: false });
      expect(dialogs).toBe(0);
      expect(
        await saveDocumentFile({ expectedRevision: before.revision }, async () => null),
      ).toMatchObject({ ok: false, error: { code: 'cancelled' } });
      let release!: (path: string) => void;
      const pending = saveDocumentFile(
        { expectedRevision: before.revision },
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      expect(await saveDocumentFile({ expectedRevision: before.revision }, choose)).toMatchObject({
        ok: false,
        error: { code: 'busy' },
      });
      const command = {
        operation: 'element.updateText',
        target: { kind: 'element', slideId: 'slide_welcome', elementId: 'el_title' },
        payload: { text: 'Unsaved edit' },
        expectedRevision: before.revision,
        origin: { kind: 'human' },
      };
      expect(dispatchDocumentCommand(command)).toMatchObject({
        ok: false,
        error: { code: 'conflict' },
      });
      release(path);
      expect(await pending).toMatchObject({ ok: true, value: { backupCreated: false } });
      expect(dispatchDocumentCommand(command).ok).toBe(true);
      const edited = getDocument();
      expect(hasUnsavedChanges()).toBe(true);
      expect(
        await openDocumentFile({ expectedRevision: edited.revision }, choose, async () => false),
      ).toMatchObject({ ok: false, error: { code: 'cancelled' } });
      expect(getDocument()).toBe(edited);
      const opened = await openDocumentFile(
        { expectedRevision: edited.revision },
        choose,
        async () => true,
      );
      expect(opened).toMatchObject({ ok: true, value: { historyReset: true } });
      expect(getDocument().slides).toEqual(before.slides);
      expect(getDocument().revision).toBeGreaterThan(edited.revision);
      expect(
        dispatchDocumentCommand({ ...command, expectedRevision: edited.revision }),
      ).toMatchObject({ ok: false, error: { code: 'stale-revision' } });
      expect(hasUnsavedChanges()).toBe(false);
      const current = getDocument();
      await fs.writeFile(path, '{');
      expect(
        await openDocumentFile({ expectedRevision: current.revision }, choose, async () => true),
      ).toMatchObject({ ok: false, error: { code: 'invalid-json' } });
      expect(getDocument()).toBe(current);
      expect(await saveDocumentFile({ expectedRevision: current.revision }, choose)).toMatchObject({
        ok: false,
        error: { code: 'file-changed' },
      });
      expect(getDocument()).toBe(current);
      await fs.writeFile(path, JSON.stringify({ ...current, revision: Number.MAX_SAFE_INTEGER }));
      expect(
        await openDocumentFile({ expectedRevision: current.revision }, choose, async () => true),
      ).toMatchObject({ ok: false, error: { code: 'revision-limit' } });
      expect(getDocument()).toBe(current);
    } finally {
      await fs.rm(directory, { recursive: true });
    }
  });
});

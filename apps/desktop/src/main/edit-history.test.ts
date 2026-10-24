import { describe, expect, it } from 'vitest';
import {
  dispatchDocumentCommand,
  editDocumentHistory,
  endDocumentSession,
  getDocument,
  getDocumentStatus,
  saveDocumentFile,
} from './document-session.js';

describe('main-authorized document undo and redo', () => {
  it('validates revisions, preserves failures and refuses history during a file operation', async () => {
    const before = getDocument();
    const request = { direction: 'undo', expectedRevision: before.revision };
    expect(editDocumentHistory({ ...request, path: 'C:/forbidden.json' }).ok).toBe(false);
    expect(getDocument()).toBe(before);
    expect(
      dispatchDocumentCommand({
        operation: 'element.updateText',
        target: { kind: 'element', slideId: 'slide_welcome', elementId: 'el_title' },
        payload: { text: 'After' },
        expectedRevision: before.revision,
        origin: { kind: 'human' },
      }).ok,
    ).toBe(true);
    expect(editDocumentHistory(request)).toMatchObject({
      ok: false,
      error: { code: 'stale-revision' },
    });
    expect(editDocumentHistory({ ...request, expectedRevision: getDocument().revision }).ok).toBe(
      true,
    );
    expect(getDocument().slides).toEqual(before.slides);
    expect(getDocumentStatus().canRedo).toBe(true);
    expect(
      editDocumentHistory({ direction: 'redo', expectedRevision: getDocument().revision }).ok,
    ).toBe(true);
    expect(getDocument().slides[0]?.elements[0]).toMatchObject({ text: 'After' });
    let release!: (path: null) => void;
    const saving = saveDocumentFile(
      { expectedRevision: getDocument().revision },
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const changed = getDocument();
    expect(editDocumentHistory({ ...request, expectedRevision: changed.revision })).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(getDocument()).toBe(changed);
    release(null);
    await saving;
    endDocumentSession();
    expect(getDocumentStatus()).toMatchObject({ canUndo: false, canRedo: false, dirty: false });
  });
});

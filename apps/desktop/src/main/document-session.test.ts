import { describe, expect, it } from 'vitest';

import { dispatchDocumentCommand, getDocument } from './document-session.js';

describe('main-owned document session', () => {
  it('uses the dispatcher and preserves the document on invalid and stale edits', () => {
    const before = getDocument();
    const command = {
      operation: 'element.updateText',
      target: { kind: 'element', slideId: 'slide_welcome', elementId: 'el_title' },
      payload: { text: 'A real Core edit' },
      expectedRevision: before.revision,
      origin: { kind: 'agent', id: 'untrusted-claim' },
    };
    expect(dispatchDocumentCommand({ ...command, extra: true }).ok).toBe(false);
    expect(getDocument()).toBe(before);
    const applied = dispatchDocumentCommand(command);
    expect(applied.ok).toBe(true);
    expect(getDocument().revision).toBe(before.revision + 1);
    expect(getDocument().slides[0]?.elements[0]).toMatchObject({ text: 'A real Core edit' });
    const changed = getDocument();
    expect(dispatchDocumentCommand(command)).toMatchObject({
      ok: false,
      error: { code: 'stale-revision' },
    });
    expect(getDocument()).toBe(changed);
    expect(before.slides[0]?.elements[0]).toMatchObject({ text: 'Your ideas, structured.' });
  });
});

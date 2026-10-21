import { describe, it, expect } from 'vitest';
import { presentationSchema } from './document.js';
import { applyCommand, createEditorState, undo, redo } from './dispatcher.js';

describe('dynamic document commands', () => {
  it('versions source replacements, refuses stale source revisions and restores them through history', () => {
    const initial = createEditorState(
      presentationSchema.parse({
        schemaVersion: '1.1',
        id: 'pres_dynamic',
        title: 'dynamic',
        revision: 0,
        slideSize: { width: 1280, height: 720 },
        slides: [
          {
            id: 'slide_dynamic',
            elements: [
              {
                id: 'el_source',
                kind: 'source',
                assetId: 'a'.repeat(64),
                sourceRevision: 0,
                geometry: { x: 0, y: 0, width: 1280, height: 720 },
              },
            ],
          },
        ],
      }),
    );
    const command = {
      operation: 'element.updateProperties',
      target: { kind: 'element', slideId: 'slide_dynamic', elementId: 'el_source' },
      payload: { assetId: 'b'.repeat(64), expectedSourceRevision: 0 },
      origin: { kind: 'human' },
      expectedRevision: 0,
    };
    const changed = applyCommand(initial, command);
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.value.state.document.slides[0]?.elements[0]).toMatchObject({
      sourceRevision: 1,
      assetId: 'b'.repeat(64),
    });
    expect(applyCommand(changed.value.state, { ...command, expectedRevision: 1 }).ok).toBe(false);
    const reverted = undo(changed.value.state);
    expect(reverted.ok).toBe(true);
    if (!reverted.ok) return;
    expect(reverted.value.document.slides[0]?.elements[0]).toMatchObject({
      sourceRevision: 0,
      assetId: 'a'.repeat(64),
    });
    expect(redo(reverted.value).ok).toBe(true);
    expect(
      applyCommand(initial, {
        ...command,
        payload: { entrance: { effect: 'slide', trigger: 'click', duration: -1 } },
      }).ok,
    ).toBe(false);
    expect(
      applyCommand(initial, {
        ...command,
        operation: 'slide.updateProperties',
        target: { kind: 'slide', slideId: 'slide_dynamic' },
        payload: { transition: 'fade' },
      }).ok,
    ).toBe(true);
  });
});

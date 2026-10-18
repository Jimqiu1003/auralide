import { describe, expect, it } from 'vitest';
import { applyCommand, createEditorState, undo, redo } from './dispatcher.js';
import { presentationSchema } from './document.js';

const initial = () =>
  createEditorState(
    presentationSchema.parse({
      schemaVersion: '1.0',
      id: 'pres_edit',
      title: 'Editing',
      revision: 0,
      slideSize: { width: 1280, height: 720 },
      slides: [
        {
          id: 'slide_edit',
          elements: [
            {
              kind: 'text',
              id: 'el_text',
              text: 'Before',
              geometry: { x: 0, y: 0, width: 100, height: 50 },
              style: { fontSize: 20, color: '#112233' },
            },
            {
              kind: 'shape',
              id: 'el_shape',
              shape: 'rectangle',
              geometry: { x: 0, y: 0, width: 20, height: 20 },
            },
          ],
        },
      ],
    }),
  );
const command = (
  payload: unknown,
  elementId = 'el_text',
  operation = 'element.updateProperties',
) => ({
  operation,
  target: { kind: 'element', slideId: 'slide_edit', elementId },
  payload,
  expectedRevision: 0,
  origin: { kind: 'human' },
});
describe('basic editable properties and paint order', () => {
  it('validates geometry and type-specific style atomically, with reversible history', () => {
    const before = initial();
    const result = applyCommand(
      before,
      command({
        geometry: { x: 12, y: 24, width: 320, height: 80 },
        style: { fontWeight: 700, align: 'center' },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.document.slides[0]?.elements[0]).toMatchObject({
      geometry: { width: 320 },
      style: { fontSize: 20, color: '#112233', fontWeight: 700, align: 'center' },
    });
    const undone = undo(result.value.state);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.value.document.slides).toEqual(before.document.slides);
    const redone = redo(undone.value);
    expect(redone.ok).toBe(true);
    if (redone.ok) expect(redone.value.document.slides).toEqual(result.value.state.document.slides);
    expect(before.document.revision).toBe(0);
  });
  it.each([
    [{}, 'el_text'],
    [{ style: {} }, 'el_text'],
    [{ style: { color: undefined } }, 'el_text'],
    [{ geometry: undefined }, 'el_text'],
    [{ style: { fontSize: 0 } }, 'el_text'],
    [{ style: { color: 'url(https://example.com)' } }, 'el_text'],
    [{ style: { fontWeight: 1001 } }, 'el_text'],
    [{ fill: '#123456' }, 'el_text'],
    [{ style: { align: 'left' } }, 'el_shape'],
    [{ geometry: { x: 0, y: 0, width: Number.NaN, height: 1 } }, 'el_text'],
    [{ geometry: { x: 0, y: 0, width: 0, height: 1 } }, 'el_text'],
    [{ extra: true }, 'el_text'],
    [{ stroke: '#111111' }, 'el_missing'],
  ])(
    'rejects malformed or incompatible properties without partial state changes',
    (payload, id) => {
      const state = initial(),
        bytes = JSON.stringify(state);
      expect(applyCommand(state, command(payload, id as string)).ok).toBe(false);
      expect(JSON.stringify(state)).toBe(bytes);
    },
  );
  it('changes paint order without losing objects and rejects out-of-range or stale requests', () => {
    const state = initial();
    const result = applyCommand(state, command({ index: 1 }, 'el_text', 'element.reorder'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.document.slides[0]?.elements.map((item) => item.id)).toEqual([
      'el_shape',
      'el_text',
    ]);
    expect(
      applyCommand(result.value.state, command({ index: 0 }, 'el_text', 'element.reorder')),
    ).toMatchObject({ ok: false, error: { code: 'stale-revision' } });
    expect(applyCommand(state, command({ index: 2 }, 'el_text', 'element.reorder')).ok).toBe(false);
    const restored = undo(result.value.state);
    if (restored.ok) expect(restored.value.document.slides).toEqual(state.document.slides);
  });
});

import { applyCommand, createEditorState, presentationSchema } from '@auralide/core';
import type { CommandError, Presentation, Result } from '@auralide/core';

/** A deterministic, in-memory proof of the same dispatcher used by the desktop bridge. */
export const runDemo = (): Result<Presentation, CommandError> => {
  const initial = createEditorState(
    presentationSchema.parse({
      schemaVersion: '1.0',
      id: 'pres_cli_demo',
      title: 'Auralide CLI demo',
      revision: 0,
      slideSize: { width: 1280, height: 720 },
      slides: [],
    }),
  );
  const result = applyCommand(initial, {
    operation: 'slide.create',
    target: { kind: 'presentation' },
    payload: { id: 'slide_cli_demo' },
    expectedRevision: 0,
    origin: { kind: 'system', id: 'cli/demo' },
  });
  return result.ok ? { ok: true, value: result.value.state.document } : result;
};

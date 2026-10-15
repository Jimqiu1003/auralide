import {
  applyCommand,
  commandEnvelopeSchema,
  createEditorState,
  err,
  ok,
  presentationSchema,
} from '@auralide/core';
import type { CommandError, Presentation, Result } from '@auralide/core';

// shortcut: this P1 document lives in memory, add storage only after its own architecture review.
let state = createEditorState(
  presentationSchema.parse({
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
  }),
);

export const getDocument = (): Presentation => state.document;

export const dispatchDocumentCommand = (command: unknown): Result<Presentation, CommandError> => {
  const parsed = commandEnvelopeSchema.safeParse(command);
  if (!parsed.success) {
    return err({ code: 'invalid-payload', message: 'Invalid command envelope.' });
  }
  // This bridge serves the human UI; a future agent bridge must assert its own identity.
  const result = applyCommand(state, { ...parsed.data, origin: { kind: 'human', id: 'desktop' } });
  if (!result.ok) return result;
  state = result.value.state;
  return ok(state.document);
};

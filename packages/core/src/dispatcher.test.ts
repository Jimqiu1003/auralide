import { describe, expect, it } from 'vitest';

import type { CommandError, CommandOperation } from './command.js';
import { applyCommand, canRedo, canUndo, createEditorState, redo, undo } from './dispatcher.js';
import type { CommandResult, EditorState } from './dispatcher.js';
import {
  parseDocument,
  presentationSchema,
  SCHEMA_VERSION,
  serializeDocument,
} from './document.js';
import type { Presentation } from './document.js';

/** A document as plain JSON, i.e. as an untrusted caller would hand it over. */
const documentInput = () => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'pres_main',
  title: 'Auralide demo',
  revision: 0,
  slideSize: { width: 1280, height: 720 },
  slides: [
    {
      id: 'slide_intro',
      name: 'Intro',
      elements: [
        {
          kind: 'text',
          id: 'el_title',
          geometry: { x: 0, y: 0, width: 400, height: 100 },
          text: 'Hello',
        },
        {
          kind: 'shape',
          id: 'el_box',
          geometry: { x: 10, y: 10, width: 50, height: 50 },
          shape: 'rectangle',
          fill: '#ffffff',
        },
      ],
    },
    { id: 'slide_empty', elements: [] },
  ],
});

const textElement = (id: string, text = 'Text') => ({
  kind: 'text',
  id,
  geometry: { x: 0, y: 0, width: 100, height: 50 },
  text,
});

const freeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;

    for (const key of Object.keys(record)) {
      freeze(record[key]);
    }

    Object.freeze(value);
  }

  return value;
};

const parseFixture = (input: unknown): Presentation => {
  const parsed = presentationSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(`fixture is not a valid document: ${JSON.stringify(parsed.error.issues)}`);
  }

  return parsed.data;
};

const createDocument = (): Presentation => parseFixture(documentInput());

/**
 * Every fixture state is deeply frozen, so a dispatcher that mutated the state it was given would
 * throw instead of quietly corrupting the history.
 */
const createState = (): EditorState => freeze(createEditorState(createDocument()));

const command = (
  operation: CommandOperation,
  target: unknown,
  payload: unknown,
  options: { readonly expectedRevision?: number; readonly origin?: unknown } = {},
): Record<string, unknown> => ({
  operation,
  target,
  payload,
  expectedRevision: options.expectedRevision ?? 0,
  origin: options.origin ?? { kind: 'human' },
});

/** A valid payload for an operation, used by the failure tests that only break one field. */
const validPayload = (operation: CommandOperation): unknown => {
  switch (operation) {
    case 'slide.create':
      return { id: 'slide_x' };
    case 'slide.remove':
      return {};
    case 'element.add':
      return { element: textElement('el_x') };
    case 'element.move':
      return { x: 1, y: 2 };
    case 'element.updateText':
      return { text: 'x' };
    case 'element.remove':
      return {};
  }
};

const applyOk = (state: EditorState, input: unknown): CommandResult => {
  const result = applyCommand(state, input);

  if (!result.ok) {
    throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  }

  return result.value;
};

const applyErr = (state: EditorState, input: unknown): CommandError => {
  const result = applyCommand(state, input);

  if (result.ok) {
    throw new Error('expected the command to be rejected');
  }

  return result.error;
};

const undoOk = (state: EditorState): EditorState => {
  const result = undo(state);

  if (!result.ok) {
    throw new Error(`expected undo to succeed, got ${result.error.code}`);
  }

  return result.value;
};

const redoOk = (state: EditorState): EditorState => {
  const result = redo(state);

  if (!result.ok) {
    throw new Error(`expected redo to succeed, got ${result.error.code}`);
  }

  return result.value;
};

/** Models a command that travelled over IPC or the CLI. */
const overTheWire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('applyCommand success paths', () => {
  it('slide.create appends a slide and increments the revision once', () => {
    const state = createState();
    const result = applyOk(
      state,
      command('slide.create', { kind: 'presentation' }, { id: 'slide_new', name: 'New' }),
    );

    expect(result.state.document.revision).toBe(1);
    expect(result.state.document.slides).toHaveLength(3);
    expect(result.state.document.slides[2]).toStrictEqual({
      id: 'slide_new',
      name: 'New',
      elements: [],
    });
    expect(result.entry.sequence).toBe(1);
    expect(result.entry.revision).toBe(1);
    expect(result.entry.operation).toBe('slide.create');
    expect(result.entry.target).toStrictEqual({ kind: 'presentation' });
    expect(result.entry.origin).toStrictEqual({ kind: 'human' });
    expect(result.state.history.entries[0]).toBe(result.entry);
    expect(canUndo(result.state)).toBe(true);
    expect(canRedo(result.state)).toBe(false);
  });

  it('slide.remove removes the slide and keeps the others', () => {
    const state = createState();
    const result = applyOk(
      state,
      command('slide.remove', { kind: 'slide', slideId: 'slide_intro' }, {}),
    );

    expect(result.state.document.revision).toBe(1);
    expect(result.state.document.slides.map((slide) => slide.id)).toStrictEqual(['slide_empty']);
    expect(result.entry.target).toStrictEqual({ kind: 'slide', slideId: 'slide_intro' });
  });

  it('element.add appends the element to the targeted slide', () => {
    const state = createState();
    const result = applyOk(
      state,
      command(
        'element.add',
        { kind: 'slide', slideId: 'slide_empty' },
        { element: textElement('el_new', 'Added') },
      ),
    );

    expect(result.state.document.revision).toBe(1);
    expect(result.state.document.slides[1]?.elements).toStrictEqual([
      textElement('el_new', 'Added'),
    ]);
    expect(result.state.document.slides[0]?.elements).toHaveLength(2);
  });

  it('element.move changes only the position', () => {
    const state = createState();
    const result = applyOk(
      state,
      command(
        'element.move',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_title' },
        { x: 250, y: 300 },
      ),
    );

    expect(result.state.document.revision).toBe(1);
    expect(result.state.document.slides[0]?.elements[0]).toStrictEqual({
      kind: 'text',
      id: 'el_title',
      geometry: { x: 250, y: 300, width: 400, height: 100 },
      text: 'Hello',
    });
    expect(result.state.document.slides[0]?.elements[1]).toStrictEqual(
      state.document.slides[0]?.elements[1],
    );
  });

  it('element.updateText replaces only the text', () => {
    const state = createState();
    const result = applyOk(
      state,
      command(
        'element.updateText',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_title' },
        { text: 'Updated' },
      ),
    );

    expect(result.state.document.revision).toBe(1);
    expect(result.state.document.slides[0]?.elements[0]).toStrictEqual({
      kind: 'text',
      id: 'el_title',
      geometry: { x: 0, y: 0, width: 400, height: 100 },
      text: 'Updated',
    });
  });

  it('element.remove removes only the targeted element', () => {
    const state = createState();
    const result = applyOk(
      state,
      command(
        'element.remove',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_box' },
        {},
      ),
    );

    expect(result.state.document.revision).toBe(1);
    expect(result.state.document.slides[0]?.elements.map((element) => element.id)).toStrictEqual([
      'el_title',
    ]);
  });

  it('records the origin of every successful command', () => {
    const origins = [
      { kind: 'human' },
      { kind: 'agent', id: 'agent:planner' },
      { kind: 'import' },
      { kind: 'system' },
    ] as const;

    let state = createState();

    origins.forEach((origin, index) => {
      const result = applyOk(
        state,
        command(
          'slide.create',
          { kind: 'presentation' },
          { id: `slide_${index}` },
          { expectedRevision: index, origin },
        ),
      );

      state = result.state;
      expect(result.entry.origin).toStrictEqual(origin);
      expect(state.history.entries[index]?.origin).toStrictEqual(origin);
    });

    expect(state.history.entries.map((entry) => entry.origin.kind)).toStrictEqual([
      'human',
      'agent',
      'import',
      'system',
    ]);
  });
});

describe('target existence', () => {
  it('rejects a command whose slide does not exist', () => {
    const state = createState();

    expect(
      applyErr(state, command('slide.remove', { kind: 'slide', slideId: 'slide_missing' }, {}))
        .code,
    ).toBe('target-not-found');
    expect(
      applyErr(
        state,
        command(
          'element.add',
          { kind: 'slide', slideId: 'slide_missing' },
          { element: textElement('el_new') },
        ),
      ).code,
    ).toBe('target-not-found');

    for (const operation of ['element.move', 'element.updateText', 'element.remove'] as const) {
      expect(
        applyErr(
          state,
          command(
            operation,
            { kind: 'element', slideId: 'slide_missing', elementId: 'el_title' },
            validPayload(operation),
          ),
        ).code,
      ).toBe('target-not-found');
    }
  });

  it('rejects a command whose element does not exist', () => {
    const state = createState();

    for (const operation of ['element.move', 'element.updateText', 'element.remove'] as const) {
      expect(
        applyErr(
          state,
          command(
            operation,
            { kind: 'element', slideId: 'slide_intro', elementId: 'el_missing' },
            validPayload(operation),
          ),
        ).code,
      ).toBe('target-not-found');
    }
  });

  it('does not resolve an element through the wrong slide', () => {
    const state = createState();
    const error = applyErr(
      state,
      command(
        'element.remove',
        { kind: 'element', slideId: 'slide_empty', elementId: 'el_title' },
        {},
      ),
    );

    expect(error.code).toBe('target-not-found');
    expect(error.message).toContain('el_title');
  });
});

describe('payload, target and envelope validation', () => {
  it('rejects a malformed payload', () => {
    const state = createState();
    const cases: ReadonlyArray<readonly [CommandOperation, unknown, unknown]> = [
      ['slide.create', { kind: 'presentation' }, {}],
      ['slide.create', { kind: 'presentation' }, { id: 'slide_x', extra: true }],
      ['slide.create', { kind: 'presentation' }, { id: 'el_x' }],
      ['slide.create', { kind: 'presentation' }, { id: 'slide_x', name: '' }],
      ['slide.remove', { kind: 'slide', slideId: 'slide_intro' }, undefined],
      ['slide.remove', { kind: 'slide', slideId: 'slide_intro' }, { extra: true }],
      ['element.add', { kind: 'slide', slideId: 'slide_empty' }, { element: textElement('bad_1') }],
      [
        'element.add',
        { kind: 'slide', slideId: 'slide_empty' },
        { element: { ...textElement('el_x'), geometry: { x: 0, y: 0, width: -1, height: 10 } } },
      ],
      [
        'element.add',
        { kind: 'slide', slideId: 'slide_empty' },
        { element: { kind: 'video', id: 'el_x' } },
      ],
      [
        'element.move',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_title' },
        { x: '0', y: 0 },
      ],
      [
        'element.move',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_title' },
        { x: 0 },
      ],
      [
        'element.updateText',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_title' },
        { text: 5 },
      ],
      ['element.remove', { kind: 'element', slideId: 'slide_intro', elementId: 'el_title' }, null],
    ];

    for (const [operation, target, payload] of cases) {
      expect(applyErr(state, command(operation, target, payload)).code).toBe('invalid-payload');
    }
  });

  it('rejects a malformed target', () => {
    const state = createState();
    const cases: ReadonlyArray<readonly [CommandOperation, unknown]> = [
      ['slide.create', { kind: 'slide', slideId: 'slide_intro' }],
      ['slide.remove', { kind: 'presentation' }],
      ['slide.remove', { kind: 'slide' }],
      ['slide.remove', { kind: 'slide', slideId: 'intro' }],
      ['slide.remove', { kind: 'slide', slideId: 'slide_intro', extra: 1 }],
      ['element.remove', { kind: 'element', slideId: 'slide_intro' }],
      ['element.remove', { kind: 'slide', slideId: 'slide_intro' }],
    ];

    for (const [operation, target] of cases) {
      expect(applyErr(state, command(operation, target, validPayload(operation))).code).toBe(
        'invalid-payload',
      );
    }
  });

  it('rejects a malformed command envelope', () => {
    const state = createState();
    const base = command('slide.remove', { kind: 'slide', slideId: 'slide_intro' }, {});

    expect(applyErr(state, { ...base, expectedRevision: -1 }).code).toBe('invalid-payload');
    expect(applyErr(state, { ...base, expectedRevision: 1.5 }).code).toBe('invalid-payload');
    expect(applyErr(state, { ...base, origin: { kind: 'robot' } }).code).toBe('invalid-payload');
    expect(applyErr(state, { ...base, origin: undefined }).code).toBe('invalid-payload');
    expect(applyErr(state, { ...base, extra: true }).code).toBe('invalid-payload');
    expect(
      applyErr(state, {
        operation: base.operation,
        target: base.target,
        payload: base.payload,
        origin: base.origin,
      }).code,
    ).toBe('invalid-payload');
  });

  it('rejects an unsupported operation', () => {
    const state = createState();
    const envelope = {
      target: { kind: 'presentation' },
      payload: { id: 'slide_x' },
      expectedRevision: 0,
      origin: { kind: 'human' },
    };

    expect(applyErr(state, { ...envelope, operation: 'slide.duplicate' }).code).toBe(
      'unsupported-operation',
    );
    expect(applyErr(state, { ...envelope, operation: 'slide_remove' }).code).toBe(
      'unsupported-operation',
    );
    expect(applyErr(state, { ...envelope, operation: 42 }).code).toBe('unsupported-operation');
    expect(applyErr(state, { operation: undefined }).code).toBe('unsupported-operation');
    expect(applyErr(state, 'slide.create').code).toBe('unsupported-operation');
    expect(applyErr(state, null).code).toBe('unsupported-operation');
    expect(applyErr(state, []).code).toBe('unsupported-operation');
  });
});

describe('revision conflicts', () => {
  it('refuses a command whose expectedRevision is behind the document', () => {
    const state = createState();
    const advanced = applyOk(
      state,
      command('slide.create', { kind: 'presentation' }, { id: 'slide_new' }),
    ).state;
    const error = applyErr(
      advanced,
      command(
        'slide.remove',
        { kind: 'slide', slideId: 'slide_intro' },
        {},
        { expectedRevision: 0 },
      ),
    );

    expect(error.code).toBe('stale-revision');
    expect(error.message).toContain('revision 1');
  });

  it('refuses a command whose expectedRevision is ahead of the document', () => {
    const state = createState();
    const error = applyErr(
      state,
      command(
        'slide.remove',
        { kind: 'slide', slideId: 'slide_intro' },
        {},
        { expectedRevision: 7 },
      ),
    );

    expect(error.code).toBe('stale-revision');
  });

  it('leaves the document and the history untouched on a stale revision', () => {
    const state = createState();
    const before = JSON.stringify(state);
    const entries = state.history.entries;

    const error = applyErr(
      state,
      command(
        'element.remove',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_box' },
        {},
        { expectedRevision: 4 },
      ),
    );

    expect(error.code).toBe('stale-revision');
    expect(JSON.stringify(state)).toBe(before);
    expect(state.history.entries).toBe(entries);
    expect(state.document.revision).toBe(0);
    expect(state.document.slides[0]?.elements).toHaveLength(2);
  });

  it('accepts the next command after an undo, because the revision went back', () => {
    const state = createState();
    const first = applyOk(
      state,
      command('slide.create', { kind: 'presentation' }, { id: 'slide_new' }),
    );
    const undone = undoOk(first.state);

    expect(undone.document.revision).toBe(0);

    const second = applyOk(
      undone,
      command(
        'element.add',
        { kind: 'slide', slideId: 'slide_empty' },
        { element: textElement('el_x') },
        { expectedRevision: 0 },
      ),
    );

    expect(second.state.document.revision).toBe(1);
    expect(second.state.document.slides[1]?.elements).toHaveLength(1);
  });
});

describe('conflicts', () => {
  it('rejects a duplicate slide id', () => {
    const state = createState();
    const error = applyErr(
      state,
      command('slide.create', { kind: 'presentation' }, { id: 'slide_intro' }),
    );

    expect(error.code).toBe('conflict');
    expect(error.message).toContain('slide_intro');
  });

  it('rejects a duplicate element id, even from another slide', () => {
    const state = createState();
    const error = applyErr(
      state,
      command(
        'element.add',
        { kind: 'slide', slideId: 'slide_empty' },
        { element: textElement('el_title') },
      ),
    );

    expect(error.code).toBe('conflict');
    expect(error.message).toContain('el_title');
  });

  it('rejects element.updateText on an element that is not text', () => {
    const state = createState();
    const error = applyErr(
      state,
      command(
        'element.updateText',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_box' },
        { text: 'nope' },
      ),
    );

    expect(error.code).toBe('conflict');
    expect(error.message).toContain('shape');
  });
});

describe('atomicity', () => {
  it('leaves the state byte-identical when a command fails', () => {
    const state = createState();
    const document = state.document;
    const before = JSON.stringify(state);
    const snapshot: unknown = JSON.parse(before);
    const failing: readonly unknown[] = [
      command(
        'element.remove',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_missing' },
        {},
      ),
      command(
        'element.move',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_title' },
        { x: '0', y: 0 },
      ),
      command(
        'slide.remove',
        { kind: 'slide', slideId: 'slide_intro' },
        {},
        { expectedRevision: 3 },
      ),
      command(
        'element.add',
        { kind: 'slide', slideId: 'slide_empty' },
        { element: textElement('el_title') },
      ),
      {
        operation: 'slide.duplicate',
        target: { kind: 'presentation' },
        payload: {},
        expectedRevision: 0,
        origin: { kind: 'agent' },
      },
    ];

    for (const input of failing) {
      expect(applyCommand(state, input).ok).toBe(false);
      expect(JSON.stringify(state)).toBe(before);
      expect(state).toStrictEqual(snapshot);
      expect(state.document).toBe(document);
      expect(state.document.revision).toBe(0);
      expect(state.history.entries).toStrictEqual([]);
      expect(state.history.cursor).toBe(0);
    }
  });

  it('does not mutate the state it was given when a command succeeds', () => {
    const state = createState();
    const document = state.document;
    const before = JSON.stringify(state);
    const snapshot: unknown = JSON.parse(before);

    const result = applyOk(
      state,
      command(
        'element.remove',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_box' },
        {},
      ),
    );

    expect(JSON.stringify(state)).toBe(before);
    expect(state).toStrictEqual(snapshot);
    expect(state.document).toBe(document);
    expect(result.state.document).not.toBe(document);
    expect(result.state.document.slides[0]?.elements).toHaveLength(1);
  });
});

describe('undo and redo', () => {
  it('restores the exact previous document and re-applies it', () => {
    const state = createState();
    const created = applyOk(
      state,
      command('slide.create', { kind: 'presentation' }, { id: 'slide_new', name: 'New' }),
    );
    const undone = undoOk(created.state);

    expect(undone.document).toStrictEqual(state.document);
    expect(undone.document.revision).toBe(0);
    expect(undone.history.cursor).toBe(0);
    expect(undone.history.entries).toHaveLength(1);
    expect(canUndo(undone)).toBe(false);
    expect(canRedo(undone)).toBe(true);

    const redone = redoOk(undone);

    expect(redone.document).toStrictEqual(created.state.document);
    expect(redone.document.revision).toBe(1);
    expect(redone.history.cursor).toBe(1);
    expect(canRedo(redone)).toBe(false);
    expect(canUndo(redone)).toBe(true);
  });

  it('undoes and redoes a multi-step sequence, operation by operation', () => {
    const initial = createState();
    const sequence: readonly unknown[] = [
      command(
        'slide.create',
        { kind: 'presentation' },
        { id: 'slide_new', name: 'New' },
        { expectedRevision: 0 },
      ),
      command(
        'element.add',
        { kind: 'slide', slideId: 'slide_new' },
        { element: textElement('el_new') },
        { expectedRevision: 1 },
      ),
      command(
        'element.updateText',
        { kind: 'element', slideId: 'slide_new', elementId: 'el_new' },
        { text: 'Edited' },
        { expectedRevision: 2 },
      ),
      command(
        'element.move',
        { kind: 'element', slideId: 'slide_new', elementId: 'el_new' },
        { x: 100, y: 200 },
        { expectedRevision: 3 },
      ),
      command(
        'element.remove',
        { kind: 'element', slideId: 'slide_new', elementId: 'el_new' },
        {},
        { expectedRevision: 4 },
      ),
      command('slide.remove', { kind: 'slide', slideId: 'slide_new' }, {}, { expectedRevision: 5 }),
    ];
    const steps: CommandResult[] = [];
    let state = initial;

    for (const input of sequence) {
      const result = applyOk(state, input);

      steps.push(result);
      state = result.state;
    }

    expect(state.document.revision).toBe(6);
    expect(state.document).toStrictEqual({ ...initial.document, revision: 6 });
    expect(state.document.slides).toStrictEqual(initial.document.slides);

    for (let index = steps.length - 1; index >= 0; index -= 1) {
      state = undoOk(state);
      expect(state.document).toStrictEqual(
        index === 0 ? initial.document : steps[index - 1]?.state.document,
      );
    }

    expect(canUndo(state)).toBe(false);
    expect(state.document).toStrictEqual(initial.document);

    for (const step of steps) {
      state = redoOk(state);
      expect(state.document).toStrictEqual(step.state.document);
    }

    expect(canRedo(state)).toBe(false);
    expect(state.document.revision).toBe(6);
  });

  it('clears the redo stack when a new command is applied', () => {
    const state = createState();
    const first = applyOk(
      state,
      command(
        'slide.create',
        { kind: 'presentation' },
        { id: 'slide_new' },
        { expectedRevision: 0 },
      ),
    );
    const undone = undoOk(first.state);

    expect(canRedo(undone)).toBe(true);

    const replacement = applyOk(
      undone,
      command(
        'slide.create',
        { kind: 'presentation' },
        { id: 'slide_other' },
        { expectedRevision: 0 },
      ),
    );

    expect(canRedo(replacement.state)).toBe(false);
    expect(replacement.state.history.entries).toHaveLength(1);
    expect(replacement.state.history.cursor).toBe(1);
    expect(replacement.entry.sequence).toBe(1);
    expect(replacement.state.history.entries[0]).toBe(replacement.entry);
    expect(replacement.state.document.slides.map((slide) => slide.id)).toStrictEqual([
      'slide_intro',
      'slide_empty',
      'slide_other',
    ]);

    const rolledBack = undoOk(replacement.state);

    expect(rolledBack.document).toStrictEqual(undone.document);
    expect(rolledBack.history.entries).toHaveLength(1);

    // Only the replacement is redoable: the discarded command is gone for good.
    const redone = redoOk(rolledBack);

    expect(redone.document).toStrictEqual(replacement.state.document);
    expect(redone.document.slides.map((slide) => slide.id)).toStrictEqual([
      'slide_intro',
      'slide_empty',
      'slide_other',
    ]);
    expect(canRedo(redone)).toBe(false);
  });

  it('reports nothing-to-undo and nothing-to-redo at the edges', () => {
    const state = createState();
    const undoResult = undo(state);

    if (undoResult.ok) {
      throw new Error('expected undo to fail on a fresh state');
    }

    expect(undoResult.error.code).toBe('nothing-to-undo');

    const redoResult = redo(state);

    if (redoResult.ok) {
      throw new Error('expected redo to fail on a fresh state');
    }

    expect(redoResult.error.code).toBe('nothing-to-redo');
  });

  it('does not mutate the state it undoes', () => {
    const state = createState();
    const created = applyOk(
      state,
      command('slide.create', { kind: 'presentation' }, { id: 'slide_new' }),
    );
    const before = JSON.stringify(created.state);

    undoOk(created.state);

    expect(JSON.stringify(created.state)).toBe(before);
    expect(canUndo(created.state)).toBe(true);
  });
});

describe('removing the last slide', () => {
  const singleSlideState = (): EditorState =>
    freeze(
      createEditorState(
        parseFixture({
          ...documentInput(),
          slides: [{ id: 'slide_only', elements: [textElement('el_only')] }],
        }),
      ),
    );

  it('is refused, so a document always keeps at least one slide', () => {
    const state = singleSlideState();
    const before = JSON.stringify(state);
    const error = applyErr(
      state,
      command('slide.remove', { kind: 'slide', slideId: 'slide_only' }, {}),
    );

    expect(error.code).toBe('conflict');
    expect(error.message).toContain('slide_only');
    expect(JSON.stringify(state)).toBe(before);
    expect(state.document.slides).toHaveLength(1);
    expect(state.document.revision).toBe(0);
  });

  it('drops the second-to-last slide, and then refuses the last one', () => {
    const state = createState();
    const removed = applyOk(
      state,
      command('slide.remove', { kind: 'slide', slideId: 'slide_empty' }, {}),
    );

    expect(removed.state.document.slides.map((slide) => slide.id)).toStrictEqual(['slide_intro']);
    expect(removed.state.document.revision).toBe(1);

    const refused = applyErr(
      removed.state,
      command(
        'slide.remove',
        { kind: 'slide', slideId: 'slide_intro' },
        {},
        { expectedRevision: 1 },
      ),
    );

    expect(refused.code).toBe('conflict');
    expect(removed.state.document.slides).toHaveLength(1);
  });

  it('removes and restores a slide with all of its elements when others remain', () => {
    const state = createState();
    const removed = applyOk(
      state,
      command('slide.remove', { kind: 'slide', slideId: 'slide_intro' }, {}),
    );
    const restored = undoOk(removed.state);

    expect(restored.document).toStrictEqual(state.document);
    expect(restored.document.slides[0]?.elements).toStrictEqual(state.document.slides[0]?.elements);
  });

  it('keeps an empty presentation a valid document, even though no command reaches it', () => {
    const empty = parseFixture({ ...documentInput(), slides: [] });

    expect(empty.slides).toStrictEqual([]);
    expect(presentationSchema.safeParse(empty).success).toBe(true);
    expect(parseDocument(serializeDocument(empty)).ok).toBe(true);
  });
});

describe('the command protocol over JSON', () => {
  it('accepts a command that travelled through the wire format', () => {
    const state = createState();
    const result = applyOk(
      state,
      overTheWire(
        command(
          'element.updateText',
          { kind: 'element', slideId: 'slide_intro', elementId: 'el_title' },
          { text: 'Updated' },
        ),
      ),
    );
    const element = result.state.document.slides[0]?.elements[0];

    expect(element?.kind === 'text' ? element.text : undefined).toBe('Updated');
  });

  it('produces a document that survives serialize → parse unchanged', () => {
    const state = createState();
    const result = applyOk(
      state,
      command(
        'element.move',
        { kind: 'element', slideId: 'slide_intro', elementId: 'el_box' },
        { x: 25, y: 30 },
      ),
    );
    const parsed = parseDocument(serializeDocument(result.state.document));

    if (!parsed.ok) {
      throw new Error(`expected the document to be parsed: ${parsed.error.message}`);
    }

    expect(parsed.value).toStrictEqual(result.state.document);
    expect(parsed.value.revision).toBe(1);
  });
});

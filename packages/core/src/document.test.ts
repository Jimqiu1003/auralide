import { describe, expect, it } from 'vitest';

import {
  MAX_COORDINATE,
  MAX_DIMENSION,
  parseDocument,
  presentationSchema,
  SCHEMA_VERSION,
  serializeDocument,
} from './document.js';
import type { DocumentErrorCode, Presentation } from './document.js';

/** A well-formed document as plain JSON, i.e. exactly how an untrusted caller would hand it over. */
const documentInput = () => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'pres_main',
  title: 'Auralide demo',
  revision: 3,
  slideSize: { width: 1280, height: 720 },
  slides: [
    {
      id: 'slide_intro',
      name: 'Intro',
      backgroundColor: '#101010',
      elements: [
        {
          kind: 'text',
          id: 'el_title',
          name: 'Title',
          geometry: { x: 40, y: 60, width: 600, height: 120 },
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          text: 'Hello Auralide',
          style: { fontSize: 48, fontWeight: 700, color: '#ffffff', align: 'left' },
        },
        {
          kind: 'shape',
          id: 'el_box',
          geometry: { x: 0, y: 0, width: 200, height: 200 },
          shape: 'rectangle',
          fill: '#3366ff',
          stroke: '#ffffff',
        },
        {
          kind: 'image',
          id: 'el_logo',
          geometry: { x: 1000, y: 20, width: 120, height: 120 },
          assetId: 'asset_logo',
          alt: 'Auralide logo',
        },
      ],
    },
    { id: 'slide_empty', elements: [] },
  ],
});

const documentWithSlide = (slide: unknown) => ({ ...documentInput(), slides: [slide] });

const documentWithElement = (element: unknown) =>
  documentWithSlide({ id: 'slide_intro', elements: [element] });

const documentWithGeometry = (geometry: unknown) =>
  documentWithElement({ kind: 'text', id: 'el_title', geometry, text: 'Hello' });

const accepts = (input: unknown): Presentation => {
  const result = presentationSchema.safeParse(input);

  if (!result.success) {
    throw new Error(`expected the document to be accepted: ${JSON.stringify(result.error.issues)}`);
  }

  return result.data;
};

const rejects = (input: unknown): void => {
  expect(presentationSchema.safeParse(input).success).toBe(false);
};

const without = (input: Record<string, unknown>, key: string): Record<string, unknown> => {
  const copy = { ...input };
  delete copy[key];

  return copy;
};

const parseFailureCode = (json: string): DocumentErrorCode => {
  const result = parseDocument(json);

  if (result.ok) {
    throw new Error('expected parsing to fail');
  }

  return result.error.code;
};

describe('SCHEMA_VERSION', () => {
  it('is declared explicitly and validated by the schema', () => {
    expect(SCHEMA_VERSION).toBe('1.1');
    expect(accepts({ ...documentInput(), schemaVersion: '1.1' }).schemaVersion).toBe('1.1');
    expect(accepts(documentInput()).schemaVersion).toBe('1.1');
    expect(accepts({ ...documentInput(), schemaVersion: '1.0' }).schemaVersion).toBe('1.0');
    rejects({ ...documentInput(), schemaVersion: '2.0' });
    rejects({ ...documentInput(), schemaVersion: 1 });
  });
});

describe('document model', () => {
  it('parses a well-formed presentation', () => {
    const document = accepts(documentInput());

    expect(document.id).toBe('pres_main');
    expect(document.title).toBe('Auralide demo');
    expect(document.revision).toBe(3);
    expect(document.slideSize).toStrictEqual({ width: 1280, height: 720 });
    expect(document.slides).toHaveLength(2);
    expect(document.slides[0]?.id).toBe('slide_intro');
    expect(document.slides[0]?.elements.map((element) => element.kind)).toStrictEqual([
      'text',
      'shape',
      'image',
    ]);
    expect(document.slides[0]?.elements[0]?.geometry).toStrictEqual({
      x: 40,
      y: 60,
      width: 600,
      height: 120,
    });
    expect(document.slides[1]?.elements).toStrictEqual([]);
  });

  it('accepts an empty presentation and an element with only its required fields', () => {
    const empty = accepts({ ...documentInput(), slides: [] });

    expect(empty.slides).toStrictEqual([]);

    const minimal = accepts(
      documentWithElement({
        kind: 'text',
        id: 'el_counter',
        geometry: { x: 0, y: 0, width: 10, height: 10 },
        text: '',
      }),
    );

    expect(minimal.slides[0]?.elements[0]).toStrictEqual({
      kind: 'text',
      id: 'el_counter',
      geometry: { x: 0, y: 0, width: 10, height: 10 },
      text: '',
    });
  });

  it('rejects a non-object document', () => {
    rejects(null);
    rejects('pres_main');
    rejects([]);
    rejects({});
  });
});

describe('JSON round trip', () => {
  it('round-trips a full document losslessly', () => {
    const document = accepts(documentInput());
    const json = serializeDocument(document);
    const parsed = parseDocument(json);

    if (!parsed.ok) {
      throw new Error(`expected the document to be parsed: ${parsed.error.message}`);
    }

    expect(parsed.value).toStrictEqual(document);
    expect(serializeDocument(parsed.value)).toBe(json);
  });

  it('round-trips an empty presentation losslessly', () => {
    const document = accepts({ ...documentInput(), slides: [] });
    const parsed = parseDocument(serializeDocument(document));

    if (!parsed.ok) {
      throw new Error(`expected the document to be parsed: ${parsed.error.message}`);
    }

    expect(parsed.value).toStrictEqual(document);
    expect(parsed.value.slides).toStrictEqual([]);
  });

  it('round-trips a document whose optional fields are absent', () => {
    const document = accepts({
      schemaVersion: SCHEMA_VERSION,
      id: 'pres_bare',
      title: '',
      revision: 0,
      slideSize: { width: 1920, height: 1080 },
      slides: [{ id: 'slide_only', elements: [] }],
    });
    const parsed = parseDocument(serializeDocument(document));

    if (!parsed.ok) {
      throw new Error(`expected the document to be parsed: ${parsed.error.message}`);
    }

    expect(parsed.value).toStrictEqual(document);
    expect(Object.keys(parsed.value.slides[0] ?? {})).toStrictEqual(['id', 'elements']);
  });
});

describe('malformed input is rejected, never repaired', () => {
  it('rejects explicit undefined in optional fields instead of losing it over JSON', () => {
    rejects(documentWithSlide({ id: 'slide_a', name: undefined, elements: [] }));
    rejects(
      documentWithElement({
        kind: 'text',
        id: 'el_a',
        text: 'Text',
        geometry: { x: 0, y: 0, width: 10, height: 10 },
        style: { color: undefined },
      }),
    );
  });

  it('rejects duplicate slide ids and element ids within or across slides', () => {
    const element = {
      kind: 'text',
      id: 'el_duplicate',
      text: 'Text',
      geometry: { x: 0, y: 0, width: 10, height: 10 },
    };
    const cases = [
      [
        { id: 'slide_same', elements: [] },
        { id: 'slide_same', elements: [] },
      ],
      [{ id: 'slide_a', elements: [element, element] }],
      [
        { id: 'slide_a', elements: [element] },
        { id: 'slide_b', elements: [element] },
      ],
    ];
    for (const slides of cases) {
      const input = { ...documentInput(), slides };
      rejects(input);
      expect(parseFailureCode(JSON.stringify(input))).toBe('invalid-document');
    }
  });

  it('returns a deeply frozen parsed document', () => {
    const result = parseDocument(JSON.stringify(documentInput()));
    if (!result.ok) throw new Error(result.error.message);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.slides[0]?.elements[0]?.geometry)).toBe(true);
    expect(() => Object.assign(result.value, { title: 'tampered' })).toThrow(TypeError);
  });

  it('reports invalid JSON separately from an invalid document', () => {
    expect(parseFailureCode('{"schemaVersion":')).toBe('invalid-json');
    expect(parseFailureCode('')).toBe('invalid-json');
    expect(parseFailureCode('null')).toBe('invalid-document');
    expect(parseFailureCode('{"schemaVersion":"1.0"}')).toBe('invalid-document');
  });

  it('rejects missing required document fields', () => {
    const required = ['schemaVersion', 'id', 'title', 'revision', 'slideSize', 'slides'] as const;

    for (const field of required) {
      rejects(without(documentInput(), field));
    }
  });

  it('rejects missing required element fields', () => {
    const element = {
      kind: 'text',
      id: 'el_title',
      geometry: { x: 0, y: 0, width: 10, height: 10 },
      text: 'Hello',
    };

    for (const field of ['kind', 'id', 'geometry', 'text'] as const) {
      rejects(documentWithElement(without(element, field)));
    }
  });

  it('rejects unknown keys at every level', () => {
    rejects({ ...documentInput(), extra: true });
    rejects(documentWithSlide({ id: 'slide_intro', elements: [], extra: true }));
    rejects(
      documentWithElement({
        kind: 'text',
        id: 'el_title',
        geometry: { x: 0, y: 0, width: 10, height: 10 },
        text: 'Hello',
        extra: true,
      }),
    );
    rejects(documentWithGeometry({ x: 0, y: 0, width: 10, height: 10, extra: true }));
    rejects(
      documentWithElement({
        kind: 'text',
        id: 'el_title',
        geometry: { x: 0, y: 0, width: 10, height: 10 },
        text: 'Hello',
        style: { fontSize: 12, extra: true },
      }),
    );
  });

  it('does not coerce types', () => {
    rejects({ ...documentInput(), revision: '3' });
    rejects({ ...documentInput(), title: 7 });
    rejects(documentWithGeometry({ x: '0', y: 0, width: 10, height: 10 }));
    rejects(documentWithGeometry({ x: 0, y: 0, width: '10', height: 10 }));
    rejects(
      documentWithElement({
        kind: 'text',
        id: 'el_title',
        geometry: { x: 0, y: 0, width: 10, height: 10 },
        text: 42,
      }),
    );
  });

  it('rejects ids without their kind prefix', () => {
    rejects({ ...documentInput(), id: 'main' });
    rejects(documentWithSlide({ id: 'el_1', elements: [] }));
    rejects(
      documentWithElement({
        kind: 'text',
        id: 'slide_1',
        geometry: { x: 0, y: 0, width: 10, height: 10 },
        text: 'Hello',
      }),
    );
  });

  it('rejects an invalid revision', () => {
    rejects({ ...documentInput(), revision: -1 });
    rejects({ ...documentInput(), revision: 1.5 });
    rejects({ ...documentInput(), revision: Number.MAX_SAFE_INTEGER + 2 });
  });

  it('rejects unsupported element shapes and kinds', () => {
    rejects(documentWithElement({ kind: 'video', id: 'el_1', assetId: 'asset_1' }));
    rejects(
      documentWithElement({
        kind: 'shape',
        id: 'el_1',
        geometry: { x: 0, y: 0, width: 10, height: 10 },
        shape: 'triangle',
      }),
    );
    rejects(
      documentWithElement({
        kind: 'image',
        id: 'el_1',
        geometry: { x: 0, y: 0, width: 10, height: 10 },
      }),
    );
    rejects(
      documentWithElement({
        kind: 'text',
        id: 'el_1',
        geometry: { x: 0, y: 0, width: 10, height: 10 },
      }),
    );
  });

  it('rejects a slide that is not an object and slides that are not an array', () => {
    rejects({ ...documentInput(), slides: 'slide_intro' });
    rejects({ ...documentInput(), slides: [null] });
  });
});

describe('geometry bounds', () => {
  it('rejects non-positive dimensions', () => {
    rejects(documentWithGeometry({ x: 0, y: 0, width: 0, height: 10 }));
    rejects(documentWithGeometry({ x: 0, y: 0, width: -10, height: 10 }));
    rejects(documentWithGeometry({ x: 0, y: 0, width: 10, height: 0 }));
    rejects(documentWithGeometry({ x: 0, y: 0, width: 10, height: -1 }));
  });

  it('rejects dimensions beyond the supported maximum', () => {
    rejects(documentWithGeometry({ x: 0, y: 0, width: MAX_DIMENSION + 1, height: 10 }));
    rejects(documentWithGeometry({ x: 0, y: 0, width: 10, height: Number.MAX_SAFE_INTEGER }));
  });

  it('accepts the dimension boundaries', () => {
    const geometry = { x: 0, y: 0, width: MAX_DIMENSION, height: MAX_DIMENSION };

    expect(accepts(documentWithGeometry(geometry)).slides[0]?.elements[0]?.geometry).toStrictEqual(
      geometry,
    );
  });

  it('rejects non-finite coordinates', () => {
    rejects(documentWithGeometry({ x: Number.NaN, y: 0, width: 10, height: 10 }));
    rejects(documentWithGeometry({ x: 0, y: Number.POSITIVE_INFINITY, width: 10, height: 10 }));
    rejects(documentWithGeometry({ x: 0, y: Number.NEGATIVE_INFINITY, width: 10, height: 10 }));
    rejects(
      documentWithElement({
        kind: 'text',
        id: 'el_title',
        geometry: { x: 0, y: 0, width: Number.NaN, height: 10 },
        text: 'Hello',
      }),
    );
  });

  it('accepts and rejects coordinates at the supported range', () => {
    const inside = { x: -MAX_COORDINATE, y: MAX_COORDINATE, width: 10, height: 10 };
    const outside = [
      { x: MAX_COORDINATE + 1, y: 0, width: 10, height: 10 },
      { x: 0, y: -MAX_COORDINATE - 1, width: 10, height: 10 },
    ];

    expect(accepts(documentWithGeometry(inside)).slides[0]?.elements[0]?.geometry).toStrictEqual(
      inside,
    );

    for (const geometry of outside) {
      rejects(documentWithGeometry(geometry));
    }
  });
});

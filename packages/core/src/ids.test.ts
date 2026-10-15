import { describe, expect, it } from 'vitest';

import {
  createIdGenerator,
  elementIdSchema,
  ID_PREFIXES,
  presentationIdSchema,
  slideIdSchema,
} from './ids.js';
import type { ElementId } from './ids.js';

describe('id prefixes', () => {
  it('names one prefix per entity kind', () => {
    expect(ID_PREFIXES).toStrictEqual({ presentation: 'pres', slide: 'slide', element: 'el' });
  });

  it('accepts only ids that carry their own kind prefix', () => {
    expect(slideIdSchema.safeParse('slide_1').success).toBe(true);
    expect(slideIdSchema.safeParse('el_1').success).toBe(false);
    expect(slideIdSchema.safeParse('1').success).toBe(false);

    expect(elementIdSchema.safeParse('el_1').success).toBe(true);
    expect(elementIdSchema.safeParse('slide_1').success).toBe(false);

    expect(presentationIdSchema.safeParse('pres_1').success).toBe(true);
    expect(presentationIdSchema.safeParse('slide_1').success).toBe(false);
  });

  it('keeps the generated id kinds apart at the type level', () => {
    const slideId = slideIdSchema.parse('slide_1');
    // @ts-expect-error a slide id is not an element id
    const elementId: ElementId = slideId;

    expect(elementId).toBe('slide_1');
  });
});

describe('createIdGenerator', () => {
  it('builds deterministic, prefixed ids from an injected source', () => {
    let counter = 0;
    const ids = createIdGenerator(() => `fixed${(counter += 1)}`);

    expect(ids.presentationId()).toBe('pres_fixed1');
    expect(ids.slideId()).toBe('slide_fixed2');
    expect(ids.elementId()).toBe('el_fixed3');
    expect(ids.slideId()).toBe('slide_fixed4');
  });

  it('produces ids that the id schemas accept', () => {
    const ids = createIdGenerator(() => 'abc');

    expect(presentationIdSchema.safeParse(ids.presentationId()).success).toBe(true);
    expect(slideIdSchema.safeParse(ids.slideId()).success).toBe(true);
    expect(elementIdSchema.safeParse(ids.elementId()).success).toBe(true);
  });

  it('keeps the default source unique across many calls', () => {
    const ids = createIdGenerator();
    const generated = new Set<string>();

    for (let index = 0; index < 10_000; index += 1) {
      generated.add(ids.elementId());
    }

    expect(generated.size).toBe(10_000);
  });
});

import { describe, expect, it } from 'vitest';
import {
  sourceRequestSchema,
  sourceChangeSchema,
  sourceStylesSchema,
} from '../src/shared/source-editing.js';

describe('source editing IPC validation', () => {
  it('requires document and source versions, stable node IDs and typed finite styles', () => {
    const request = {
      expectedRevision: 4,
      expectedSourceRevision: 2,
      slideId: 'slide_source',
      elementId: 'el_source',
    };
    expect(sourceRequestSchema.parse(request)).toEqual(request);
    expect(sourceRequestSchema.safeParse({ ...request, path: 'C:/private' }).success).toBe(false);
    expect(sourceRequestSchema.safeParse({ ...request, expectedSourceRevision: -1 }).success).toBe(
      false,
    );
    expect(
      sourceChangeSchema.safeParse({ type: 'text', nodeId: 'node-12', text: 'Hello' }).success,
    ).toBe(true);
    for (const nodeId of ['body', 'node-1" onclick="evil', 'node-', ''])
      expect(sourceChangeSchema.safeParse({ type: 'text', nodeId, text: 'x' }).success).toBe(false);
    for (const styles of [
      {},
      { opacity: 2 },
      { width: 0 },
      { offsetX: Infinity },
      { offsetY: NaN },
      { fontSize: undefined },
      { color: 'url(https://example.com)' },
      { fontFamily: 'Arial; color:red' },
      { backgroundImage: 'url(file:///C:/private)' },
    ])
      expect(sourceStylesSchema.safeParse(styles).success).toBe(false);
    expect(
      sourceStylesSchema.safeParse({
        fontFamily: '微软雅黑',
        fontSize: 24,
        color: '#123456',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderStyle: 'solid',
        opacity: 0.5,
        width: 300,
        height: 100,
        offsetX: -20,
        offsetY: 30,
      }).success,
    ).toBe(true);
    expect(
      sourceChangeSchema.safeParse({
        type: 'text',
        nodeId: 'node-1',
        text: 'auralide-asset:' + 'f'.repeat(64),
      }).success,
    ).toBe(false);
  });
});

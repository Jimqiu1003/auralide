import { expect, it } from 'vitest';
import { runDemo } from './demo.js';

it('proves headless dispatch without writing a document', () => {
  expect(runDemo()).toMatchObject({
    ok: true,
    value: {
      revision: 1,
      slides: [{ id: 'slide_cli_demo', elements: [] }],
    },
  });
});

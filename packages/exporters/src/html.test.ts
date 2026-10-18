import { describe, expect, it } from 'vitest';
import { presentationSchema } from '@auralide/core';
import { exportPresentationHtml } from './html.js';

describe('offline HTML export', () => {
  it('escapes active content and preserves schema metadata for a native round trip', () => {
    const document = presentationSchema.parse({
      schemaVersion: '1.0',
      id: 'pres_export',
      title: '中文演示',
      revision: 4,
      slideSize: { width: 1280, height: 720 },
      slides: [
        {
          id: 'slide_export',
          elements: [
            {
              id: 'el_export',
              kind: 'text',
              text: '</script><script>globalThis.pwned=true</script>',
              geometry: { x: 10, y: 20, width: 400, height: 80 },
            },
          ],
        },
      ],
    });
    const html = exportPresentationHtml(document);
    const embedded = html.match(/id="auralide-document">(.*?)<\/script>/s)?.[1];
    expect(embedded).toBeDefined();
    expect(JSON.parse(embedded ?? '').document).toEqual(document);
    expect(html).not.toContain('<script>globalThis.pwned');
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain('aria-label="幻灯片导航"');
    expect(() => exportPresentationHtml({ ...document, revision: -1 })).toThrow();
  });
});

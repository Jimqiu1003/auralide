import { describe, expect, it } from 'vitest';
import { presentationSchema } from '@auralide/core';
import { assetUrl } from '@auralide/renderer';
import type { Asset } from '@auralide/renderer';
import {
  addAsset,
  validateBundle,
  serializeBundle,
  readBundleHtml,
  readBundleJson,
  MAX_BUNDLE_BYTES,
  assertBundleSize,
} from './bundle.js';
import { exportPresentationHtml } from './html.js';

const doc = presentationSchema.parse({
  schemaVersion: '1.1',
  id: 'pres_bundle',
  title: '中文 </script>',
  revision: 0,
  slideSize: { width: 1280, height: 720 },
  slides: [{ id: 'slide_bundle', elements: [] }],
});
describe('self-contained bundles', () => {
  it('deduplicates bytes and reopens native JSON and HTML without executing source', () => {
    const assets: Record<string, Asset> = {};
    const id = addAsset(
      assets,
      Buffer.from('<html><script>throw new Error("must not run")</script></html>'),
      'text/html',
    );
    expect(
      addAsset(
        assets,
        Buffer.from('<html><script>throw new Error("must not run")</script></html>'),
        'text/html',
      ),
    ).toBe(id);
    expect(Object.keys(assets)).toHaveLength(1);
    const source = presentationSchema.parse({
      ...doc,
      slides: [
        {
          id: 'slide_bundle',
          elements: [
            {
              id: 'el_source',
              kind: 'source',
              assetId: id,
              sourceRevision: 0,
              geometry: { x: 0, y: 0, width: 1280, height: 720 },
            },
          ],
        },
      ],
    });
    const json = serializeBundle(source, assets);
    expect(readBundleJson(json)?.document).toEqual(source);
    const html = exportPresentationHtml(source, assets);
    expect(readBundleHtml(html)?.assets).toEqual(assets);
    expect(readBundleHtml(html)?.document).toEqual(source);
    expect(html).not.toContain('<script>throw');
    expect(
      readBundleHtml(
        `<script type="application/json" id="auralide-document">${JSON.stringify({ format: 'auralide-html-v1', document: doc }).replace(/</g, '\\u003c')}</script>`,
      )?.document,
    ).toEqual(doc);
  });
  it('rejects corrupt bytes, missing references, malformed keys and asset kind mismatches', () => {
    const assets: Record<string, Asset> = {};
    const id = addAsset(assets, Buffer.from('image'), 'image/png');
    const bundle = { format: 'auralide-bundle-v2', document: doc, assets };
    expect(() =>
      validateBundle({ ...bundle, assets: { [id]: { mime: 'image/png', base64: 'aQ==' } } }),
    ).toThrow(/完整性/);
    expect(() => validateBundle({ ...bundle, assets: { bad: assets[id] } })).toThrow();
    const element = {
      id: 'el_image',
      kind: 'image',
      assetId: 'f'.repeat(64),
      geometry: { x: 0, y: 0, width: 10, height: 10 },
    };
    expect(() =>
      validateBundle({
        ...bundle,
        document: { ...doc, slides: [{ id: 'slide_bundle', elements: [element] }] },
      }),
    ).toThrow(/资源/);
    const ref = addAsset(assets, Buffer.from('auralide-asset:' + 'e'.repeat(64)), 'text/css');
    expect(() => validateBundle(bundle)).toThrow(/依赖/);
    expect(() => assetUrl(ref, assets)).toThrow(/缺少资源/);
  });
  it('checks final byte boundaries including encoding overhead', () => {
    expect(() => assertBundleSize(MAX_BUNDLE_BYTES)).not.toThrow();
    expect(() => assertBundleSize(MAX_BUNDLE_BYTES + 1)).toThrow(/100 MiB/);
    expect(Buffer.byteLength('中文')).toBe(6);
  });
  it('bounds source expansion depth before materializing nested data URLs', () => {
    const assets: Record<string, Asset> = {};
    const id = 'a'.repeat(64);
    assets[id] = {
      mime: 'text/css',
      base64: Buffer.from('auralide-asset:' + id).toString('base64'),
    };
    expect(() => assetUrl(id, assets)).toThrow(/循环/);
  });
});

import { createHash } from 'node:crypto';
import { presentationSchema } from '@auralide/core';
import type { Presentation } from '@auralide/core';
import type { Asset, Assets } from '@auralide/renderer';

export const MAX_BUNDLE_BYTES = 100 * 1024 * 1024;
export interface DocumentBundle {
  readonly format: 'auralide-bundle-v2';
  readonly document: Presentation;
  readonly assets: Assets;
}
const MIME =
  /^(image\/(png|jpeg|gif|webp|svg\+xml|avif)|audio\/(mpeg|wav|ogg|mp4|webm)|video\/(mp4|webm|ogg)|font\/(woff2?|ttf|otf)|text\/(html|css)|application\/(javascript|json))$/;
export function addAsset(assets: Record<string, Asset>, bytes: Uint8Array, mime: string): string {
  if (!MIME.test(mime)) throw new Error(`不支持的资源类型：${mime}`);
  const id = createHash('sha256').update(bytes).digest('hex');
  const existing = assets[id];
  if (existing && existing.mime !== mime) throw new Error('相同字节的资源类型冲突。');
  assets[id] = { mime, base64: Buffer.from(bytes).toString('base64') };
  return id;
}
export function validateBundle(input: unknown): DocumentBundle {
  if (!input || typeof input !== 'object') throw new Error('无效封装清单。');
  const value = input as Record<string, unknown>;
  if (
    value.format !== 'auralide-bundle-v2' ||
    Object.keys(value).some((k) => !['format', 'document', 'assets'].includes(k))
  )
    throw new Error('不支持的封装版本。');
  const document = presentationSchema.parse(value.document);
  if (Buffer.byteLength(JSON.stringify(document)) > 20 * 1024 * 1024)
    throw new Error('结构化文档不能超过 20 MiB。');
  if (!value.assets || typeof value.assets !== 'object' || Array.isArray(value.assets))
    throw new Error('无效资源集合。');
  const assets: Record<string, Asset> = Object.create(null) as Record<string, Asset>;
  let size = 0;
  for (const [id, raw] of Object.entries(value.assets)) {
    if (!/^[a-f0-9]{64}$/.test(id) || !raw || typeof raw !== 'object')
      throw new Error('无效资源标识。');
    const asset = raw as Record<string, unknown>;
    if (
      Object.keys(asset).sort().join(',') !== 'base64,mime' ||
      typeof asset.mime !== 'string' ||
      !MIME.test(asset.mime) ||
      typeof asset.base64 !== 'string'
    )
      throw new Error(`无效资源：${id}`);
    size += asset.base64.length;
    if (size > MAX_BUNDLE_BYTES) throw new Error('资源封装超过 100 MiB。');
    const bytes = Buffer.from(asset.base64, 'base64');
    if (
      bytes.toString('base64') !== asset.base64 ||
      createHash('sha256').update(bytes).digest('hex') !== id
    )
      throw new Error(`资源完整性验证失败：${id}`);
    assets[id] = { mime: asset.mime, base64: asset.base64 };
  }
  for (const slide of document.slides)
    for (const element of slide.elements) {
      if ('assetId' in element) {
        const asset = assets[element.assetId];
        const prefix = element.kind === 'source' ? 'text/html' : `${element.kind}/`;
        if (
          !asset ||
          !(prefix === 'text/html' ? asset.mime === prefix : asset.mime.startsWith(prefix))
        )
          throw new Error(`对象 ${element.id} 的资源缺失或类型错误。`);
      }
      if (
        element.kind === 'text' &&
        element.style?.fontAssetId &&
        !assets[element.style.fontAssetId]?.mime.startsWith('font/')
      )
        throw new Error(`对象 ${element.id} 的字体缺失。`);
      if (
        element.kind === 'source' &&
        element.originalAssetId &&
        assets[element.originalAssetId]?.mime !== 'text/html'
      )
        throw new Error(`对象 ${element.id} 的原始 HTML 缺失。`);
    }
  const visited = new Set<string>();
  const visit = (id: string, chain: string[]): void => {
    if (!assets[id]) throw new Error(`缺少资源依赖：${id}`);
    if (chain.includes(id) || chain.length > 32) throw new Error('资源依赖循环或过深。');
    if (visited.has(id)) return;
    const asset = assets[id]!;
    if (/^(text\/|application\/)/.test(asset.mime)) {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.from(asset.base64, 'base64'),
      );
      for (const match of text.matchAll(/auralide-(?:asset|style|event):([a-f0-9]{64})/g))
        visit(match[1]!, [...chain, id]);
    }
    visited.add(id);
  };
  for (const id of Object.keys(assets)) visit(id, []);
  return { format: 'auralide-bundle-v2', document, assets };
}
export function referencedAssets(document: Presentation, assets: Assets): Assets {
  const selected: Record<string, Asset> = Object.create(null) as Record<string, Asset>;
  const visit = (id: string, depth = 0): void => {
    if (depth > 32) throw new Error('资源依赖过深。');
    if (selected[id]) return;
    const asset = assets[id];
    if (!asset) throw new Error(`缺少资源：${id}`);
    selected[id] = asset;
    if (/^(text\/|application\/)/.test(asset.mime))
      for (const match of Buffer.from(asset.base64, 'base64')
        .toString('utf8')
        .matchAll(/auralide-(?:asset|style|event):([a-f0-9]{64})/g))
        visit(match[1]!, depth + 1);
  };
  for (const slide of document.slides)
    for (const element of slide.elements) {
      if ('assetId' in element) visit(element.assetId);
      if (element.kind === 'source' && element.originalAssetId) visit(element.originalAssetId);
      if (element.kind === 'text' && element.style?.fontAssetId) visit(element.style.fontAssetId);
    }
  return selected;
}
export function serializeBundle(document: Presentation, assets: Assets): string {
  const text = JSON.stringify(
    validateBundle({
      format: 'auralide-bundle-v2',
      document,
      assets: referencedAssets(document, assets),
    }),
  );
  assertBundleSize(Buffer.byteLength(text));
  return text;
}
export function assertBundleSize(bytes: number): void {
  if (bytes > MAX_BUNDLE_BYTES) throw new Error('最终文件超过 100 MiB，请减少图片或音视频体积。');
}
export function readBundleJson(text: string): DocumentBundle | null {
  const value: unknown = JSON.parse(text);
  if (value && typeof value === 'object' && 'format' in value) return validateBundle(value);
  return null;
}
/** Reads inert metadata only. No source scripts are evaluated while reopening a document. */
export function readBundleHtml(text: string): DocumentBundle | null {
  const match = text.match(
    /<script\b(?=[^>]*\bid=["']auralide-document["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/i,
  );
  if (!match) return null;
  const value = JSON.parse(match[1]!) as Record<string, unknown>;
  if (value.format === 'auralide-html-v1')
    return {
      format: 'auralide-bundle-v2',
      document: presentationSchema.parse(value.document),
      assets: {},
    };
  return validateBundle(value);
}

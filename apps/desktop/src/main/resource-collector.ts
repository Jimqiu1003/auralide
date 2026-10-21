import fs from 'node:fs/promises';
import { relative, isAbsolute, extname } from 'node:path';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { parse } from 'acorn';
import type { Node } from 'acorn';
import postcss from 'postcss';
import { addAsset, MAX_BUNDLE_BYTES } from '@auralide/exporters';
import { SOURCE_CSP } from '@auralide/renderer';
import type { Asset, Assets } from '@auralide/renderer';
import type { SourceScan } from '@auralide/html-bridge';
import { readResourceBytes } from './document-files.js';

export const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 6) return /^[23]/.test(ip) && !ip.toLowerCase().startsWith('2001:db8:');
  if (isIP(ip) !== 4) return false;
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
/** Pin the resolved public address on every redirect; no cookies, proxy credentials or ambient auth. */
export async function fetchStaticResource(
  url: URL,
  redirects = 0,
): Promise<{ bytes: Buffer; mime: string }> {
  if (url.protocol !== 'https:' || url.username || url.password || redirects > 5)
    throw new Error('远程资源仅支持无凭据 HTTPS，最多 5 次重定向。');
  const address = await lookup(url.hostname);
  if (!isPublicAddress(address.address)) throw new Error('拒绝读取本机、局域网或保留地址。');
  return await new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        lookup: (_host, _options, cb) => cb(null, address.address, address.family),
        headers: { Accept: '*/*' },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          void fetchStaticResource(new URL(res.headers.location, url), redirects + 1).then(
            resolve,
            reject,
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`远程资源返回 HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BUNDLE_BYTES) {
            res.destroy(new Error('远程资源超过 100 MiB。'));
          } else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            bytes: Buffer.concat(chunks),
            mime: (res.headers['content-type'] ?? '').split(';')[0] ?? '',
          }),
        );
      },
    );
    req.setTimeout(15000, () => req.destroy(new Error('远程资源请求超时。')));
    req.on('error', reject);
    req.end();
  });
}
interface CollectionOptions {
  readonly scan: (source: string) => Promise<SourceScan>;
  readonly grantDirectory: () => Promise<string | null>;
  readonly allowRemote: () => Promise<boolean>;
  readonly assets?: Assets;
  readonly packaged?: boolean;
  readonly rebaseLocal?: boolean;
}
export async function collectSource(
  source: string,
  base: URL,
  options: CollectionOptions,
): Promise<{ assetId: string; originalAssetId: string; assets: Record<string, Asset> }> {
  if (!options.packaged && /auralide-(?:asset|style|event):|__AURALIDE_REFERENCE_/.test(source))
    throw new Error('源 HTML 包含保留的封装标记。');
  const assets: Record<string, Asset> = { ...options.assets };
  const originalAssetId = addAsset(assets, Buffer.from(source), 'text/html');
  const scan = await options.scan(source);
  const cache = new Map<string, string>(),
    active = new Set<string>();
  let root: string | null | undefined,
    remote: boolean | undefined,
    total = 0;
  const load = async (raw: string, owner: URL, kind: 'css' | 'js' | 'binary'): Promise<string> => {
    if (/^auralide-asset:[a-f0-9]{64}$/.test(raw)) {
      const id = raw.slice('auralide-asset:'.length);
      if (!assets[id]) throw new Error(`缺少封装依赖：${id}`);
      return id;
    }
    let url = new URL(raw, owner);
    const key = kind + ':' + url.href;
    if (cache.has(key)) return cache.get(key)!;
    if (active.has(key) || active.size > 32) throw new Error(`循环资源依赖或深度超限：${raw}`);
    active.add(key);
    try {
      let bytes: Buffer, mime: string;
      if (url.protocol === 'data:') {
        const match = url.href.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
        if (!match) throw new Error('无效的内嵌资源。');
        mime = match[1]!;
        bytes = match[2]
          ? Buffer.from(match[3]!, 'base64')
          : Buffer.from(decodeURIComponent(match[3]!));
      } else if (url.protocol === 'file:') {
        if (url.host) throw new Error('不支持 UNC 资源。');
        if (root === undefined) {
          const grant = await options.grantDirectory();
          root = grant ? await fs.realpath(grant) : null;
        }
        if (!root) throw new Error('未授权素材目录，无法完整封装。');
        if (
          options.rebaseLocal &&
          owner.href === base.href &&
          !/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(raw)
        )
          url = new URL(raw, pathToFileURL(join(root, 'index.html')));
        const path = await fs.realpath(fileURLToPath(url));
        const rel = relative(root, path);
        if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel))
          throw new Error(`资源越过授权目录：${raw}`);
        bytes = await readResourceBytes(path);
        mime = MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? '';
      } else {
        if (remote === undefined) remote = await options.allowRemote();
        if (!remote) throw new Error(`尚未收集远程静态资源：${raw}`);
        const resource = await fetchStaticResource(url);
        bytes = resource.bytes;
        mime = resource.mime || MIME_BY_EXTENSION[extname(url.pathname).toLowerCase()] || '';
      }
      total += bytes.length;
      if (total > MAX_BUNDLE_BYTES) throw new Error('资源集合超过 100 MiB。');
      if (kind === 'css') {
        bytes = Buffer.from(
          await compileCss(new TextDecoder('utf-8', { fatal: true }).decode(bytes), url),
        );
        mime = 'text/css';
      }
      if (kind === 'js') {
        bytes = Buffer.from(
          await compileJs(new TextDecoder('utf-8', { fatal: true }).decode(bytes), url),
        );
        mime = 'application/javascript';
      }
      if (
        mime === 'image/svg+xml' &&
        /<script\b|<foreignObject\b|(?:href|src)\s*=\s*["'](?!#|data:)|url\(/i.test(
          bytes.toString('utf8'),
        )
      )
        throw new Error(`SVG 必须自包含且无脚本：${raw}`);
      const id = addAsset(assets, bytes, mime);
      cache.set(key, id);
      return id;
    } catch (error) {
      throw new Error(`${raw}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    } finally {
      active.delete(key);
    }
  };
  const compileCss = async (text: string, owner: URL): Promise<string> => {
    const sheet = postcss.parse(text);
    const jobs: (() => Promise<void>)[] = [];
    const urls = async (value: string): Promise<string> => {
      const matches = [...value.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^()'"\s]+))\s*\)/gi)];
      if ((value.match(/url\(/gi)?.length ?? 0) !== matches.length)
        throw new Error('无法静态解析 CSS URL。');
      for (const match of matches) {
        const raw = match[2] ?? match[3]!;
        if (raw.includes('\\')) throw new Error('暂不支持转义 CSS URL。');
        if (raw.startsWith('#')) continue;
        value = value.replace(
          match[0],
          `url("auralide-asset:${await load(raw, owner, 'binary')}")`,
        );
      }
      return value;
    };
    sheet.walkDecls((decl) => {
      jobs.push(async () => {
        decl.value = await urls(decl.value);
      });
    });
    sheet.walkAtRules('import', (rule) => {
      jobs.push(async () => {
        const match = rule.params.match(/^(?:url\(\s*)?(["'])(.*?)\1\s*\)?(.*)$/i);
        if (!match) throw new Error('无法静态解析 CSS @import。');
        rule.params = `url("auralide-asset:${await load(match[2]!, owner, 'css')}")${match[3]}`;
      });
    });
    for (const job of jobs) await job();
    return sheet.toString();
  };
  const compileJs = async (text: string, owner: URL): Promise<string> => {
    const edits: { start: number; end: number; value: string }[] = [];
    const ast = parse(text, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      onComment: (_block, value, start, end) => {
        if (/[#@]\s*sourceMappingURL=/.test(value)) edits.push({ start, end, value: '' });
      },
    });
    const imports: { start: number; end: number; url: string; kind: 'js' | 'binary' }[] = [];
    const add = (value: unknown, kind: 'js' | 'binary' = 'js'): void => {
      const literal = value as { type?: string; value?: unknown; start: number; end: number };
      if (literal?.type !== 'Literal' || typeof literal.value !== 'string')
        throw new Error('不支持计算生成的资源地址或动态 import。');
      imports.push({ start: literal.start, end: literal.end, url: literal.value, kind });
    };
    let count = 0;
    const walk = (node: Node): void => {
      if (++count > 1000000) throw new Error('脚本节点数量超限。');
      const n = node as Node & Record<string, unknown>;
      if (
        [
          'ImportDeclaration',
          'ExportAllDeclaration',
          'ExportNamedDeclaration',
          'ImportExpression',
        ].includes(node.type) &&
        n.source
      )
        add(n.source);
      if (['CallExpression', 'NewExpression'].includes(node.type)) {
        const callee = n.callee as Record<string, unknown>;
        const prop = callee?.property as Record<string, unknown> | undefined;
        const name = callee?.name ?? prop?.name ?? prop?.value;
        if (
          [
            'fetch',
            'XMLHttpRequest',
            'WebSocket',
            'EventSource',
            'Worker',
            'SharedWorker',
            'sendBeacon',
            'eval',
            'Function',
            'write',
            'writeln',
          ].includes(String(name))
        )
          throw new Error(`不支持在线接口或动态代码：${String(name)}`);
        const args = n.arguments as unknown[];
        if (name === 'URL') add(args[0], 'binary');
        if (name === 'setAttribute') {
          const field = args[0] as { value?: unknown };
          if (['src', 'href', 'poster'].includes(String(field?.value))) add(args[1], 'binary');
        }
      }
      if (node.type === 'AssignmentExpression') {
        const left = n.left as { type: string; property?: { name?: string; value?: string } };
        if (
          left.type === 'MemberExpression' &&
          ['src', 'href', 'poster'].includes(left.property?.name ?? left.property?.value ?? '')
        )
          add(n.right, 'binary');
      }
      for (const value of Object.values(n))
        if (value && typeof value === 'object') {
          if (Array.isArray(value)) {
            for (const child of value)
              if (child && typeof child === 'object' && 'type' in child) walk(child as Node);
          } else if ('type' in value) walk(value as Node);
        }
    };
    walk(ast);
    for (const item of imports)
      edits.push({
        start: item.start,
        end: item.end,
        value: JSON.stringify(`auralide-asset:${await load(item.url, owner, item.kind)}`),
      });
    for (const edit of edits.sort((a, b) => b.start - a.start))
      text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
    return text;
  };
  let html = scan.html;
  for (const ref of scan.references) {
    let id: string;
    if (ref.url !== undefined) id = await load(ref.url, base, ref.kind);
    else {
      id = addAsset(
        assets,
        Buffer.from(
          ref.kind === 'css'
            ? await compileCss(ref.text ?? '', base)
            : await compileJs(ref.text ?? '', base),
        ),
        ref.kind === 'css' ? 'text/css' : 'application/javascript',
      );
    }
    html = html.replaceAll(
      ref.token,
      `auralide-${ref.attribute ? (ref.kind === 'css' ? 'style' : 'event') : 'asset'}:${id}`,
    );
  }
  html = html.replace(
    /<head(?:\s[^>]*)?>/i,
    (match) => `${match}<meta http-equiv="Content-Security-Policy" content="${SOURCE_CSP}">`,
  );
  html = html.replace(
    /<\/head\s*>/i,
    '<style data-auralide-player-policy>@media(prefers-reduced-motion:reduce){html body *,html body *::before,html body *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}</style></head>',
  );
  return { assetId: addAsset(assets, Buffer.from(html), 'text/html'), originalAssetId, assets };
}

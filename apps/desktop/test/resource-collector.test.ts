import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectSource, isPublicAddress } from '../src/main/resource-collector.js';
import { assetUrl } from '@auralide/renderer';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await fs.rm(path, { recursive: true, force: true });
});
async function setup() {
  const path = await fs.mkdtemp(join(os.tmpdir(), 'auralide-resources-'));
  directories.push(path);
  return path;
}
describe('bounded resource collection', () => {
  it('recursively collects local CSS, repeated images and static modules', async () => {
    const path = await setup();
    await fs.writeFile(join(path, 'image.png'), Buffer.from('png'));
    await fs.writeFile(join(path, 'nested.css'), '.box{background:url("image.png")}');
    await fs.writeFile(
      join(path, 'theme.css'),
      '@import "nested.css"; .other{background:url(image.png)}',
    );
    await fs.writeFile(join(path, 'helper.js'), 'export const value=7;');
    await fs.writeFile(
      join(path, 'main.js'),
      'import {value} from "./helper.js";globalThis.value=value;',
    );
    const result = await collectSource('original', pathToFileURL(join(path, 'deck.html')), {
      scan: async () => ({
        html: '<html><head></head><body><link href="a"><script src="b"></script></body></html>',
        nodes: [],
        references: [
          { token: '"a"', kind: 'css', url: 'theme.css' },
          { token: '"b"', kind: 'js', url: 'main.js' },
        ],
      }),
      grantDirectory: async () => path,
      allowRemote: async () => false,
    });
    expect(Object.values(result.assets).filter((a) => a.mime === 'image/png')).toHaveLength(1);
    const output = assetUrl(result.assetId, result.assets);
    expect(output).toMatch(/^data:text\/html;base64,/);
    const html = Buffer.from(output.split(',')[1]!, 'base64').toString();
    expect(html).toContain('data:text/css;base64,');
    expect(html).toContain('data:application/javascript;base64,');
    expect(html).not.toContain('auralide-asset:');
  });
  it('refuses traversal, missing assets and denied remote access', async () => {
    const path = await setup(),
      outside = await setup();
    await fs.writeFile(join(outside, 'outside.png'), 'x');
    const run = (url: string) =>
      collectSource('original', pathToFileURL(join(path, 'deck.html')), {
        scan: async () => ({
          html: '<head></head>token',
          nodes: [],
          references: [{ token: 'token', kind: 'binary', url }],
        }),
        grantDirectory: async () => path,
        allowRemote: async () => false,
      });
    await expect(run(pathToFileURL(join(outside, 'outside.png')).href)).rejects.toThrow(/授权目录/);
    await expect(run('missing.png')).rejects.toThrow(/missing.png/);
    await expect(run('https://example.invalid/image.png')).rejects.toThrow(/尚未收集/);
  });
  it('rejects online APIs and computed imports with concrete reports', async () => {
    const path = await setup();
    for (const text of ['fetch("https://example.invalid/api")', 'import(window.modulePath)']) {
      await expect(
        collectSource('original', pathToFileURL(join(path, 'deck.html')), {
          scan: async () => ({
            html: '<head></head>token',
            nodes: [],
            references: [{ token: 'token', kind: 'js', text }],
          }),
          grantDirectory: async () => path,
          allowRemote: async () => false,
        }),
      ).rejects.toThrow(/在线接口|动态 import/);
    }
  });
  it('rejects local and private network destinations', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
      '::ffff:127.0.0.1',
      'fc00::1',
    ])
      expect(isPublicAddress(ip)).toBe(false);
    expect(isPublicAddress('1.1.1.1')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { isTrustedRendererUrl, validateDevServerUrl } from '../src/main/security.js';

describe('renderer URL boundary', () => {
  const entry = 'file:///D:/Auralide/dist/renderer/index.html';

  it('trusts the application entry and its fragments only', () => {
    expect(isTrustedRendererUrl(entry, entry)).toBe(true);
    expect(isTrustedRendererUrl(`${entry}#slide-1`, entry)).toBe(true);
    for (const candidate of [
      'file:///C:/Users/Jim/Downloads/hostile.html',
      `${entry}?replacement=1`,
      'https://example.com/',
      'invalid',
    ]) {
      expect(isTrustedRendererUrl(candidate, entry)).toBe(false);
    }
  });

  it('rejects dev origin-prefix and credential lookalikes', () => {
    const dev = 'http://localhost:5173/';
    expect(isTrustedRendererUrl(dev, dev)).toBe(true);
    for (const candidate of [
      'http://localhost:51730/',
      'http://localhost:5173@evil.example/',
      'http://localhost:5173/hostile.html',
    ]) {
      expect(isTrustedRendererUrl(candidate, dev)).toBe(false);
    }
  });

  it('only permits local HTTP development in an unpackaged app', () => {
    expect(validateDevServerUrl('', true)).toBe('');
    expect(validateDevServerUrl('http://localhost:5173', false)).toBe('http://localhost:5173/');
    expect(validateDevServerUrl('http://127.0.0.1:5173/', false)).toBe('http://127.0.0.1:5173/');
    expect(() => validateDevServerUrl('http://localhost:5173/', true)).toThrow();
    for (const candidate of [
      'https://example.com/',
      'file:///D:/hostile.html',
      'http://localhost:5173@evil.example/',
      'http://user:pass@localhost:5173/',
      'http://localhost:5173/?query=1',
    ]) {
      expect(() => validateDevServerUrl(candidate, false)).toThrow();
    }
  });
});

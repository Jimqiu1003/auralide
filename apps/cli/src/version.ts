import { readFileSync } from 'node:fs';

let cachedVersion: string | undefined;

/**
 * Reads the CLI version from its own `package.json` so the manifest stays the single source of
 * truth. Resolved relative to the running module, which works from `dist/` after a build.
 */
export function readVersion(): string {
  if (cachedVersion === undefined) {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
      throw new Error('apps/cli/package.json does not declare a version');
    }
    const { version } = parsed;
    if (typeof version !== 'string') {
      throw new Error('apps/cli/package.json version is not a string');
    }
    cachedVersion = version;
  }

  return cachedVersion;
}

import { isOk } from '@auralide/core';
import { describe, expect, it } from 'vitest';

import { parseArgs, type CliOptions } from './args.js';

function expectOk(argv: readonly string[]): CliOptions {
  const parsed = parseArgs(argv);
  if (!isOk(parsed)) {
    throw new Error(`expected a valid parse, got: ${parsed.error.code} ${parsed.error.message}`);
  }
  return parsed.value;
}

describe('parseArgs', () => {
  it('selects the demo and rejects conflicting commands', () => {
    expect(expectOk(['--demo', '--json'])).toEqual({ command: 'demo', json: true });
    expect(parseArgs(['--demo', '--version']).ok).toBe(false);
    expect(parseArgs(['--demo', '--help']).ok).toBe(false);
  });
  it('defaults to the help command with json output disabled', () => {
    expect(expectOk([])).toEqual({ command: 'help', json: false });
  });

  it('selects the version command from -v and --version', () => {
    expect(expectOk(['--version']).command).toBe('version');
    expect(expectOk(['-v']).command).toBe('version');
  });

  it('accepts flags in any order and keeps --json orthogonal', () => {
    expect(expectOk(['--json', '--version'])).toEqual({ command: 'version', json: true });
    expect(expectOk(['-h', '--json'])).toEqual({ command: 'help', json: true });
  });

  it('rejects unknown options with a typed error code', () => {
    const parsed = parseArgs(['--nope']);

    expect(isOk(parsed)).toBe(false);
    if (isOk(parsed)) {
      throw new Error('expected a failure result');
    }
    expect(parsed.error.code).toBe('unknown-option');
    expect(parsed.error.message).toContain('--nope');
  });

  it('rejects unexpected positional arguments', () => {
    const parsed = parseArgs(['export']);

    expect(isOk(parsed)).toBe(false);
    if (isOk(parsed)) {
      throw new Error('expected a failure result');
    }
    expect(parsed.error.code).toBe('unexpected-argument');
  });
});

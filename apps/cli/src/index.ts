#!/usr/bin/env node
import { isErr } from '@auralide/core';

import { HELP_TEXT, parseArgs } from './args.js';
import { readVersion } from './version.js';
import { runDemo } from './demo.js';

/** Exit code convention: 0 success, 2 usage error. */
function main(argv: readonly string[]): number {
  const parsed = parseArgs(argv);

  if (isErr(parsed)) {
    process.stderr.write(`${parsed.error.message}\n\n${HELP_TEXT}\n`);
    return 2;
  }

  if (parsed.value.command === 'version') {
    const version = readVersion();
    process.stdout.write(
      parsed.value.json ? `${JSON.stringify({ name: 'auralide', version })}\n` : `${version}\n`,
    );
    return 0;
  }

  if (parsed.value.command === 'demo') {
    const result = runDemo();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result.ok ? 0 : 1;
  }

  process.stdout.write(`${HELP_TEXT}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));

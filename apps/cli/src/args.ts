import { err, ok, type Result } from '@auralide/core';
import { z } from 'zod';

/** Commands the P0 CLI understands. `help` is the default when no flag is given. */
export const CLI_COMMANDS = ['help', 'version'] as const;

/** Schema for the parsed command line: the CLI is a trust boundary, so argv is validated. */
export const cliOptionsSchema = z.object({
  command: z.enum(CLI_COMMANDS),
  json: z.boolean(),
});

export type CliOptions = z.infer<typeof cliOptionsSchema>;

export type CliErrorCode = 'unknown-option' | 'unexpected-argument' | 'invalid-options';

export type CliError = {
  readonly code: CliErrorCode;
  readonly message: string;
};

const KNOWN_FLAGS = new Set(['--help', '-h', '--version', '-v', '--json']);

export const HELP_TEXT = [
  'auralide — AI-Native HTML Presentation Editor (P0 infrastructure scaffold)',
  '',
  'Usage: auralide [--help] [--version] [--json]',
  '',
  'Options:',
  '  -h, --help     Show this help text (default command)',
  '  -v, --version  Print the CLI version',
  '      --json     Emit machine-readable output where supported',
  '',
  'No document commands exist yet; editing commands arrive with the P1 command layer.',
].join('\n');

/**
 * Parses raw `process.argv` style input into validated options.
 *
 * Returns a `Result` instead of throwing so callers (scripts, CI, future agents) can branch on
 * the failure code without catching exceptions.
 */
export function parseArgs(argv: readonly string[]): Result<CliOptions, CliError> {
  const positional = argv.filter((arg) => !arg.startsWith('-'));
  const firstPositional = positional[0];
  if (firstPositional !== undefined) {
    return err({
      code: 'unexpected-argument',
      message: `Unexpected argument: ${firstPositional}`,
    });
  }

  const unknownOption = argv.find((arg) => !KNOWN_FLAGS.has(arg));
  if (unknownOption !== undefined) {
    return err({ code: 'unknown-option', message: `Unknown option: ${unknownOption}` });
  }

  const wantsVersion = argv.includes('--version') || argv.includes('-v');

  const parsed = cliOptionsSchema.safeParse({
    command: wantsVersion ? 'version' : 'help',
    json: argv.includes('--json'),
  });

  if (!parsed.success) {
    return err({
      code: 'invalid-options',
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
    });
  }

  return ok(parsed.data);
}

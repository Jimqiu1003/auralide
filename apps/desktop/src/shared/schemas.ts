import { z } from 'zod';

/**
 * Payload schemas for the IPC boundary.
 *
 * Validation happens in the **main process** — the trusted side — because that is where a bad payload
 * could cause damage. The preload intentionally does not validate: it forwards, it does not decide.
 * Schemas are strict, so an unexpected field is a rejection rather than something silently dropped.
 */

export const pingRequestSchema = z
  .strictObject({
    message: z.string().min(1).max(500),
  })
  .describe('Payload accepted by the validated echo channel');

export type ValidatedPingRequest = z.infer<typeof pingRequestSchema>;

/** Renders a Zod failure as a single line suitable for a typed refusal response. */
export const describeIssues = (issues: readonly z.core.$ZodIssue[]): string =>
  issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

/**
 * Result primitive shared by every Auralide layer.
 *
 * Failures are values, not exceptions: boundaries that can fail return a `Result` so that the
 * editor UI, the CLI and future agents handle failure the same explicit way.
 */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Creates a successful result. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/** Creates a failed result. */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Narrows a result to its success branch. */
export const isOk = <T, E>(
  result: Result<T, E>,
): result is { readonly ok: true; readonly value: T } => result.ok;

/** Narrows a result to its failure branch. */
export const isErr = <T, E>(
  result: Result<T, E>,
): result is { readonly ok: false; readonly error: E } => !result.ok;

/** Transforms a success value and passes failures through unchanged. */
export const mapResult = <T, U, E>(
  result: Result<T, E>,
  transform: (value: T) => U,
): Result<U, E> => (result.ok ? ok(transform(result.value)) : result);

/** Returns the success value, or `fallback` when the result holds an error. */
export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T =>
  result.ok ? result.value : fallback;

import { describe, expect, it } from 'vitest';

import { err, isErr, isOk, mapResult, ok, unwrapOr } from './result.js';

describe('Result', () => {
  it('represents success with its value', () => {
    const result = ok(42);

    expect(result.ok).toBe(true);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  it('represents failure with its error', () => {
    const result = err({ code: 'invalid-options', message: 'nope' });

    expect(result.ok).toBe(false);
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
  });

  it('narrows the failure branch so error stays accessible', () => {
    const result = err(new Error('boom'));

    if (!isErr(result)) {
      throw new Error('expected a failure result');
    }

    expect(result.error.message).toBe('boom');
  });

  it('maps success values only', () => {
    expect(mapResult(ok(2), (value) => value * 3)).toEqual({ ok: true, value: 6 });
    expect(mapResult(err('bad'), (value: number) => value * 3)).toEqual({
      ok: false,
      error: 'bad',
    });
  });

  it('falls back only when the result failed', () => {
    expect(unwrapOr(ok('kept'), 'fallback')).toBe('kept');
    expect(unwrapOr(err('reason'), 'fallback')).toBe('fallback');
  });
});

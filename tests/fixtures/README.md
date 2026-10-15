# Test fixtures

Shared, committed test inputs live here. Rules:

- Fixtures are real inputs, not placeholders: a fixture exists because a test asserts on it.
- Keep them small and readable; prefer text formats (HTML, JSON, SVG) over binaries.
- Never put credentials, tokens, personal data or a real user's presentation content in a fixture.
- HTML fixtures are **untrusted input by definition** — they exist to prove the import path is
  safe, so they may deliberately contain hostile markup. Do not copy them into documentation or
  run them outside a sandboxed context.

Directories (created when the first fixture lands):

```
tests/fixtures/html/     imported HTML cases for packages/html-bridge
tests/fixtures/docs/     structured document samples for packages/core
tests/fixtures/export/   expected export outputs for packages/exporters
```

P0 shipped no fixtures (there was no import/export code to test). From P1, `tests/fixtures/html/**`
belongs to the Compatibility & QA engineer: they own the corpus and the compatibility notes, and the
Lead does not write there without being asked.

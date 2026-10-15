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

P0 ships no fixtures: there is no import/export code to test yet. Adding a directory here before a
test needs it would be dead weight.

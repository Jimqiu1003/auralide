# ADR-0002 — P1: runtime shell, IPC security baseline, structured model and command contract

- Status: **Accepted**
- Date: 2026-10-15
- Deciders: Project Owner (Jim), Lead Engineering Agent
- Supersedes: none
- Extends: [`ADR-0001`](ADR-0001-foundation.md) (repository, toolchain, architecture baseline)
- Related: [`p1-plan.md`](../architecture/p1-plan.md), [`security.md`](../architecture/security.md),
  [`COLLABORATION.md`](../agents/COLLABORATION.md)

## Context

ADR-0001 fixed the repository, toolchain and layer boundaries, but P0 deliberately shipped no
runtime behaviour and no document model. P1 must produce a desktop application that really starts and
a core that really validates and mutates a document — while the highest-risk surface of the product
(executing user-supplied HTML) is still ahead.

Two things therefore have to be decided now, before code depends on them:

1. how the Electron shell exposes privileged capability to the renderer, so the boundary is safe
   from the first line of UI code rather than retrofitted; and
2. what a "document" and an "edit" mean, so that the UI, the CLI and future agents cannot drift into
   three different mutation paths.

A second developer (Compatibility & QA) joins in P1 on a different machine, which adds a
collaboration dimension that P0 (single writer) did not have.

## Decision

### 1. The Electron shell is the runtime, with two explicit load paths

- Production: the built renderer is loaded from disk (`loadFile`, `base: './'`).
- Development: the window loads the Vite dev server URL from `AURALIDE_DEV_SERVER_URL`.
- The two paths differ **only** in that. Application logic, security settings and the preload bridge
  are identical in both, so development cannot silently exercise a different security posture.
- **The production Content Security Policy is never relaxed for developer convenience.** Development
  gets its own policy (it must allow the Vite dev server's inline refresh preamble and its websocket);
  the production policy is strict and is asserted against the built output.

### 2. Renderer capability is a frozen, minimal, validated bridge

Electron window defaults stay as established in ADR-0001: `contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`, `webSecurity: true`. On top of that:

| Concern            | Rule                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Preload surface    | a frozen object exposing only named, typed operations (no `ipcRenderer`, no `require`, no `process` passthrough)             |
| Channels           | an explicit allow-list; handlers are registered only for allow-listed channels                                               |
| Sender validation  | every handler checks that the message came from the application's own window and an expected URL                             |
| Payload validation | Zod schema per channel; invalid payloads return a typed error, they are never forwarded blind                                |
| Filesystem / shell | not exposed in P1 at all — no capability is granted before a feature needs it                                                |
| Navigation         | `will-navigate` to anything outside the app is denied; `window.open` is denied and external links open in the user's browser |
| Permissions        | session permission requests are denied by default                                                                            |

Negative behaviour (undefined globals, rejected navigations, refused payloads) is part of the
verification, not an afterthought.

### 3. The structured document model lives in `core` and is JSON-serializable

Zod schemas describe `Presentation`, `Slide`, `Element` (text, shape, image reference), geometry,
document revision and edit origin. Entities carry stable identifiers; the model has an explicit
`SCHEMA_VERSION`; parse/serialize round-trips losslessly; malformed input is rejected rather than
coerced. `packages/core` still does not import DOM, React, Electron or Node-only APIs — that is what
keeps the CLI/agent path viable.

HTML remains a rendering and export target, never the document of truth (ADR-0001 §7).

### 4. Every edit goes through one command dispatcher

A command carries `operation`, `target`, `payload`, `expectedRevision` and `origin`. The dispatcher:

1. validates the target exists and the payload is well-formed;
2. compares `expectedRevision` with the document revision and refuses stale edits with a typed
   conflict error;
3. mutates atomically — a command that fails validation leaves the document byte-identical;
4. increments the revision on success and records the edit origin (human / agent / import);
5. returns the new document plus an undo entry, and supports undo/redo for supported operations.

Callers never mutate the document directly: the UI, the CLI and agents use the same entry point, so
validation, attribution and reversibility cannot be bypassed by a new surface.

P1 implements six operations — `slide.create`, `slide.remove`, `element.add`, `element.move`,
`element.updateText`, `element.remove` — deliberately small enough to be fully tested.

### 5. The repository is public under Apache-2.0 (owner decision)

The owner approved publishing the repository on 2026-10-15; it is public under Apache-2.0 and stays
that way unless the owner decides otherwise. Recording it here because it changes what the platform
enforces: the public repository carries a `main-protection` ruleset (PR required, `verify` check
required, no force push, no deletion, no bypass actors), secret scanning with push protection, and
Dependabot vulnerability alerts. No secret was ever committed (checked across all files and all
commits before the change).

### 6. Two developers collaborate through GitHub, worktrees only isolate one machine

- Cross-developer coordination is an **Issue + Pull Request**; nothing is agreed only in conversation.
- A **worktree** isolates parallel work on a single machine. It is not a sharing mechanism, and no
  workflow may assume access to another machine's paths.
- File ownership is partitioned by zone (see `COLLABORATION.md`); shared configuration has exactly one
  integrator (the Lead). A feature branch asks for a shared-config change instead of making it.
- `CODEOWNERS` documents the zones. It does not gate merges today because the ruleset requires 0
  approvals (single-maintainer phase) — assuming otherwise would be a false sense of control.

## Consequences

**Positive**

- The renderer boundary is safe before any editor UI exists, which is when it is cheapest.
- One command path means validation, revision conflict detection, attribution and undo cannot be
  bypassed by adding a new caller.
- A JSON-serializable, schema-versioned model gives storage, export and agents a stable contract.
- Two developers can work in parallel without file races or lockfile ping-pong.

**Negative / accepted costs**

- The preload surface must grow explicitly: every new capability is a deliberate, reviewed change.
- Strict IPC validation adds boilerplate per channel (accepted: it is the boundary that matters).
- Dev and production CSPs must both be maintained and asserted.
- P1's command set is intentionally tiny; features that need more operations wait.

## Alternatives considered

| Alternative                                             | Why not                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Expose `ipcRenderer` with a channel prefix convention   | Any renderer mistake becomes a privileged call; no sender or payload checking by default.   |
| Disable `sandbox` to simplify the preload               | Removes the main defence for untrusted HTML, which the product will execute.                |
| Relax the production CSP during development             | Ships a weakened policy to production by accident; makes the dev/prod difference invisible. |
| Keep the document as HTML in the renderer               | Agents cannot edit safely; revision tracking and undo become guesswork.                     |
| Let the UI mutate the model directly and validate later | Guarantees a second, unvalidated mutation path.                                             |
| A CRDT / real-time model in P1                          | Out of scope; P1 only needs single-user correctness with conflict detection.                |
| One shared worktree for both developers                 | Impossible across machines and unsafe even locally (shared index and branch).               |

## Follow-ups

- P1: implement the runtime, the core model and the dispatcher; verify both with real tests and a
  launched window; publish `docs/reports/P1-runtime-core-report.md`.
- P1+: storage layer on top of the schema, HTML import through `html-bridge`, preload capability
  review for each new feature, CLI/MCP surface on the documented command protocol.

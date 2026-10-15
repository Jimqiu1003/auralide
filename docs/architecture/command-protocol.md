# Command Protocol

Status: **P1 draft for review** — the envelope, the operation set and the result contract below are the
contract that [`ADR-0002`](../decisions/ADR-0002-p1-runtime-and-core.md) §3–4 fixes for P1. Sections
marked _not implemented_ describe surfaces that do not exist yet; nothing here claims behaviour that
has not been built and verified.

Audience: implementers of the future CLI, MCP server and AI-agent integrations, and anyone adding an
operation to the command layer.

Normative source: `ADR-0002` §3 (structured document model) and §4 (one command dispatcher). Field
names in this document follow `ADR-0002`. Where the P1.2 implementation
(`feat/p1-core-commands`, `packages/core`) uses different names, the implementation wins and the
difference must be reconciled at P1.2 review — it is a documentation defect, not a second contract.

## 1. Purpose and non-goals

There is exactly **one channel that may modify a document**: the command dispatcher in
`packages/core` described by `ADR-0002` §4. Everything else — the editor UI, the future CLI, a future
MCP server, an AI agent — is a **transport** that builds the same command envelope and calls the same
dispatcher.

```text
editor UI ─┐
CLI ───────┼─→ command envelope ─→ dispatcher ─→ document + revision + history entry
MCP ───────┘                          │
                                      └─→ Result<success, error>   (failures are values)
```

Purpose of this document:

1. pin the envelope, the operation set and the result shape so three transports cannot drift apart;
2. make failure modes machine-discriminable, so a CLI, an MCP tool and a UI can react to the same
   error without parsing prose;
3. state what an agent is and is not allowed to express, so the security review has a target.

Non-goals (deliberately not decided here):

| Not this protocol's job                           | Where it belongs                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Framing, channels, serialization of a transport   | the transport (in-process call, CLI process, MCP tool result)                       |
| Authentication, authorization, permission prompts | the surface above the dispatcher, with `docs/architecture/security.md`              |
| The document model itself (schema, ids, geometry) | `ADR-0002` §3 and `packages/core` — this document references it, never redefines it |
| Storage format, history persistence, export       | separate decisions; not P1                                                          |
| Collaboration (CRDT / OT / merge)                 | explicitly out of scope for P1 (`ADR-0002`, alternatives table)                     |

## 2. The command envelope

Every mutation, from every source, is one JSON object:

```json
{
  "operation": "element.updateText",
  "target": { "kind": "element", "slideId": "s_9f2", "elementId": "e_14a" },
  "payload": { "text": "Revenue grew 18% year over year." },
  "expectedRevision": 7,
  "origin": { "kind": "agent", "id": "claude-code/session-3f2a" }
}
```

| Field              | Type          | Required | Semantics and constraints                                                                                                                    |
| ------------------ | ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation`        | string (enum) | yes      | One of the operations in §3. An operation the dispatcher does not implement fails with `unsupported-operation`; it is never ignored.         |
| `target`           | object        | yes      | What the operation applies to, addressed by stable ids (§2.1).                                                                               |
| `payload`          | object        | yes      | Operation-specific arguments (§3). It describes a change; it never contains a document. `{}` is valid for operations that take no arguments. |
| `expectedRevision` | integer ≥ 0   | yes      | The document revision the caller based its intent on. A mismatch fails with `stale-revision` (§5).                                           |
| `origin`           | object        | yes      | Who issued the command, for attribution and audit (§2.2).                                                                                    |

Parsing is **strict**: an unknown member on the envelope, a missing field, or a wrong type fails with
`invalid-envelope` — unknown fields are never ignored, and values are never coerced
(`ADR-0002` §3: "malformed input is rejected rather than coerced").

### 2.1 Target shapes

Targets address model entities by **stable identifier**, never by array position or by an HTML
selector or path.

| `target.kind`  | Shape                                                             | Resolves to                         |
| -------------- | ----------------------------------------------------------------- | ----------------------------------- |
| `presentation` | `{ "kind": "presentation" }`                                      | the open document as a whole        |
| `slide`        | `{ "kind": "slide", "slideId": "s_9f2" }`                         | one slide of the document           |
| `element`      | `{ "kind": "element", "slideId": "s_9f2", "elementId": "e_14a" }` | one element inside that named slide |

Rules:

- `slideId` is **required even for element targets.** Resolution stays deterministic, and an element
  that exists in another slide is a `target-not-found` rather than a silently addressed element.
- An operation accepts only the target kinds listed for it in §3. Any other combination fails with
  `target-not-found` (wrong entity kind) or `invalid-envelope` (shape that is not a valid target).
- Ids are opaque strings as minted by `packages/core`. Callers may hold them, compare them and store
  them; they may not parse meaning out of them, and they may not invent one that collides with an
  existing entity (`conflict`).

### 2.2 Origin

```json
{ "kind": "human" }
{ "kind": "agent", "id": "claude-code/session-3f2a" }
{ "kind": "import", "id": "import-2026-10-15T09-31-00Z" }
{ "kind": "system", "id": "core/migration" }
```

| `origin.kind` | Meaning                                                 | `id`                                            |
| ------------- | ------------------------------------------------------- | ----------------------------------------------- |
| `human`       | a person acting in the editor UI or the CLI             | optional; identifies the session when available |
| `agent`       | an AI agent or automation acting through a tool surface | **required**; stable identifier of the caller   |
| `import`      | a document/HTML import path                             | the import job or source reference              |
| `system`      | internal maintenance (migration, repair)                | the subsystem name                              |

Why `origin` is mandatory and not decorative:

1. it is written into the history with every applied command, so any edit can be attributed after the
   fact;
2. agent writes are the writes that most need review (`security.md` §3.7: "No arbitrary code
   execution on behalf of agents" and "the command layer records the origin of every mutation");
3. attribution is what makes a future "discard the agent's changes" or per-origin undo stack possible
   without re-architecting history.

**The origin is set by the trusted entry point, not read out of an untrusted request body.** A
renderer, CLI or MCP handler that receives an `origin` from a less-trusted party must replace it with
what it actually knows about the caller; a caller may never claim `human` for agent-initiated work.

## 3. The first operation set (P1)

Six operations, deliberately small enough to be fully tested (`ADR-0002` §4). Each one is a complete
specification: target, payload, preconditions, resulting document change and undoability.

| Operation            | Target         | Payload                   | Undoable in P1 |
| -------------------- | -------------- | ------------------------- | -------------- |
| `slide.create`       | `presentation` | `{ slideId?, position? }` | yes            |
| `slide.remove`       | `slide`        | `{}`                      | yes            |
| `element.add`        | `slide`        | `{ element }`             | yes            |
| `element.move`       | `element`      | `{ position }`            | yes            |
| `element.updateText` | `element`      | `{ text }`                | yes            |
| `element.remove`     | `element`      | `{}`                      | yes            |

Common preconditions for all six: the target resolves (§2.1), `payload` parses against the
operation's schema, and `expectedRevision` equals the document revision. Any failure leaves the
document, its revision and its history **unchanged** (§4.3).

Undoability as a column is a commitment: a future operation that is not undoable must say so here and
justify it in the PR that adds it (§8).

### 3.1 `slide.create`

Target: `presentation`.

| Payload field | Type        | Required | Notes                                                                                                       |
| ------------- | ----------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `slideId`     | string (id) | no       | When supplied, the dispatcher refuses a collision (`conflict`). When omitted, the dispatcher mints one.     |
| `position`    | integer ≥ 0 | no       | Insertion index. `position == slideCount` appends; larger values are `invalid-payload`. Defaults to append. |

- **Success effect**: a new empty slide exists at `position`; `slideCount` grows by one; the revision
  increments by one; the response's `createdId` is the slide's id (whether supplied or minted) — the
  caller should not assume it knows the id after a request that omitted one.
- **Undo**: removes the created slide, leaving the document identical to the pre-command state.

### 3.2 `slide.remove`

Target: `slide`.

| Payload field | Type | Required | Notes                                                         |
| ------------- | ---- | -------- | ------------------------------------------------------------- |
| —             | —    | —        | The payload MUST be `{}`; anything else is `invalid-payload`. |

- **Preconditions**: the slide exists. Removing the document's only slide is refused — whether that is
  `conflict` or `invalid-payload` is a model-invariant decision owned by P1.2 (§10, open question 1).
- **Success effect**: the slide and its elements are gone; the revision increments by one.
- **Undo**: restores the slide **with its original ids**, so ids a caller previously learned stay
  valid after an undo.

### 3.3 `element.add`

Target: `slide`.

| Payload field       | Type   | Required | Notes                                                                        |
| ------------------- | ------ | -------- | ---------------------------------------------------------------------------- |
| `element`           | object | yes      | The element to add, in the shape `ADR-0002` §3 defines for `Element`.        |
| `element.elementId` | string | no       | Dispatcher mints one when omitted; a collision is `conflict`.                |
| `element.type`      | enum   | yes      | `text` \| `shape` \| `image` (`ADR-0002` §3).                                |
| `element.geometry`  | object | yes      | `{ x, y, width, height }`, all finite numbers, `width > 0` and `height > 0`. |

- Type-specific fields (text content, shape styling, image reference) are those of the element schema
  in `packages/core`; this document does not restate them. The dispatcher rejects an element carrying
  fields that do not belong to its `type` (`invalid-payload`) — `ADR-0002` §3 rejects rather than
  coerces.
- **Preconditions**: the slide exists; the element passes its schema; `elementId` is unused if given.
- **Success effect**: the element is appended to the slide; the revision increments by one.
- **Undo**: removes the added element.

### 3.4 `element.move`

Target: `element`.

| Payload field | Type   | Required | Notes                                           |
| ------------- | ------ | -------- | ----------------------------------------------- |
| `position`    | object | yes      | The element's **new absolute top-left corner**. |
| `position.x`  | number | yes      | Finite; element-local slide coordinates.        |
| `position.y`  | number | yes      | Finite; element-local slide coordinates.        |

- Absolute coordinates, not a delta: a request is interpreted identically no matter what the
  dispatcher's in-memory state is, which is what makes an agent-issued move reviewable and replayable.
- **Preconditions**: the element exists. Only `x`/`y` change; `width`, `height`, `type` and content are
  untouched (resizing is a different operation that does not exist in P1).
- **Success effect**: new position recorded; the revision increments by one.
- **Undo**: restores the previous `x`/`y`.

### 3.5 `element.updateText`

Target: `element`.

| Payload field | Type   | Required | Notes                                                                                                      |
| ------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `text`        | string | yes      | **Plain text.** Markup is not a text edit: HTML must not be smuggled in as document truth (`ADR-0001` §7). |

- **Preconditions**: the element exists and its `type` is `text`. Text on a shape or image element is
  `invalid-payload`, not a silent style write.
- **Success effect**: the element's text is replaced; the revision increments by one.
- **Undo**: restores the previous text.

### 3.6 `element.remove`

Target: `element`.

| Payload field | Type | Required | Notes                                                         |
| ------------- | ---- | -------- | ------------------------------------------------------------- |
| —             | —    | —        | The payload MUST be `{}`; anything else is `invalid-payload`. |

- **Preconditions**: the element exists in the named slide.
- **Success effect**: the element is gone; the revision increments by one.
- **Undo**: restores the element with its original id, geometry, type and content.

## 4. Result contract

A command returns a value, never an exception across a boundary. The shape is the repository's
existing `Result<T, E>` (`packages/core/src/result.ts`):

```ts
type CommandResult = { ok: true; value: CommandSuccess } | { ok: false; error: CommandError };

interface CommandSuccess {
  operation: string; // echoes the applied operation
  document: Presentation; // the new document, JSON-serializable (§6)
  revision: number; // the new document revision
  undo: UndoEntry; // the inverse entry recorded in history
  createdId?: string; // id minted by this command, when it minted one
}

interface CommandError {
  code: CommandErrorCode; // machine-discriminable, frozen vocabulary
  message: string; // human-readable, for logs and CLI stderr
  details?: Record<string, unknown>; // structured context, e.g. { expected, actual }
}
```

`UndoEntry` is **proposed by this document** as an envelope-shaped inverse command whose
`expectedRevision` is the revision it would apply to. `ADR-0002` fixes only that an undo entry is
returned and that undo/redo are supported; the exact shape is P1.2's to confirm (§10, open question 2).

### 4.1 Error codes

| `code`                  | Raised when                                                                                                                                        | Typical `details`          | Retryable?                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------- |
| `invalid-envelope`      | the command object is not JSON, is missing a required field, has an unknown member or a wrong type.                                                | `field`, `reason`          | no — fix the request                         |
| `invalid-payload`       | `payload` does not satisfy the operation's schema (missing/extra field, wrong type, non-finite geometry, out-of-range `position`).                 | `field`, `reason`          | no — fix the request                         |
| `target-not-found`      | `target` names a slide or element that does not exist, or an element that is not in the named slide.                                               | `target`                   | no — re-read, then decide                    |
| `stale-revision`        | `expectedRevision` differs from the document revision.                                                                                             | `expected`, `actual`       | **yes** — after re-reading the document (§5) |
| `conflict`              | the request is valid in isolation but cannot be applied to the current state (id already in use, model invariant violated) at a matching revision. | `reason`, `conflicting-id` | no — the state must change first             |
| `unsupported-operation` | `operation` is not one this dispatcher implements.                                                                                                 | `operation`                | no — this build cannot do it                 |

The first five are required by the task contract; `invalid-envelope` is added here so that a transport
can tell "your JSON was malformed" from "that field of your payload is wrong" without parsing
`message`. Codes are a frozen vocabulary: callers switch on them, so adding or renaming one is a
compatible-only-by-ADR change (§8).

### 4.2 Failure is a value, and it has no side effects

- A failed command returns `{ ok: false, error }`; it does not throw across the dispatcher boundary.
- **Failure means zero side effects**: the document, its `revision` and its history are byte-identical
  to the pre-command state. `ADR-0002` §4.3: "a command that fails validation leaves the document
  byte-identical."
- A transport must not turn `{ ok: false }` into a transport-level failure (an MCP tool error, a
  non-zero exit with no payload). The result object is the answer.

## 5. Versioning and concurrency

Two different integers are easy to confuse; they answer different questions.

| Concept                            | What it versions                                             | Changes when                                              | Lives in                 |
| ---------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- | ------------------------ |
| `SCHEMA_VERSION` / `schemaVersion` | the **shape** of the document model (field/entity structure) | the model changes incompatibly and needs a migration step | the document, as a field |
| `revision`                         | the **content** of one document                              | every successfully applied command (`+1`)                 | the document, as a field |

- `revision` starts at `0` for a fresh document and is a monotonic integer, not a timestamp, not a
  content hash, and it does not change on read.
- `SCHEMA_VERSION` belongs to the codebase; a document carrying a different one is **not silently
  coerced**. Handling (reject, or run an explicit migration command recorded with
  `origin.kind: "system"`) is a P1+ decision (§10, open question 3).
- Ids are minted by `packages/core`, are unique within the document, and survive undo — undoing a
  create and redoing it must not leave a caller holding a dangling id.

### 5.1 `expectedRevision` is an optimistic concurrency token

The dispatcher compares `expectedRevision` with the document revision **before** mutating. On
mismatch, it fails with `stale-revision` and `details: { expected, actual }`. That is the intended
outcome, not an error to paper over: a caller that guessed a revision based on a stale view must not be
allowed to overwrite an intervening edit.

Correct client behaviour on `stale-revision`: re-read the document, re-derive the intended change
against the new state, and issue a **new** envelope with the new `expectedRevision`. Blind retry with
the same payload is wrong whenever the intervening edit touched the same target.

### 5.2 Concurrency in P1: single writer, conflict rejection

- One document is owned by one dispatcher instance; the dispatcher applies commands atomically
  (`ADR-0002` §4.3), so revision comparison has an unambiguous meaning.
- Multiple sources (human UI, CLI, agent) may target the same document, but their edits **serialize**
  through that dispatcher. There is no merging: the loser of a race gets `stale-revision`.
- No CRDT, no operational transform, no last-write-wins, no multi-machine editing
  (`ADR-0002`, alternatives table: "A CRDT / real-time model in P1" is out of scope).
- P1 does not define a lock, lease or queue. Because of that, an agent that edits a document a human
  also has open must expect `stale-revision` and handle it (§10, open question 4).

## 6. JSON serialization contract

1. **The document is JSON.** Lossless round-trip through `JSON.stringify` / `JSON.parse` is an
   acceptance criterion for the model (`p1-plan.md`, P1.2). Consequently the model contains no
   `Date`, `Map`, `Set`, `undefined`, function, `bigint`, `NaN` or `Infinity`; numbers are finite.
   Malformed input is rejected, not coerced.
2. **Protocol messages are JSON**, and the envelope is identical in every transport (§7). A request
   is the envelope; a response is a `CommandResult`. No transport may add a second, transport-local
   command shape.
3. **Encoding**: UTF-8, one JSON object per request/response. Where a transport needs a text form (a
   CLI printing a result, an MCP tool payload), the object is serialized verbatim rather than
   flattened into prose.

### 6.1 Example — success

Request (`origin.kind: "agent"`, document at revision 7):

```json
{
  "operation": "element.updateText",
  "target": { "kind": "element", "slideId": "s_9f2", "elementId": "e_14a" },
  "payload": { "text": "Revenue grew 18% year over year." },
  "expectedRevision": 7,
  "origin": { "kind": "agent", "id": "claude-code/session-3f2a" }
}
```

Response (`ok: true`; the document is trimmed here — a real response carries the whole document):

```json
{
  "ok": true,
  "value": {
    "operation": "element.updateText",
    "revision": 8,
    "document": {
      "schemaVersion": 1,
      "revision": 8,
      "presentationId": "p_001",
      "slides": [
        {
          "slideId": "s_9f2",
          "elements": [
            {
              "elementId": "e_14a",
              "type": "text",
              "geometry": { "x": 96, "y": 240, "width": 640, "height": 120 },
              "text": "Revenue grew 18% year over year."
            }
          ]
        }
      ]
    },
    "undo": {
      "operation": "element.updateText",
      "target": { "kind": "element", "slideId": "s_9f2", "elementId": "e_14a" },
      "payload": { "text": "Revenue grew 17% year over year." },
      "expectedRevision": 8
    }
  }
}
```

What the caller may conclude: the edit was attributed to `claude-code/session-3f2a` in history; the
document is now at revision 8; the previous text is recoverable from `undo`.

### 6.2 Example — `stale-revision`

Same intent, but the document has moved to revision 9 in the meantime:

```json
{
  "operation": "element.updateText",
  "target": { "kind": "element", "slideId": "s_9f2", "elementId": "e_14a" },
  "payload": { "text": "Revenue grew 18% year over year." },
  "expectedRevision": 7,
  "origin": { "kind": "human" }
}
```

```json
{
  "ok": false,
  "error": {
    "code": "stale-revision",
    "message": "Expected revision 7 but the document is at revision 9.",
    "details": { "expected": 7, "actual": 9 }
  }
}
```

The document is unchanged: revision 9, no history entry, and whatever the intervening edit was is
still there. The caller re-reads, re-derives the text against revision 9, and sends a new command.

## 7. Transport mapping

One envelope, three transports. In P1 only the in-process call exists; the CLI and MCP rows are
**proposed**, not approved surfaces, and the parameters shown must not be treated as a published CLI
contract.

| Transport  | Status                                                      | How the envelope appears                                                                                                                                                             |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| In-process | P1.2 — the only implemented path                            | a typed call: `dispatch(document, command)` returning `Result<CommandSuccess, CommandError>` (`dispatch` is a placeholder name; P1.2 owns the export). Serialization is skipped.     |
| CLI        | P1.3 proves a minimal invocation; full surface not designed | one invocation = one envelope; the command JSON is passed as an argument, the result object is printed verbatim by a machine-readable mode. Proposed, not an approved parameter set. |
| MCP server | not implemented (P1+ per `ADR-0002` follow-ups)             | one tool whose input schema is the envelope and whose output is the `CommandResult` as JSON. Proposed: a single tool named `apply_command` rather than one tool per operation.       |

Rules every transport must honour:

- build the envelope; never grow a transport-local mutation path (`ADR-0002` §4: "Callers never mutate
  the document directly");
- surface `{ ok: false, error }` as data, keeping `code` intact so automation can branch on it;
- set `origin` from what the transport actually knows (§2.2), never from untrusted input;
- keep diagnostics out of the machine-readable payload (stderr, not stdout, for the CLI);
- do not add fields to the envelope for one transport's convenience.

CLI illustration — **proposed, not approved**:

```text
auralide apply --command '<envelope-json>' [--json]
```

Exit-code mapping, stdout/stderr discipline, and whether a CLI command even takes a raw envelope or a
per-operation flag surface are open questions (§10, open question 5); they need their own decision
before the CLI is published.

## 8. Extending the protocol

Adding an operation widens what every transport — including agents — can do to a document, so it is an
architecture change, not a local refactor.

Procedure:

1. **Decide first.** Open an Issue; if the operation changes a decision in `ADR-0002` (the operation
   set, the envelope, the result contract) amend the ADR, do not work around it.
2. **Specify the payload schema** in `packages/core` next to the operation. The Zod schema is the
   machine-readable contract; this document is its human-readable twin.
3. **State the full specification here**: target kind, payload fields, preconditions, model
   invariants it must not violate, resulting document change, undo inverse, and the error codes it can
   return.
4. **Say whether it is undoable.** If it is not, justify it in the PR; the §3 table must carry the
   answer.
5. **Test the contract, not the happy path**: success, each declared failure code, boundary cases
   (empty document, first/last element, out-of-range index), and an undo/redo round-trip.
6. **Keep it additive.** New operations are additive; changing an existing operation's payload,
   semantics or error codes is a breaking change for every transport and needs an ADR note and a
   compatibility decision.
7. **Update §3 in the same PR.** An operation that is implemented but undocumented is a defect.

Forbidden, in any transport or layer:

| Not allowed                                                                       | Why                                                                                                                                |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Mutating the document without going through the dispatcher                        | Creates a second, unvalidated mutation path (`ADR-0002` §4, and the UI shortcut is explicitly rejected in the alternatives table). |
| Writing the document as raw HTML, or storing markup in model text fields          | HTML is a rendering/export target, never the document of truth (`ADR-0001` §7).                                                    |
| Addressing entities by array index, DOM selector or path                          | Indices shift under edits; agents and undo need stable ids.                                                                        |
| Coercing invalid input, or applying part of a command                             | Violates reject-don't-coerce and "failure is zero side effects".                                                                   |
| Adding an operation only in a transport (CLI flag, MCP tool) with no core support | The transports would diverge; `ADR-0002` §4 requires one entry point.                                                              |
| Reporting agent-initiated work as `origin.kind: "human"`                          | Destroys attribution and defeats the audit requirement.                                                                            |
| Ignoring an unknown `operation` or unknown field                                  | Silently accepting an unimplemented intent is worse than refusing it.                                                              |

## 9. Relationship to the security boundary

This protocol is where "an agent asked to change the document" becomes auditable. The rules it carries
(`docs/architecture/security.md`):

- **Authorization happens above the dispatcher.** A command with `origin.kind: "agent"` is only issued
  after the user has authorized the _capability_ being exercised; the protocol records who acted, it
  does not grant permission. `security.md` §3.7: an agent command that writes files, runs processes or
  reaches the network requires explicit user approval.
- **The command layer cannot be used as a privilege escalation path.** It mutates the in-memory
  document and its history; it does not read or write files, spawn processes or open sockets.
  Persistence, assets and export are separate privileged operations reached through the validated
  preload/IPC bridge (`ADR-0002` §2, `security.md` §3.2).
- **Imported content is untrusted input.** The protocol accepts model fields and plain text; it never
  accepts executable markup. HTML import goes through `packages/html-bridge` and is normalized before
  it reaches the model (`security.md` §3.5). A text field is data, never a script channel.
- **Attribution is a security control, not telemetry.** `origin` is what lets a reviewer separate an
  agent's edits from a person's, and it must be recorded for every applied command.

## 10. Open questions

Decisions that need an owner; none of them are answered by `ADR-0002`.

1. **Model invariants and their error codes.** Which refusals are `invalid-payload` and which are
   `conflict`? Specifically: can a document have zero slides, and is a duplicate id a payload problem
   or a state problem? Needs one rule so callers can branch deterministically.
2. **Undo/redo over the wire.** Is undo an operation in this envelope (with `expectedRevision`), a
   separate dispatcher capability that no transport can invoke, or a transport-level feature? If it is
   an operation: what happens to the redo stack after an intervening edit, and does `origin` still
   apply to the undo itself?
3. **Schema migration.** When `schemaVersion` differs from `SCHEMA_VERSION`: reject, or run an explicit
   migration command with `origin.kind: "system"`? Is migration inside or outside this protocol?
4. **Concurrency surface.** Is single-writer conflict rejection enough for P1.3's minimal CLI, and who
   sees the `stale-revision` — the human, the agent, or both? Any lease/lock/queue is a new decision.
5. **CLI surface.** Envelope-as-argument versus per-operation flags; exit-code mapping; whether the
   result goes to stdout in full. Requires its own decision before publication.
6. **Command identity and idempotency.** Should the envelope carry a command id / idempotency key so a
   retried agent call is not applied twice, and so a duplicate delivery is detectable? Today an agent
   retry is indistinguishable from a second intended edit.
7. **Whole document versus delta in the response.** Every success returns the whole document; cheap
   in-process, potentially large over MCP or a long agent loop. Revisit with real payload sizes.
8. **Asset references.** P1 has image _references_ only. Do binary assets ever travel through the
   protocol, or only through a separate privileged channel keyed by reference?
9. **Origin spoofing and the `human` claim.** Which surfaces are trusted to assert `origin`, and is a
   transport-asserted origin a signed/enveloped field or just convention above the dispatcher?

## 11. Related documents

- [`ADR-0002`](../decisions/ADR-0002-p1-runtime-and-core.md) — the accepted decision this document
  specifies (§3 model, §4 dispatcher).
- [`p1-plan.md`](p1-plan.md) — P1.2 implements the model and dispatcher; P1.3 proves a headless call,
  a minimal CLI invocation and documents this protocol.
- [`security.md`](security.md) — untrusted HTML, IPC bridge rules, agent authorization.
- [`overview.md`](overview.md) — layer responsibilities and the command layer's place in them.
- `packages/core/src/result.ts` — the `Result<T, E>` shape the result contract mirrors.
- `docs/reports/P1-runtime-core-report.md` — verification evidence for the model and dispatcher
  (published when P1 closes; not present yet).

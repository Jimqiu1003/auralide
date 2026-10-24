# Command Protocol

Status: **P1 baseline with additive M2 editing operations**. Normative architecture: [ADR-0002](../decisions/ADR-0002-p1-runtime-and-core.md).
The selected implementation is the `feat/p1-core-document-commands` lineage; the incompatible
`feat/p1-core-commands` prototype is preserved in its historical branch. Exact types are the Zod
schemas and public exports in `packages/core`. Evidence: [Codex report](../reports/P1-codex-takeover-report.md).

## One mutation path

```text
Desktop renderer → named preload API → main-owned session ─┐
CLI --demo → in-memory state ──────────────────────────────┼→ core.applyCommand
Future MCP / agent transport (not implemented) ───────────┘
```

Core has no filesystem, network, Electron or UI capability. A caller adopts the returned state only
on success. Neither the desktop nor the CLI persists documents in P1.

## Envelope and model

```json
{
  "operation": "element.move",
  "target": { "kind": "element", "slideId": "slide_intro", "elementId": "el_title" },
  "payload": { "x": 250, "y": 300 },
  "expectedRevision": 4,
  "origin": { "kind": "agent", "id": "planner/session-3" }
}
```

Every command has exactly these five fields. Unknown fields and invalid types are refused without
coercion. Targets are presentation `{kind:'presentation'}`, slide `{kind:'slide',slideId}`, or element
`{kind:'element',slideId,elementId}`. Targets use stable ids, never array positions or DOM selectors;
element resolution is restricted to the named slide. `expectedRevision` is a nonnegative safe integer
matching the current document. Origin is `{kind:'human'|'agent'|'import'|'system',id?}`; agent requires
an id. The trusted transport asserts identity: desktop replaces a validated origin with
`{kind:'human',id:'desktop'}`. Future agent transports must assert their own identity.

The model is `Presentation {schemaVersion:'1.0',id,title,revision,slideSize,slides}`;
`Slide {id,name?,backgroundColor?,elements}`. Elements discriminate on `kind` and share
`id,geometry:{x,y,width,height}`. Kinds are text (`text,style?`), shape
(`shape:'rectangle'|'ellipse'|'line',fill?,stroke?`) and image (`assetId,alt?`). See `document.ts` for
optional styling and numeric bounds. Image data is a reference, not bytes. Text is data and must
be escaped by renderers, never interpreted as HTML.

Ids are branded strings prefixed `pres_`, `slide_`, `el_`. Slide ids are unique per document; element
ids are unique across all slides. Callers provide ids when creating nodes; `createIdGenerator`
provides an injectable factory. Its clock/counter default guarantees only process-local uniqueness;
collisions are rejected. Unknown schema versions are refused with no implicit migration.
`parseDocument` returns `invalid-json` or `invalid-document` on failure.

## Six P1 operations

| Operation            | Target kind  | Payload                       | Effect / refusal                                                |
| -------------------- | ------------ | ----------------------------- | --------------------------------------------------------------- |
| `slide.create`       | presentation | `{id,name?,backgroundColor?}` | Append empty slide; duplicate id is conflict                    |
| `slide.remove`       | slide        | `{}`                          | Remove slide and children; removing the only slide is conflict  |
| `element.add`        | slide        | `{element}`                   | Append complete element with id; duplicate anywhere is conflict |
| `element.move`       | element      | `{x,y}`                       | Set absolute position, preserving size and identity             |
| `element.updateText` | element      | `{text}`                      | Replace plain text; non-text element is conflict                |
| `element.remove`     | element      | `{}`                          | Remove element                                                  |

A zero-slide document is valid initially or when parsed, but deleting the final slide is refused.
Geometry is finite and bounded by exported constants; dimensions must be positive.
P1 has no arbitrary insertion positions, optional generated ids in payloads, generic property
patches, batches or document replacement operations.

This reconciles the earlier protocol draft's illustrative `slideId?`, `position`, `elementId`,
`type`, `invalid-envelope` and `createdId` with the implemented `id`, `x/y`, `kind` and typed results.
That draft did not publish a transport API. The accepted envelope and six operations are unchanged.

## Results and atomicity

```ts
applyCommand(state: EditorState, command: unknown): Result<CommandResult, CommandError>
// Success: {ok:true,value:{state:{document,history},entry}}
// Failure: {ok:false,error:{code,message}}
```

`createEditorState(document)` validates and clones into frozen state with empty history. Documents
and history outputs are frozen at runtime as well as readonly in types. History entries record
`sequence,revision,operation,target,origin,before,after`; P1 uses complete snapshots.
Failure leaves document, revision and history unchanged. Validation order: supported-operation
probe → strict envelope → target/existence/payload → revision match → state invariants/execution.
Do not branch on message wording.

| Error code                            | Meaning                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `unsupported-operation`               | Missing, invalid or unsupported operation                                   |
| `invalid-payload`                     | Malformed envelope, target shape or operation payload                       |
| `target-not-found`                    | Named entity absent from the addressed scope                                |
| `stale-revision`                      | Caller expected a different revision                                        |
| `conflict`                            | Duplicate id, wrong element kind, last-slide removal, or exhausted revision |
| `nothing-to-undo` / `nothing-to-redo` | No entry at the history cursor                                              |

Success increments revision once; safe-integer exhaustion returns conflict. P1 does not return
error details, createdId or content deltas; the caller already knows its new ids.

## Undo / redo

`undo(state)` and `redo(state)` return `Result<EditorState,CommandError>`. They restore content,
stable ids and array order, while incrementing the **current** revision once. Revision never moves
backwards: undo must not make a stale command valid again (the ABA problem). Historical snapshots
retain their original revisions. A new successful command truncates the redo branch; failed edits
preserve it. These are headless functions, not additional wire operations. History retains original
command attribution; transport-level undo attribution is deferred.

## Implemented transports

| Surface                   | P1 behavior                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| In-process                | `createEditorState`, `applyCommand`, `undo`, `redo`, `canUndo`, `canRedo`                    |
| Desktop                   | Frozen bridge v1.1.0: `getRuntimeInfo`, `ping`, `getDocument`, `applyCommand`                |
| CLI                       | `--demo [--json]` executes one deterministic in-memory slide.create and prints a JSON Result |
| MCP / general CLI editing | Not implemented                                                                              |

Desktop main owns state. `getDocument()` returns the document without history;
`applyCommand(command)` returns `Result<Presentation,CommandError>`. Renderer imports Core types
only. Every channel checks sender window, exact URL and main frame; Zod validates argument arity.
Malformed transport arguments reject the promise; malformed commands return typed failures.
Diagnostic ping retains its existing response shape. No generic invoke, file or shell API is exposed.

CLI demo is a verification surface, not a general apply-command API. It writes no files. Stdout is
only the JSON Result; exit 0 means success, 1 command failure, 2 usage error (diagnostics on stderr).
Help/version remain available; command selectors are mutually exclusive. After build:

```powershell
pnpm --filter @auralide/cli start --demo --json
```

## Extensions and open decisions

New operations need an Issue, schema, target/payload/invariant/error specification, undo semantics
and failure-atomicity tests. Accepted architecture changes need an ADR update. Do not create
transport-local mutation paths or accept executable markup through text fields.

Deferred: format migration, full CLI framing, MCP, idempotency keys, agent
authorization, binary assets, snapshot memory limits and deltas. Attribution records an action;
it does not authorize capability. Authorization remains above Core.

## M2 additive editing contract (2026-10-18, execution of next-stage plan)

`element.updateProperties` accepts an element target and a strict nonempty payload with optional
complete `geometry`, partial text `style`, or shape `fill`/`stroke`. Text style is rejected for
non-text objects; shape colors are rejected for other objects. Reuse existing geometry/style limits;
new color edits accept bounded literal colors, never CSS resource expressions. The resulting full
document is still schema-validated before adoption. Content/IDs and the JSON 1.0 format are unchanged.

`element.reorder` accepts `{ index }` within the target slide's existing array. Array order is the
paint order in canvas, thumbnails, HTML preview and export; legacy `zIndex` data is retained in JSON
but does not override array ordering. Unknown/missing targets, stale revisions and invalid payloads
fail without partial mutation. Both operations enter the existing reversible Core history.

Desktop bridge 1.6 exposes only named `editHistory({ direction: 'undo' | 'redo', expectedRevision })`.
Main validates sender/payload/revision, refuses operations while file I/O is pending, and adopts Core
undo/redo at a fresh revision. History is session-only and resets on reopen/closed-session teardown.
Native input undo stays local; document shortcuts only run outside text/form inputs. No external
Agent edit capability is granted. CLI remains a headless Core demonstration, not a live editor API.

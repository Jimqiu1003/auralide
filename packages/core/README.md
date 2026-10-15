# @auralide/core

The document model, the command contract and the validation primitives that every other Auralide
layer builds on. `core` is deliberately free of Electron, React, the DOM and Node-only APIs, so the
same code runs in the renderer, in the main process and headlessly behind a CLI or an agent.

## Modules

| File            | Responsibility                                                                           |
| --------------- | ---------------------------------------------------------------------------------------- |
| `document.ts`   | Zod schemas for `Presentation` → `Slide` → `Element`, geometry, revision and edit origin |
| `command.ts`    | The command contract: operations, targets, payloads and typed failures                   |
| `dispatcher.ts` | The only path from a command to a new document, plus undo/redo                           |
| `ids.ts`        | Prefixed, branded entity ids and the injectable id generator                             |
| `result.ts`     | `Result<T, E>` — failures are values, not exceptions                                     |
| `layer.ts`      | The canonical architecture layer names                                                   |

`src/index.ts` exports the public surface only; everything else is an implementation detail.

## The document

A document is JSON: `{ schemaVersion, id, title, revision, slideSize, slides[] }`, where each slide
holds elements of kind `text`, `shape` or `image` (the image element stores an `assetId` reference,
never image bytes). Its shape is versioned by `SCHEMA_VERSION` (`'1.0'`).

Input is validated at the boundary and **rejected, never repaired**: every object schema is strict
(an unknown key fails), numbers are not coerced, and geometry must be a positive, finite box inside
the supported bounds. Duplicate slide ids, duplicate element ids anywhere in the document and explicit
`undefined` in optional fields are rejected. `parseDocument(serializeDocument(document))` is lossless.

Documents are immutable values. `createEditorState` validates and copies its input; `parseDocument` results,
dispatcher results and history snapshots are deeply frozen at runtime as well as readonly in types.
Nothing in this package mutates a document it was given.

## The command contract

One shape covers every edit, so the renderer, the CLI and future agents cannot drift into three
different mutation paths:

```jsonc
{
  "operation": "element.move",
  "target": { "kind": "element", "slideId": "slide_intro", "elementId": "el_title" },
  "payload": { "x": 250, "y": 300 },
  "expectedRevision": 4,
  "origin": { "kind": "agent", "id": "planner" },
}
```

Operations: `slide.create`, `slide.remove`, `element.add`, `element.move`, `element.updateText`,
`element.remove`. The `payload` field is always present; parameterless operations carry `{}`.

`applyCommand(state, command)` validates the target shape, proves the target exists, validates the
payload, refuses a stale `expectedRevision`, then applies the command atomically:

- a command that fails validation leaves the state and its history byte-identical;
- a successful command increments `revision` exactly once and records `origin`
  (`human` / `agent` / `import` / `system`; `agent` requires an actor `id`);
- `undo` restores previous content and `redo` re-applies it; both advance the revision so an old
  concurrency token can never become current again. Applying a new command clears the redo stack;
- reaching the maximum safe revision refuses further commands, undo and redo with a typed `conflict`
  instead of producing an invalid document.

Because `applyCommand` takes `unknown`, it is the trust boundary for commands arriving as JSON over
IPC, from a CLI or from an agent; the caller adopts the returned state instead of mutating the one
it passed in.

Model invariants the dispatcher enforces with `conflict` (a well-formed command the current state
cannot accept): a slide or element id may not collide with an existing one, `element.updateText`
requires a text element, and `slide.remove` refuses the document's only slide. A zero-slide document
is still a valid presentation — it is just never reached by deleting the last slide.

## Ids

Ids are strings with a kind prefix (`pres_`, `slide_`, `el_`) and are branded, so a slide id cannot
be passed where an element id is expected. `createIdGenerator(nextSuffix)` builds the typed factory;
injecting the suffix source keeps tests and reproducible imports deterministic. The default source
combines the wall clock with a process-local counter, so uniqueness is guaranteed **within one
process only** — sufficient because ids are compared inside a single document.

## Commands

```sh
pnpm --filter @auralide/core typecheck
pnpm --filter @auralide/core lint
pnpm --filter @auralide/core test
pnpm --filter @auralide/core build
```

# P2 — Validated Editing Vertical Slice

Goal: create → human edit → authorized Agent edit → conflict → undo/redo → save → close → reopen
→ HTML preview. This full flow is **not** the scope of the first increment.

## P2A — Durable Document Foundation

Issue #22, Lead-owned branch `feat/p2a-durable-documents`, independent sibling worktree. Depends on
unmerged P1.5 #19 → #20 → #21; review the incremental PR against #21, then retarget after merges.
No automatic merge, Core rewrite or new dependency. Human QA #18 owns its separate fixture/docs zones.

Acceptance: main-only native file grants; strict request/schema/revision validation; safe snapshot
save/reopen; original bytes retained on staged-write/replace failure; explicit corrupt/schema/
permission/disk-conflict errors; real desktop round trip across application restart; unchanged Core
six-operation/undo/redo regressions; native Windows x64 and ARM64 macOS CI evidence.

P2A persists only a document snapshot. Session undo history deliberately resets on reopen; see
Proposed ADR-0005. Persistent command history, external Agent Apply, full UI, databases, cloud,
CRDT, migrations, HTML parsing and release packaging are **Deferred**.

## Later increments (not implemented)

1. Shared authorized Application command API with Read/Propose/Preview/Apply/Destructive scopes,
   stable IDs, explicit revision and reviewable command diff. CLI/MCP reuse the service.
2. Owner-selected A shell components and actual selection context, with command-based undo/redo UI.
3. Reviewed HTML compatibility/import boundary and loss reporting before any general parser.

Each increment has its own Issue, file ownership, acceptance tests and PR. Next budget gate requires
observed user workflow and QA evidence, rather than advancing because code compiles.

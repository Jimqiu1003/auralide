# ADR-0005 — Application ownership and P2A snapshot persistence

- Status: **Proposed — owner review required**; bounded experimental P2A implementation authorized
- Date: 2026-10-15
- Extends ADR-0001/0002; proposes replacing the overview's future persistent-history commitment
- Scope: Issue #22; no Core protocol/schema change

## Current state

Main owns a frozen in-memory EditorState. CLI independently demonstrates the same pure Dispatcher.
Undo history stores before/after document snapshots. No storage package or filesystem mutation API
exists in Core. Origin is provenance asserted by transport, not an Agent credential.

## Proposal

Keep the current directory boundaries. Main's document session acts as the small application service;
a Node-only file adapter reads/writes the existing versioned Presentation JSON, with a 20 MiB limit.
Native Open/Save dialogs grant a path only in main. Renderer supplies only expectedRevision, never a
path or replacement document. Serialize operations and refuse edits while a file operation is active.
Validate loaded schema and saved live state. Cancellation/failure leaves live state and file binding
unchanged. Opening over unsaved edits requires explicit confirmation.

Write a unique same-directory temporary file exclusively, flush/close, retain an exclusive uniquely
named backup of an existing target and replace with rename. New files use exclusive link creation
to avoid clobbering an unexpected target. Check the last known disk fingerprint before replacement;
refuse detected external changes. Clean up only owned temporary files; retain recovery backups.
No backup rotation/deletion or silent fallback to truncate-in-place. Directory fsync/power-loss and
adversarial concurrent writers are outside this normal I/O failure guarantee and must be documented.

Persist document content/current revision, not session history. Reopen creates a validated EditorState
with empty history and a revision greater than both the old live and loaded revision, fencing stale
requests and Aura renders within this process. At the safe-integer ceiling refuse without changes.
This is session hydration, not a second content-edit path; ordinary edits still use Dispatcher.
Revision is a session concurrency fence, not a globally unique durable event ID. Cross-process Agent
coordination needs a future session identity contract before it is exposed.

## Alternatives and consequences

Persisting before/after histories multiplies file size and commits an unreviewed recovery format;
patch/event logs need replay/versioning semantics. Both are deferred. A database or generic storage
framework adds no value for this first JSON round trip. Keeping filesystem code in Core violates its
accepted isolation. Introducing a new universal Application package now would pretend unused CLI/MCP
policy was implemented; extract only when a real second client needs it.

Users receive real saved snapshots and failure-safe replacement, but undo does not span application
restarts. Backups consume space until users manage them; no automatic cleanup is included. Large
document history remains O(number of edits × document size), outside the snapshot file's 20 MiB cap.

## Validation

Test valid round trips, corrupt JSON/schema, external file changes, unexpected target creation,
failed rename and original-byte preservation, forbidden path arguments, cancellations, operation
serialization, revision fencing, history reset and unchanged Core undo/redo. Launch real Electron,
save/edit/resave, restart, reopen, and inspect Core-derived HTML on both native CI targets.

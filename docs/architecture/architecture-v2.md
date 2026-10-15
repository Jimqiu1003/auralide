# Architecture V2 — bounded alignment

Status: **Proposed** target responsibilities; P2A is an experimental implementation, not approval of
all future features. [ADR-0005](../decisions/ADR-0005-application-and-persistence.md),
[ADR-0006](../decisions/ADR-0006-html-compatibility-boundary.md).

Human UI / CLI / future MCP → application policy and command API → pure Core Dispatcher/history.
Application services call storage, preview and export adapters; adapters never own document edits.
The Electron document session is the current application service. CLI remains a deterministic
in-memory Core demo; a shared external Application API is **Deferred**, not duplicated here.

| Layer                          | Actual state / responsibility                                                | Boundary                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Core                           | Implemented: schema, six commands, conflicts, immutable snapshots, undo/redo | No UI, filesystem, platform or model-provider dependency                  |
| Main application session       | Implemented command adoption; P2A adds serialized file operations            | Asserts human origin, validates revision, owns live state and file grants |
| Storage adapter                | P2A: validated JSON snapshot, bounded read, staged write/backup/replace      | Receives only main-authorized paths; no renderer file API                 |
| Renderer                       | P1.5 pure inert model-to-HTML preview                                        | Escapes data; no document ownership or resource privilege                 |
| HTML Bridge                    | Placeholder, retained for future compatibility policy                        | No universal lossless import claim; see ADR-0006                          |
| Canvas / editor-ui / exporters | Mostly placeholders, retained without new runtime abstraction                | Implement only when a vertical slice needs behavior                       |
| Agent                          | Typed bounded browser contract; external identity/permissions deferred       | Origin metadata is not authenticated identity or authorization            |

## Permission design (Proposed)

| Capability  | Permitted effect                                                                     | Approval boundary                                                       |
| ----------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Read        | Scoped document summary, slides, stable IDs/properties, revision, allowed operations | Explicit document scope; never implies third-party or filesystem access |
| Propose     | Return command/diff without adopting state                                           | No writes; schema validation still required                             |
| Preview     | Render a proposed/current snapshot in isolated runtime                               | No script/network grant; screenshots require matching scope             |
| Apply       | Adopt a validated command at exact expected revision                                 | Explicit actor capability, trusted identity, Core dispatch and audit    |
| Destructive | Delete/overwrite/execute untrusted code                                              | Separate explicit confirmation; Apply does not imply it                 |

P2A exposes human-only native file dialogs through the existing authenticated shell. It does not
grant file access to Agent transports or Aura guests. A future Agent must use the same command
service, not directly edit JSON, private Core state or on-disk files. Proposals/diffs are designs,
not new implemented tools. The standalone UI follows owner-selected direction A; no full UI rollout.

## Budget and evidence

P2's initial 120 person-hours are a validation budget, not a release date. Conditional 600/1800/3600
hour gates are uncommitted. Evidence must distinguish Implemented, Verified, Proposed, Deferred and
Not Supported. Production promises follow tests, not placeholder package names or CI totals.

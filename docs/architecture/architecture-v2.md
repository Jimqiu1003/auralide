# Architecture V2 — bounded alignment

Status: **Proposed** target responsibilities; P2A is an experimental implementation, not approval of
all future features. [ADR-0005](../decisions/ADR-0005-application-and-persistence.md),
[ADR-0006](../decisions/ADR-0006-html-compatibility-boundary.md).

Human UI / CLI / future MCP → application policy and command API → pure Core Dispatcher/history.
Application services call storage, preview and export adapters; adapters never own document edits.
The Electron document session is the current application service. CLI remains a deterministic
in-memory Core demo; a shared external Application API is **Deferred**, not duplicated here.

| Layer                          | Actual state / responsibility                                                                  | Boundary                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Core                           | Schema 1.1, commands, conflicts, immutable snapshots, undo/redo                                | No UI, filesystem, platform or model-provider dependency                  |
| Main application session       | Command adoption, resource collection, canonical source patches and serialized file operations | Asserts human origin, validates revision, owns live state and file grants |
| Storage adapter                | Validated legacy JSON / bundle v2, bounded read, staged write/backup/replace                   | Receives only main-authorized paths; no renderer file API                 |
| Renderer                       | Pure model-to-HTML preview with embedded asset references                                      | Escapes data; no document ownership or resource privilege                 |
| HTML Bridge                    | Bounded native conversion, detached source scan/patch helpers                                  | No universal lossless import claim; see ADR-0006                          |
| Canvas / editor-ui / exporters | Shell editing, source controls and shared offline HTML player adapters                         | No live DOM authority or specialized chart/Canvas editor                  |
| Agent                          | Typed bounded browser contract; external identity/permissions deferred                         | Origin metadata is not authenticated identity or authorization            |

## Permission design (Proposed)

The owner-authorized 2026-10-21 increment adds bundle/source adapters on top of these boundaries:
Core 1.1 stores asset IDs, source revisions, media and dynamics; the main document session owns asset
bytes, serialized file operations and source patches. HTML Bridge performs detached source scans and
canonical patches. Exporters validate bundle v2 and emit the shared offline player. Source selection
uses a separate inert native view; script-enabled playback uses its own unprivileged session.
Neither guest can mutate Core or access file grants. The native/source distinction and compatibility
limits are specified in [ADR-0006's dated extension](../decisions/ADR-0006-html-compatibility-boundary.md).

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

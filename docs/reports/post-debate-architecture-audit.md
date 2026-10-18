# Post-debate architecture audit

Date: 2026-10-15. Scope: current code and P2A, not a rewrite. Issue #22.

## Observed baseline

Canonical main remains `049cc2d`; fetched remote main is `2e63f41`, containing merged PR #14
head `2802a23`. New work starts from reviewed, unmerged P1.5 stack #19/#20/#21, isolated at
`410d6f1` in `feat-p2a-durable-documents`. All historical worktrees and dirty files remain preserved.
P1.5 Windows/macOS ARM64 CI passed at Aura head `65be406`; actual native ARM64 artifacts contain
155 smoke checks, not only a build architecture argument. This is prior baseline evidence, not P2A.

| Audit question                             | Code evidence / disposition                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage incorrectly called P1 implemented? | Yes in inherited overview; corrected in P1.5. P2A now adds actual snapshot persistence, not historical persistent undo                                                                                              |
| Phase/platform drift?                      | README still starts with historical P1 status while AGENTS says P1.5. Update current entry points to experimental P2A and link historical reports; ADR-0003 fixes Windows x64/macOS ARM64                           |
| Empty modules?                             | Canvas/editor-ui/html-bridge/exporters still export layer placeholders; keep as cheap boundary markers, explicitly deferred, no claimed functionality                                                               |
| Second content writer?                     | Desktop adopts successful Core dispatch; CLI uses same applyCommand. React changes local UI state only; Aura render/inspect is read-only. Hydration must validate and reset state in main, not accept renderer JSON |
| History memory?                            | Core stores full before/after snapshots and parses/freezes snapshots; O(edits × document size). No cap or long-session benchmark. Keep semantics; do not optimize speculatively. Record large-document gate         |
| Persistence ownership?                     | Node-only main adapter behind native dialogs/application session. Core stays pure; no filesystem bridge to guests                                                                                                   |
| Renderer vs HTML Bridge?                   | Pure native-to-HTML output exists; general conversion/sanitization is not integrated. Proposed ADR-0006 defines immutable source and explicit loss boundary                                                         |
| Agent identity/revision/permission/audit?  | Main overwrites desktop claimed origin; Aura metadata says human/desktop. Neither is external Agent authorization. Bounded in-memory audit is not durable identity/security logging                                 |
| Real macOS validation?                     | CI checks native Node/Electron process arch, uname, hardware flag and Rosetta; actual prod/dev windows passed. Physical monitor/screen-reader/pixel parity remain unverified                                        |

## Decisions and scope

Retain Electron/React/TypeScript/pnpm/Zod and existing Core. No new dependency or folder migration.
Architecture V2 and ADR-0005/0006 are **Proposed**, pending owner review. P2A implements only the
explicitly authorized save/reopen slice. It does not make HTML, MCP, export or chat an exclusive
technical advantage. Differentiation remains shared human/Agent structured edits, reversibility,
visual authoring and trustworthy local preview. Full Agent permissions/diff and UI work are deferred.

Owner selected UI direction A; this decision approves a layout direction, not every component or
execution permission. Initial 120-hour validation budget and later conditional budgets are not dates
or spending commitments. Exact P2A tests/results belong in its implementation report after execution.

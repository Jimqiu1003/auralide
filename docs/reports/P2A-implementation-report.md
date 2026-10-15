# P2A — Durable Document Foundation

Date: 2026-10-15. Lead implementation, sequential execution without sub-agents. Issue
[#22](https://github.com/Jimqiu1003/auralide/issues/22). Status: **Implemented and verified on Windows x64 and native macOS ARM64**;
native CI gate recorded below. Architecture V2 and ADR-0005/0006 remain **Proposed** for owner review.

## 1. Existing State

Canonical main `049cc2d` remains untouched; fetched origin/main `2e63f41` contains merged #14.
Unmerged P1.5 stack #19 → #20 → #21 supplies platform CI, Aura POC and design/skills. P2A branch
`feat/p2a-durable-documents` starts at `410d6f1` in sibling worktree `feat-p2a-durable-documents`.
The incremental PR depends on #21; retarget after prerequisites merge, rerun checks, never auto-merge.
Historical dirty worktrees/branches are preserved. No Core source or dependency version is changed.

Before this increment, desktop documents lived only in memory. Actual P1.5 Aura CI at `65be406`
passed on Windows x64 and native macOS ARM64; that evidence does not substitute for P2A testing.

## 2. Lessons Applied

Kept the independent Electron/React/TypeScript product and existing schemas/Dispatcher rather than
rebuilding. The P2 validation budget is not a deadline. Explicitly bounded HTML compatibility and
Agent permissions instead of claiming generic lossless conversion or treating provenance as auth.
Owner-selected A remains the design direction; no full UI rollout, parser, database or cloud added.
Placeholder layers are retained and labeled deferred. Corrected current phase/storage/platform
entry points while preserving historical ADRs/reports.

## 3. Architecture V2

Main document session is the small current application service. It serializes file operations,
asserts human edit origin and adopts only successful Core command state. The main-only Node adapter
handles disk I/O; Core remains independent of Electron, DOM, filesystem and providers. Renderer asks
for named Open/Save operations with expectedRevision, never a path or substitute document.

Proposed ADR-0005 makes P2A a **snapshot**, not persistent undo history. Reopen validates content,
starts empty history and advances revision above both the previous live and loaded revisions,
preventing stale in-process edits/previews from becoming valid again. At the safe integer limit it
refuses. Save preserves current revision. Cross-process event IDs and persistent history are deferred.
Proposed ADR-0006 retains immutable source provenance, explicit conversion losses and opaque content
for unsupported HTML; no implementation of universal conversion is implied.

## 4. Implementation

- `src/main/document-files.ts`: schema/UTF-8/regular-file/20 MiB validation, bounded reads, SHA-256
  disk stamps, exclusive same-directory temporary write + flush, unique recovery backup and rename.
  New targets use exclusive link creation so a newly appeared file is not overwritten.
- `src/main/document-session.ts`: strict revision-only requests, file binding only after success,
  cancellation/failure preservation, serialized file operations, edit refusal while busy, validated
  reopen and revision fencing. No second ordinary content-edit path.
- Main/preload/shared contract: named `saveDocument` / `openDocument`, bridge 1.3.0. Existing exact
  sender/main-frame/URL/arity guards apply. Native dialogs grant paths only in main; Open over dirty
  state and Close require explicit discard. Close is refused while a file operation is in progress.
- Workbench: minimal Open/Save controls and typed errors. No arbitrary file API, Agent filesystem
  access, automatic reopen/retry/overwrite, Save As system or full editor implementation.
- Storage/session unit tests, actual Electron persistence test and native CI step; existing smoke
  updates its asserted bridge contract. Synthetic smoke teardown explicitly destroys its test
  session; user-facing close confirmation is separately exercised by the persistence test.
- Architecture V2, P2 plan, audit, ADR-0005/0006, README/AGENTS/overview/platform documentation.

No fixtures or docs in human QA-owned zones changed. Exact file list: the PR diff / `git show --stat`.

## 5. Verification

Local environment: Windows x64; Node 24.21.0, Electron 44.7.2, Vitest 5.0.4, pnpm 12.11.2.

| Command / behavior                                  | Actual result                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                    | PASS, locked existing dependencies only                                                                             |
| `pnpm format` / `pnpm verify`                       | PASS, formatting/lint/typecheck/test/build. Unchanged Turbo tasks used shared cache; changed desktop tasks executed |
| `pnpm --filter @auralide/core test`                 | Direct PASS, 73 tests; existing six commands/revision/undo/redo regressions                                         |
| `pnpm --filter @auralide/cli test` / CLI demo       | Direct PASS, 7 tests; demo produces valid revision-1 Core document                                                  |
| Desktop Vitest                                      | PASS, 16 tests; 5 new storage/application tests plus existing 11                                                    |
| `node --test scripts/qa/platform-evidence.test.mjs` | PASS, 1 validator self-check                                                                                        |
| `pnpm --filter @auralide/desktop smoke`             | Actual production/development windows, 155/155 PASS, existing security/CSP/Core/Aura probes retained                |
| `node apps/desktop/test/persistence.electron.mjs`   | Actual windows/process restart + real disk adapter, 22/22 PASS                                                      |
| `node apps/desktop/test/wireframes.electron.mjs`    | PASS, 12 views, themes, shortcut hints, keyboard focus, narrow viewport; A selected                                 |
| `git diff --check`                                  | PASS                                                                                                                |

Storage negatives: corrupt JSON and invalid UTF-8/schema, directories, >20 MiB, invalid save state,
external disk edits, rename failure with exact original/backup preservation, new-target appearance,
invalid/path-bearing requests, cancelled dialogs/discard, busy serialization, stale revisions and
revision exhaustion. No test deletes meaningful checks to pass.

Real integration: human text edit → save → edit/resave → exact old backup → reject stale/path/forged
sender requests → decline/accept unsaved discard → close saved window → new process → native-dialog
authorized reopen → stable-ID HTML inspection reads saved content. Corrupt Open preserves state;
cancel Close preserves unsaved work; explicit discard closes without modifying the saved snapshot.
Only native dialog responses are stubbed. OS dialog usability and actual human clicks are **not**
verified by this integration test.

Initial direct desktop tests/typecheck in the fresh worktree failed because dependency `dist`
outputs were not built. `pnpm build` supplied them; the checks then passed. This setup failure is
recorded, not counted as a successful initial run. A later read-change guard was accidentally placed in the write routine in checkpoint 08144bb, causing four unit failures; the misplaced guard was moved into readBytes, then full verify, 155 smoke checks and 20 persistence checks passed again. The failed checkpoint remains visible in Git history; it is not the review head. Final exact-head CI is tracked below.

Ignored evidence: `apps/desktop/test-artifacts/{production,dev,persistence}.json`,
`p2a-reopened.png`, `p2a-html-preview.png`, `persistence-*/` saved/backup fixtures, and wireframe screenshots/results.

## 6. Risks

1. **Medium:** snapshot history remains O(edits × document size) in memory; the 20 MiB file cap does
   not bound history. No large-document/long-session benchmark or history compaction is claimed.
2. **Medium:** normal I/O failures preserve the original; adversarial cross-process replacement in
   the final fingerprint/rename interval and full power-loss/directory-journal durability are not
   guaranteed. Concurrent multi-process editing needs a future locking/conflict design.
3. **Medium:** undo history resets on reopen; revision rebasing is a Proposed session policy needing
   owner review. Persistent undo/audit/version recovery is not implemented.
4. **Low:** recovery backups accumulate; no automatic deletion or retention policy. Temp cleanup
   can leave an owned temp file after an OS cleanup refusal; it never truncates the original.
5. **Unverified:** real file-dialog/menu interaction, screen reader, physical DPI/mixed monitors,
   power-loss injection and identical font rasterization. Remote native CI evidence is separate.

Not Supported: arbitrary HTML/JS conversion/execution, unsupported target builds, Agent direct file
access, production packaging/signing/notarization/release. Deferred: general Agent auth/Apply/diff,
new-document workflow/full editor, assets, exports, migrations, persistent command history.

## 7. Next Iteration

Build one authorized Agent proposal/apply slice through the existing application session: read IDs
and revision → propose/diff → explicit Apply grant → Core command → conflict rejection → undo and
HTML verification. CLI/MCP must share this service rather than duplicate edit logic. Acceptance:
proposal does not mutate, unauthorized/stale/destructive requests refuse, successful edit is attributed
and undoable. Scope and permission ADR review precede exposing an external transport.

## 8. Git Delivery / native gate

Branch: `feat/p2a-durable-documents`; [PR #23](https://github.com/Jimqiu1003/auralide/pull/23). Implementation c57c4a8b7498e15809cf758b0bcbe81b1087e5c0 passed [native CI 38752711796](https://github.com/Jimqiu1003/auralide/actions/runs/38752711796): Windows x64, macOS ARM64 and aggregate success. Downloaded macOS persistence.json reports 20/20 workflow checks; platform.json records Node 24.20.0 / Electron 44.7.2 ARM64, uname arm64, hardware=1, translated=0. Final implementation/test head 9af5b05adb8c10cad42d39a9b03b77feba309edc passed [CI 38753293317](https://github.com/Jimqiu1003/auralide/actions/runs/38753293317), both native jobs and aggregate. Downloaded ARM64 persistence.json confirms 22/22 checks; its native HTML PNG was visually reviewed alongside the Windows PNG. This includes the two added screenshot assertions. Evidence was rechecked on 2026-10-16. The report-only commit records these fixed implementation heads; its own hash is available in Git history. The latest exact
head CI must pass Windows x64 and native macOS ARM64 before recommending integration. ADR-0005 and
ADR-0006, snapshot/history policy and stacked PR merge order require owner review. Nothing merges
automatically; main and existing worktrees remain preserved.

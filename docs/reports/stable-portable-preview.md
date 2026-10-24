# Auralide 0.2.0-preview.1 — stabilization and portable candidate

Date: 2026-10-18. Owner/implementer: Lead Engineer (Codex). Product reviewer: Jim.
Status: implementation candidate; Owner five-minute scenario and independent QA acceptance pending.
Scope: M0–M2 engineering work from [the execution plan](../architecture/next-stage-plan.md).

## Actual result and provenance

- #20 (`68b2164`), #21 (`7fdcf98`) and #23 (`dc259b7`) passed Windows x64/native macOS ARM64 CI
  and were merged normally; stable main is `19a31d4`. No force push or main-protection bypass.
- `feat/stable-portable` starts from the corrected P2A lineage. The final A2/file delta is ported
  from `06a01ed..fb94ee7` (#24/#27/#28/#29), rather than merging the rejected Demo 0.1 default UI.
  Original branches, historical evidence and the dirty `feat-demo-v01` worktree are preserved.
- T05–T07: final A2, limited HTML import/loss review/source retention, JSON/HTML Save As and offline
  HTML export. Migration regression required explicitly selecting Format before editing in the
  existing diagnostics test; the real production Shell remains free of those probes.
- T08–T10: additive Core properties/order commands; typed main-authorized history bridge 1.6;
  numeric geometry, text/shape styles and paint-order controls; Ctrl/Cmd document shortcuts outside
  inputs; basic current/first-slide presentation with navigation and Escape return.
- T11 engineering: existing isolated Electron tests plus a new real editing/save/restart suite.
  The same suite runs against the built source app and the actual packaged EXE. Native file choices
  are stubbed only in tests; file I/O, IPC, security checks, document/history and processes are real.
- Packaging reuses #25's official Electron + Vite main bundling. Each output has a unique directory,
  source SHA, version, instructions, licenses and example document. No previous build is deleted.

## Tasks, ownership and acceptance

Assigned branch/worktree: `feat/stable-portable` / sibling worktree of that name; one sequential writer.
Writes: `apps/desktop`, additive Core command/tests, renderer paint-order output, CI and Lead-owned
architecture/reports. Human-owned `tests/fixtures/html/**` and `docs/qa/**` are untouched.
Dependencies: corrected M0 commits. Outputs: source commit + draft PR, verified Windows portable
directory/ZIP, runtime evidence and concise user handoff. No external Agent, plugin runtime or new dependency.

## Verification ledger

- M0: uncached Turbo lint/typecheck/test/build 30/30 tasks; local smoke 165/165; persistence 25/25.
- Migrated A2/files before additive editing: verify PASS; smoke 177/177; persistence 25/25;
  Shell 49/49; file workflows 41/41 on real Windows x64 Electron.
- Additive editing: full `pnpm verify` PASS; source Electron editing 20/20 checks, including invalid
  geometry preservation, object styles/order, undo/redo, presentation and actual save/restart/reopen.
- Source screenshots inspected; no whole-page/panel overflow observed in the initial native capture.
- Final source regression: smoke 177/177, persistence 25/25, Shell 49/49, files 41/41 and editing
  20/20 PASS on Windows x64. Presentation additionally suspends native Aura guests during resize.
- #7/#8/#9/#15/#16/#17/#22 closed after merged verification; #8's historical Undo wording was
  clarified to mean content restoration with monotonic revision. #10/#11/#18/#26 remain open.
- Final full regression, native CI and packaged EXE evidence are recorded with the artifact manifest
  and the final delivery summary. Earlier results do not assert that a later untested build passed.

## Remaining boundaries and next work

ADR-0003 is Accepted; ADR-0004 is Accepted for bounded POC; ADR-0005/0006 remain Proposed. Current
implementation is a bounded experiment, not silent approval of all proposed persistence/HTML policies.
No schema version change; saved content uses JSON 1.0. Paint order follows the element array; legacy
`zIndex` is retained in data and does not override array paint order. No arbitrary lossless HTML claim.

History is session-only, full-snapshot and currently unbounded. Backups accumulate; disk conflict
fingerprints are not hostile multi-process locking or power-loss durability. No automatic deletion.
Resize is numeric; freeform resize handles, rich text, media assets, persistent version UI, Agent Apply,
PDF/PPTX and extension installation remain later work. Native input and document undo are separate.

Preview is unsigned Windows x64, not a published release or installer. Keep the entire portable folder
together; `Auralide.exe` needs its accompanying Electron libraries and resources. macOS packaging,
signing/notarization, screen-reader, physical mixed-DPI and hands-on macOS acceptance are NOT RUN here.
CI's native macOS results are reported separately after they complete. Issue #26 must remain open
until Jim accepts the real scenario; #10/#11/#18 retain independent QA ownership.

Next: Owner tries the bundled example and five-minute workflow; resolve reported issues before
converting the replacement PR to Ready. Only then retire superseded #27/#28/#29; #24/#25 stay Draft.
M3's capability/Agent proposal gate and M4's assets/versions/HTML extensions remain deferred.

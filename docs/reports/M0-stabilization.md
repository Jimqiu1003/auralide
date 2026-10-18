# M0 stabilization — execution evidence

Date: 2026-10-18. Owner: Lead Engineer. Reviewer: Jim / Compatibility & QA Engineer.
Plan: local `docs/stabilization-next-stage` at `d9a5acd` (not yet merged).
Status: T01 implemented and locally verified; integration/native macOS evidence pending.

## T01 — Aura renderer state

- Assigned branch/worktree: `feat/p15-foundation-integration`, existing clean PR #20 worktree.
- Base: merged platform main `72bcec5`; merge-only update, no rewritten history.
- Writes: `apps/desktop/src/renderer/aura-poc.tsx`, `apps/desktop/test/aura.probes.mjs`, this report.
- Acceptance: close active Lab → remaining preview selected/visible; edit document → Diagnostics
  succeeds with current revision and returns the old preview's revision plus `stale: true`.
- Before fix: real production/dev smoke failed remaining-tab selection and visibility.
- After fix: `pnpm verify` PASS (unchanged packages may use Turbo cache); Electron production/dev
  smoke 165/165 PASS. No IPC/schema/security relaxation. Closing a tab returns focus to the surviving
  tab button or preview entry. Screen-reader/manual macOS acceptance NOT RUN locally.
- Skills: Ponytail; accessibility-lead checks applied sequentially under project single-agent rule;
  React Doctor changed-scope regression result recorded at final delivery.

Do not infer main integration, Owner acceptance or a distributable from these local checks.

## T03 — Closed-window document lifecycle

- Assigned branch/worktree: existing clean `feat/p2a-durable-documents`, PR #23; merged T01/T02.
- Writes: main/session lifecycle, existing persistence unit/Electron suites and this report.
- Contract: Cancel preserves everything. Only native `closed` ends the session; a later activation
  starts a clean welcome document, empty history and no old file binding at a newer revision.
  Pending native file operations still block close. Disk content is never rewritten by discard.
- Unit checks cover clean reset, revision fencing, cancelled fresh Save and unchanged disk bytes.
- Real persistence test now waits for native window closure, keeps the process alive, activates a
  new window and verifies discarded content does not return and the previous file grant is gone.
  Windows simulates only macOS's keep-alive policy; actual macOS execution remains a CI gate.
- Local `pnpm verify` PASS; persistence 25/25 PASS. Initial lifecycle test raced renderer teardown
  against native `closed`; it now awaits the actual native event, not a fixed delay. Activation
  cannot replace a main window that is still being closed. No diagnostic logging retained.

T01 native CI initially caught a renderer-selection assertion before React committed its update.
The assertion now awaits the selected state with the existing bounded wait; it still fails for the
original bug. This is synchronization, not removal of the regression assertion.

## T02 — Distinct reference workspace states

- Assigned branch/worktree: existing clean `docs/p15-ui-system`, PR #21; merged T01 additively.
- Writes: `docs/design/workspace-wireframes.html`, `apps/desktop/test/wireframes.electron.mjs`, this report.
- B Agent now places proposal review in the main stage. C Design exposes layers; C Agent exposes
  audit; C Aura has exactly one diagnostics panel. A/B/C each have four distinct content states.
- Before fix: strengthened Electron assertion failed B Agent main-stage content (0 instead of 1).
- After fix: `pnpm verify` PASS; real Electron wireframes PASS across 12 states, Light/Dark/System,
  Ctrl/Cmd hints, keyboard focus and 960px layout, with no page errors. Reference prototypes only.
- T01 React Doctor changed-scope: 86/100; two pre-existing warnings (handler state/redundant status
  role), no project dependency/config installed. No screen-reader or native macOS manual claim.

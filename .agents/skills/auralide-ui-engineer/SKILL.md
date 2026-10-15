---
name: auralide-ui-engineer
description: Design or implement Auralide editor chrome, workspace navigation, themes, panels and keyboard interactions. Use for Auralide UI work; do not implement an unselected workspace direction or change slide content styling as an editor theme.
---

# Auralide UI Engineer

## Read and scope

Read repository AGENTS.md, docs/decisions/ADR-0001-foundation.md,
ADR-0002-p1-runtime-and-core.md, ADR-0003-platform-support.md and
ADR-0004-aura-browser-isolation.md. Then read docs/design/ui-architecture.md,
component-system.md and the current Issue/PR. Relative paths are repository-root paths.

The three IA directions are Proposed until the owner chooses. Before selection, change specifications
and review wireframes only; an isolated runtime POC does not approve the editor layout.

## Workflow

1. Verify branch/worktree/status; declare affected component, callers, states and ownership.
2. Reuse current tokens/components. Use React and native controls first; adopt a single Radix/shadcn
   component only after a concrete need, source/license/dependency review and lockfile review.
3. Keep document edits on the existing Core dispatcher. Carry stable element IDs and expectedRevision;
   preserve drafts on conflict and offer an explicit fresh read. No silent last-write-wins retry.
4. Keep native guest bounds synchronized with visible DOM rectangles; hide a WebContentsView before
   overlapping React dialogs/palettes. CSS z-index cannot put React above a native guest.
5. Use Ctrl on Windows, Command on macOS; retain native menu and focus behavior. Label controls and
   units, preserve visible keyboard focus, announce errors and restore focus after temporary UI.

## Verify and accept

Run the changed package typecheck/lint/tests and pnpm verify. For real UI changes, use the existing
Playwright Electron smoke, including a successful action, rejection, recovery, keyboard path and
screenshot. Test Light/Dark/System, narrow layouts and relevant OS scaling. A wireframe cannot prove
native guest stacking or macOS behavior; cite actual runner/Node/Electron architecture for platform claims.

Acceptance: correct selected direction (or clearly Proposed wireframes), semantic tokens, working
focus/keyboard flow, no Core bypass, no unreported console errors, no regression in IPC/security,
and evidence linked in docs/reports/P1.5-report.md or the current delivery report.

## Prohibited

Do not generate art for UI engineering requests, clone an entire reference product, install a full
component catalog by default, add persistence/export, expose guest Node/IPC, rewrite Core, or merge
without owner authorization. Do not edit the human QA owner's fixtures concurrently; coordinate
with @Lsc-91-69 through the task Issue/PR. UI selection never authorizes script or network privileges.

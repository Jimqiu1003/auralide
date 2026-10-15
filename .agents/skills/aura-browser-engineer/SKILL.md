---
name: aura-browser-engineer
description: Build or review Auralide Aura Browser WebContentsView lifecycle, preview rendering, session isolation and structured inspection tools. Use for Aura runtime and Agent Browser contracts, not general browser automation or unrestricted third-party extraction.
---

# Aura Browser Engineer

## Read and scope

Read AGENTS.md, accepted ADR-0001 and ADR-0002, platform ADR-0003 and Aura ADR-0004,
then docs/architecture/aura-browser.md, agent-browser-contract.md and platform-support.md.
Read the assigned Issue and real IPC/preload callers before editing. Paths are repository-root paths.

## Workflow

1. Inspect current branches/worktrees and identify who owns shell, guest, contract and tests.
2. Keep HTML source separate from Core truth. Use packages/renderer public pure rendering functions
   for Core previews; do not create a parallel document mutation or export pipeline.
3. Use WebContentsView with contextIsolation/sandbox/webSecurity true, nodeIntegration/webviewTag false,
   no guest preload, separate nonpersistent sessions, denied permissions/popups/downloads and a
   resource allow-list. POC scripts and network remain disabled; HTML Lab loads the reviewed fixture only.
4. Validate named tool parameters with packages/agent Zod schemas. Resolve elements by stable ID,
   check revision before and after asynchronous work, return typed refusal and bounded diagnostics.
   Internal inspection code must be fixed and reviewed; never accept JavaScript or selectors as tools.
5. Convert DOM CSS coordinates to Electron DIP once using shell zoom, not devicePixelRatio. Clip to
   content bounds; hide guests for overlaps/minimize and dispose webContents on close/window teardown.
6. Record bounded metadata audit with a trusted caller identity. A preview capture does not authorize
   reading a third-party page; external agent authentication and research grants need a separate gate.

## Verify and accept

Run pure contract/render/policy/lifecycle tests, desktop typecheck/lint, pnpm verify and real Electron
smoke for production and development. Exercise invalid tool fields, arbitrary URL/script rejection,
network/permission refusal, guest bridge absence, stale revision, resize/zoom/overlay, tab close and
window teardown. Capture the actual guest via preview.screenshot and verify a PNG; shell screenshots
alone do not prove native guest output. Record host, Node and actual Electron architecture.

Acceptance: isolated view operates, stable ID inspection agrees with Core, no publicly supplied code
executes, failed/stale tools preserve document state, resource counts return to baseline, and reported
platform results match observed evidence. Mark unavailable hardware, features and tests NOT RUN.

## Prohibited

No deprecated BrowserView, webviewTag=true, generic guest IPC/filesystem, raw executeJavaScript tool,
implicit sensitive-page scraping, automatic navigation/capture consent, animation permission changes,
Core rewrites, full editor development or unapproved merge. Design Web Research and controlled scripts
separately before implementing them; coordinate human-owned corpus work with @Lsc-91-69.

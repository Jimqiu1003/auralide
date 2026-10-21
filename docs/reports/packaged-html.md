# Packaged HTML — staged delivery

Owner request: 2026-10-21. Stage 1 branch: `feat/packaged-html`, based on PR #30 at `6f72d13`.
Stage 2 branch: `feat/source-visual-editing`, stacked on Stage 1. No main merge or existing-worktree modification.

## Stage 1 behavior

- Offline, editable bundle v2; SHA-256 deduplication/integrity validation; final HTML and native
  resource files capped at 100 MiB including encoding; structured document capped at 20 MiB.
- Images, embedded fonts, audio/video, fade/slide transitions, page/click entrances, full screen,
  keyboard controls, reduced motion and pause/unload on page changes.
- Dynamic source HTML keeps its whole document/module/CSS graph in a sandboxed component. Script
  execution is an explicit playback toggle, separate from inert editor/Aura/import inspection.
- Missing/ungranted resources, private destinations, unsupported computed/API dependencies and
  cycles refuse packaging. Local resources need a native directory grant. Remote collection is an
  explicit prompt, uses public HTTPS with pinned DNS, and sends no ambient credentials.
- HTML metadata is restored without executing source; native JSON saves retain the same asset set.
  Export preserves file binding/dirty/history. Legacy-upgrade saves require a different path.

## Verification

Windows x64 authoring host, Node 24.21.0, Electron 44.7.2:

- `pnpm verify`: PASS, 123 unit tests across Core, CLI, exporters and desktop.
- `node apps/desktop/test/bundle.electron.mjs`: PASS for real Electron import/export/restart,
  source default-disabled scripts, module graph, CSS, PNG decoding, interaction and bridge absence;
  real Edge opens the exported file with network offline and zero HTTP requests.
  Native WAV/WebM decoding, click entrances, reduced motion and page-change pause also pass.
- Existing `file-io.electron.mjs`: 41 PASS; `editing.electron.mjs`: 20 PASS;
  desktop production/development smoke: 177 PASS.
- Local ignored evidence: `apps/desktop/test-artifacts/bundle/result.json`, `offline-player.png`,
  `bundle-editor.png`, `edge-offline.png`. Stage 1 PR [#34](https://github.com/Jimqiu1003/auralide/pull/34)
  at `256c2bc` passed both native Windows x64 and macOS ARM64 CI targets:
  [run 39546976172](https://github.com/Jimqiu1003/auralide/actions/runs/39546976172).
  Remote CDN collection has deterministic refusal tests;
  successful live CDN downloads and arbitrary third-party libraries are NOT a compatibility claim.

## Limits

The static resource resolver intentionally refuses unsupported forms rather than guessing: srcset,
HTML base/nested pages/plugins, escaped/complex CSS URLs, computed JS addresses, fetch/XHR/sockets,
workers/eval and module cycles. Browser media codecs/autoplay policies still apply. Embedded source
CSS/layout is preserved, including original overflow; system-font metrics can differ by platform.
No PDF/PPTX, plugin system, persistent undo history, automatic merge or signed release is included.

## Stage 2 behavior and verification

The internal editor selects ordinary canonical source nodes in an inert native view. It supports
leaf text, image/font replacement, font/colour/background/border/opacity/size and relative layout
offsets, through the same revision-checked Core history. Source replacement rechecks dependencies;
missing nodes, stale revisions and conflicting input are refused with current content retained.
Source drafts survive closing the panel within the session. Runtime DOM, script-created nodes,
Canvas/WebGL and chart models are not new writing authorities or specialized visual editors.

Changed boundaries: HTML Bridge scan/patch helpers; shared typed IPC/preload; main source controller
and document session/resource collector; React internal editor and inspector; exporter active-resource
closure; unit/Electron fixtures and CI. No new runtime dependency is needed for Stage 2.

Local command/evidence paths (all under the Stage 2 worktree):

- `pnpm verify` — formatting, lint, strict types, unit tests and production build.
- `node apps/desktop/test/source-editing.electron.mjs` — real source guest and native pointer,
  styles/text/image/font, history, stale-node rejection, failure/draft recovery, restart and playback.
  Evidence: `apps/desktop/test-artifacts/source-editing/result.json`, `source-editor.png`,
  `source-native.png`. Shell screenshots exclude native child views; the separate native capture
  records the actual edited source.
- `node apps/desktop/test/bundle.electron.mjs`, `file-io.electron.mjs`, `editing.electron.mjs`
  and `pnpm --filter @auralide/desktop smoke` cover the original file/security/editing surfaces.

Local results: `pnpm verify` PASS (126 unit tests); source-editing Electron suite 48 PASS;
bundle suite 36 PASS; file I/O 41 PASS; basic editing 20 PASS; production/development smoke 177 PASS.
The source suite includes import → edit → export → real shutdown/reopen → edit → second export,
with font resources, relative translation, appearance and original provenance retained.
It also guards against the parser guest's CSP discarding previous inline styles during later patches.

The Stage 2 native CI result is recorded after execution below. Physical mixed-DPI
monitor transitions, screen-reader/manual acceptance and arbitrary third-party script compatibility
remain NOT RUN; CI is native automated validation, not owner acceptance or release approval.

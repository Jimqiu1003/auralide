# Packaged HTML — staged delivery

Owner request: 2026-10-21. Stage 1 branch: `feat/packaged-html`, based on PR #30 at `6f72d13`.
Stage 2 follows on a separate branch/PR. No main merge or existing-worktree modification.

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
  `bundle-editor.png`, `edge-offline.png`. Native macOS ARM64 is NOT RUN locally; the new bundle
  suite runs in both native CI targets. Remote CDN collection has deterministic refusal tests;
  successful live CDN downloads and arbitrary third-party libraries are NOT a compatibility claim.

## Limits

The static resource resolver intentionally refuses unsupported forms rather than guessing: srcset,
HTML base/nested pages/plugins, escaped/complex CSS URLs, computed JS addresses, fetch/XHR/sockets,
workers/eval and module cycles. Browser media codecs/autoplay policies still apply. Embedded source
CSS/layout is preserved, including original overflow; system-font metrics can differ by platform.
No PDF/PPTX, plugin system, persistent undo history, automatic merge or signed release is included.

Stage 2 internal visual editing and its evidence are pending in the follow-up PR.

# Platform support

Owner contract, 2026-10-15; [ADR-0003](../decisions/ADR-0003-platform-support.md), Issue #15.

| Target                                                    | Contract                        | Validation at authoring                                                 |
| --------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| Windows x64                                               | First release                   | Local validation reported with the delivery; CI must independently pass |
| macOS ARM64 / Apple Silicon                               | First release                   | Native ARM64 CI startup and Aura smoke PASS; physical manual QA pending |
| Windows ARM64                                             | Future                          | No build job                                                            |
| Linux                                                     | Future, architectures undecided | No build job                                                            |
| macOS Intel / Universal, Windows x86, unspecified targets | Unsupported                     | No build job                                                            |

## Runtime boundaries

Core remains JSON data, schemas and commands with no Electron, DOM or operating-system imports.
CLI uses Node and the same Core dispatcher; it must avoid shell-specific invocation inside its code.
Main owns filesystem and window capabilities. Platform menus live in `src/main/platform.ts`; the
application installs the returned template after Electron readiness. Native copy/cut/paste/select-all
operate on focused text controls. Document undo/redo and future shortcuts must use Core and cannot be
replaced by native text-edit undo roles.

macOS uses its native application and Window menus, Command text shortcuts, closes windows without
quitting and recreates its window on activation. Windows uses Ctrl text shortcuts and quits after the
last window closes. P1 already implements that lifecycle in `main.ts`.

Use `node:path`, `fileURLToPath` and `pathToFileURL` rather than concatenated drive letters or URL paths.
Session and document logic must not depend on path casing, separator style, cwd or another user's
worktree location. Save/replace behavior on case-sensitive filesystems remains a storage-phase gate;
P1 currently has no persistent document writes.

## Audit of inherited paths and scripts

| Area              | Observed behavior / action                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core / CLI        | No Windows-only runtime paths found in their document flow; keep the boundary enforced by lint                                                                                                                      |
| Desktop launch    | Resolves Electron via the package and uses `spawn` arguments without shell; removes inherited `ELECTRON_RUN_AS_NODE`                                                                                                |
| Desktop smoke     | Starts Vite via Node's JS entry, avoiding `.cmd` quoting; Windows cleanup uses `taskkill`, other systems use `SIGTERM`                                                                                              |
| Worktree tooling  | `pnpm worktree` requires PowerShell 7; its default root is Jim's Windows drive. On macOS install `pwsh` and set `AURALIDE_WORKTREE_ROOT` or pass `-WorktreeRoot`; this is developer tooling, not an app requirement |
| Git hooks         | Shell tooling is a contributor prerequisite, not an application runtime dependency                                                                                                                                  |
| Menus / shortcuts | Platform adapter uses native roles, Command on macOS and Ctrl on Windows; no document mutation callback                                                                                                             |
| Fonts / scaling   | Current shell uses system fonts. Exact text metrics/pixels across OSs are NOT proven. Fix presentation font assets and test baselines before promising parity                                                       |
| View bounds       | Electron bounds are device-independent pixels; Aura Browser must convert DOM layout once, not multiply again by display scale factor                                                                                |

No unsupported platform packaging, production signing, notarization, automatic release or store task
is introduced. `pnpm build` builds application code; it does not generate an installer.

## CI verification and evidence

`.github/workflows/ci.yml` runs `pnpm verify`, the evidence validator self-check, a real Electron
identity launch and production/development smoke on `windows-2025` x64 and `macos-15` ARM64. The
`verify` aggregate keeps the existing required status name and fails if either target fails or is
skipped. Its Ubuntu runner only evaluates upstream job results; it does not build Linux software.

GitHub's current [runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
and [runner images](https://github.com/actions/runner-images) identify `macos-15` as ARM64 on public
repositories (checked 2026-10-15). Labels are not evidence: `platform-evidence.mjs` additionally
asserts Node `process.arch`, real Electron main `process.arch`, `uname -m`, `hw.optional.arm64` and
the Rosetta translation flag. An Intel/translated process fails the job rather than falling back.

Run from repository root, after installation and build:

```text
node --test scripts/qa/platform-evidence.test.mjs
node scripts/qa/platform-evidence.mjs win32 x64
pnpm --filter @auralide/desktop smoke
```

On native macOS replace the evidence arguments with `darwin arm64`. A desktop session is required.
CI uploads `apps/desktop/test-artifacts/` even after failure: `platform.json` records observed process
and hardware facts, smoke JSON records each assertion and screenshots show each load path and narrow
viewport. A missing artifact or failed startup is not PASS. Do not substitute cross-build arguments,
old P1 screenshots or test counts for actual macOS execution.

Local evidence on 2026-10-15: `pnpm verify` passed (desktop tasks executed, unchanged package tasks
reused the shared Turbo cache); the independent evidence validator self-check passed; actual Node
24.21.0 and Electron 44.7.2 both reported Windows x64; production/development desktop smoke passed
89/89 assertions. Evidence is under this branch's ignored desktop `test-artifacts/` directory.

The authoring host is Windows. Native macOS ARM64 Aura startup and production/development smoke passed in CI 38747803700 at 65be406; hardware and Electron process identity were checked in downloaded artifacts. See docs/reports/P1.5-report.md. P2A adds actual bounded document writes and its own native CI round trip; see docs/reports/P2A-implementation-report.md for that separate gate. Physical DPI, screen-reader and menu interaction acceptance remains pending. PowerShell is developer tooling only.

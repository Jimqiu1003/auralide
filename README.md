# Auralide

**AI-Native HTML Presentation Editor** — a local-first presentation editor that combines the visual
freedom of HTML/CSS/SVG with direct manipulation, on top of a structured document model that humans
and AI agents edit through the same validated command layer.

> Status: **P2A — experimental Durable Document Foundation**, on the unmerged P1.5 PR stack.
> Windows x64 and macOS ARM64 are the first-release targets. The desktop provides a Core-driven
> workbench, validated commands, isolated Aura preview and local JSON save/reopen. Undo history
> remains session-only; full editor UI, external Agent Apply, arbitrary HTML import and export are
> deferred. See [P2 plan](docs/architecture/p2-vertical-slice-plan.md) and
> [Architecture V2 proposal](docs/architecture/architecture-v2.md). Historical P0/P1 reports remain unchanged.

## Requirements

| Tool    | Version used by this repository | Notes                              |
| ------- | ------------------------------- | ---------------------------------- |
| Node.js | 24.x (Active LTS)               | `engines.node: >=24.0.0`           |
| pnpm    | 12.11.2                         | pinned via `packageManager`        |
| Git     | 2.55+                           | worktrees are part of the workflow |
| Python  | 3.12 (optional)                 | future tooling only, not required  |

## Setup

```powershell
# from the repository root
corepack enable pnpm      # or: npm install -g pnpm@12.11.2
pnpm install
pnpm build                # tsc + vite builds for every workspace package
```

## Scripts

Start the built desktop with `pnpm --filter @auralide/desktop start`. For development, run
`pnpm --filter @auralide/desktop dev` and `pnpm --filter @auralide/desktop start:dev` in separate
terminals after a build. Run `pnpm --filter @auralide/desktop smoke` to verify both modes in a
desktop session. `pnpm --filter @auralide/cli start --demo --json` proves headless Core dispatch.

Takeover evidence and preserved historical worktrees: [P1 Codex report](docs/reports/P1-codex-takeover-report.md).

| Command          | What it does                                              |
| ---------------- | --------------------------------------------------------- |
| `pnpm build`     | Turborepo build (TypeScript emit + Vite renderer bundle)  |
| `pnpm typecheck` | `tsc --noEmit` per workspace package                      |
| `pnpm lint`      | ESLint flat config, including architecture boundary rules |
| `pnpm test`      | Vitest unit tests for packages that define them           |
| `pnpm format`    | Prettier write                                            |
| `pnpm verify`    | format check → lint → typecheck → test → build            |
| `pnpm worktree`  | Git worktree management for parallel agent work           |

## Repository layout

```
apps/desktop      Electron shell + Vite/React renderer surface
apps/cli          headless CLI entry point
packages/core     document model, command layer, validation primitives (UI-free)
packages/renderer HTML/CSS/SVG execution surface
packages/canvas   selection, geometry, direct manipulation
packages/editor-ui React panels, toolbars, inspectors
packages/html-bridge sandboxed bridge for imported HTML
packages/agent    agent-facing command surface (CLI/MCP)
packages/exporters HTML/PDF/PPTX adapters
docs/             architecture, decisions, agent collaboration, reports
scripts/dev/      developer tooling (worktree management)
tests/fixtures/   shared test fixtures
```

## Working on this repository

- Read [`AGENTS.md`](AGENTS.md) first — it is the repository-wide rule set for humans and agents.
- Never commit to `main` directly after bootstrap: use `feat/*`, `fix/*`, `chore/*`, `docs/*`,
  `test/*`, `refactor/*` branches and open a Pull Request (see
  [`docs/agents/COLLABORATION.md`](docs/agents/COLLABORATION.md)).
- Parallel work on **one machine** happens in isolated Git worktrees under
  `D:\01_Projects\01_MyProjects\Auralide Worktrees` (see
  [`docs/agents/WORKTREE-GUIDE.md`](docs/agents/WORKTREE-GUIDE.md)). A worktree is local isolation,
  **not** a sharing mechanism: the second developer works from their own clone and pushes branches.
- Architecture decisions live in [`docs/decisions/`](docs/decisions/); phase plans in
  [`docs/architecture/`](docs/architecture/). The P0 report
  ([`docs/reports/P0-bootstrap-report.md`](docs/reports/P0-bootstrap-report.md)) is frozen history.

## License

Apache-2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

## P1.5 preview

Supported development targets are Windows x64 and macOS ARM64; see [platform contract](docs/architecture/platform-support.md). The bounded [Aura Browser POC](docs/architecture/aura-browser.md) adds a Core preview, reviewed HTML Lab fixture, stable-ID inspection and screenshot capture. It has no arbitrary page loading or script execution. Build the workspace before starting the desktop. The UI remains a diagnostic shell with [direction A selected](docs/design/ui-architecture.md); B/C remain references and full shell implementation is deferred.

## Save and reopen (P2A)

Build with `pnpm build`, then `pnpm --filter @auralide/desktop start`. Apply a text edit and choose
**Save document** in the workbench. Main opens a native file dialog; no path is accepted from the
renderer. Subsequent saves retain uniquely named `.bak` recovery files beside the document. These
backups are not automatically deleted. Reopen with **Open document**, including after restarting.
Opening or closing over unsaved edits requires confirmation. A file changed by another program is
refused rather than silently overwritten. Documents are limited to 20 MiB in this experimental slice.

Reopen preserves content/IDs, starts empty undo history and advances the session revision to reject
stale intent. Refresh Aura after reopening. This snapshot format does not persist command history.
Run `node apps/desktop/test/persistence.electron.mjs` after building to exercise real save/restart/
reopen/HTML preview; only native dialog selections are stubbed in that test.

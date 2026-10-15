# Auralide

**AI-Native HTML Presentation Editor** — a local-first presentation editor that combines the visual
freedom of HTML/CSS/SVG with direct manipulation, on top of a structured document model that humans
and AI agents edit through the same validated command layer.

> Status: **P0 — infrastructure bootstrap**. The repository contains the monorepo scaffold, tooling,
> CI, collaboration rules and architecture records. It deliberately contains no editor features yet.

## Requirements

| Tool    | Version used by this repository | Notes                                    |
| ------- | ------------------------------- | ---------------------------------------- |
| Node.js | 24.x (Active LTS)               | `engines.node: >=24.0.0`                 |
| pnpm    | 12.11.2                         | pinned via `packageManager`              |
| Git     | 2.55+                           | worktrees are part of the workflow       |
| Python  | 3.12 (optional)                 | future tooling only, not required for P0 |

## Setup

```powershell
# from the repository root
corepack enable pnpm      # or: npm install -g pnpm@12.11.2
pnpm install
pnpm build                # tsc + vite builds for every workspace package
```

## Scripts

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
- Parallel work happens in isolated Git worktrees under
  `D:\01_Projects\01_MyProjects\Auralide Worktrees` (see
  [`docs/agents/WORKTREE-GUIDE.md`](docs/agents/WORKTREE-GUIDE.md)).
- Architecture decisions live in [`docs/decisions/`](docs/decisions/); the P0 report is
  [`docs/reports/P0-bootstrap-report.md`](docs/reports/P0-bootstrap-report.md).

## License

Apache-2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

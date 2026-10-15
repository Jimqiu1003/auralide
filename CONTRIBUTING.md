# Contributing to Auralide

Auralide is developed by humans and AI agents under one rule set. Read
[`AGENTS.md`](AGENTS.md) before your first change — it is the authoritative source for Git rules,
worktree rules and engineering standards.

## Branch and pull request flow

`main` is protected: after the P0 bootstrap commit, every change lands through a Pull Request.

| Branch prefix | Use for                               |
| ------------- | ------------------------------------- |
| `feat/`       | new functionality                     |
| `fix/`        | bug fixes                             |
| `chore/`      | tooling, dependencies, infrastructure |
| `docs/`       | documentation, ADRs, reports          |
| `test/`       | tests and fixtures                    |
| `refactor/`   | behaviour-preserving restructuring    |

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat(core): add element id generator`, `chore(ci): cache pnpm store`, `docs(adr): record storage choice`.

## Before opening a PR

```powershell
pnpm install
pnpm verify     # format:check → lint → typecheck → test → build
```

The same checks run in CI (`.github/workflows/ci.yml`). A PR is only ready when CI is green and
the change has a verification summary (commands run + observed result).

## Task protocol

Every non-trivial change should have a task record with scope, branch, expected outputs and
acceptance criteria — see [`docs/agents/TASK-PROTOCOL.md`](docs/agents/TASK-PROTOCOL.md). Parallel
work uses isolated worktrees under `D:\01_Projects\01_MyProjects\Auralide Worktrees`; see
[`docs/agents/WORKTREE-GUIDE.md`](docs/agents/WORKTREE-GUIDE.md).

## Engineering rules (summary)

- TypeScript strict; explicit types at package boundaries; validate external input with schemas.
- Keep `packages/core` free of Electron, React and Node.js APIs (enforced by ESLint).
- Do not add a dependency without a reason; prefer the standard library and existing packages.
- Never commit secrets, tokens, `.env` files or private keys.
- Never claim a check passed unless it was executed.
- Do not rewrite existing architecture decisions silently — update the ADR instead.

## Reporting security issues

Do not open a public issue for a vulnerability. Contact the maintainer listed in `NOTICE` directly
until a private reporting channel is configured.

# Contributing to Auralide

Auralide is developed by humans and AI agents under one rule set. Read
[`AGENTS.md`](AGENTS.md) before your first change — it is the authoritative source for Git rules,
worktree rules and engineering standards.

## Branch and pull request flow

`main` is integration-only: after the P0 bootstrap commit, every change lands through a Pull Request.

**How that is enforced (verified 2026-10-15):** GitHub branch protection and repository rulesets are
not available for private repositories on the current plan — `GET/PUT .../branches/main/protection`
and `POST/GET .../rulesets` all answer `HTTP 403: Upgrade to GitHub Pro or make this repository
public to enable this feature`. The controls that do exist are:

- a local `pre-push` hook (`.githooks/pre-push`, enabled with `pnpm hooks:install`), which refuses
  direct pushes to `main` and can be overridden deliberately with `AURALIDE_ALLOW_MAIN_PUSH=1`;
- CI (`.github/workflows/ci.yml`) running on every pull request — visible, but **not blocking**
  merges on the GitHub side.

The hook is a local convenience, not a security boundary: hooks are not distributed by `git clone`
and can be bypassed with `git push --no-verify`. Until the plan changes, "CI is green" is a rule
maintained by discipline, not by the platform.

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

## Labels

Issues and pull requests are triaged with the repository's labels. The set is small on purpose
(GitHub's defaults plus six project labels). To recreate them in another clone:

```powershell
gh label create infra        --color 5319e7 --description "Build, tooling, CI and repository infrastructure"
gh label create area/core     --color 0e8a16 --description "Document model, commands, validation (packages/core)"
gh label create area/editor   --color 1d76db --description "Renderer, canvas and editor UI"
gh label create area/agent    --color fbca04 --description "Agent/CLI command surface"
gh label create security      --color b60205 --description "Security, sandboxing, secrets and supply chain"
gh label create dependencies  --color 0366d6 --description "Dependency updates and license review"
```

There is no labels configuration file: the labels live in the repository settings, and this list is
the record of them.

## Reporting security issues

Do not open a public issue for a vulnerability. Contact the maintainer listed in `NOTICE` directly
until a private reporting channel is configured.

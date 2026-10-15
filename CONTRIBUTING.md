# Contributing to Auralide

Auralide is developed by humans and AI agents under one rule set. Read
[`AGENTS.md`](AGENTS.md) before your first change — it is the authoritative source for Git rules,
worktree rules and engineering standards.

## Branch and pull request flow

`main` is integration-only: after the P0 bootstrap commit, every change lands through a Pull Request.

**How that is enforced (verified 2026-10-15).** The repository is public and a repository ruleset,
`main-protection`, is active on `~DEFAULT_BRANCH` with no bypass actors
(`current_user_can_bypass: never`):

| Rule                     | Effect                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `pull_request`           | changes reach `main` only through a pull request (0 approvals required — single maintainer) |
| `required_status_checks` | the `verify` check must pass, and the branch must be up to date with `main` first           |
| `non_fast_forward`       | force pushes are rejected                                                                   |
| `deletion`               | deleting `main` is rejected                                                                 |

Verified end to end: a direct push with the local hook bypassed (`git push --no-verify origin
<branch>:main`) is refused by the server with

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - Required status check "verify" is expected.
```

The same change enabled **secret scanning** and **push protection** for the repository, plus
**Dependabot vulnerability alerts**. Automated dependency-update pull requests stay off until the
owner asks for them.

`.githooks/pre-push` (enable once with `pnpm hooks:install`) remains a fast local pre-flight: it
catches the mistake before the round trip. It is not a security boundary — it can be bypassed with
`git push --no-verify` and is not distributed by `git clone` — and the ruleset now enforces the rule
regardless.

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

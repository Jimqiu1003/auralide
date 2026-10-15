# Repository verification checklist

Reproducible, repository-level checks and the exact commands that produce them. Every row below was
executed on the `chore/ci-hardening` worktree (2026-10-15, Windows, Node 24, pnpm 12.11.2) — nothing
here is a guess.

## Per-worktree setup

```powershell
git worktree list                                   # confirm the worktree does not exist yet
pnpm worktree -- new -Name chore/ci-hardening        # scripts/dev/worktree.ps1
Set-Location -LiteralPath 'D:\01_Projects\01_MyProjects\Auralide Worktrees\chore-ci-hardening'
pnpm install --frozen-lockfile
```

`pnpm install --frozen-lockfile` observed: `Lockfile passes supply-chain policies`, `Packages: +150`,
`Done in 890ms`. One install per worktree is required; the pnpm store is shared.

## The gates

| Check                 | Command on a clean worktree                                  | Observed result                                |
| --------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| Format                | `pnpm format:check`                                          | `All matched files use Prettier code style!`   |
| Lint                  | `pnpm lint`                                                  | `9 successful, 9 total`                        |
| Typecheck             | `pnpm typecheck`                                             | all 9 packages `Done`                          |
| Test                  | `pnpm test`                                                  | 2 files, 10 tests passed (`core` 5, `cli` 5)   |
| Build                 | `pnpm build`                                                 | 9 packages, `desktop` emits `dist/renderer/**` |
| Everything            | `pnpm verify`                                                | format:check → lint → typecheck → test → build |
| Everything (no cache) | `npx turbo run lint typecheck test build --force --continue` | `29 successful, 29 total`, `0 cached`, 7.6 s   |

`--force` matters: Turborepo reuses a shared worktree cache, so a plain `pnpm lint` can print
`FULL TURBO` / `9 cached` and prove nothing about the change being verified. Use `--force` (and
`--continue` while diagnosing) when the goal is a real failure list.

Per-package form, for when a single package needs isolation (no Turbo cache):

```powershell
pnpm --filter @auralide/core test
pnpm -r typecheck      # needs dist/ from a previous build: turbo's typecheck depends on ^build
```

`pnpm -r lint|typecheck|test` works on this repository but skips Turbo's task graph: `typecheck` and
`test` run without building dependencies first, so run `pnpm build` once (or use the Turbo tasks)
before trusting a clean `pnpm -r` run.

## Known gaps (recorded, not fixed here)

| Gap                                        | Evidence                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7 of 9 packages have no `test` script      | `agent`, `canvas`, `desktop`, `editor-ui`, `exporters`, `html-bridge`, `renderer` have no `test` — `turbo run test` silently covers only `core` and `cli` |
| Root-level files are outside `pnpm lint`   | `turbo run lint` lints the 9 packages only; `eslint.config.js`, `scripts/**` and `tests/**` are linted by nothing                                         |
| Ambient type leakage (fixed on 2026-10-15) | `packages/core` loaded `@types/node` transitively; see `tsconfig.base.json`                                                                               |

## CI

`.github/workflows/ci.yml` runs, in order: `pnpm install --frozen-lockfile`, `pnpm format:check`,
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. The job is named `verify`, which the
`main-protection` ruleset requires as a status check. No step is missing; the list matches
`pnpm verify` in the root `package.json`.

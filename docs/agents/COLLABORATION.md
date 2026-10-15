# Collaboration: two developers, many agents

Auralide is developed by **two humans** plus AI agents that may run **in parallel**. This document
defines how that stays safe. It is normative for every session; it complements `AGENTS.md`, which
remains the repository-wide rule set.

## 1. People and agents

### Humans

| Person                        | Role                                                    | GitHub        | Owns                                                                   |
| ----------------------------- | ------------------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| Project Owner / Lead Engineer | product, architecture, core, integration                | `@Jimqiu1003` | `packages/core`, `apps/**`, shared configuration, CI, ADRs, phase docs |
| Compatibility & QA Engineer   | HTML test corpus, compatibility matrix, automated tests | `@Lsc-91-69`  | `tests/fixtures/html/**`, `docs/qa/**`, approved E2E directories       |

The two developers work on **different machines and different clones**. The QA engineer has no access
to the Lead's `D:` drive, so nothing in the workflow may assume a shared local path, a shared
`node_modules` or a shared worktree.

### Agents

| Role                        | Owns                                                                    | Does not own                                 |
| --------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| **Lead Agent**              | Task decomposition, assignment, integration, final verification, `main` | Writing feature code in parallel with others |
| **Infrastructure Agent**    | Toolchain, workspace config, CI, worktree scripts, dependency policy    | Product layers                               |
| **Core Agent**              | `packages/core`: schema, commands, validation, history                  | UI, Electron, filesystem                     |
| **Editor Agent**            | `packages/canvas`, `packages/editor-ui`, `packages/renderer`            | `core` internals, persistence                |
| **Agent Integration Agent** | `packages/agent`, `apps/cli`, MCP/command surface                       | Renderer UI                                  |
| **QA Agent**                | Tests, fixtures, compatibility, release validation                      | Feature implementation                       |

One agent may hold several roles in a small phase; a Core Agent may implement inside
`packages/core` **under a task owned by the Lead**. One _file_ is never written by two writers at the
same time, whether they are humans or agents.

## 2. Ownership zones

| Zone                                                                                                                                                            | Owner                                          | Notes                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| `packages/core/**`                                                                                                                                              | Lead (Core Agent implements under a Lead task) | document model, commands, history                             |
| `apps/desktop/**`, `apps/cli/**`                                                                                                                                | Lead                                           | runtime, IPC, CLI surface                                     |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.github/**`, `AGENTS.md`, `docs/decisions/**` | Lead (single integrator)                       | everyone else requests changes through an Issue or PR comment |
| `tests/fixtures/html/**`, `docs/qa/**`, approved E2E directories                                                                                                | QA Engineer                                    | the Lead does not write here without being asked              |
| `docs/architecture/**`, `docs/agents/**`, `docs/reports/**`                                                                                                     | Lead                                           | the P0 report is frozen history — never rewritten             |
| `packages/{renderer,canvas,editor-ui,html-bridge,agent,exporters}/**`                                                                                           | unassigned in P1                               | first writer claims it through an Issue                       |

`.github/CODEOWNERS` records the same zones so GitHub can request the right reviewer. It does **not**
gate merges today: the `main-protection` ruleset requires 0 approvals (single-maintainer phase), so
CODEOWNERS is documentation until the ruleset asks for reviews.

## 3. Non-negotiable rules

1. The Lead assigns tasks and integrates results. No writer self-assigns an unowned area.
2. Every task has a branch, an expected output list, acceptance criteria and a verification command.
3. Parallel **writing** tasks get separate worktrees (see [`WORKTREE-GUIDE.md`](WORKTREE-GUIDE.md)).
4. Two writers never modify the same file concurrently; the Lead splits the task or serializes it.
5. Shared configuration and architecture files have a single integrator: the Lead (see the zone table).
6. A delivery is not complete without: commit SHA(s), the commands that were run, their observed
   results, and a short change summary.
7. Merging happens through a Pull Request with green CI — never by pushing to `main`.
8. No writer may rewrite `main`, force-push a shared branch, or delete another developer's worktree.
9. Unfinished work leaves a recoverable record (branch + task record + WIP commit), never an
   unexplained dirty tree.
10. If something cannot be verified, it is reported as unverified. "Configured" is not "verified".

## 4. Working across two machines

| Need                                   | Mechanism                                                 | Not this                                        |
| -------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Coordinate a change between developers | GitHub Issue + Pull Request (review, discussion, CI)      | a chat message that leaves no record            |
| Hand over work in progress             | push the branch, open a draft PR, describe what remains   | sending patches by mail or copying a directory  |
| Isolate parallel local work            | Git worktree on **one** machine (see `WORKTREE-GUIDE.md`) | a worktree as a cross-machine sharing mechanism |
| Share code                             | `git push` / `git pull` against `origin`                  | a shared network drive or the Lead's `D:` drive |
| Change a shared config file            | ask the Lead in the Issue/PR                              | editing it from a feature branch                |
| Reproduce another developer's result   | the committed commands in the PR description              | "works on my machine"                           |

**A worktree is a local isolation device, not a collaboration channel.** It has no meaning to the
other developer; it only keeps two tasks on one machine from sharing a working directory, an index
and a checked-out branch.

## 5. Standard workflow

```
Lead: task record (scope, branch, acceptance)  →  GitHub Issue + docs/agents/TASK-PROTOCOL.md
   ↓
Writer: worktree + branch  →  implement small, self-contained changes
   ↓
Writer: local verification (pnpm verify or the task's narrower gate)
   ↓
Writer: commit (Conventional Commits), push branch, open PR
   ↓
CI: install → format → lint → typecheck → test → build  (required by the ruleset)
   ↓
Lead: review diff, re-run the gate, merge PR
   ↓
Lead: fast-forward the main worktree, remove the worktree, delete the branch
```

## 6. Conflict handling

- **Different files, same area**: allowed in parallel, integration is a merge.
- **Same file**: serialize. The second writer rebases onto the first merged change.
- **Shared config touched by two tasks** (e.g. a dependency addition while another task edits
  `turbo.json`): the Lead re-sequences them, since both touch integrator-owned files. In P1 the Lead
  adds the dependencies the phase needs up front (`zod` for `core`, `playwright-core` for the desktop
  runtime) precisely so feature branches do not race on `pnpm-lock.yaml`.
- **Lockfile conflicts**: never hand-edit `pnpm-lock.yaml`. Resolve by re-running `pnpm install`
  after merging the `package.json` files.
- **Semantic conflict** (both changes are valid but incompatible): escalate to the owner with both
  options and the consequence of each; do not silently pick one.

## 7. Evidence requirements

Every delivery report contains, at minimum:

```
Task:            <task id / issue number>
Branch + SHA:    chore/xyz @ 1a2b3c4
Files changed:   list
Commands run:    pnpm --filter @auralide/core test   → 24 passed
                 pnpm verify                          → all stages passed
Result:          what actually happened
Not verified:    what was not checked and why
Risks / next:    follow-ups
```

Reports are honest about failures. A failing check that is reported is useful; a failing check that
is hidden is a defect.

## 8. Phase status

- **P0 (done, frozen):** infrastructure bootstrap. See `docs/reports/P0-bootstrap-report.md`.
- **P1 (merged, PR #14):** runtime and core foundation — a really starting Electron shell with a safe
  preload/IPC boundary, and the first structured document model plus command dispatcher. Plan:
  `docs/architecture/p1-plan.md`; decisions: `ADR-0002`. The QA engineer starts their own workstream
  in parallel on the zones listed above.

- **P1.5 (current):** Issues #15–#18. Lead writes runtime/platform/design work sequentially; no sub-agents under the current owner instruction. QA @Lsc-91-69 owns independent compatibility work through #18. No QA fixtures or docs are modified by the runtime workstream. Owner approval is required before full UI implementation and before any PR merge.

- **P2A (experimental, current):** Issue #22, sequential Lead-owned storage/session increment on the unmerged P1.5 stack. Direction A is selected; ADR-0005/0006 remain Proposed. Human QA zones remain unchanged. No automatic merges.

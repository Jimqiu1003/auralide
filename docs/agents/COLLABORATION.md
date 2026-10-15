# Multi-Agent Collaboration

Auralide is developed by a human owner plus AI agents that may run **in parallel**. This document
defines how that stays safe. It is normative for every agent session; it complements `AGENTS.md`,
which remains the repository-wide rule set.

## 1. Roles

| Role                        | Owns                                                                    | Does not own                                 |
| --------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| **Lead Agent**              | Task decomposition, assignment, integration, final verification, `main` | Writing feature code in parallel with others |
| **Infrastructure Agent**    | Toolchain, workspace config, CI, worktree scripts, dependency policy    | Product layers                               |
| **Core Agent**              | `packages/core`: schema, commands, validation, history                  | UI, Electron, filesystem                     |
| **Editor Agent**            | `packages/canvas`, `packages/editor-ui`, `packages/renderer`            | `core` internals, persistence                |
| **Agent Integration Agent** | `packages/agent`, `apps/cli`, MCP/command surface                       | Renderer UI                                  |
| **QA Agent**                | Tests, fixtures, compatibility, release validation                      | Feature implementation                       |

One agent may hold several roles in a small phase; one _file_ is never written by two agents at the
same time.

## 2. Non-negotiable rules

1. The Lead Agent assigns tasks and integrates results. No agent self-assigns an unowned area.
2. Every task has a branch, an expected output list, acceptance criteria and a verification command.
3. Parallel **writing** tasks get separate worktrees (see [`WORKTREE-GUIDE.md`](WORKTREE-GUIDE.md)).
4. Two agents never modify the same file concurrently; the Lead splits the task or serializes it.
5. Shared configuration and architecture files have a single designated integrator (by default the
   Lead Agent): `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`,
   `tsconfig.base.json`, `eslint.config.js`, `.github/**`, `AGENTS.md`, `docs/decisions/**`.
6. A delivery is not complete without: commit SHA(s), the commands that were run, their observed
   results, and a short change summary.
7. Merging happens through a Pull Request with green CI — never by pushing to `main`.
8. No agent may rewrite `main`, force-push a shared branch, or delete another agent's worktree.
9. Unfinished work must leave a recoverable record (branch + task record + WIP commit or patch),
   never an unexplained dirty tree.
10. If an agent cannot verify something, it says so explicitly. "Configured" is not "verified".

## 3. Standard workflow

```
Lead: task record (scope, branch, acceptance)  →  docs/agents/TASK-PROTOCOL.md
   ↓
Agent: worktree + branch  →  implement small, self-contained changes
   ↓
Agent: local verification (pnpm verify or the task's narrower gate)
   ↓
Agent: commit with Conventional Commits message, push branch
   ↓
Agent: report (SHA, commands, results, risks)  →  Lead
   ↓
Lead: review diff, re-run the gate, merge PR
```

## 4. Conflict handling

- **Different files, same area**: allowed in parallel, integration is a merge.
- **Same file**: serialize. The second agent rebases onto the first agent's merged change.
- **Shared config touched by two tasks** (e.g. adding a dependency while another task edits
  `turbo.json`): the Lead re-sequences them, since they both touch integrator-owned files.
- **Lockfile conflicts**: never hand-edit `pnpm-lock.yaml`. Resolve by re-running `pnpm install`
  after merging `package.json` files.
- **Semantic conflict** (both changes are valid but incompatible): escalate to the owner with both
  options and the consequence of each; do not silently pick one.

## 5. Evidence requirements

Every agent report contains, at minimum:

```
Task:            <task id / title>
Branch + SHA:    chore/xyz @ 1a2b3c4
Files changed:   list
Commands run:    pnpm test --filter @auralide/core   → 5 passed
                 pnpm typecheck                        → 10 successful
Result:          what actually happened
Not verified:    what was not checked and why
Risks / next:    follow-ups
```

Reports are honest about failures. A failing check that is reported is useful; a failing check that
is hidden is a defect.

## 6. Phase P0 status

During P0 only infrastructure exists: the Lead Agent performed the bootstrap, and the other roles
have documented responsibilities but no code to own yet. Parallel execution was therefore **not**
exercised in P0 beyond worktree isolation checks (see `docs/reports/P0-bootstrap-report.md` for what
was actually verified). Roles take effect from P1.

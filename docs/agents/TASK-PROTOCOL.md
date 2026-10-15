# Task Protocol

How work is described, assigned, executed and closed in Auralide. Applies to humans and agents
alike; complements [`COLLABORATION.md`](COLLABORATION.md) (roles and rules) and
[`WORKTREE-GUIDE.md`](WORKTREE-GUIDE.md) (isolation mechanics).

## 1. Task record

A task without a record is not a task. Every unit of work has, at minimum:

```yaml
id: P1-CORE-003 # stable id, never reused
title: Element id generator and document revision counter
owner: Core Agent # exactly one accountable owner
reviewer: Lead Agent
branch: feat/core-element-ids
worktree: Auralide Worktrees/feat-core-element-ids
scope:
  writes: packages/core/src/** # files the task may change
  reads: packages/core, docs/decisions/ADR-0001-foundation.md
  forbidden: packages/editor-ui/** # explicitly out of bounds
depends_on: [P1-CORE-001]
acceptance:
  - createElementId() returns a unique, sortable id for 10k calls
  - revision counter increments on every applied command
  - pnpm --filter @auralide/core test passes
verification: pnpm verify
deliverable: commit SHA + PR URL + verification summary
status: pending | active | blocked | done | dropped
```

Rules for the record:

- `scope.writes` must be disjoint from any task running in parallel (the Lead enforces this).
- Acceptance criteria must be observable by a command or a described manual check.
- A task touching `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`,
  `eslint.config.js`, `.github/**`, `AGENTS.md` or `docs/decisions/**` is an
  **integrator-owned** task: the Lead Agent is the owner or the explicit reviewer.
- Changing acceptance criteria after work started requires the Lead's agreement (a task is not
  "done" against criteria invented after the fact).

## 2. Lifecycle

| State     | Meaning                                                         |
| --------- | --------------------------------------------------------------- |
| `pending` | Recorded, not started, dependencies may be unmet                |
| `active`  | Owned, branch/worktree exists, work in progress                 |
| `blocked` | Cannot proceed; the blocker is written down with what was tried |
| `done`    | Acceptance criteria verified; evidence attached; merged via PR  |
| `dropped` | Abandoned on purpose; the reason is recorded                    |

A task moves to `done` only when the acceptance evidence exists. "Implemented" without a verified
check is `active`, not `done`.

## 3. Assignment rules

1. The Lead Agent creates the record and names one owner.
2. Work that writes files is assigned together with its worktree/branch, or explicitly as
   "same-worktree" when it is serialized behind another task.
3. Two `active` tasks must not share a file in `scope.writes`. If they must, one is `blocked` by
   the other (`depends_on`).
4. An owner that finds the task larger than its scope stops and reports; it does not silently
   expand into another agent's files.
5. An owner that cannot verify a criterion says so and leaves the task `active` or `blocked`.

## 4. Evidence attached on completion

```
Task:          P1-CORE-003
Branch + SHA:  feat/core-element-ids @ 9f3c1a2
Files changed: packages/core/src/ids.ts, packages/core/src/ids.test.ts
Commands run:
  pnpm --filter @auralide/core test    → 12 passed
  pnpm verify                          → format:check, lint, typecheck, test, build all OK
Result:        element ids are unique across 10k calls; revision counter increments per command
Not verified:  cross-process uniqueness (single-process assumption documented)
Risks / next:  storage layer must persist the counter (task P1-STORAGE-001)
```

## 5. Parallel work with DSH Agent Teams

When the work is executed through DSH Agent Teams, the shared task board mirrors this protocol:

1. The Lead creates one shared task per unit of work, with `write_scopes` and acceptance criteria.
2. The Lead creates the worktree and branch first, then names the owner and target in the task.
3. Dependencies are recorded with `blocked_by`; a blocked task is not started.
4. Teammates report back with the evidence block above; the Lead re-runs the final gate on the
   integrated result before merging.
5. Tool-level state (`active`/`completed`) never substitutes for the acceptance check.

Without Agent Teams, the same records live in the task description / PR body. The format is not
optional; the storage is.

## 6. Reporting a blocker

A blocker report contains: task id, what was attempted, the exact command and error, what is
already done and committed, what is _not_ verified, and the decision needed from the owner. Local
work is left committed on its branch so it can be resumed — never left as an unexplained dirty
tree.

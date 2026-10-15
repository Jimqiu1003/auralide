# Git Worktree Guide

Auralide agents work in **isolated Git worktrees** so parallel tasks never share a working
directory, an index or a checked-out branch.

## Layout

| Purpose          | Path                                                     |
| ---------------- | -------------------------------------------------------- |
| Main repository  | `D:\01_Projects\01_MyProjects\Auralide Dev`              |
| Linked worktrees | `D:\01_Projects\01_MyProjects\Auralide Worktrees\<name>` |

Rules (from `AGENTS.md` §5):

- worktrees are siblings of the main repository, never nested inside it;
- one branch belongs to exactly one worktree;
- never switch another agent's branch;
- never remove a worktree with uncommitted changes;
- deleting a directory is **not** removing a worktree — always use `git worktree remove`.

## The management script

`scripts/dev/worktree.ps1` is the only supported way to create and remove worktrees. It refuses the
dangerous cases instead of asking for confirmation.

```powershell
# from the repository (or any worktree)
pnpm worktree -- <command> [options]
# equivalent, explicit form
pwsh -NoProfile -File scripts/dev/worktree.ps1 <command> [options]
```

| Command              | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `status`             | Main repository branch, cleanliness, upstream and worktree count  |
| `list`               | Every worktree with branch, dirty state and ahead/behind          |
| `new -Name <branch>` | Create `<branch>` from `-Base` (default `main`) in a new worktree |
| `check -Name <n>`    | Is that worktree clean, in sync and merged?                       |
| `remove -Name <n>`   | Remove a clean, merged worktree (deletes the merged branch too)   |
| `sync`               | `git fetch --prune` + per-worktree sync report + `worktree prune` |

Options: `-Base <branch>` (default `main`), `-WorktreeRoot <path>`, `-AllowUnmerged`, `-DryRun`.

`-Name` accepts the branch name, the directory name, or the worktree path.

## Walkthrough

### 1. See the current state

```powershell
pnpm worktree -- status
pnpm worktree -- list
```

### 2. Start a task in its own worktree

```powershell
pnpm worktree -- new -Name feat/core-schema
# creates D:\01_Projects\01_MyProjects\Auralide Worktrees\feat-core-schema on branch feat/core-schema
Set-Location -LiteralPath 'D:\01_Projects\01_MyProjects\Auralide Worktrees\feat-core-schema'
pnpm install          # required per worktree; the pnpm store is shared, so this is fast
pnpm verify           # or the narrower gate for your task
```

Branch prefixes are enforced: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `refactor/`.

### 3. Work, commit, push

```powershell
git status
git add <paths>
git commit -m "feat(core): add element id generator"
git push -u origin feat/core-schema
gh pr create --fill --base main
```

### 4. Check before finishing

```powershell
pnpm worktree -- check -Name feat-core-schema
```

Output reports clean/dirty, upstream sync, commits not yet in `main`, and whether the worktree is
removable.

### 5. Remove when merged and clean

```powershell
pnpm worktree -- remove -Name feat-core-schema
```

Refusals you should expect (they are intentional):

| Situation                                 | Result                          |
| ----------------------------------------- | ------------------------------- |
| Uncommitted changes                       | Refused, with the change list   |
| Branch has commits not merged into `main` | Refused unless `-AllowUnmerged` |
| Target is the main worktree               | Refused                         |
| Target path outside the worktree root     | Refused                         |
| Branch already checked out elsewhere      | `new` refuses                   |

There is deliberately **no** `--force`: recovery is always possible, accidental data loss is not.

### 6. Keep the shared state tidy

```powershell
pnpm worktree -- sync     # fetch, report ahead/behind, prune stale records
```

## Notes

- Each worktree needs its own `pnpm install`; `node_modules` is not shared, the content-addressable
  store is. Disk cost is small, isolation is real.
- Turborepo caches live per worktree (`.turbo/` is ignored), so builds in different worktrees do not
  invalidate each other.
- A worktree that is no longer needed but has unmerged work should be _kept_, not forced away: push
  the branch, then open a PR.

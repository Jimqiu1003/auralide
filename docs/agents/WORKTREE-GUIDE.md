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

**Remove before you merge.** `gh pr merge --delete-branch` deletes the _remote_ branch, then tries to
clean up the local worktree itself — on Windows it drops the worktree record and the local branch
while leaving `apps/`, `packages/` and `node_modules/` behind, because those paths exceed
`MAX_PATH` (observed twice with PR #2 and PR #3). The leftovers are no longer registered
worktrees, so `remove` cannot see them. The reliable order is:

```powershell
# 1. merge (CI already green), WITHOUT --delete-branch
gh pr merge <n> --merge
# 2. fast-forward the main worktree, then remove the worktree and its branch
git -C 'D:\01_Projects\01_MyProjects\Auralide Dev' pull --ff-only
pnpm worktree -- remove -Name feat-core-schema
# 3. optionally delete the remote branch that the merge left behind
git push origin --delete feat-core-schema
```

### 6. Keep the shared state tidy

```powershell
pnpm worktree -- sync     # fetch, report ahead/behind, prune stale records, report orphans
```

`sync` also lists directories in the worktree root that are **not** registered worktrees and contain
no `.git` — the signature left behind by the merge above or by a failed deletion. They are reported,
never deleted; the command prints the `cmd /c rmdir /s /q "\\?\<path>"` line that removes one once
you have checked its contents.

## Notes

- Each worktree needs its own `pnpm install`; `node_modules` is not shared, the content-addressable
  store is. Disk cost is small, isolation is real.
- Turborepo caches live per worktree (`.turbo/` is ignored), so builds in different worktrees do not
  invalidate each other.
- A worktree that is no longer needed but has unmerged work should be _kept_, not forced away: push
  the branch, then open a PR.
- **Windows long paths.** A worktree that ran `pnpm install` contains paths beyond the
  260-character `MAX_PATH` limit (measured: 263–266 characters). Git only deletes such trees when
  `core.longpaths` is on, so the script passes `-c core.longpaths=true` to every git call.
  Measured behaviour, verified on this repository:
  - `git worktree remove` can **exit 0 while leaving hundreds of files behind** (643 files in a
    tree whose longest path was 266 characters), so `remove` never trusts the exit code: it checks
    the filesystem, finishes the deletion with a `\\?\`-prefixed `rmdir`, then runs
    `git worktree prune`. `gh pr merge --delete-branch` has the same problem and skips the local
    branch deletion.
  - Without `core.longpaths`, git fails earlier with `Filename too long` and still deletes part of
    the tree, which leaves a half-removed directory. Enabling it for this repository is recommended:

  ```powershell
  git config core.longpaths true   # repository-local, not global
  ```

- **Never run `remove` from inside the worktree you are removing.** A process whose current
  directory is inside a tree prevents its deletion on Windows (`rmdir` exit 32). The script steps
  out of the target when _it_ is the process holding it, but it cannot release a parent shell's
  handle — it reports that case explicitly instead of failing silently.

# Auralide — AGENTS.md

## 1. Project Identity

- Project: Auralide
- Product: AI-Native HTML Presentation Editor
- Language: TypeScript (strict)
- First-release platforms: Windows x64 and macOS ARM64 (ADR-0003)
- Architecture: Local-first, modular monorepo
- License: Apache-2.0
- Repository: public, <https://github.com/Jimqiu1003/auralide> (owner decision, 2026-10-15)
- Development stage: M2 Desktop Preview candidate; Owner/manual acceptance pending
- Project root: `D:\01_Projects\01_MyProjects\Auralide Dev`
- Development team: Project Owner / Lead Engineer and Compatibility & QA Engineer
  (see `docs/agents/COLLABORATION.md`)

### Product Vision

Build an AI-native presentation editor combining:

1. The visual freedom of HTML, CSS, SVG and JavaScript.
2. The direct manipulation experience of PowerPoint, WPS and Figma.
3. A shared, structured document model editable by humans and AI agents.
4. Reliable local storage, version history and future export capabilities.

The editor must not treat raw HTML as the sole source of document truth.

### Current owner-authorized execution (2026-10-18)

The owner requested execution of `docs/architecture/next-stage-plan.md` and a usable Windows x64
portable EXE. M0 corrections are merged through #20/#21/#23. The isolated `feat/stable-portable`
candidate migrates the final A2/file workflows and adds bounded basic properties/order, session
undo/redo, basic presentation and tested portable packaging. These current instructions supersede
the historical P1/P2A scope restrictions below only for that plan. ADR-0005/0006 remain Proposed;
no full persistent history, arbitrary script execution, external Agent Apply, release publishing or
third-party plugin installation is authorized. Keep #24/#25 as historical Drafts. M3/M4 remain later
gates, not permission for this execution to grow without bounds. Continue sequentially without sub-agents.

## 2. Architecture Principles

Target technology baseline:

- TypeScript strict
- Electron
- React
- Vite
- pnpm Workspaces
- Turborepo
- Zod
- Vitest
- Playwright

Architecture layers:

- Core: document schema, commands, validation, history.
- Renderer: HTML, CSS, SVG and isolated components.
- Canvas: element selection, movement, resizing and editing.
- Editor UI: toolbars, inspectors, panels and interactions.
- Agent: CLI, MCP and structured commands.
- Exporters: HTML, PDF and PPTX adapters.
- Storage: local documents, assets and history.

Keep the core independent of Electron and UI frameworks.

The current P2A owner instruction authorizes only validated snapshot save/reopen and its architecture
alignment, not the full P2 editor. Read `p2-vertical-slice-plan.md`, `architecture-v2.md` and Proposed
ADR-0005/0006. Those proposals do not supersede accepted ADRs without owner review. Direction A
(canvas first, stable panels) is owner-selected. Run sequentially without sub-agents. Filesystem
operations stay in main behind native dialogs; guests and external Agents receive no file grant.

The completed P1 scope implements the runtime shell and the core document/command foundation described in
`docs/architecture/p1-plan.md`. Do not build editor UI features, animation, import/export pipelines or
collaboration features: P1 is about a safe runtime and a trustworthy model. P1.5 extends this with the owner-authorized isolated Aura Browser POC, platform adapters/CI and design proposals (ADR-0003/0004). Full editor UI awaits owner selection. The current owner instruction is single-agent execution; do not spawn sub-agents.

## 3. Source of Truth

- `AGENTS.md`: repository-wide agent rules.
- `docs/architecture/`: technical architecture.
- `docs/decisions/`: Architecture Decision Records.
- `docs/agents/`: multi-agent collaboration procedures.
- `docs/reports/`: implementation and validation reports.
- `README.md`: project entry point and setup instructions.
- `package.json` and lockfile: dependency and script definitions.
- Git history: authoritative source control history.
- GitHub Issues and PRs: task discussion and review.

If a decision changes, update the corresponding ADR.

Do not silently override an accepted architecture decision.

## 4. Git Rules

- Default branch: `main`.
- Never develop features directly on `main` after bootstrap.
- Use dedicated feature branches and Pull Requests.
- Keep commits atomic and descriptive.
- Prefer Conventional Commits.
- Rebase or merge only when the working tree is understood and clean.
- Do not force-push shared branches.
- Do not modify Git history destructively without explicit approval.
- Never run `git reset --hard`, destructive clean operations, or force-remove worktrees without explicit authorization.

Branch naming:

- `feat/<topic>`
- `fix/<topic>`
- `chore/<topic>`
- `docs/<topic>`
- `test/<topic>`
- `refactor/<topic>`

## 5. Worktree Rules

Canonical repository:

`D:\01_Projects\01_MyProjects\Auralide Dev`

Worktree parent:

`D:\01_Projects\01_MyProjects\Auralide Worktrees`

- Linked worktrees must be siblings of the main repository, not nested inside it.
- One active branch must belong to only one worktree.
- Each agent uses its assigned worktree and branch.
- Before work, verify `git status`, current branch and active worktrees.
- Do not switch another agent's branch.
- Do not remove worktrees with uncommitted changes.
- Remove completed worktrees only after merge, validation and confirmation that no work remains.
- Never assume that deleting a directory is equivalent to removing a Git worktree.

## 6. Multi-Agent Collaboration

Roles:

- Lead Agent: planning, integration and final verification.
- Infrastructure Agent: development environment, tooling and CI.
- Core Agent: schema, document model and command architecture.
- Editor Agent: canvas, UI and interaction architecture.
- Agent Integration Agent: CLI, MCP and AI interfaces.
- QA Agent: tests, compatibility and validation.

P1 runs one Lead-owned task per workstream: `chore/p1-project-transition`, `feat/p1-desktop-runtime`,
`feat/p1-core-commands`, `feat/p1-integration` (see `docs/architecture/p1-plan.md`). A Core Agent may
implement inside `packages/core` under a Lead-owned task; the Compatibility & QA engineer owns
`tests/fixtures/html/**` and `docs/qa/**`. The two human developers coordinate through GitHub Issues
and Pull Requests; a worktree isolates work on one machine only and is never a sharing mechanism.

Rules:

1. The Lead Agent owns task assignment and integration.
2. Every task must have a defined scope, branch, expected outputs and acceptance criteria.
3. Agents must not modify the same files concurrently.
4. Shared configuration changes require coordination.
5. Agents communicate through task records and Git history, not undocumented assumptions.
6. Every implementation task must produce a verification summary.
7. Failed or incomplete work must be reported truthfully.
8. Parallel execution is optional; isolation and reproducibility are mandatory.

Never assume another agent has completed a task without verifying the result.

## 7. Agent-Safe Editing

Future human and AI editing must share one validated command interface.

- Prefer structured commands over unrestricted document rewrites.
- Use stable element identifiers.
- Track revisions and modification origins.
- Preserve manual edits unless explicitly authorized to change them.
- Detect conflicting changes.
- Keep operations undoable where practical.

These are architectural requirements, not permission to implement the editor during P0.

## 8. Engineering Standards

- Use TypeScript strict mode.
- Prefer explicit types at package boundaries.
- Validate external input with schemas.
- Avoid unnecessary dependencies and abstraction.
- Prefer established, maintained packages.
- Pin dependencies using the lockfile.
- Use cross-platform scripts where practical.
- Test important behavior rather than adding meaningless placeholder tests.
- Never report checks as passed unless executed successfully.

Before submitting a PR, run the checks relevant to the changes.

## 9. Security and Licensing

- Project license: Apache-2.0.
- Preserve original copyright and license notices.
- Audit dependencies before adoption.
- Do not copy AGPL/GPL code into the Apache-licensed core without an approved compatibility and distribution plan.
- Never commit API keys, access tokens, passwords or private certificates.
- Use environment variables and ignored local configuration for secrets.
- Treat imported HTML and JavaScript as untrusted.
- Do not grant untrusted rendering code unrestricted Node.js or filesystem access.
- Avoid logging secrets or sensitive credentials.
- Do not publish the repository or change visibility without explicit approval.

## 10. File Management

- Keep project source, documentation, scripts and tracked configuration inside the repository.
- Keep linked worktrees outside the main repository.
- Do not write project files to unrelated directories.
- Temporary output, caches, logs and build artifacts must be ignored by Git.
- Do not add large binary assets without justification.
- Keep architecture documentation concise and current.
- Never delete or overwrite existing user data without checking its contents.

## 11. Completion Protocol

For each completed task, report:

1. Objective and actual result.
2. Files created or modified.
3. Commands executed.
4. Tests performed and their outcomes.
5. Branch and commit SHA.
6. PR URL, when applicable.
7. Remaining issues or risks.
8. Recommended next action.

Never claim that a repository, branch protection, CI workflow or remote push is configured without verifying it.

## 12. Decision Priority

Follow, in order:

1. Higher-priority platform and security instructions.
2. Explicit instructions from the project owner.
3. This repository's AGENTS.md.
4. Accepted architecture decisions.
5. Task-specific implementation plans.
6. Existing project conventions.

When instructions conflict, explain the conflict and request a decision rather than silently ignoring the restriction.

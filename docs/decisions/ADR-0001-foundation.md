# ADR-0001 — Foundation: repository, toolchain and architecture baseline

- Status: **Accepted**
- Date: 2026-10-15
- Deciders: Project owner (Jim), Lead Engineering Agent (P0 bootstrap)
- Supersedes: none
- Related: [`docs/architecture/overview.md`](../architecture/overview.md),
  [`security.md`](../architecture/security.md), [`repository-structure.md`](../architecture/repository-structure.md)

## Context

Auralide is a new product: an AI-native HTML presentation editor. Before any editor feature exists,
the foundation must be decided, because these choices are expensive to reverse once code, CI and
agent workflows depend on them.

The project is developed by a single owner working with multiple AI agents (Codex/DSH sessions),
possibly in parallel. That imposes requirements a normal greenfield repository does not have:

- parallel agents must not corrupt each other's work → isolation is mandatory;
- every change must be verifiable by machine → the toolchain must fail loudly and reproducibly;
- agents and humans must share one rule set → rules must live in the repository, not in prompts;
- the product must be able to run offline and own the user's data → local-first.

## Decision

### 1. A standalone repository with the Apache-2.0 license

Auralide lives in its own GitHub repository (`auralide`) rather than inside any existing project. It
is licensed **Apache-2.0**, which provides an explicit patent grant and allows future commercial
distribution while remaining friendly to contributors.

The repository was created **private** on 2026-10-15 and the owner approved publishing it the same
day; it is **public** as of 2026-10-15. Nothing in the toolchain publishes packages or artifacts, and
no secrets were committed (verified by an 11-pattern scan over every tracked file and every commit
before the visibility change). Going public also unlocked the controls the Free plan withholds from
private repositories: a `main-protection` ruleset (pull request required, `verify` check required,
force pushes and deletion rejected, no bypass actors), secret scanning with push protection, and
Dependabot vulnerability alerts.

### 2. TypeScript strict everywhere

All application and library code is TypeScript with `strict` plus
`noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax` and `isolatedModules`
(`tsconfig.base.json`).

TypeScript **6.0.3** is pinned: it is the newest stable line that the surrounding ecosystem
(currently `typescript-eslint@8.71.2`, which declares `typescript >=4.8.4 <6.1.0`) fully supports.
TypeScript 7.x (the native compiler) is deliberately not adopted yet; revisiting it is a P1+
decision once the lint/tooling ecosystem supports it.

### 3. pnpm workspaces + Turborepo

A single pnpm workspace (`pnpm-workspace.yaml`) with `apps/*` and `packages/*`, installed with
**pnpm 12.11.2** (pinned through `packageManager`) and orchestrated by **Turborepo 2.11.8**.

Reasons: strict, non-flat `node_modules` (a package can only import what it declares — important
with agents writing code), content-addressable store with hard links, first-class workspace
protocol (`workspace:*`), supply-chain controls (`allowBuilds`, `minimumReleaseAge`,
lockfile policy verification), and Turborepo's task graph + caching for `build`, `typecheck`,
`lint` and `test`.

The lockfile is committed and CI installs with `--frozen-lockfile`.

### 4. Electron + React + Vite for the desktop surface

- **Electron 44** is the desktop shell (Windows first, cross-platform later).
- **React 19 + Vite 8** render the editor surface; the renderer is a normal web app so it stays
  testable in a browser and future remote/web targets remain possible.
- The main process owns privileged capabilities. Renderer windows run with
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and the built shell ships a
  restrictive Content Security Policy.

### 5. Local-first

Documents are user-owned local files; the structured model is the source of truth and templates
are derived from it. No Auralide server is required to open, edit, version or export a document.
Cloud features, if ever added, are additive and opt-in.

### 6. Core is decoupled from UI and platform

`packages/core` contains the document model, command definitions, validation and history, and must
not import Electron, React, the DOM, or any higher layer. This is enforced by an ESLint
`no-restricted-imports` boundary rule, not only by convention, and it is what makes headless
operation (CLI, agents, CI, future server-side export) possible.

### 7. HTML-first rendering, structured document model

Slides render as real HTML/CSS/SVG in a sandboxed context, so anything a browser can draw is
expressible. But raw HTML is **not** the document of truth: the model is structured, and HTML is a
render/export target. Imported HTML is parsed into the model and treated as untrusted input.

### 8. Agent and user share one validated command layer

All mutations — from the UI, the CLI or an agent — go through the same structured, schema-validated
command dispatcher in `core`, producing revision entries with origin (human/agent/import) and
undoable inverse operations. Agents therefore cannot bypass validation, and every agent edit is
attributable and reversible.

### 9. Verification is part of "done"

`pnpm verify` (format check → lint → typecheck → test → build) is the local gate; the same steps run
in GitHub Actions on every PR. Tests must assert real behaviour: placeholder tests that only make CI
green are prohibited by `AGENTS.md`.

## Consequences

**Positive**

- One consistent, strictly typed codebase; a bad import fails the build instead of shipping.
- Agents can work in isolated worktrees and be verified mechanically (`AGENTS.md`, `docs/agents/`).
- Local-first storage keeps the user in control of their data.
- Core stays reusable by a CLI/agent/server without dragging in Electron or React.

**Negative / accepted costs**

- More configuration than a single-package repository; a new package must declare `package.json`,
  `tsconfig.json`, `tsconfig.build.json` and scripts.
- Cross-package type resolution goes through built `dist/*.d.ts`, so `typecheck` depends on `^build`
  (Turborepo handles ordering; a cold `pnpm typecheck` builds dependencies first).
- Electron binaries and renderer bundles are large; packaging/signing work is deferred to P1+.
- Committing to `typescript-eslint`'s TypeScript support window means an upgrade gate on TS majors.

## Alternatives considered

| Alternative                          | Why not                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Single package repository            | Makes layer boundaries and per-area CI checks unenforceable; agents collide on files.                                                 |
| npm/yarn workspaces                  | Weaker isolation of undeclared imports; pnpm's supply-chain controls are stronger.                                                    |
| Nx instead of Turborepo              | More features than needed; Turborepo's task graph covers build/lint/test caching with less configuration.                             |
| Tauri instead of Electron            | Smaller binaries, but a Rust toolchain and a different webview-per-platform story; team and product target Electron-class capability. |
| Web-only app (no desktop shell)      | Loses native filesystem/local-first UX that the product vision requires.                                                              |
| HTML as the document source of truth | Makes agent edits unsafe and non-addressable; conflicts with the shared command layer.                                                |
| TypeScript 7 (native compiler)       | Not yet supported by the lint/type ecosystem (`typescript-eslint` peer range).                                                        |
| Storing documents in a database      | Contradicts local-first and complicates user-owned files.                                                                             |

## Follow-ups (P1)

- Implement the document schema and command dispatcher in `core` (with the first real tests).
- Add the preload/IPC allow-list between main and renderer, and move the CSP to response headers.
- Add Playwright for end-to-end coverage of the desktop shell.
- Introduce a license/secret scan and automated dependency updates in CI.

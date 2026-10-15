# Repository Structure

## Top level

```
Auralide Dev/
├─ apps/
│  ├─ desktop/          Electron shell + Vite/React renderer surface
│  └─ cli/              headless CLI entry point
├─ packages/
│  ├─ core/             document model, command layer, validation primitives (UI-free)
│  ├─ renderer/         HTML/CSS/SVG execution surface
│  ├─ canvas/          selection, geometry, manipulation
│  ├─ editor-ui/        React panels, toolbars, inspectors
│  ├─ html-bridge/      sandboxed import/export bridge
│  ├─ agent/            agent-facing command surface
│  └─ exporters/        HTML/PDF/PPTX adapters
├─ docs/
│  ├─ architecture/     overview, repository structure, security baseline, phase plans
│  ├─ decisions/        Architecture Decision Records
│  ├─ agents/           collaboration rules, worktrees, task protocol
│  ├─ qa/               compatibility notes and QA procedures (QA engineer)
│  └─ reports/          implementation and validation reports (per phase, frozen once closed)
├─ scripts/dev/         developer tooling (worktree management)
├─ tests/fixtures/      shared test fixtures (`html/` belongs to the QA engineer)
├─ .github/             CI workflow, PR and issue templates
├─ AGENTS.md            repository-wide rules for humans and agents
├─ turbo.json           task graph and caching
├─ tsconfig.base.json   shared strict TypeScript options
├─ eslint.config.js     flat ESLint config incl. architecture boundary rules
└─ pnpm-workspace.yaml  workspace roots + pnpm policy (allowBuilds, release age)
```

## Workspace rules

- `apps/*` are runnable artifacts (Electron shell, CLI). `packages/*` are libraries consumed by them.
- Every workspace project is private (`"private": true`) and versioned `0.0.0` during P0.
- Internal dependencies use the `workspace:*` protocol and are resolved through `node_modules`
  symlinks; a package's `exports`/`types` point at `dist/`, so dependents see built declarations.
- Therefore `build` must run before type checking a dependent package. Turborepo encodes this:
  `build`, `typecheck` and `test` all declare `dependsOn: ["^build"]`.

## TypeScript configuration

| File                            | Purpose                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `tsconfig.base.json`            | strict options shared by every project (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, …) |
| `<project>/tsconfig.json`       | `noEmit` type check for the whole project, including tests                                                                           |
| `<project>/tsconfig.build.json` | emit configuration; excludes `*.test.ts`                                                                                             |

Cross-package imports resolve through the dependency's built `dist/*.d.ts`. Do not add a `paths`
mapping to package sources: `rootDir` correctness depends on it, and mixing source-resolved types
with `dist` runtime resolution produced emitted files next to sources during P0 (see the P0 report).

## Naming conventions

| Concern          | Convention                                     | Example                            |
| ---------------- | ---------------------------------------------- | ---------------------------------- |
| Package name     | `@auralide/<dir>`                              | `@auralide/core`                   |
| Source layout    | `src/<module>.ts`, one concern per file        | `packages/core/src/result.ts`      |
| Tests            | `src/<module>.test.ts` (co-located)            | `packages/core/src/result.test.ts` |
| Entry point      | `src/index.ts` re-exporting the public surface | `packages/core/src/index.ts`       |
| Relative imports | explicit `.js` extension (NodeNext ESM)        | `import { ok } from './result.js'` |

## Where new code goes

1. Model, command or validation change → `packages/core`.
2. Rendering of model content → `packages/renderer`; interaction/geometry → `packages/canvas`.
3. Panels and controls → `packages/editor-ui`.
4. Import/export of HTML → `packages/html-bridge`; other formats → `packages/exporters`.
5. Agent/CLI surface → `packages/agent`, `apps/cli`.
6. Anything that changes a shared decision → add or update an ADR first.

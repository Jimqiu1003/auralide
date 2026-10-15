# P1 Phase Plan — Runtime & Core Foundation

Status: **active** (started 2026-10-15). Decisions: [`ADR-0002`](../decisions/ADR-0002-p1-runtime-and-core.md).
Previous phase: [`P0 report`](../reports/P0-bootstrap-report.md) (frozen history).

## Goal

Turn the P0 scaffold into something that **actually runs** and can be built on: a real Electron
desktop shell with a safe renderer boundary, and a first structured document model with a validated
command layer that the UI, the CLI and future agents all use.

P1 success is measured by behaviour that can be observed, not by files that exist:

1. `pnpm --filter @auralide/desktop start` opens a window; `pnpm --filter @auralide/desktop dev`
   loads the Vite dev server; both are verified by an automated smoke run.
2. The renderer can reach the main process **only** through a minimal, allow-listed, schema-validated
   IPC bridge; everything else (Node.js, `require`, filesystem, shell, navigation) is unreachable and
   that is proven by negative tests.
3. `@auralide/core` parses, validates and serializes a structured presentation document, and applies
   `slide.create`, `slide.remove`, `element.add`, `element.move`, `element.updateText` and
   `element.remove` through one dispatcher with revision checks, origin recording and undo/redo.
4. A PR-only, CI-gated workflow holds for two developers on two machines.

## Workstreams

| #    | Workstream                         | Branch                        | Owner                        | Depends on | Deliverable                                                                                                                   |
| ---- | ---------------------------------- | ----------------------------- | ---------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| P1.0 | Engineering transition P0 → P1     | `chore/p1-project-transition` | Lead                         | —          | phase docs, ADR-0002, CODEOWNERS, P1 issues, protection re-check, phase dependency preparation                                |
| P1.1 | Desktop runtime foundation         | `feat/p1-desktop-runtime`     | Lead                         | P1.0       | launching Electron (dev + production), preload/IPC security baseline, minimal shell page with stable test ids, smoke evidence |
| P1.2 | Core document & command foundation | `feat/p1-core-commands`       | Core Agent (Lead-owned task) | P1.0       | Zod document model, command dispatcher with revision/origin/undo, Vitest coverage                                             |
| P1.3 | Integration & agent boundary       | `feat/p1-integration`         | Lead                         | P1.1, P1.2 | core callable headless, desktop↔core boundary proven, command protocol note, integration report                               |
| QA-1 | HTML corpus & compatibility        | (QA engineer's own branches)  | Compatibility & QA Engineer  | —          | fixtures + compatibility notes in `tests/fixtures/html/**`, `docs/qa/**`                                                      |

P1.1 and P1.2 are independent (different packages, disjoint files) and run in parallel after P1.0.

## Acceptance criteria

### P1.1 — Desktop runtime

- Electron binary installed and a window observed; smoke run produces a screenshot and a machine-
  readable evidence file.
- Development mode and production build both start; the production Content Security Policy is **not**
  relaxed to make development work (dev gets its own policy).
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` unchanged.
- Preload exposes a frozen, minimal, typed API. No `ipcRenderer`, `require`, `process`, filesystem or
  shell access reaches the renderer — asserted by negative tests.
- IPC: channel allow-list, sender validation, Zod payload validation, and a rejection path that is
  observed in the test output.
- External navigation and `window.open` are denied.
- The page shows the product name, version, runtime status and a working IPC round-trip, with
  `data-testid` attributes for the QA workflow.

### P1.2 — Core

- Zod schemas for presentation, slide, element (text, shape, image reference), geometry, revision and
  edit origin; stable ids; JSON round-trip; explicit `SCHEMA_VERSION`; malformed input rejected.
- No dependency on DOM, React, Electron or Node-only APIs (ESLint boundary rule).
- Six commands, each carrying `operation`, `target`, `payload`, `expectedRevision`, `origin`.
- Dispatcher: target existence, payload validity, stale-revision detection, revision increment on
  success, origin recording, undo/redo, and **no partial mutation** when validation fails.
- Vitest covers success, failure, boundary, undo/redo and revision conflict.

### P1.3 — Integration

- `@auralide/core` is callable headlessly (`node -e "import('@auralide/core')"` style check).
- The desktop surface obtains core capability through the documented boundary (no layer skipping).
- The command protocol is documented for the future CLI/MCP surface.
- A minimal CLI invocation proves the same dispatcher path used by the UI.
- A stable desktop launch entry and test ids exist for the QA workflow.

## Out of scope for P1

Animation, complex HTML import, PPTX/PDF conversion, real-time multi-user collaboration, cloud
services, packaging/signing/auto-update, and any WPS-style full editor UI. The desktop page stays a
diagnostic shell until the core is trustworthy.

## Risks

| Risk                                                  | Mitigation                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Electron GUI cannot be observed in an agent session   | automate the launch with Playwright's Electron driver; capture screenshot + DOM assertions + console log; if a real window cannot be opened, say so and leave a reproducible command |
| Development CSP pressure erodes the production policy | two policies from one source; the production policy is asserted in the built output                                                                                                  |
| Core/desktop coupling shortcuts the architecture      | `packages/core` stays UI-free (ESLint rule) and the desktop only imports its public exports                                                                                          |
| Two developers racing on shared config                | ownership zones + Lead as single integrator (see `docs/agents/COLLABORATION.md`)                                                                                                     |
| Renderer security regressions                         | negative IPC/navigation tests run with the smoke suite, not only happy paths                                                                                                         |

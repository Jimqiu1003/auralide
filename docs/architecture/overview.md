# Auralide Architecture Overview

Status: **P1 — runtime & core foundation** (a really starting Electron shell and a structured document
model with a validated command layer; still no editor UI).
Phase plan: [`p1-plan.md`](p1-plan.md). Decisions: [`docs/decisions/`](../decisions/).

## 1. What Auralide is

An AI-native, local-first HTML presentation editor. The product promise is a three-way combination:

1. **Web-native visual freedom** — slides are HTML/CSS/SVG/JS, not a proprietary shape model.
2. **Direct manipulation** — selection, drag, resize and inline editing with PowerPoint/Figma-like feel.
3. **A shared structured document model** — the same validated command layer is used by the human UI
   and by AI agents, so agent edits are reviewable, addressable and undoable.

Raw HTML is **not** the document of truth. HTML is a rendering and export target produced from a
structured model; imported HTML is parsed into that model and treated as untrusted input.

## 2. Layers

```
apps/desktop ── Electron main process (window, lifecycle, OS integration)
     │
     └── renderer surface (React + Vite)
             ├── packages/editor-ui      panels, toolbars, inspectors
             ├── packages/canvas         selection, geometry, manipulation
             ├── packages/renderer       HTML/CSS/SVG execution surface
             └── packages/html-bridge    sandboxed import/export bridge
apps/cli ───────── headless entry point (scripts, CI, agents)
packages/agent ─── agent-facing command surface (CLI + future MCP)
packages/exporters  HTML / PDF / PPTX adapters
packages/core ──── document schema, command layer, validation, history  (no UI, no Electron)
```

Dependency direction is one-way: `core` is the bottom and must not import any higher layer.
`packages/core/src/**` is ESLint-guarded against importing Electron, React, React DOM and the
higher layers; renderer-side packages are guarded against Node.js APIs.

### Layer responsibilities

| Layer         | Owns                                                                         | Must not own                                    |
| ------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `core`        | Document schema, command definitions, validation, history, revision tracking | Electron, React, DOM, filesystem, network       |
| `renderer`    | Turning model nodes into HTML/CSS/SVG, isolated rendering contexts           | Editor chrome, persistence                      |
| `canvas`      | Hit-testing, selection, transforms, guides, snapping                         | Persistence, exports                            |
| `editor-ui`   | React panels, toolbars, inspectors, keyboard maps                            | Document mutation logic (goes through commands) |
| `html-bridge` | Import/export between the model and untrusted HTML, sandboxing rules         | Direct Node.js/filesystem access                |
| `agent`       | Structured command surface for AI/CLI clients, permission and audit concerns | Rendering, UI state                             |
| `exporters`   | HTML/PDF/PPTX production from the model                                      | Editing, selection                              |

## 3. Command layer (design commitment, implemented in P1)

Every mutation — human or agent — is expressed as a **structured command** applied to the document:

- commands have a stable shape (target, operation, payload) and are validated with Zod schemas;
- elements carry stable identifiers, so commands never address elements by raw HTML position;
- each applied command produces a revision entry with origin (human / agent / import), timestamp and
  inverse operation for undo;
- conflicting concurrent edits are detected by revision comparison rather than by last-write-wins;
- the UI, the CLI and agent tooling all call the same command dispatcher.

This is why `core` owns commands and history while `editor-ui` owns only presentation.

## 4. Rendering and execution boundaries

- Slide content is rendered inside a **sandboxed** context: Electron windows run with
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, plus a Content Security
  Policy in the built shell (see [`security.md`](security.md)).
- Imported HTML/JS never receives Node.js, filesystem or network privileges. Script execution is
  opt-in per document, off by default.
- The Electron main process is the only place with privileged APIs; the renderer talks to it through
  an explicit, validated bridge (added in P1 with a preload script).

## 5. Storage (design commitment, implemented in P1)

Local-first: documents are files on disk owned by the user.

- A project is a directory (or an archive) containing a structured document file plus assets.
- The structured model is the source of truth; rendered HTML is derived.
- History/versioning is append-only and stored next to the document, never only in memory.
- No Auralide server is required to open, edit or export a document.

## 6. Technology baseline

| Concern         | Choice                                    | Recorded in   |
| --------------- | ----------------------------------------- | ------------- |
| Language        | TypeScript strict (6.0.3)                 | ADR-0001      |
| Package manager | pnpm workspaces (12.11.2)                 | ADR-0001      |
| Task runner     | Turborepo 2.11.8                          | ADR-0001      |
| Desktop shell   | Electron 44                               | ADR-0001      |
| UI              | React 19 + Vite 8                         | ADR-0001      |
| Validation      | Zod 4                                     | ADR-0001      |
| Unit tests      | Vitest 5                                  | ADR-0001      |
| E2E (planned)   | Playwright (P1, driven by `apps/desktop`) | this document |
| Lint/format     | ESLint 10 (flat config) + Prettier 3      | ADR-0001      |

Node.js 24 (Active LTS) is the runtime baseline; `engines` in `package.json` enforces it.

## 7. Explicit non-goals for P1

- No editor UI beyond the diagnostic shell: no canvas, toolbars, inspectors or slide editing surface.
- No animation, complex HTML import, PPTX/PDF conversion or real-time collaboration.
- No packaging/signing/auto-update, no release automation, no cloud services or telemetry.

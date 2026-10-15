# @auralide/desktop

Electron shell for Auralide. P1 includes runtime diagnostics and a small text-only slide workbench
to prove the Core boundary (ADR-0002, P1 plan). Main owns an in-memory document; the renderer reads
it and applies `element.updateText` through the validated bridge. Reload document recovers from
stale revisions or a failed read. Closing the application discards this sample session; there is
no save, import/export, asset loading or full canvas editor yet.

## Run

```powershell
pnpm --filter @auralide/core build      # or `pnpm build` at the repository root (turbo builds deps first)
pnpm --filter @auralide/desktop build   # tsc main + vite preload (preload.cjs) + vite renderer
pnpm --filter @auralide/desktop start   # production load path: file://dist/renderer/index.html
```

Development load path (Vite dev server + HMR, same security posture):

```powershell
# terminal 1
pnpm --filter @auralide/desktop dev                 # vite on http://localhost:5173 (strictPort)
# terminal 2
pnpm --filter @auralide/desktop start:dev           # == node scripts/launch.mjs --dev
```

`scripts/launch.mjs` is the stable launch entry (also used by the QA workflow): it removes
`ELECTRON_RUN_AS_NODE`, which some tooling sets globally and which would otherwise make the Electron
binary run as plain Node, without a window.

`AURALIDE_DEV_SERVER_URL` is the only switch between the two load paths; `webPreferences`, the
preload bridge, the IPC allow-list and the navigation guards are identical in both.

## Smoke run

```powershell
pnpm --filter @auralide/desktop smoke          # both modes, sequentially
node test/smoke.electron.mjs dev               # dev only
```

It launches a **real window** (Playwright's Electron driver), asserts the renderer, the frozen
preload surface, the allow-listed ping, the refusal path, the console for CSP violations, and the
per-mode policy; then writes `test-artifacts/<mode>.png` (screenshot) and `test-artifacts/<mode>.json`
(machine-readable evidence: checks, console log, main-process startup line). It needs a desktop
session and is deliberately **not** part of `pnpm verify` / CI.

## Content Security Policy

One source (`vite.config.ts`, plugin `auralide-csp`) injects one of two policies into
`src/renderer/index.html` at the `<!--csp-->` placeholder:

- **build / production**: `script-src 'self'` — no inline script, no `'unsafe-eval'`;
- **serve / development**: additionally `script-src 'unsafe-inline'` (Vite's inline React Refresh
  preamble) and `connect-src ws://localhost:5173` (HMR).

Development never widens production, and the placeholder is mandatory: if it is missing the plugin
throws instead of emitting a page without a policy. The smoke run asserts both directions — the
built `dist/renderer/index.html` stays strict, the served dev page carries the dev policy.

## Troubleshooting

| Symptom                                                           | Cause / fix                                                                                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Process failed to launch!` from the smoke run                    | `ELECTRON_RUN_AS_NODE=1` is set in the shell (some agent/CI shells do this) — Electron then runs as plain Node and opens no window. Unset it. |
| Window is blank, `runtime-status` says `error: ...`               | The preload is missing or stale: rebuild with `pnpm --filter @auralide/desktop build` (`preload.cjs` must exist next to `main.js`).           |
| A second `pnpm start` seems to do nothing                         | `app.requestSingleInstanceLock()` focuses the running instance instead of opening a second one.                                               |
| `error during build: Rolldown failed to resolve "@auralide/core"` | `@auralide/core` was not built. Build it first, or build through turbo (`pnpm build`), which orders dependencies.                             |
| `vite` fails with "port already in use"                           | `strictPort: true` on purpose: another dev server is running. Stop it or change the port **and** the dev CSP together.                        |

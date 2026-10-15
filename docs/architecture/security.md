# Security and Dependency Baseline

Status: **P0** — this document records the rules and constraints that later phases must honor.
Nothing here replaces a threat model for the finished product.

## 1. Secrets

- Secrets never enter Git: `.env` and `.env.*` are ignored, only `.env.example` is tracked.
- Credentials live in environment variables or user-local files outside the repository.
- Never paste a token into an issue, a commit, a test fixture or this documentation.
- Use the official interactive flows for authentication (`gh auth login`, credential managers).
- `*.pem`, `*.key`, `*.p12`, `*.pfx` and `secrets/` are ignored by `.gitignore`.
- Avoid logging secrets; the CLI never prints environment values.

## 2. Supply chain

| Control                  | Setting                                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reproducible installs    | committed `pnpm-lock.yaml`; CI runs `pnpm install --frozen-lockfile`                                                                                                                                                                                                         |
| Dependency build scripts | denied by default (`pnpm-workspace.yaml` has no `allowBuilds` entries); `strictDepBuilds` is true, so meeting an unreviewed install script fails the install with `ERR_PNPM_IGNORED_BUILDS` instead of running it. Verified: no dependency in the P0 tree requires approval. |
| Fresh-release protection | pnpm `minimumReleaseAge`; currently `react`/`react-dom@19.3.1` are excluded because they were published inside the window. Remove the exclusion once the versions age.                                                                                                       |
| Registry                 | default `https://registry.npmjs.org`; changing it is an ADR-level decision                                                                                                                                                                                                   |
| Lockfile verification    | pnpm 12 verifies the lockfile against supply-chain policies on install                                                                                                                                                                                                       |

Rules:

- Adding a dependency requires: a stated reason, a check of its license, and a check that it is
  maintained. Prefer the standard library and packages already in the tree.
- Do not add a dependency only to shorten a few lines of code.
- Review a package's install scripts before adding it to `allowBuilds`; `dangerouslyAllowAllBuilds`
  is never enabled in this repository.
- `electron@44` no longer ships a postinstall: its binary is downloaded on first use by the
  `electron` entry point, so the desktop shell needs no build approval (and the binary is absent
  until the app is first started).
- Do not vendor or copy code from GPL/AGPL projects into this Apache-2.0 codebase.

### License policy

- Project license: **Apache-2.0** (`LICENSE`, `NOTICE`).
- Allowed without extra review: MIT, ISC, BSD-2/3-Clause, Apache-2.0, 0BSD, CC0, Unlicense.
- Requires review and a recorded decision: MPL-2.0, LGPL (dynamic linking only), CC-BY-*, and any
  custom license.
- Not allowed in the product: GPL, AGPL, SSPL, or unlicensed/vendor-proprietary code, including
  copied HTML/JS samples. Imported presentation content must come from the user.
- Preserve copyright headers when adapting third-party code, and record the origin in the ADR or
  the commit message.

### Dependency inventory (P0 baseline)

Installed at bootstrap (all permissively licensed — verify before adding more):

| Package group                                                       | License          | Scope                 |
| ------------------------------------------------------------------- | ---------------- | --------------------- |
| `typescript`, `turbo`, `vitest`, `vite`, `eslint` and their plugins | MIT / Apache-2.0 | development only      |
| `react`, `react-dom`                                                | MIT              | renderer runtime      |
| `electron`                                                          | MIT              | desktop shell runtime |
| `zod`                                                               | MIT              | runtime validation    |

Re-verify with a license scan (for example `pnpm licenses list`) when the dependency set changes;
P0 added no runtime dependency beyond React, Electron and Zod.

## 3. Untrusted HTML execution (future-facing constraints)

Presentations are HTML, so the product will eventually execute user-supplied markup and script.
That is the highest-risk surface of the product, and the constraints are fixed now:

1. **No Node.js in renderers.** Electron windows keep `contextIsolation: true`,
   `nodeIntegration: false`, `sandbox: true`. `webSecurity` stays on. `apps/desktop/src/main/main.ts`
   is the single place where these defaults may change, and only through an ADR.
2. **Privileged APIs behind an explicit bridge.** Filesystem, persistence and export live in the
   main process and are reached through a validated, allow-listed API surface (preload + IPC). No
   `remote` module, no generic `ipcRenderer.send(channel, anything)` passthrough.
3. **Sandboxed rendering contexts.** Imported slides render in isolated frames/contexts with a
   restrictive CSP; scripts are opt-in per document and disabled by default. `object-src`,
   `frame-src` and `base-uri` stay `'none'`.
4. **No network by default.** Imported content must not be able to exfiltrate local data; remote
   resource loading is blocked unless the user enables it.
5. **Sanitize on import.** HTML import goes through `packages/html-bridge`, normalizes markup, and
   drops executable content that is not part of the model.
6. **Treat file paths as hostile input.** Exports and asset writes are restricted to the project's
   own directory; path traversal (`..`, absolute paths, UNC) is rejected.
7. **No arbitrary code execution on behalf of agents.** An agent command that would write files,
   run processes or reach the network requires explicit user approval; the command layer records
   the origin of every mutation.

### Known gaps (P0)

- The CSP is delivered by a `<meta>` tag in the built shell; the Vite dev server injects an inline
  React Refresh preamble, so `pnpm dev` needs a relaxed `script-src` until a dev-specific policy
  (or header-based CSP from the main process) is implemented in P1.
- No preload/IPC bridge exists yet, so there is no privileged API surface to review; adding one
  requires the allow-list review described above.
- Dependabot/automated dependency updates and secret scanning are not enabled yet (see P1
  recommendations in the P0 report).

## 4. Repository hygiene

- Build output (`dist/`), caches (`.turbo/`), coverage and logs are ignored.
- Generated TypeScript output must never be written next to sources; `rootDir`/`outDir` per project
  is what prevents it (this failed once during P0 — see the report).
- Commits are reviewed through Pull Requests; `main` is protected as far as the GitHub plan allows
  (see the P0 report for the exact, verified state).

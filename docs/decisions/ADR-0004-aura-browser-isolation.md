# ADR-0004 — Aura Browser isolation and inspection POC

- Status: **Accepted for the bounded POC** (owner's P1.5 mission); expanded execution permissions remain proposed
- Date: 2026-10-15
- Extends: [ADR-0001](ADR-0001-foundation.md), [ADR-0002](ADR-0002-p1-runtime-and-core.md), [ADR-0003](ADR-0003-platform-support.md)
- Scope: Issue #16; [runtime design](../architecture/aura-browser.md), [tool contract](../architecture/agent-browser-contract.md)

## Decision

Use Electron WebContentsView, owned by main, for Aura Browser guests. The trusted React shell
measures a placeholder; main validates and clips its bounds. BrowserView and webviewTag are not used.
Each mode has a private, nonpersistent Session, separate from the shell and other modes. Guests have
no preload, Node integration, editor IPC, filesystem capability or public JavaScript executor.
Keep context isolation, sandbox and web security enabled. Deny permissions, downloads, popups,
navigation and all requests except the controller's exact generated main-frame document.

The POC implements inert Core slide HTML and one reviewed HTML Lab fixture. It does not load
arbitrary files, URLs, scripts or assets. Preview rendering lives in the existing renderer package
so later HTML export can share it. Core and its mutation/history paths are unchanged.

Expose named, strict Zod-validated tools to the authenticated shell. Revision-sensitive reads reject
stale state before and after asynchronous work. Only fixed, reviewed inspection snippets run in the
guest; callers supply a stable element ID, never executable code or a selector. Audit metadata is
bounded and excludes document text and screenshot data. External Agent authentication and grants
are not implemented by this shell-only bridge.

Native views cannot be covered by React z-index. Hide the guest before showing an overlapping shell
dialog, restore it afterwards, and explicitly close every guest on tab/window teardown. Limit the
POC to two tabs (one per implemented mode), reusing mode Sessions rather than creating unlimited
partitions. Bounds use DIP, accounting for shell zoom once; do not multiply by devicePixelRatio.

## Consequences and further gates

The POC proves isolation, layout and structured inspection; it does not establish a safe general
HTML execution environment. Controlled JavaScript/animation, file selection, resource allow-lists,
Web Research navigation and third-party inspection each need a separate reviewed capability policy.
Opening a website will not implicitly authorize reading its sensitive contents.

The four-mode product design remains valid, but Web Research and external Agent Inspect transports
are deferred. Storage, exports and full editor UI are also deferred. This extends ADR-0002's named
bridge without relaxing production CSP or introducing another document mutation path.

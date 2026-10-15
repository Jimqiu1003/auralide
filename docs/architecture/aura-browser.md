# Aura Browser

Status: P1.5 isolated runtime POC. Decision: [ADR-0004](../decisions/ADR-0004-aura-browser-isolation.md).

## Modes and actual scope

| Mode          | P1.5 implementation                                                                      | Deferred                                                                        |
| ------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Slide Preview | Core slide to escaped HTML/CSS/SVG; stable IDs; fit to pane; diagnostics and PNG capture | Assets, animations, controlled JavaScript, full screen presentation, export     |
| HTML Lab      | Reviewed local `layout-basics` fixture; original grid layout remains intact              | Arbitrary local files, generated HTML import, CSS editing                       |
| Web Research  | Architecture only                                                                        | Address bar, back/forward/reload, remote pages, material capture                |
| Agent Inspect | Typed shell-only tools, revision checks, fixed inspection, bounded audit                 | External Agent transport/authentication, capability consent UI, selection tools |

## Ownership and trust

`BrowserController` in desktop main owns tabs, WebContentsView, Sessions, bounds, lifecycle and
inspection. Main owns the Core document. The trusted shell requests rendering and supplies a
measured rectangle; guests never receive its contextBridge. Existing document edits still use
`applyCommand` and the Core Dispatcher. The CLI uses that same Core implementation.

`packages/renderer/renderSlideHtml` is a pure, validated rendering path: escaped text/IDs,
allow-listed literal colors, geometry and inert SVG shapes. Image references render placeholders;
there are no asset reads. It is available to a future exporter, which is not implemented here.
Preview HTML denies scripts, network, frames and objects in CSP; only inline styles are allowed.
The shell's existing distinct production/development CSP remains independent.

Each mode uses a random, private, nonpersistent Session. Preview and Lab never share the editor
Session. All permission/device checks, downloads, windows, webviews, navigation and redirects are
denied. Request interception only allows the exact controller-generated data URL as a main frame.
Every guest keeps `contextIsolation`, `sandbox`, `webSecurity` true and `nodeIntegration` false.
No preload or generic IPC is injected. These restrictions intentionally rule out Web Research today.

Future research requires its own partition and resource/navigation policy, explicit origin display,
and scoped user consent for inspection/capture. An open tab alone is not a grant. Never reuse the
editor Session or expose arbitrary executeJavaScript, file access or shell commands.

## Layout and lifecycle

The shell uses ResizeObserver, resize/scroll/visibility listeners and animation-frame coalescing.
Only a fully visible placeholder is shown. Main validates finite bounds, multiplies CSS coordinates
by shell zoom once, clips to content DIP and hides inactive/minimized/zero-sized guests. Preview
zoom fits document dimensions; HTML Lab does not rewrite its source layout.

The POC has one tab per implemented mode, at most two live guests and two reusable mode Sessions.
Replacing/closing a tab explicitly closes its webContents. Window disposal removes listeners and
closes all guests. Minimize/restore, split resizing and shell overlays have actual smoke probes.
Before the shell modal opens, it awaits hiding the native guest; closing restores visibility.
General menus/palettes/docking are not implemented by this diagnostic UI.

Screenshot requests require a visible current tab, bounded DIP dimensions/area and PNG bytes.
OS scaling can increase physical raster allocation; stress testing at high DPI and moving between
mixed-DPI monitors remains a QA gate, not established by unit tests or CI startup alone.

## Verification boundary

Run `pnpm verify`, `node --test scripts/qa/platform-evidence.test.mjs`, platform evidence collection,
and `pnpm --filter @auralide/desktop smoke`. Smoke launches actual production and Vite windows,
verifies guest preferences/session separation, stable-ID inspection, PNG capture, denied inputs and
network, split layout, modal/minimize restoration and guest cleanup. Unit tests independently cover
stale revisions, bounds clipping and bounded audit. See [P1.5 report](../reports/P1.5-report.md) for
executed results; a configured runner is not a PASS.

Cross-platform pixel equality is not claimed. System Arial fallback/rasterization can differ.
Before visual parity becomes a release promise, choose redistributable fonts and compare reviewed
reference fixtures on both native platforms, including 125%/150% Windows scaling and Retina.

# Auralide component system — P1.5 proposal

Status: **Proposed**. Applies to trusted editor chrome; slide content has independent styling.
The wireframe demonstrates tokens and region placement without adding a React component library.

## Tokens

| Semantic token | Light     | Dark      | Use                                   |
| -------------- | --------- | --------- | ------------------------------------- |
| `canvas`       | `#f1f3f5` | `#12171e` | Workspace surround                    |
| `surface`      | `#ffffff` | `#1c242e` | Panels and controls                   |
| `text`         | `#182330` | `#edf2f7` | Primary copy                          |
| `muted`        | `#4b596b` | `#bcc8d6` | Secondary copy                        |
| `border`       | `#758396` | `#8392a4` | Control and panel boundaries          |
| `accent`       | `#2556b8` | `#a7c8ff` | Active state and focus                |
| `active`       | `#e3ebfa` | `#293d58` | Selected control fill                 |
| `danger`       | `#a51e31` | `#ffb4be` | Destructive action / error, with text |

Theme choices: Light, Dark and System. System follows `prefers-color-scheme`, including changes
while open. Persist preference only when application settings exist; this wireframe uses memory.
Verify final text contrast ≥4.5:1 (3:1 for large text), essential boundary/focus contrast ≥3:1 against
adjacent backgrounds. Theme switching must preserve focus, selection and document colors.

Spacing scale: 4, 8, 12, 16, 24, 32 DIP. Control height: 32 DIP; compact rows 28 DIP with adequate
hit area; comfortable controls 40 DIP. Radius: 4/8 DIP; no semantic reliance on shadow. Focus:
2 DIP accent outline with 3 DIP offset. Hover uses active fill; pressed/selected also has a border
and textual/ARIA state. Disabled has native semantics and an explanation if the reason is not clear.

Chrome typography: `system-ui, "Segoe UI", sans-serif`, 14px/1.5 body, 12px labels, 16px section,
24px review heading; use tabular numerals for geometry and revisions. Windows/macOS system fonts
will differ. A deterministic slide font requires a separately approved distributable font asset,
explicit fallback policy and font-ready capture; none is bundled or licensed by this proposal.
Do not claim identical line wrapping or pixel rendering from these system stacks.

## Component and interaction contracts

| Component            | States and behavior                                                             | Keyboard / verification                                                                                 |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Workspace navigation | Current destination named; preserves document/selection                         | Native buttons now; future tabs require full tablist/tabpanel and arrow-key pattern                     |
| Slide thumbnails     | Ordered slide ID, label, selected state, preview alternative                    | Arrow navigation; insert/reorder only through commands when available; move buttons as drag alternative |
| Layer tree           | Stable element ID, label, type, lock/visibility state, order                    | Implement ARIA tree only with full arrow/expand behavior; use ordinary lists until then                 |
| Property inspector   | Unit-labeled fields, mixed-value state, dirty draft, validation errors          | Enter commits one command; Escape reverts draft; stale revision preserves draft and offers refresh      |
| Context menu         | Selection-aware actions, disabled reason; no third-party DOM actions by default | Context Menu key / Shift+F10; Escape closes, focus returns to invoker; native menu over guest           |
| Command palette      | Search labeled actions, scope and shortcut; no arbitrary code execution         | Ctrl+K / Cmd+K; modal focus trap, Escape close, restore focus; hide guest when overlapping              |
| Aura Browser tabs    | Mode, title/origin, loading/error, close action, permission indicator           | Next/previous tab and close have menu equivalents; tab selection does not grant capture permission      |
| Docked panel         | Named region, collapse/restore, bounded width/height                            | Keyboard resize alternative; restore focus if hidden; no arbitrary docking in P1.5                      |
| Agent proposal       | IDs, expected revision, source, capability scope, diff, result/audit reference  | Apply uses dispatcher; reject preserves document; conflict cannot silently retry                        |
| Diagnostics          | Severity, stable element/tab ID, revision/time of measurement                   | Plain-text list navigable without screenshots; no secrets or automatic third-party extraction           |

Proposed editor shortcuts: primary modifier is Ctrl on Windows and Cmd on macOS. Undo is primary+Z;
Redo is Ctrl+Y on Windows and Cmd+Shift+Z on macOS; palette primary+K; Escape closes temporary UI.
Use native menu roles for text editing and OS conventions; do not intercept typing or guest browser
shortcuts globally. macOS gets application/Edit/Window menus and native traffic-light area; Windows
gets a conventional application menu and native caption buttons. Test both in a real Electron window.

## Radix / shadcn evaluation

[Radix accessibility documentation](https://www.radix-ui.com/primitives/docs/overview/accessibility)
describes primitives handling focus, keyboard and ARIA details. This is a suitable candidate for
dialogs, menus and tabs, but integration with native guest surfaces remains application work.
[shadcn/ui](https://ui.shadcn.com/) distributes editable component source;
its [component catalog](https://ui.shadcn.com/docs/components) includes menus, dialogs and resizable
panels. It can accelerate selected components, but importing a catalog adds maintenance ownership
and does not prove accessibility. Reviewed 2026-10-15.

Decision: **evaluate only; neither installed**. Retain native HTML controls for the wireframe. After
IA selection, add only a concrete needed component (likely Dialog or Context Menu) if existing
components do not serve it. Before adoption check the exact package/version, primary repository,
license files and dependency licenses, release activity, install scripts, React compatibility and
lockfile diff. No registry executable or remote preset runs as part of this documentation task.

## Installed skills audit

The following entry files were present and read on 2026-10-15. Local presence is verified;
tool access to a specific Figma file or a successful future workflow is not implied.

| Requested capability       | Existing skill path under `C:/Users/Jim/.codex/`                                                      | Use boundary                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| figma-design-to-code       | `plugins/cache/openai-curated-remote/figma/16.0.0/skills/figma-design-to-code/SKILL.md`               | Apply when an owner-selected Figma source is supplied; no Figma file needed for editable HTML wireframes |
| web-design-guidelines      | `skills/web-design-guidelines/SKILL.md`                                                               | Refresh its official guideline source before a UI compliance audit                                       |
| react-best-practices       | `plugins/cache/openai-curated-remote/build-web-apps/0.1.2/skills/react-best-practices/SKILL.md`       | Use for actual React changes, not a reason to add dependencies                                           |
| shadcn                     | `plugins/cache/openai-curated-remote/build-web-apps/0.1.2/skills/shadcn-best-practices/SKILL.md`      | Use if adopting individual components; no initialization in this phase                                   |
| frontend-testing-debugging | `plugins/cache/openai-curated-remote/build-web-apps/0.1.2/skills/frontend-testing-debugging/SKILL.md` | Use available browser tooling to validate rendered flows; record fallback if Browser plugin absent       |

Two project skills are supplied under `.agents/skills/`: `auralide-ui-engineer` and
`aura-browser-engineer`. They constrain future implementation to selected UI direction, ADRs,
existing command boundaries and observed tests. No duplicate global skills are installed.

## QA handoff

Lead validates all 12 direction/workspace combinations, Light/Dark/System, keyboard-only direction
and workspace switching, focus visibility and 960/1440 DIP layouts. Then coordinate with the human
QA owner through Issue/PR before adding fixtures or files in `docs/qa` and `tests/fixtures/html`.
Production acceptance additionally needs screen-reader review, real DPI/multi-display resize,
native menus, guest overlay/focus tests and Windows/macOS screenshots. Wireframes cannot verify
those native behaviors. Artifact-specific browser results belong in the P1.5 report, not assumptions.

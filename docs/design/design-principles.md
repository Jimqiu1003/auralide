# Auralide design principles — P1.5 proposal

Status: **Proposed, owner selection pending**. Date: 2026-10-15. Scope: Issue #17,
P1.5-C. These specifications and the HTML wireframe are review artifacts, not a working editor.
No direction is approved by its inclusion here. No new runtime dependency is installed.

## Architecture before appearance

The Core document is the source of truth. Selection is UI context containing stable document,
slide and element IDs plus the observed revision; it is not a mutable copy of a document.
Human and Agent edits use the existing dispatcher and typed errors. A conflict preserves the
user's draft and asks for refresh/review; it never silently retries against a new revision.
Undo restores content while the revision increases (ADR-0002). Keep Core free of React and Electron.

The trusted React shell owns menus, panels and capability controls. Aura Browser owns isolated
guest surfaces. Imported HTML cannot acquire the shell preload. Preview and future export should
consume one rendering contract; this proposal does not implement export or loosen script policy.
See ADR-0001, ADR-0002 and the P1.5 platform/browser ADRs when integrated.

## Interaction rules

- Put the slide and the selected object's properties in a stable relationship. Switching workspaces
  preserves selection, slide and zoom; a surface switch must not become a document edit.
- Show document revision and operation result next to Agent review. Distinguish a proposed change,
  an applied command, a conflict and a screenshot that verifies only appearance.
- Expose object identity and reading order in Layers. Human labels may change; stable IDs do not.
  Invisible and locked objects remain discoverable. Do not infer editability from a screenshot.
- Use labeled actions and progressive disclosure. Advanced properties belong in Design/Layers;
  browser permissions belong in Aura Browser; Agent capability grants remain visible.
- UI theme affects chrome, not slide colors. A light slide stays light in a dark workspace.
- Preserve focus and keyboard access through panel transitions. Never rely on hover, dragging,
  color, or an unlabeled icon as the only route to an operation.
- Each persisted change needs the command result; a UI animation or optimistic thumbnail is not
  proof of success. Errors remain visible until resolved; do not hide conflicts in a transient toast.

## Evidence from existing products

These are narrow observations from official documentation, checked 2026-10-15, not endorsements of
entire interfaces. Proposed Auralide applications are design inferences and require user testing.

| Source observation | Auralide design inference |
| --- | --- |
| Keynote distinguishes navigator and slide-only views, with an object list in those views. [Apple guide](https://support.apple.com/en-au/guide/keynote/tanae4979928/mac) | Keep slide navigation and object selection explicit, allowing canvas-focused work. |
| WPS provides a Selection Pane through its Select menu. [WPS Academy](https://www.wps.com/academy/how-to-use-select-feature-in-wps-presentation/1862117/) | Offer an object list route when overlapping objects prevent direct selection. |
| Canva exposes layers through Position. [Canva Help](https://www.canva.com/help/finding-and-arranging-layers/) | Let users identify and arrange objects without disturbing slide layout. |
| Figma Slides separates simple slide authoring from Design mode and its advanced controls. [Figma Slides](https://www.figma.com/slides/) | Compare a task workspace direction with a persistent-panel direction. |
| Slides.com provides HTML/CSS developer controls and HTML export. [Developer mode](https://slides.slides.com/news/slides-for-developers), [HTML export](https://slides.com/docs/export-to-html) | Preserve an HTML-oriented inspection surface, while retaining Core as truth rather than copying its raw-HTML editing model. |

## Acceptance for the next UI implementation

The owner selects an information architecture from [ui-architecture.md](ui-architecture.md).
Then implement one selected workflow at a time with the component contracts in
[component-system.md](component-system.md). Do not build all three alternatives into the application.
Capture Windows x64 and real macOS ARM64 screenshots at the same document, viewport and zoom;
report font fallback and rasterization differences rather than claiming pixel parity. Keyboard,
contrast and screen-reader checks remain independent gates from screenshot review.

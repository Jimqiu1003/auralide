# P1.5 UI architecture alternatives

Status: **Proposed — no primary direction selected**. Issue #17. Review the editable, standalone
[HTML wireframe](workspace-wireframes.html). It has three directions, four workspace views per
direction, theme and platform controls. All content is sample data; no documents, files, agents or
network resources are opened. Editing its HTML/CSS source changes the wireframe.

## Shared workspace responsibilities

| Workspace     | Primary question                                     | Required context                                                                                  |
| ------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Editor        | What does this slide communicate?                    | Slide sequence, preview, selected object, basic properties                                        |
| Design/Layers | How is this object structured and placed?            | Layer identity/order, geometry, layout rules, advanced properties                                 |
| Aura Browser  | How does this presentation or sample behave in HTML? | Tabs with explicit mode, URL/origin, permission state, diagnostics                                |
| Agent         | What will change, why, and how can it be verified?   | Selection IDs, expected revision, capability scope, command proposal/result, audit and screenshot |

Workspace choice does not change document content. Model state lives in the existing main-process
document service; all mutation uses Core. Shell selection state and view layout are separate.
Only a validated capability may connect an Agent request to a document operation.

## Three substantive alternatives

| Dimension                             | A — Canvas first / stable panels                                          | B — Task workspaces / progressive panels                                      | C — Research + Agent / dual surface                                                             |
| ------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Primary layout                        | Left slide rail, central slide, persistent right properties               | Left task rail, large task content; contextual lower shelf                    | Persistent left intent/context column, central authoring surface, right Aura comparison surface |
| Navigation                            | Horizontal workspace buttons, canvas keeps its position                   | Vertical Editor / Design / Aura / Agent destinations replace center and shelf | Horizontal document/surface navigation, context column anchors tasks                            |
| Layers                                | Left rail alongside thumbnails, expands in Design                         | Full-height left column only in Design; summary elsewhere                     | Left context column under selection, shared by both surfaces                                    |
| Inspector                             | Persistent right column; Agent replaces inspector only in Agent workspace | Bottom shelf in Editor/Design; diagnostics shelf in Aura                      | Lower part of central authoring surface; diagnostics beside browser                             |
| Agent entry                           | Top Agent destination opens review in right panel                         | Dedicated Agent destination with full proposal/result workspace               | Always-visible intent/history column; Agent workspace expands audit                             |
| Aura entry                            | Top Aura destination replaces the central slide with tabs                 | Dedicated Aura destination with address strip and lower diagnostics           | Always-visible right surface; Aura workspace enlarges browser share                             |
| Windows / macOS                       | Native titlebar, Windows menu vs macOS application menu; Ctrl vs Cmd      | Same native chrome, task navigation stays in content area                     | Same native chrome, split bounds use DIP on both platforms                                      |
| Cost to inspect an object from Editor | Select once; properties already visible                                   | Select once for shelf; one Design switch for full layers                      | Select once; context stays beside browser                                                       |
| Cost to compare with a web reference  | Switch to Aura and back; two transitions                                  | Switch workspace and back; two transitions                                    | No workspace switch; focus crosses the divider                                                  |
| Benefit                               | Predictable positions, lower mode-switch cost during editing              | Most space for current task, fewer simultaneous controls                      | Reference and command evidence stay beside the slide                                            |
| Tradeoff                              | Panels reduce canvas width; dense on small windows                        | More context switches; shelf consumes vertical space                          | Two surfaces reduce slide size; cross-surface focus and privacy are harder                      |
| Suitable evaluation                   | Repeated slide/object adjustments                                         | New users alternating authoring and inspection                                | Research-heavy, Agent-assisted layout validation                                                |

Counts describe proposed explicit transitions from the initial Editor view, not measured performance.
The wireframe illustrates layout differences; it does not simulate object editing, docking or runtime.

## Panel and surface behavior

- Initial proposal: minimum shell width 960 DIP; narrow review windows stack panels and retain reading
  order. Production minimum size must be chosen after testing on 1280×800 laptops at OS scaling.
- Use fixed semantic regions, not arbitrary desktop docking in P1.5. Later docking may resize or
  collapse named panels with a keyboard alternative; no free floating windows until a need is proven.
- Native WebContentsView is above React DOM. A higher CSS z-index cannot place a React menu above
  it. Before a shell dialog, palette or context menu overlaps the guest: hide/detach the guest,
  present trusted UI, then restore bounds and focus on close. Alternatively use a reviewed native
  menu. Do not draw security warnings inside untrusted guest content.
- Size guest views from the shell's measured visible content rectangle, in Electron DIP. Resize,
  sidebar collapse, display scale changes, minimize/restore and teardown need runtime tests.
- Keyboard focus must identify shell vs guest; Escape exits guest interaction to a named shell
  control. Guest keystrokes cannot invoke privileged editor commands accidentally.
- Separate Preview, HTML Lab and Web Research origins/sessions. Research capture requires an
  explicit scoped grant; no automatic DOM extraction merely because a page is open.

## Owner decisions requested after review

1. Choose A, B or C as the primary IA (or identify specific changes before selection).
2. Confirm initial panel density and acceptable minimum canvas area on a laptop.
3. Confirm whether Agent should be persistent (C) or a workspace (A/B).

The options do not approve script permissions, arbitrary docking, persistence, packaging, or export.
Those remain separate implementation/architecture decisions. macOS native chrome and real
WebContentsView stacking are specifications here, not behavior proven by this HTML artifact.

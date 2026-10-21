# ADR-0006 — HTML compatibility and one writing authority

- Status: **Proposed — owner review required**
- Date: 2026-10-15
- Extends ADR-0001/0002/0004; bounded file conversion separately authorized by the owner on 2026-10-17

## Current state and proposal

Native structured Presentation remains the only editable authority. Its escaped HTML/CSS/SVG output
is derived and can be regenerated; it is not independently writable document state. Aura loads that derived output and reviewed inert fixtures. Imported sources are inspected in a
separate, disposable guest; arbitrary remote pages remain unsupported.

Future imports retain original source bytes/assets as immutable provenance, with hashes and a
conversion report. Only explicitly supported text/shape/image mappings become native objects via
validated commands. Unsupported CSS/layout/scripts/custom components stay opaque, preview-only or
restricted source components in a separate capability domain; no claim of arbitrary lossless HTML
conversion. A source edit makes a new source revision and requires explicit reconversion/replacement,
never silent synchronization with native objects or two live writing authorities.

Conversion reports must list source nodes, resulting stable IDs, supported/approximated/dropped
features and visual differences. The user reviews loss before applying. Unknown HTML and remote
pages receive separate sandboxed Sessions, no editor preload/Node/filesystem/keys, denied permissions
and independently reviewed resource/script policy. Sanitization is not permission to execute code.

## Alternatives and consequences

Using raw HTML as native truth loses structured command guarantees; bidirectional DOM/model editing
creates ambiguous ownership. Flattening everything hides losses and destroys editability. The chosen
boundary preserves provenance and honest compatibility at the cost of explicitly limited import.
No parser, dual-write synchronization, script permission or new dependency is authorized by this ADR.

Validation before implementation: QA fixtures with unsupported layouts/scripts, source hash
preservation, deterministic conversion reports, explicit loss acceptance, escaped native rendering,
and negative tests proving imported guests cannot call privileged IPC. Pixel similarity alone does
not prove semantic/native editability.

## Authorized bounded implementation — 2026-10-17

The owner explicitly requested HTML import/export and Save As, prioritizing single-file multi-slide
presentations. This authorizes the following slice without accepting every future proposal above:

- UTF-8 local HTML (20 MiB maximum) is inspected in a hidden sandboxed BrowserWindow with no preload,
  Node, scripts, external resources, downloads or granted permissions. Only fixed main-owned DOM
  inspection executes. Conversion is bounded to 50,000 nodes, 100 pages and 10,000 native objects.
- Static `.slide`, `data-slide`, `data-slide-id`, Reveal-style sections and direct body sections are
  recognized. Embedded CSS determines measured text/basic shapes. Typography, stacking, transparency,
  complex transforms and unsupported media are explicitly lossy; no arbitrary pixel-fidelity claim.
- A native confirmation lists conversion warnings before replacing anything. The selected source is
  untouched; exact UTF-8 bytes, SHA-256 and source-to-element mappings are retained under userData's
  `html-imports`. Converted objects are staged with Core commands, then adopted atomically as an
  unsaved, unbound document. A rejection, cancellation or cache failure preserves the active document.
- Derived offline HTML includes escaped, schema-validated native metadata. Reopening Auralide-produced
  HTML hydrates that metadata under the same boundary as JSON; unknown metadata is refused. Its
  generated standalone player may execute only in the exported file, never in imported guests/Aura.
- Save As selects a new native file grant and binds only after successful atomic write. Saving a bound
  HTML file regenerates from Core and keeps the existing fingerprint/backup protections. Export is a
  separate derived snapshot; it does not clear dirty state or change the active file binding.

Original HTML is immutable provenance, not a second editable authority. A third-party plugin API
remains Proposed and unimplemented.

## Owner-authorized packaged source components — 2026-10-21

The owner requested two sequential increments: self-contained offline HTML with dynamic content and
round trips, followed by bounded internal source-element editing. This extends the experimental
slice; it does not accept every proposal in this ADR or change Aura's inert preview policy.

Core 1.1 adds media/source asset references, source revisions, entrances and slide transitions. Core
still contains no resource bytes, DOM or platform code. Bundle v2 stores the validated document plus
SHA-256-addressed resources; old JSON/HTML v1 remain readable. The document body retains its 20 MiB
limit; resource-containing files and final UTF-8 HTML have a 100 MiB cap including base64 overhead.
Upgrade saves cannot replace the old bound file. Existing atomic writes/conflict backups remain.

Source import parses detached DOM in an isolated helper without loading or executing source code.
Main collects only native-dialog-granted local resources and explicitly requested, credential-free
public HTTPS resources. Static module/CSS dependencies are rewritten to content addresses. Missing
resources, APIs/computed dependencies, nested frames, unsupported srcset and cyclic imports refuse
the complete import/export rather than producing a misleading offline-success result.

The same derived player is used for exported HTML and a separate unprivileged playback window.
Native audio/video have explicit controls. Source frames have opaque origins and no scripts until
the user enables them; they never get same-origin, Node, preload, file grants or editor IPC. Resource
CSP allows only embedded data, while connect/object/form/base access stays denied. Main additionally
intercepts network, denies permissions, downloads, popups and navigation. The editor's script policy
and Aura's script/network policy remain unchanged; the shell only adds embedded-font loading.

Original HTML bytes remain immutable resources. Supported internal edits produce new source assets
through commands/revision checks; a live DOM is never adopted as document state. This is not a promise
of arbitrary HTML fidelity, arbitrary script analysis or arbitrary DOM-native equivalence.

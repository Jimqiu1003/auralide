# ADR-0006 — HTML compatibility and one writing authority

- Status: **Proposed — owner review required**
- Date: 2026-10-15
- Extends ADR-0001/0002/0004; no general HTML parser implemented

## Current state and proposal

Native structured Presentation remains the only editable authority. Its escaped HTML/CSS/SVG output
is derived and can be regenerated; it is not independently writable document state. Aura POC only
loads that output and a reviewed inert fixture. Arbitrary imported or remote content is unsupported.

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

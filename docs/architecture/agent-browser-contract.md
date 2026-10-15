# Browser–Agent contract

Status: bounded shell POC implemented; external Agent transport and capability grants deferred.
Types and strict Zod input schema: `packages/agent/src/browser-contract.ts`.
Decision: [ADR-0004](../decisions/ADR-0004-aura-browser-isolation.md).

## Implemented operations

All requests are `{ tool, input }`; unknown properties and unknown tools are rejected.

| Tool                                 | Input                                           | Result                                                                           |
| ------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `browser.open`                       | `fixture: 'layout-basics'`                      | HTML Lab tab                                                                     |
| `browser.listTabs`                   | Empty object                                    | Tab metadata array                                                               |
| `browser.activate` / `browser.close` | `tabId`                                         | Tab / null                                                                       |
| `preview.render`                     | `slideId`, `expectedRevision`                   | Core preview tab                                                                 |
| `preview.inspectElement`             | `tabId`, stable `elementId`, `expectedRevision` | ID, tag, bounded text, CSS bounds                                                |
| `preview.getDiagnostics`             | `tabId`, `expectedRevision`                     | Render/current revision, stale flag, mode, counts, title, view bounds/visibility |
| `preview.screenshot`                 | `tabId`, `expectedRevision`                     | Revision, `image/png`, base64 PNG                                                |

Success is `{ ok: true, value }`; failure is `{ ok: false, error: { code, message } }`.
Codes: `invalid-input`, `revision-conflict`, `not-found`, `permission-denied`, `runtime-error`.
IDs/revisions reuse Core schemas. Tab IDs are runtime-local `aura-N`, not persistent document IDs.
Element bounds are guest CSS coordinates; native view bounds are host DIP. Screenshots may contain
device-scaled pixels. Consumers must not assume all three coordinate spaces are identical.

Render rejects a stale caller revision. Inspection and capture additionally reject a stale rendered
tab. Diagnostics accepts the current revision and can describe an older render as `stale: true`.
Async operations recheck document revision on completion. Reload must first read the main document,
list tabs and render the current revision; it must not replay stale writes automatically.

## Permissions and audit

Only the editor's own window/main frame at the exact trusted URL can invoke the named IPC channels.
Arguments have exact arity and per-operation validation. Guests have no bridge. No URL, selector,
JavaScript, credentials or file path is accepted by these tools. The fixed inspection adapter only
reads approved fields from at most 10,000 stable-ID elements, with text limited to 2,000 characters.

Main retains the latest 50 operation metadata entries: trusted actor `human/desktop`, tool, time,
revision and outcome. It does not log HTML, element text, screenshots or arbitrary request bodies.
This in-memory audit is diagnostic, not a durable security log or an authenticated Agent identity.
No new network transport, MCP server, token store or external authorization mechanism is shipped.

## Future selection and editing tools

`editor.getSelection` should return explicit document ID/revision, slide ID and selected stable IDs.
Its schema and ownership await actual selection behavior; the POC does not invent selection state.
`editor.applyCommand` must use the existing command envelope/Dispatcher, origin, conflict detection
and undo history, as the current desktop `applyCommand` does. Never mutate a renderer-side clone or
rewrite the document through a browser tool. A future external Agent requires explicit capabilities,
an authenticated actor, operation audit and scoped consent before third-party reads.

Verification flow: read document/selection → propose command at expected revision → dispatch → read
result/revision → render that revision → inspect stable IDs and capture if authorized. Conflicts stop
the workflow and require fresh context. Screenshots supplement structured evidence; they do not
replace the model or grant permission to read another origin.

# MCP Apps

MCP Apps expose tools whose results a host can render using UI resources.

## Language

**UI resource**:
A host-rendered HTML document identified by a `ui://` URI, together with its declared CSP,
permissions and appearance hints.

**Origin declaration**:
An entry in a UI resource's CSP allowlist describing an external origin or wildcard domain
that the resource declares it needs to access.

**Prepared app**:
An MCP App considered together with the current build artefacts and metadata for its
referenced UI resources.

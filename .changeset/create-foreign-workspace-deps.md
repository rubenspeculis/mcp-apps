---
"@mcpapps/cli": patch
---

fix(create): only emit `workspace:*` deps inside the mcp-apps monorepo

Scaffolding into another pnpm workspace previously matched the host's
`pnpm-workspace.yaml` and emitted `workspace:*` / local-path deps that the host
can't resolve. Detection now confirms the root is the mcp-apps monorepo.

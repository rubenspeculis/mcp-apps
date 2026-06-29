# @mcpapps/create

Scaffold a new [**MCP App**](https://github.com/rubenspeculis/mcp-apps) — an interactive
`ui://` component a host like Claude renders in a sandboxed iframe.

```bash
pnpm create @mcpapps my-app                  # Vue (default)
pnpm create @mcpapps my-app --renderer flutter
# or: npm create @mcpapps@latest my-app
```

Options:

| Flag | Default | Description |
| --- | --- | --- |
| `--renderer <vue\|flutter>` | `vue` | Which renderer to scaffold |
| `--name <name>` | directory name | Package name |
| `--force` | – | Scaffold into a non-empty directory |

Then:

```bash
cd my-app
pnpm install
pnpm dev      # Vue: host emulator   ·   Flutter: pnpm start
```

This is a thin wrapper around [`@mcpapps/cli`](https://www.npmjs.com/package/@mcpapps/cli),
whose `mcpapps` command also runs `dev`, `serve`, `build`, `audit`, and `deploy` inside the
scaffolded project.

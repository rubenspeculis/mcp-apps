---
seo:
  title: "@mcpapps — Build MCP Apps with Vue or Flutter, on Hono"
  description: A less-opinionated, multi-renderer framework for building MCP Apps —
    interactive UIs returned from Model Context Protocol tools and rendered inside
    hosts like Claude, ChatGPT and VS Code. Server on Hono, components in Vue or
    Flutter, deployed to the edge.
---

::u-page-hero
#title
Build MCP Apps your way

#description
A less-opinionated, multi-renderer framework for **MCP Apps** — interactive UIs returned from Model Context Protocol tools and rendered inside Claude, ChatGPT and VS Code.

Author components in **Vue** _or_ **Flutter**, serve them from a **Hono** server, and deploy to the **edge**.

#links
  :::u-button
  ---
  color: primary
  size: xl
  to: /getting-started
  trailing-icon: i-lucide-arrow-right
  ---
  Get started
  :::

  :::u-button
  ---
  color: neutral
  variant: outline
  size: xl
  icon: i-simple-icons-github
  to: https://github.com/rubenspeculis/mcp-apps
  target: _blank
  ---
  View on GitHub
  :::
::

::u-page-section
#title
One contract, your choice of stack

#description
@mcpapps implements the standard MCP Apps / mcp-ui contract, then gets out of your way.

#features
  :::u-page-feature
  ---
  icon: i-simple-icons-hono
  ---
  #title
  Server on [Hono]{.text-primary}

  #description
  A Workers-native MCP server. The same `fetch` handler runs on Cloudflare Workers, Node, Bun and Deno — not just Express on Node.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-blocks
  ---
  #title
  [Vue or Flutter]{.text-primary}, per app

  #description
  A pluggable renderer chosen per app. Vue for lightweight, self-contained cards; Flutter for rich, stateful, canvas UIs. Both share the same host bridge.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-shield-check
  ---
  #title
  End-to-end [type safety]{.text-primary}

  #description
  One `zod` schema drives server validation, inferred Vue hooks (`useToolResult<"tool">()`), and generated typed Dart models for Flutter.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-monitor-play
  ---
  #title
  A real [host emulator]{.text-primary}

  #description
  Develop against a sandboxed-iframe emulator that speaks the exact mcp-ui postMessage protocol, with live-reload that replays the last tool result.
  :::

  :::u-page-feature
  ---
  icon: i-simple-icons-cloudflare
  ---
  #title
  Ship to the [edge]{.text-primary}

  #description
  Deploy the server to Cloudflare Workers, and expose your local dev server to a real host through a built-in Cloudflare tunnel.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-terminal
  ---
  #title
  A complete [CLI]{.text-primary}

  #description
  `@mcpapps/create` scaffolds a runnable project; `mcpapps dev / serve / build / deploy` takes it from localhost to production.
  :::
::

::u-page-section
#title
Inspired by Skybridge. Built for freedom.

#description
[Skybridge](https://github.com/alpic-ai/skybridge) pioneered a great developer experience for MCP Apps. @mcpapps is **not affiliated with or endorsed by Skybridge or Alpic** — it is an independent project that takes the inspiration in a more open direction: Hono instead of Express, **Vue or Flutter** instead of React-only, and a renderer you choose. See exactly how they compare.

#links
  :::u-button
  ---
  color: neutral
  variant: subtle
  size: lg
  to: /comparison
  trailing-icon: i-lucide-arrow-right
  ---
  @mcpapps vs Skybridge
  :::
::

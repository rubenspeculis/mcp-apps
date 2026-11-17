# @mcpapps/protocol

## 0.2.0

### Minor Changes

- 5fe8a13: Add shared Claude and ChatGPT host profiles, host-aware CLI audits, and
  profile-driven compatibility metadata. Add server authorisation and configurable
  CORS options, and allow Flutter builds to omit font-CDN CSP declarations.

  Harden the postMessage boundary and generated HTML against spoofed messages and
  script breakouts. Validate CSP origins case-insensitively, keep the emulator's
  protocol version aligned with the shared contract, and centralise CLI origin
  policy and project preparation.

## 0.1.4

## 0.1.3

### Patch Changes

- Move zod

## 0.1.2

## 0.1.1

### Patch Changes

- Minor release update to get all tags up to date

## 0.1.0

### Minor Changes

- 75e759a: Initial release: standard-compliant MCP Apps framework on Hono with **Vue and
  Flutter** renderers, end-to-end type safety from zod schemas, a host emulator,
  Cloudflare Workers support (fetch-native), stdio transport, and a Cloudflare
  tunnel helper.

---
"@mcpapps/protocol": minor
"@mcpapps/server": minor
"@mcpapps/cli": minor
"@mcpapps/flutter": minor
"@mcpapps/client-core": patch
"@mcpapps/dev": patch
"@mcpapps/vue": patch
"@mcpapps/vite-plugin-vue": patch
---

Add shared Claude and ChatGPT host profiles, host-aware CLI audits, and
profile-driven compatibility metadata. Add server authorisation and configurable
CORS options, and allow Flutter builds to omit font-CDN CSP declarations.

Harden the postMessage boundary and generated HTML against spoofed messages and
script breakouts. Validate CSP origins case-insensitively, keep the emulator's
protocol version aligned with the shared contract, and centralise CLI origin
policy and project preparation.

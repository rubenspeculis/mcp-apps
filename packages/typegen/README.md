# @mcpapps/typegen

Generate typed **Dart** models from your zod tool schemas (zod → JSON Schema → Dart), so a
Flutter MCP App component consumes tool input/output with real types instead of dynamic maps.

```bash
pnpm add -D @mcpapps/typegen
```

```ts
import { zodToDart } from "@mcpapps/typegen";
import { z } from "zod";

const dart = zodToDart([
  {
    name: "GetWeatherOutput",
    schema: z.object({ tempC: z.number(), condition: z.string() }),
  },
]);
```

Used by a Flutter project's `codegen.ts`/`pre-deploy.ts` step.

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps).

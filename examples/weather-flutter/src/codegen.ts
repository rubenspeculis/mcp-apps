import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Generates a type stub so `tsc --noEmit` can resolve the import in worker.ts.
// The real file is written by pre-deploy.ts (requires a Flutter build).
const here = dirname(fileURLToPath(import.meta.url));
const metaDir = resolve(here, "generated");
await mkdir(metaDir, { recursive: true });
await writeFile(
  join(metaDir, "component-meta.ts"),
  [
    "// Auto-generated stub — overwritten by pre-deploy.ts at deploy time",
    'export const COMPONENT_URI = "ui://weather-flutter/get_weather";',
    'export const COMPONENT_HTML = "";',
    'export const COMPONENT_BASE_PATH = "/_c/stub/";',
    "",
  ].join("\n"),
);

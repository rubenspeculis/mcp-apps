import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/hono.ts", "src/stdio.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});

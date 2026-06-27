import { defineConfig } from "vitest/config";

// Shared Vitest base. Each package's vitest.config.ts re-exports or merges this.
// Turbo owns orchestration (`turbo test` fans out per package); there is no
// root-level project runner.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Packages with no *.test.ts are a no-op pass (Turbo fans out `test` to all).
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
    },
  },
});

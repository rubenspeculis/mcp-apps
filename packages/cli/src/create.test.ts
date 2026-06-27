import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./create.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mcpapps-cli-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("createApp (vue)", () => {
  it("scaffolds a complete, name-substituted Vue project", async () => {
    const result = await createApp({
      targetDir: join(dir, "my-app"),
      renderer: "vue",
      dep: "workspace:*",
    });

    expect(result.renderer).toBe("vue");
    expect(result.name).toBe("my-app");
    expect(result.files).toContain("src/app.ts");
    expect(result.files).toContain("src/components/GreetingCard.vue");
    expect(result.files).toContain("scripts/build-components.ts");
    expect(result.files).toContain("src/worker.ts");

    const pkg = JSON.parse(await readFile(join(dir, "my-app", "package.json"), "utf8"));
    expect(pkg.name).toBe("my-app");
    expect(pkg.dependencies["@mcpapps/server"]).toBe("workspace:*");
    expect(pkg.dependencies.hono).toMatch(/^\^4/);

    const appTs = await readFile(join(dir, "my-app", "src/app.ts"), "utf8");
    expect(appTs).toContain('name: "my-app"');
    expect(appTs).toContain('renderer: "vue"');
    expect(appTs).not.toContain("APP_NAME");

    const codegen = await readFile(join(dir, "my-app", "scripts/build-components.ts"), "utf8");
    expect(codegen).toContain("ui://my-app/greet");
  });
});

describe("createApp (flutter)", () => {
  it("scaffolds a Flutter project with a Dart entrypoint", async () => {
    const result = await createApp({
      targetDir: join(dir, "fl-app"),
      renderer: "flutter",
      dep: "workspace:*",
    });

    expect(result.renderer).toBe("flutter");
    expect(result.files).toContain("flutter/lib/main.dart");
    expect(result.files).toContain("flutter/pubspec.yaml");
    expect(result.files).toContain("flutter/.fvmrc");

    const dartMain = await readFile(join(dir, "fl-app", "flutter/lib/main.dart"), "utf8");
    expect(dartMain).toContain("runMcpApp");

    const devTs = await readFile(join(dir, "fl-app", "src/dev.ts"), "utf8");
    expect(devTs).toContain("ui://fl-app/greet");
  });
});

describe("createApp safety", () => {
  it("refuses to scaffold into a non-empty directory without --force", async () => {
    await writeFile(join(dir, "existing.txt"), "x");
    await expect(createApp({ targetDir: dir, renderer: "vue" })).rejects.toThrow(/not empty/);
  });
});

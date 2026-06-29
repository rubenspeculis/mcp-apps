import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    expect(result.files).toContain("mcpapps.config.ts");
    expect(result.files).toContain("src/worker.ts");

    const pkg = JSON.parse(await readFile(join(dir, "my-app", "package.json"), "utf8"));
    expect(pkg.name).toBe("my-app");
    expect(pkg.dependencies["@mcpapps/server"]).toBe("workspace:*");
    expect(pkg.dependencies.hono).toMatch(/^\^4/);
    expect(pkg.scripts.dev).toBe("mcpapps dev");
    expect(pkg.scripts.audit).toBe("mcpapps audit");

    const appTs = await readFile(join(dir, "my-app", "src/app.ts"), "utf8");
    expect(appTs).toContain('name: "my-app"');
    expect(appTs).toContain('renderer: "vue"');
    expect(appTs).not.toContain("APP_NAME");

    const config = await readFile(join(dir, "my-app", "mcpapps.config.ts"), "utf8");
    expect(config).toContain("ui://my-app/greet");
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

    // The audit script needs the mcpapps bin, so @mcpapps/cli must be a dep.
    const pkg = JSON.parse(await readFile(join(dir, "fl-app", "package.json"), "utf8"));
    expect(pkg.scripts.audit).toBe("mcpapps audit");
    expect(pkg.devDependencies["@mcpapps/cli"]).toBe("workspace:*");
  });

  it("pins mcpapps_bridge to a git tag when scaffolding outside the monorepo", async () => {
    // tmpdir has no pnpm-workspace.yaml ancestor -> published-consumer branch.
    await createApp({ targetDir: join(dir, "fl-app"), renderer: "flutter", dep: "^0.1.0" });

    const pubspec = await readFile(join(dir, "fl-app", "flutter/pubspec.yaml"), "utf8");
    expect(pubspec).toContain("mcpapps_bridge:");
    expect(pubspec).toContain("url: https://github.com/rubenspeculis/mcp-apps.git");
    expect(pubspec).toContain("path: packages/flutter_bridge");
    expect(pubspec).toMatch(/ref: v\d+\.\d+\.\d+/);
    expect(pubspec).not.toContain("path: ../"); // never a local path off-repo
  });

  it("uses a local path dep for mcpapps_bridge when scaffolding in-repo", async () => {
    // Fake the @mcpapps monorepo root: a workspace marker, the identifying root
    // package.json name, and a flutter_bridge package.
    await writeFile(join(dir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "mcpapps-monorepo" }));
    await mkdir(join(dir, "packages/flutter_bridge"), { recursive: true });
    await writeFile(join(dir, "packages/flutter_bridge/pubspec.yaml"), "name: mcpapps_bridge\n");

    await createApp({ targetDir: join(dir, "apps/fl-app"), renderer: "flutter" });

    const pubspec = await readFile(join(dir, "apps/fl-app", "flutter/pubspec.yaml"), "utf8");
    expect(pubspec).toContain("mcpapps_bridge:");
    // Relative path from apps/fl-app/flutter -> packages/flutter_bridge.
    expect(pubspec).toContain("path: ../../../packages/flutter_bridge");
    expect(pubspec).not.toContain("git:");
  });

  it("emits published deps when scaffolding into a foreign pnpm workspace", async () => {
    // A different monorepo (e.g. otivo-agentic) is itself a pnpm workspace. Its
    // marker must NOT be mistaken for ours, or the scaffold gets `workspace:*`
    // deps the host can't resolve (ERR_PNPM_WORKSPACE_PKG_NOT_FOUND).
    await writeFile(join(dir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "otivo-agentic" }));

    await createApp({ targetDir: join(dir, "apps/mcp"), renderer: "flutter" });

    const pkg = JSON.parse(await readFile(join(dir, "apps/mcp", "package.json"), "utf8"));
    expect(pkg.devDependencies["@mcpapps/cli"]).toMatch(/^\^\d/);
    expect(pkg.devDependencies["@mcpapps/cli"]).not.toBe("workspace:*");
    expect(pkg.dependencies["@mcpapps/server"]).toMatch(/^\^\d/);

    const pubspec = await readFile(join(dir, "apps/mcp", "flutter/pubspec.yaml"), "utf8");
    expect(pubspec).toContain("url: https://github.com/rubenspeculis/mcp-apps.git");
    expect(pubspec).not.toContain("path: ../"); // never a local path off-repo
  });
});

describe("createApp safety", () => {
  it("refuses to scaffold into a non-empty directory without --force", async () => {
    await writeFile(join(dir, "existing.txt"), "x");
    await expect(createApp({ targetDir: dir, renderer: "vue" })).rejects.toThrow(/not empty/);
  });
});

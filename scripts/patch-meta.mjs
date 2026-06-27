// One-off: add npm publish metadata to every publishable package.json.
// Only adds/overwrites the shared fields below; preserves everything else.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO = "https://github.com/rubenspeculis/mcp-apps";
const keywords = ["mcp", "model-context-protocol", "mcp-apps", "mcp-ui", "hono", "ai"];

const pkgsDir = "packages";
let patched = 0;

for (const name of readdirSync(pkgsDir)) {
  const file = join(pkgsDir, name, "package.json");
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (!pkg.name?.startsWith("@mcpapps/")) continue;

  pkg.license ??= "MIT";
  pkg.author = "Rubens Peculis";
  pkg.homepage = `${REPO}#readme`;
  pkg.bugs = `${REPO}/issues`;
  pkg.repository = { type: "git", url: `git+${REPO}.git`, directory: `${pkgsDir}/${name}` };
  pkg.keywords = keywords;
  pkg.sideEffects = false;
  pkg.publishConfig = { access: "public" };

  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  patched++;
  console.log(`patched ${pkg.name}`);
}
console.log(`\n${patched} packages patched`);

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Find a Flutter binary, in order:
 *   1. `FLUTTER_BIN` env var (if it points at an existing file)
 *   2. `flutter` on PATH
 *   3. fvm: the version pinned in `<projectDir>/.fvmrc`
 *   4. fvm: the global default (`~/fvm/default/bin/flutter`)
 *
 * Throws a clear, actionable error if none are found.
 */
export function resolveFlutterBin(projectDir?: string): string {
  const env = process.env.FLUTTER_BIN;
  if (env && existsSync(env)) return env;

  try {
    execSync("command -v flutter", { stdio: "ignore" });
    return "flutter";
  } catch {
    // not on PATH — fall through to fvm
  }

  if (projectDir) {
    const fvmrc = join(projectDir, ".fvmrc");
    if (existsSync(fvmrc)) {
      try {
        const version = JSON.parse(readFileSync(fvmrc, "utf8")).flutter as string;
        const pinned = join(homedir(), "fvm", "versions", version, "bin", "flutter");
        if (existsSync(pinned)) return pinned;
      } catch {
        // ignore malformed .fvmrc
      }
    }
  }

  const fvmDefault = join(homedir(), "fvm", "default", "bin", "flutter");
  if (existsSync(fvmDefault)) return fvmDefault;

  throw new Error(
    "Could not find a Flutter binary. Set FLUTTER_BIN, install Flutter on your PATH, " +
      "or pin a version with fvm (.fvmrc).",
  );
}

// Conventional Commits. config-conventional already defines the type-enum
// (feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert).
// Do not re-declare it — keep this file minimal so every repo is identical.
export default {
  extends: ["@commitlint/config-conventional"],
};

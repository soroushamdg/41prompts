/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "public-only-imports-public",
      severity: "error",
      comment:
        "core, cli, and sdk-ts may import only each other, Node builtins, or their own declared " +
        "dependencies (CLAUDE.md rule 11) — never packages/db, packages/ui, packages/logger, or apps/*.",
      from: { path: "^packages/(core|cli|sdk-ts)/src" },
      to: { path: "^(packages/(db|ui|logger)/|apps/)" }
    },
    {
      name: "core-is-pure",
      severity: "error",
      comment: "packages/core is pure TS: no npm dependency, no Node builtin, no IO (CLAUDE.md rule 1 / ADR-001).",
      from: { path: "^packages/core/src", pathNot: "\\.test\\.ts$" },
      to: {
        dependencyTypes: [
          "core",
          "npm",
          "npm-dev",
          "npm-optional",
          "npm-peer",
          "npm-bundled",
          "npm-no-pkg",
          "npm-unknown"
        ]
      }
    },
    {
      name: "sdk-has-no-npm-deps",
      severity: "error",
      comment:
        "packages/sdk-ts ships zero npm dependencies; Node builtins are allowed and are what the " +
        "disk cache uses. It does import @41prompts/core — a sibling public package, which rule 11 " +
        "permits — and esbuild inlines that at build time, so the tarball still has no dependencies " +
        "key. That is the claim this rule cannot see; packages/sdk-ts/src/package.test.ts reads the " +
        "built output and is where it is proved (EPIC-052 ruling 2).",
      from: { path: "^packages/sdk-ts/src", pathNot: "\\.test\\.ts$" },
      to: {
        dependencyTypes: ["npm", "npm-dev", "npm-optional", "npm-peer", "npm-bundled", "npm-no-pkg", "npm-unknown"]
      }
    },
    {
      name: "no-phantom-deps",
      severity: "error",
      comment: "a public package importing something outside its own declared dependencies is a phantom dependency.",
      from: { path: "^packages/(core|cli|sdk-ts)/src" },
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] }
    },
    {
      name: "web-uses-core-through-its-public-surface",
      severity: "error",
      comment:
        "apps/web imports packages/core and never reimplements it (CLAUDE.md rule 1, EPIC-013 " +
        "decision 10). Reaching past the package root into core's internals would sidestep the " +
        "surface EPIC-052 freezes and make a refactor inside core a broken web app.",
      from: { path: "^apps/web" },
      to: { path: "^packages/core/src/(?!index\\.ts$|fixtures\\.ts$)" }
    },
    {
      name: "layering-core-sdk-never-import-cli",
      severity: "error",
      comment: "cli may depend on core; core and sdk-ts never import cli.",
      from: { path: "^packages/(core|sdk-ts)/src" },
      to: { path: "^packages/cli/src" }
    }
  ],
  options: {
    tsConfig: { fileName: "tsconfig.depcruise.json" },
    doNotFollow: { path: "node_modules" }
  }
};

#!/usr/bin/env bash
set -euo pipefail

# EPIC-007 decision 5, widened by EPIC-056: proves the public tree can be extracted with its real
# git history and installed and tested completely standalone. The actual split — creating
# `github.com/41prompts/41prompts` and pushing — is Soroush's; this only proves it would work.
# Everything happens inside a scratch clone; the real repo, its remote, and its working tree are
# never touched, and nothing here is ever pushed anywhere.
#
# `uvx git-filter-repo` (not a system install) so this runs the same way locally and in CI,
# matching how sdks/python's own tests are already run (ci.yml's astral-sh/setup-uv step).
#
# ## What EPIC-056 changed, and why
#
# 1. **`packages/cli-unscoped` was missing.** `41p` publishes to npm with `provenance: true` and a
#    `prepublishOnly` that only passes inside `41prompts/41prompts` — so it could only ever be
#    published from a repository that did not contain its source. Found by reading, not by a gate.
#
# 2. **The public root is a set of real files now**, under `mirror/`, renamed to the root by the
#    filter. It used to be the monorepo's root `package.json` with its scripts rewritten by a
#    `node -e` heredoc inside this script, and the comment there said EPIC-056 would have to do it
#    for real anyway. It also means the public repository gets a README that describes the public
#    tree rather than one that tells a stranger to run `pnpm dev` and `pnpm db:migrate` against
#    packages that are not there.
#
# 3. **The tree is asserted, not assumed.** The old check listed paths that must be absent. It now
#    also lists what must be PRESENT — all six publishable distributions and the governance files —
#    because a filter that silently drops a package produces a smaller tree that installs and tests
#    perfectly. `apps/web/public-distributions.test.ts` holds the same list and fails if a new
#    distribution is added to the workspace without reaching this script.

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

echo "[mirror-dry-run] cloning $REPO_ROOT into $SCRATCH (no hardlinks -- filter-repo rewrites history destructively)"
git clone --no-local --no-hardlinks "$REPO_ROOT" "$SCRATCH/mirror"
cd "$SCRATCH/mirror"

echo "[mirror-dry-run] filtering history down to the public tree, and promoting mirror/ to the root"
uvx git-filter-repo --force \
  --path packages/core \
  --path packages/cli \
  --path packages/cli-unscoped \
  --path packages/sdk-ts \
  --path sdks/python \
  --path sdks/python-alias \
  --path LICENSES \
  --path REUSE.toml \
  --path DCO \
  --path SECURITY.md \
  --path TRADEMARKS.md \
  --path mirror \
  --path pnpm-lock.yaml \
  --path tsconfig.base.json \
  --path tsconfig.depcruise.json \
  --path .dependency-cruiser.cjs \
  --path eslint.config.js \
  --path turbo.json \
  --path .gitignore \
  --path .gitattributes \
  --path .nvmrc \
  --path .prettierrc.json \
  --path .prettierignore \
  --path .editorconfig \
  --path-rename mirror/:

echo "[mirror-dry-run] resulting top-level tree:"
find . -maxdepth 2 -not -path "./.git*" | sort

echo "[mirror-dry-run] confirming no proprietary path survived the filter"
for forbidden in packages/db packages/ui packages/logger apps infra scripts docs mirror \
                 .github/workflows/deploy.yml .github/workflows/build-images.yml \
                 .github/workflows/rollback.yml .github/workflows/ci.yml \
                 .github/workflows/compliance.yml CLAUDE.md; do
  if [ -e "$forbidden" ]; then
    echo "[mirror-dry-run] FAIL: $forbidden is still present after filtering" >&2
    exit 1
  fi
done

# The other half, and the one a shrinking tree would pass silently. Every path here is something
# the public repository is broken without: a distribution nobody can install, a licence nobody can
# read, or a publish workflow that is the only mechanical guard the Python side has.
echo "[mirror-dry-run] confirming everything the public repository needs DID survive"
for required in packages/core packages/cli packages/cli-unscoped packages/sdk-ts \
                sdks/python sdks/python-alias \
                package.json pnpm-workspace.yaml README.md CONTRIBUTING.md \
                LICENSE NOTICE DCO SECURITY.md TRADEMARKS.md \
                LICENSES REUSE.toml \
                .github/workflows/publish-npm.yml \
                .github/workflows/publish-pypi.yml \
                .github/workflows/dependency-review.yml; do
  if [ ! -e "$required" ]; then
    echo "[mirror-dry-run] FAIL: $required is missing from the filtered tree" >&2
    exit 1
  fi
done

echo "[mirror-dry-run] confirming the public root manifest is the public one, not the monorepo's"
node -e '
  const m = require("./package.json");
  if (m.license !== "Apache-2.0") { console.error("root package.json license is " + m.license); process.exit(1); }
  for (const forbidden of ["dev", "e2e", "db:migrate", "compliance:full", "autonomous"]) {
    if (m.scripts?.[forbidden]) { console.error("root package.json still carries the monorepo script: " + forbidden); process.exit(1); }
  }
'

echo "[mirror-dry-run] pnpm install (not --frozen-lockfile: the filtered tree is a real subset of the lockfile it started from, not a lockfile drift bug)"
pnpm install --no-frozen-lockfile

echo "[mirror-dry-run] pnpm test (packages/core, packages/cli, packages/cli-unscoped, packages/sdk-ts)"
pnpm test

echo "[mirror-dry-run] uv run pytest (sdks/python)"
(cd sdks/python && uv run pytest -q)

echo "[mirror-dry-run] OK -- the public-only tree installs and tests standalone"

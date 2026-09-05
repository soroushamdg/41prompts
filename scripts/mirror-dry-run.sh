#!/usr/bin/env bash
set -euo pipefail

# EPIC-007 decision 5: proves the four public packages (packages/core, packages/cli,
# packages/sdk-ts, sdks/python) can be extracted with their real git history and installed and
# tested completely standalone -- the actual split (EPIC-056) is a separate epic; this only
# proves it would work. Everything happens inside a scratch clone; the real repo, its remote, and
# its working tree are never touched, and nothing here is ever pushed anywhere.
#
# `uvx git-filter-repo` (not a system install) so this runs the same way locally and in CI,
# matching how sdks/python's own tests are already run (ci.yml's astral-sh/setup-uv step).

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

echo "[mirror-dry-run] cloning $REPO_ROOT into $SCRATCH (no hardlinks -- filter-repo rewrites history destructively)"
git clone --no-local --no-hardlinks "$REPO_ROOT" "$SCRATCH/mirror"
cd "$SCRATCH/mirror"

echo "[mirror-dry-run] filtering history down to the public packages and the shared root config they need to build"
uvx git-filter-repo --force \
  --path packages/core \
  --path packages/cli \
  --path packages/sdk-ts \
  --path sdks/python \
  --path LICENSES \
  --path REUSE.toml \
  --path package.json \
  --path pnpm-workspace.yaml \
  --path pnpm-lock.yaml \
  --path tsconfig.base.json \
  --path tsconfig.depcruise.json \
  --path .dependency-cruiser.cjs \
  --path eslint.config.js \
  --path turbo.json \
  --path .gitignore \
  --path .nvmrc \
  --path .prettierrc.json \
  --path .prettierignore \
  --path .editorconfig

echo "[mirror-dry-run] resulting top-level tree:"
find . -maxdepth 2 -not -path "./.git*" | sort

echo "[mirror-dry-run] confirming no proprietary path survived the filter"
for forbidden in packages/db packages/ui packages/logger apps infra scripts docs; do
  if [ -e "$forbidden" ]; then
    echo "[mirror-dry-run] FAIL: $forbidden is still present after filtering" >&2
    exit 1
  fi
done

echo "[mirror-dry-run] pnpm install (not --frozen-lockfile: the filtered tree is a real subset of the lockfile it started from, not a lockfile drift bug)"
pnpm install --no-frozen-lockfile

echo "[mirror-dry-run] pnpm test (packages/core, packages/cli, packages/sdk-ts)"
pnpm test

echo "[mirror-dry-run] uv run pytest (sdks/python)"
(cd sdks/python && uv run pytest -q)

echo "[mirror-dry-run] OK -- the public-only tree installs and tests standalone"

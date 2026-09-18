# Contributing

## Public vs. proprietary

**Six distributions are public**, Apache-2.0, and mirrored to their own repository
(`docs/decisions/ADR-002-licensing-and-repos.md`, and EPIC-056 for the split itself) — four on npm
and two on PyPI:

| directory | published as |
|---|---|
| `packages/core` | `@41prompts/core` |
| `packages/cli` | `@41prompts/cli` |
| `packages/cli-unscoped` | `41p` |
| `packages/sdk-ts` | `@41prompts/sdk` |
| `sdks/python` | `fortyone-prompts`, import `fortyone` |
| `sdks/python-alias` | `41prompts` |

It said "four packages" until 2026-09-18 and had done since before `packages/cli-unscoped` and
`sdks/python-alias` existed. `apps/web/public-distributions.test.ts` now derives the set from the
workspace and fails when this table disagrees with it, so the count cannot go stale again.

Every source file in them carries a real
<!-- REUSE-IgnoreStart -->`SPDX-FileCopyrightText`/`SPDX-License-Identifier: Apache-2.0`<!-- REUSE-IgnoreEnd -->
header — add one to any new file you create there.

Everything else — `apps/web`, `apps/worker`, `packages/db`, `packages/ui`, `packages/logger`,
`infra/`, `docs/`, `scripts/`, and the repo's own root configuration — is
`LicenseRef-41Prompts-Proprietary`. These files don't carry a header individually; `REUSE.toml`
declares the licence for them in bulk.

A public package may import only other public packages, Node builtins, or its own declared
dependencies — never `apps/*`, `packages/db`, `packages/ui`, or `packages/logger`. This is
enforced by `dependency-cruiser` and by each public package's `turbo.json` `tags: ["public"]`, not
by memory; a violation fails CI with the rule name in the failure message.

## DCO sign-off

Every commit must be signed off: `git commit -s`. This adds a `Signed-off-by:` trailer certifying
you have the right to submit the change under the Developer Certificate of Origin
(<https://developercertificate.org/>) — the project uses DCO, not a CLA. A PR with an unsigned
commit will be asked to amend and re-sign before it can merge.

## Running the compliance checks locally

Everything CI checks on every pull request and on `main` runs locally with one command:

```
pnpm compliance
```

This runs, in order: `REUSE` licence-header linting over the whole repo, the dependency-cruiser
and Turborepo boundary checks, the ADR-003 forbidden-word grep, the dependency licence gate (fails
on a non-permissive licence reaching a public package; warns, doesn't block, everywhere else), and
a mirror dry-run that extracts all six public distributions with their real git history into a
scratch clone, promotes `mirror/` to the root, and proves the result installs and tests completely
standalone. Each check can also be run on its
own — `pnpm reuse-lint`, `pnpm boundaries`, `pnpm forbidden-words`, `pnpm license-gate`,
`pnpm mirror-dry-run` — see `package.json`'s `scripts` for the exact commands.

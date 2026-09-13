# 41Prompts

Workbench for the prompt layer. A prompt is a set of typed bloks (context, constraint, example, expected) that
each own one or more spans of the compiled prompt. Expected bloks compile to checks, not text; failures attribute
back to the owning blok. Prompts are delivered to production via a typed SDK, gated by those checks.

## Commands

```
pnpm install
pnpm dev            # web + worker
pnpm test           # vitest across packages
pnpm typecheck
pnpm lint           # eslint + dependency-cruiser boundaries
pnpm db:generate    # drizzle migration from schema
pnpm db:migrate
pnpm e2e            # playwright, needs dev running
```

<!-- REUSE-IgnoreStart -->

## Licensing

**This repository contains two kinds of code under two different licences. Read this before using any
of it.**

**Apache-2.0 — open, and you may use these.** `packages/core`, `packages/cli`, `packages/sdk-ts`
(published as `@41prompts/sdk`) and `sdks/python`. Each carries its own `LICENSE` file and an
`SPDX-License-Identifier: Apache-2.0` header on every source file.

**All rights reserved — you may not use these.** Everything else, and specifically `packages/ui`,
`packages/db`, `packages/logger`, `apps/worker` and `apps/web`, plus `infra/`, `docs/` and `scripts/`.
Each of the first four carries a `LICENSE` file saying so; all of them are declared
`LicenseRef-41Prompts-Proprietary` in `REUSE.toml`, whose text is in
`LICENSES/LicenseRef-41Prompts-Proprietary.txt`.

**Source being visible is not a grant of any licence.** This repository was public for a period in
September 2026, for reasons that had nothing to do with licensing, and closing it again does not
un-publish what was seen. Reading proprietary code here gives you no right to use, copy, modify,
distribute or create derivative works from it. No licence is implied by publication, by the absence
of a licence file in any particular directory, or by the repository being open to view. The only
permissive grant in this repository is Apache-2.0, and it covers exactly the four packages named
above.

There is deliberately **no repository-root `LICENSE` file**: a single one would tell GitHub to label
the whole repository with a licence that is wrong for most of it. The split above is the licence
statement.

<!-- REUSE-IgnoreEnd -->

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

`packages/core`, `packages/cli`, `packages/sdk-ts` (published as `@41prompts/sdk`), and `sdks/python` are
Apache-2.0. Everything else in this repository is proprietary.

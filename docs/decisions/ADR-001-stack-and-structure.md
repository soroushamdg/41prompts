# ADR-001: Stack and repository structure

Status: accepted · 2026-08-19

## Decision

- TypeScript strict everywhere except the Python SDK. Node 22. pnpm workspaces + Turborepo.
- `apps/web`: Next.js 16 App Router. Marketing site, app, and API route handlers in one deployable.
- `apps/worker`: Node process running pg-boss jobs (eval runs, summariser calls, publish tasks).
- `packages/core`: pure TypeScript with zero framework or IO dependencies. Owns: segmenter, classifier, clustering, diagnostics, compiler, assertion model, graders, artifact schema, variable schema.
- `packages/db`: Drizzle schema + migrations, shared by web and worker.
- `packages/ui`: design tokens and components.
- `packages/cli`, `packages/sdk-ts`, `sdks/python`.
- Postgres 16. Better Auth. Vercel AI SDK for provider calls. Cloudflare R2 for artifacts. Stripe, Resend, PostHog, Sentry.
- Tailwind v4 with tokens in `@theme`; shadcn primitives only for dialog, dropdown, popover, restyled to the Resolution system.
- Vitest for packages, Playwright for three e2e flows.

## Why

- **Pure core package.** Agent-written code is reliable in small, framework-free, tested modules and unreliable in framework-tangled code. Everything that must be correct is isolated where it can be tested without a browser or a database.
- **Next.js over TanStack Start.** Both are fine technically. The size of the training corpus is an engineering property when the engineer is a model.
- **Better Auth over Clerk.** Users in our own Postgres. Enterprise auth features are on the `later` list anyway.
- **Drizzle over Prisma.** Closer to SQL, lighter runtime, no generated client to fight in a monorepo.
- **pg-boss over Inngest.** We chose a single VPS; a Postgres-backed queue keeps the whole system on one box with no external dependency and no cold starts.
- **R2 even on a VPS.** SDK polls for label pointers and artifacts must never hit the application server. R2's CDN and free egress absorb that traffic at zero cost.

## Consequences

- One deployable for web + API keeps early ops trivial; if the API ever needs independent scaling it splits along the route-handler boundary.
- The worker is the only process allowed to call model providers for runs. Web calls providers only for the decompiler summariser, via the worker queue, cached.
- Anything in `packages/core` that reaches for `fetch`, `fs`, or `process.env` is a bug.

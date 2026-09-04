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

## Revisions (2026-09-04)

- Hosting is **AWS Lightsail, Montréal (ca-central-1)**, replacing Hetzner (2026-09-04). Same single-VPS posture; user data stays in Canada, which simplifies the Law 25 cross-border note. Minimum instance 4 GB / 2 vCPU. Lightsail daily snapshots are a second backup layer alongside the nightly dump to R2.
- **No agent ever holds SSH access to the server.** Claude Code writes infra as code (`infra/`); Soroush runs the bootstrap once from his own machine; Coolify deploys from GitHub thereafter. Secrets are set by a human in Coolify and GitHub, never by an agent.
  - **Superseded 2026-09-04 (Soroush's decision, advisor dissent recorded).** Claude Code may reach the staging/production box over SSH and the Coolify API from Soroush's machine, under `infra/ACCESS.md`. Reason given: diagnosis through a human paste loop was the slowest part of the first deploy. Advisor position, unchanged: root on the box exposes Coolify's database (every secret, the GitHub App private key, the root deploy key) and there is no review step before a command runs; the mitigations are (1) every `ssh`/Coolify-API command stays on Claude Code's per-command approval, never allow-listed; (2) read-only by default, any mutating command is shown and approved in chat first; (3) every change made on the box must also land in `infra/` in the same session or be reverted; (4) Coolify's own containers, database and proxy are never touched by an agent; (5) no secret value is ever printed, committed, or written under the repo; connection details live in `~/.41prompts/` outside the repo; (6) the Coolify API token carries the narrowest permission set the UI offers, never root. Revisit at GATE 1; if a single unreviewed mutation has happened by then, revert to read-only observer access.
- The import boundary is an **allow-list**, not a deny-list: public packages may import only public packages, Node builtins, and their own declared dependencies; `packages/core` imports nothing; `packages/sdk-ts` has no npm dependencies. Enforced by dependency-cruiser and Turborepo boundary tags (`public` / `private`).
- Model prompts (judge, summariser) and drift heuristics are proprietary and live in `apps/worker` or a private `packages/engine`. `packages/core` contains only what we are content to see forked.
- SDK telemetry is off by default. "Apps resolving this prompt" is derived from CDN access logs.
- Raw run payloads have a 12-month default retention with a purge job, from EPIC-031.

## Consequences

- One deployable for web + API keeps early ops trivial; if the API ever needs independent scaling it splits along the route-handler boundary.
- The worker is the only process allowed to call model providers for runs. Web calls providers only for the decompiler summariser, via the worker queue, cached.
- Anything in `packages/core` that reaches for `fetch`, `fs`, `process.env`, or the DOM is a bug.
- `packages/ui` is proprietary and may not be imported by any public package.

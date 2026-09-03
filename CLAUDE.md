# 41Prompts

Workbench for the prompt layer. A prompt is a set of typed **bloks** (context, constraint, example, expected)
that each own a span of the compiled prompt. Expected bloks compile to assertions, not text. Failures attribute
back to the owning blok. Prompts are delivered to production via a typed SDK with test-gated publishing.

Read `docs/PROCESS.md` before starting any epic. The current epic is always `docs/epics/CURRENT.md`.
`docs/roadmap.md` holds the goal, tasks, tests and review for every epic; consult it when an epic file is terse.

## Stack

- TypeScript strict everywhere. pnpm workspaces + Turborepo. Node 22.
- `apps/web`: Next.js 16 (App Router), Tailwind v4, Better Auth, Drizzle.
- `packages/core`: pure TS, **zero framework or IO dependencies**. Compiler, decompiler, diagnostics, graders, artifact schema.
- `packages/ui`: design tokens + components. Light and dark from the same tokens.
- `packages/cli`: `41p` (link, pull, check, run).
- `packages/sdk-ts`: runtime `resolve()`.
- `sdks/python`: runtime `resolve()`, parity with sdk-ts.
- `apps/worker`: pg-boss job runner for eval runs.
- Postgres 16 via Drizzle. Cloudflare R2 for artifacts. Vercel AI SDK for providers.
- Infra: Hetzner VPS, Docker Compose, Coolify. See `infra/`.

## Commands

```
pnpm install
pnpm dev            # web + worker
pnpm test           # vitest across packages
pnpm typecheck
pnpm lint
pnpm db:generate    # drizzle migration from schema
pnpm db:migrate
pnpm e2e            # playwright, needs dev running
```

## Rules

1. Logic that must be correct goes in `packages/core` with tests. The web app imports it; it never reimplements it.
2. Segmentation and clustering in the decompiler are **deterministic**. No model call chooses a boundary. Models only label.
3. Bloks store the **verbatim** source span. Summaries are metadata. The compiler never emits a paraphrase of user text.
4. Compilation is per blok. Changing one blok changes exactly one block. Block outputs are cached by content hash.
5. A blok owns a **set of ranges**, never a single span.
6. Every run stores the raw provider payload, prompt hash, input hash, model, params, latency, cost.
7. Judge models are pinned by version. Never call a floating alias for grading.
8. The SDK never blocks a call on the network and never throws. Resolve order: memory → disk → bundled → network.
9. Publishing to Live is blocked when assertions fail on the target model. Override requires a typed reason and is audited.
10. Colour: green, red, amber mean pass, fail, drift. Nothing else may use them. No decorative saturation.
11. Every user-facing string that a junior developer reads uses plain words: version, Live, Publish, Undo. Never "label", "pointer", "artifact", "promote".

## Naming

- Files: kebab-case. Types and components: PascalCase. Functions and variables: camelCase. DB columns: snake_case.
- Blok kinds: `context | constraint | example | expected | image_ref | image_input`.
- Prompt ids: `pr_` + 8 hex. Project ids: `proj_` + 4 hex. Build sha: content hash of the compiled artifact.
- Env: `FORTYONE_API_KEY`, `DATABASE_URL`, `R2_*`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`.

## Never touch without an explicit instruction in the current epic

- `docs/backlog.md`, `docs/decisions/*` (I edit these)
- `infra/` production compose and secrets
- Migration files already applied (`packages/db/migrations/*` older than the current epic)
- `packages/core/src/artifact/schema.ts` once Stage 5 begins (it is a public contract)

## Definition of Done for every epic

- All acceptance criteria in the epic file are checked off with evidence (test name, screenshot path, or command output).
- `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.
- New behaviour has tests in the package that owns it.
- No new dependency without a one-line reason in the PR description.
- This file is still accurate. If a convention changed, update it in the same PR.
- Write a `docs/epics/reports/EPIC-xxx-report.md` with: what was built, what was skipped, open questions, and the exact commands to verify.

## How to work

- Plan first: write `docs/epics/plan-EPIC-xxx.md` with steps and open questions, then implement.
- Small commits at logical checkpoints. Never auto-commit a broken state.
- When unsure about product behaviour, check the mockups in `docs/design/` before guessing. They are the spec.
- Stop and ask when an acceptance criterion is impossible or contradicts another rule here. Do not silently reinterpret.

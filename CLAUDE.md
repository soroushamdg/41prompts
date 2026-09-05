# 41Prompts

Workbench for the prompt layer. A prompt is a set of typed **bloks** (context, constraint, example, expected)
that each own one or more **spans** of the compiled prompt. Expected bloks compile to **checks**, not text.
Failures attribute back to the owning blok. Prompts are delivered to production via a typed SDK; publishing
to Live is blocked when checks fail.

Read `docs/PROCESS.md` before starting any epic. The current epic is always `docs/epics/CURRENT.md`.
`docs/roadmap.md` holds goal, tasks, tests and review for every epic; `docs/backlog.md` is the index.
ICP: an AI engineer at a company of 10–500 people who owns a production prompt. Build for that person.

## Stack

- TypeScript strict everywhere. pnpm workspaces + Turborepo. Node 22.
- `apps/web`: Next.js 16 (App Router), Tailwind v4, Better Auth, Drizzle.
- `apps/worker`: pg-boss job runner for runs, summaries, publishes. Model prompts (judge, summariser) live here and are proprietary.
- `packages/core`: pure TS, **zero dependencies, no DOM, no IO**. Segmenter, classifier, clustering, detectors, compiler, checks, deterministic graders, artifact schema. Public (Apache-2.0).
- `packages/ui`: design tokens + components. Proprietary.
- `packages/db`: Drizzle schema + migrations. Proprietary.
- `packages/logger`: shared pino logger for `apps/web` and `apps/worker` — JSON to stdout, redaction, request/job id via `AsyncLocalStorage`. Proprietary.
- `packages/cli`: `41p` (link, pull, check, run, decompile). Public.
- `packages/sdk-ts`: published as `@41prompts/sdk`. Runtime `resolve()`. Zero dependencies. Public.
- `sdks/python`: `fortyone-prompts`, import `fortyone`. Zero dependencies. Public.
- Postgres 16. Cloudflare R2. Vercel AI SDK for providers. Stripe, Resend, PostHog, Sentry.
- Infra: AWS Lightsail (Montréal), Docker Compose, Coolify. See `infra/`.

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

## Rules

1. Logic that must be correct goes in `packages/core` with tests. The web app imports it; it never reimplements it.
2. Segmentation and clustering are **deterministic**. No model call chooses a boundary. Models only label and summarise, from the worker.
3. Bloks store the **verbatim** source span. Summaries are metadata. The compiler never emits a paraphrase of user text.
4. Compilation is per blok. Changing one blok changes exactly one span. Span outputs are cached by content hash.
5. A blok owns a **set of ranges**, never a single one.
6. Every run stores the raw provider payload (purged after 12 months), prompt hash, input hash, model, params, latency, cost.
7. Judge models are pinned by version. Never call a floating alias for grading.
8. The SDK never blocks a call on the network and never throws. Resolve order: memory → disk → bundled → network. Telemetry is off by default.
9. Publishing to Live is blocked when checks fail on the target model. "Publish anyway" requires a typed reason and is audited.
10. Colour: green, red, amber mean pass, fail, drift. Nothing else may use them. Pass/fail is never shown by colour alone.
11. Public packages (`core`, `cli`, `sdk-ts`, `sdks/python`) import only each other, Node builtins, or their own declared dependencies. Never `apps/*`, `packages/db`, `packages/ui`, `packages/logger`.
12. Every interactive element works by keyboard and by touch; `prefers-reduced-motion` shows end states, never skips them.

## Vocabulary (ADR-003)

Use: blok, span, check, version, Draft, Live, Publish, Publish anyway, Undo, edited by hand, update from blok.
Never in UI strings, schema, or code identifiers: **block**, assertion (UI only; the type may be `Check`), label, pointer, artifact (UI only), promote, enum, sha, reconcile, override, drifted.
Check kinds display as plain phrases: "valid JSON shape", "one of the allowed values", "word limit", "must contain".

## Naming

- Files kebab-case. Types and components PascalCase. Functions and variables camelCase. DB columns snake_case.
- Blok kinds: `context | constraint | example | expected | image_ref | image_input`.
- Prompt ids `pr_` + 8 hex. Project ids `proj_` + 4 hex. Build sha: content hash of the compiled artifact.
- Env: `FORTYONE_API_KEY`, `DATABASE_URL`, `R2_*`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `KEY_ENCRYPTION_SECRET`.
- Public source files carry `SPDX-License-Identifier: Apache-2.0` headers. Copyright holder is `<legal entity>` until incorporation.

## Server access

Claude Code may reach the staging/production box over SSH and the Coolify API from Soroush's machine (ADR-001
revision, 2026-09-04; full context and human setup steps in `infra/ACCESS.md`). Rules:

1. Connect only through the `~/.ssh/config` alias `41p-box` and the values in `~/.41prompts/staging.env` (`COOLIFY_URL`, `COOLIFY_API_TOKEN`). Never read `~/.ssh/lightsail/` directly, never copy either file, never print a value from them.
2. Read-only by default: `docker ps/logs/inspect/stats`, `free`, `df`, `journalctl`, `cat` of files under `/data/coolify/applications/`, and `GET` calls to the Coolify API.
3. Any command that changes the box (`rm`, `docker rm/volume/exec/restart/compose`, editing a file, `apt`, `systemctl`, any Coolify API call other than `GET`) is shown in chat with a one-line reason and run only after Soroush says yes. Batch approvals are not a thing; one command, one yes.
4. Never touch `coolify`, `coolify-db`, `coolify-redis`, `coolify-realtime`, `coolify-proxy`, `coolify-sentinel`, or anything under `/data/coolify/` except read.
5. Every change made on the box is also made in `infra/` in the same session, or reverted before the session ends. Every mutating command and its approval is logged in the session file.
6. Never allow-list `ssh`, `scp`, or `curl` against the Coolify URL in Claude Code's permissions; they stay on per-command approval.
7. Never output `Config.Env`, the contents of any `.env` file, or a Coolify API response body unfiltered — select named keys first (`--format`, `jq`, `grep`) before anything reaches the transcript.

## Never touch without an explicit instruction in the current epic

- `docs/backlog.md`, `docs/roadmap.md`, `docs/decisions/*`, `docs/reviews/*` (I edit these)
- `infra/` production compose and secrets
- Applied migration files
- `packages/core/src/artifact/schema.ts` once Stage 5a begins (public contract)
- Any `LICENSE`, `NOTICE`, or `REUSE.toml`

## Definition of Done for every epic

- All acceptance criteria in the epic file checked with evidence (test name, screenshot path, or command output).
- `pnpm test`, `pnpm typecheck`, `pnpm lint` pass in CI.
- New behaviour has tests in the package that owns it.
- No new dependency without a one-line reason in the PR description.
- Forbidden-word grep over UI strings passes.
- This file is still accurate; update it in the same PR if a convention changed.
- `docs/epics/reports/EPIC-xxx-report.md` written: built, skipped, open questions, exact verify commands.
- `docs/epics/sessions/EPIC-xxx-session.md` written per PROCESS.md.

## How to work

- Plan first into `docs/epics/plan-EPIC-xxx.md`; stop and show the plan before implementing.
- Small commits at logical checkpoints. Never auto-commit a broken state.
- When unsure about product behaviour, check `docs/design/` (the mockups are the spec) and `docs/design/README.md`.
- If an acceptance criterion is impossible or contradicts a rule here, write `docs/epics/BLOCKER-EPIC-xxx.md` and stop. Do not reinterpret silently.

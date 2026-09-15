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
Check kinds display as plain phrases. The six `rule_without_check` names are "valid JSON shape",
"one of the allowed values", "word limit", "character limit", "must contain", "must not contain"; ADR-003
adds "matches a pattern" and "refuses to answer". This list was four until EPIC-012b needed a phrase for a
prohibition and found none among them (ruling 2, 2026-09-10) — ADR-003 always had eight and this file was
showing a sample as though it were the set.

## Naming

- Files kebab-case. Types and components PascalCase. Functions and variables camelCase. DB columns snake_case.
- Blok kinds: `context | constraint | example | expected | image_ref | image_input`.
- Prompt ids `pr_` + 8 hex. Project ids `proj_` + 4 hex. Build hash: content hash of the compiled artifact.
- Env: `FORTYONE_API_KEY`, `DATABASE_URL`, `R2_*`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `KEY_ENCRYPTION_SECRET`.
- Public source files carry `SPDX-License-Identifier: Apache-2.0` headers. Copyright holder is `<legal entity>` until incorporation.

## Server access

Claude Code may reach the staging/production box over SSH and the Coolify API from Soroush's machine (ADR-001
revision, 2026-09-04; full context and human setup steps in `infra/ACCESS.md`). Rules:

1. Connect only through the `~/.ssh/config` alias `41p-box` and the values in `~/.41prompts/staging.env` (`COOLIFY_URL`, `COOLIFY_API_TOKEN`). Never read `~/.ssh/lightsail/` directly, never copy either file, never print a value from them.
2. Read-only by default: `docker ps/logs/inspect/stats`, `free`, `df`, `journalctl`, `cat` of files under `/data/coolify/applications/`, and `GET` calls to the Coolify API.
3. Any command that changes the box (`rm`, `docker rm/volume/exec/restart/compose`, editing a file, `apt`, `systemctl`, any Coolify API call other than `GET`) is shown in chat with a one-line reason and run only after Soroush says yes. Batch approvals are not a thing; one command, one yes.

   **One standing exception, granted 2026-09-14**: the read-only `SELECT` that reads a magic-link
   token out of **staging's** `verifications` table, so a deployed environment can be driven in a
   browser. `docs/PROCESS.md`, "Driving a deployed environment: the one supported mechanism", is the
   whole of it — staging only, read-only, token to a scratchpad file and never the transcript.
   Nothing else about `docker exec` changes: every other use still needs one command, one yes.

   **A second standing exception, granted 2026-09-14**, for the same reason and equally narrow:
   `delete from users where email like 'claude-drive-%@example.com'` on **staging**, so the browser
   drive clears the test data it creates instead of staging accumulating it forever. `example.com` is
   reserved by RFC 2606, so the pattern cannot match a real account. No other `DELETE` is covered.
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
- `pnpm test`, `pnpm typecheck`, `pnpm lint` pass locally.
- **`node scripts/gates.mjs ci` green on the commit before it is merged.** Clean checkout, frozen
  lockfile, cold cache, every gate both workflows run in the order they run them. The three tasks
  above run against a working tree that has state CI does not, and five consecutive CI failures on
  locally-green PRs had five different mechanisms; `docs/PROCESS.md`, "Local green is not CI green",
  names each one. Read the run's closing "what a green here still does not cover" block — it is part
  of the result, not a footer. **Since 2026-09-15 this is the only CI there is** — nothing is pushed,
  so GitHub Actions never sees the commit and this run is not a rehearsal for a gate that follows it.
- New behaviour has tests in the package that owns it.
- No new dependency without a one-line reason in the commit message and the epic report.
- Forbidden-word grep over UI strings passes.
- **Every changed file's diff was actually visible during self-review.** Git shows no diff for a file
  it considers binary — one stray NUL byte is enough — so a review that could not see a file's diff
  is not a review of that file, whatever it reported. `pnpm binary-files` fails the build when a
  tracked source file under `packages/` or `apps/` is binary; `.gitattributes` forces a textual diff
  so the mistake surfaces rather than hides.
- This file is still accurate; update it in the same commit if a convention changed.
- **The built page was loaded in a browser and looked right**, with a screenshot in the report.
  Not "the tests pass" — the page, served by `next start` from a real `next build`, rendered styled
  and complete, with the feature driven by hand. `docs/PROCESS.md` says why the e2e suite cannot
  stand in for this, and why `pnpm dev` cannot either. **Deployed staging is no longer part of this
  criterion** (2026-09-15, "Nothing is pushed" below); the built app is.
- `docs/epics/reports/EPIC-xxx-report.md` written: built, skipped, open questions, exact verify commands.
- `docs/epics/sessions/EPIC-xxx-session.md` written per PROCESS.md.

## Nothing is pushed. Soroush pushes (2026-09-15)

**Claude Code never runs `git push`, never opens a pull request, and never calls the GitHub API to
merge one.** Soroush's decision, 2026-09-15. Two reasons, and the first is a hard constraint:

1. **The Actions allowance.** `docs/backlog.md`'s EPIC-009 section records 2,175 billed minutes in
   the repository's first 8.4 days against a 2,000-minute month, which stopped every deploy and
   every CI run mid-epic. EPIC-009 saved 22% and left the project roughly 3x over at the observed
   merge rate. A branch that is never pushed bills nothing.
2. **A red build on GitHub is a slow way to learn something a local gate already knows.** The
   failures were arriving after the push, not before it.

**What replaces each step:**

| was | is now |
|---|---|
| push the branch | nothing — the branch stays local |
| open a PR, describe the change | the commit message carries what the PR description carried |
| CI green on the PR | `node scripts/gates.mjs ci` green on the commit, locally |
| merge the PR with `gh` | `git merge --no-ff` into local `main` |
| staging redeploys, `/healthz` shows the commit | nothing deploys |
| drive the deployed URL | drive the **built** app: `next build`, `next start`, by hand, screenshotted |

**`main` still moves only through a branch and a green gate.** The guard hook in `.githooks` that
refuses a direct commit on `main` stays exactly as it is. What changed is where the gate runs and
who presses merge — not that there is one.

**Soroush pushes, when he decides to.** Until he does, `origin/main` is behind local `main` and
staging is serving an older commit. That is expected, and it means **a staging URL is not evidence
about anything built after the last push.** Do not quote it as though it were.

**Human-only work is skipped, not blocked on** (same ruling). Rows whose status names a step only
Soroush can take — an account, a payment method, a lawyer, recruited participants, a key set in
Coolify — are skipped and the run moves to the next row. `docs/backlog.md` already carries four of
them as `deferred`. Building the product comes first; a deferred row is revisited when he is ready.

## How to work

- Plan first into `docs/epics/plan-EPIC-xxx.md`; stop and show the plan before implementing.
- Small commits at logical checkpoints. Never auto-commit a broken state.
- Never `git push`; never open or merge a pull request. See "Nothing is pushed" above.
- When unsure about product behaviour, check `docs/design/` (the mockups are the spec) and `docs/design/README.md`.
- If an acceptance criterion is impossible or contradicts a rule here, write `docs/epics/BLOCKER-EPIC-xxx.md` and stop. Do not reinterpret silently.

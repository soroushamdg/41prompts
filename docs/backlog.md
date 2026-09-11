# Backlog

Status: `todo` · `current` · `done` · `blocked` · `deferred` · `cut`
Sizes: S one session · M two to three · L must be split
Gates: ▣ marks a go/no-go checkpoint; nothing after it starts until it passes (criteria in `roadmap.md`).

ICP: AI engineers at companies of 10–500 people who own a production prompt. Everything is built for them.

Stages ship in order. Nothing in a later stage starts until the stage before has a report for every epic.

---

## Stage 0 · Foundation

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-000 | Repo scaffold: monorepo, TS strict, lint, Vitest, CI, Apache-2.0 + SPDX on public packages, boundary allow-list | M | — | done |
| EPIC-005 | Customer discovery: 10 interviews with ICP engineers, 5 written use cases, pricing check, activation definition | S | — | cut |
| EPIC-006 | Namespaces and marks: npm org, GitHub org, PyPI names, trademark knockout search, domain check | S | — | todo |
| EPIC-001 | Infra: AWS Lightsail Montréal + Coolify, Compose (postgres, web, worker), staging + prod, TLS, nightly backups to R2, restore drill; infra as code, no agent SSH | M | 000 | done |
| EPIC-002 | Data + auth: Drizzle baseline, migrations, Better Auth (Google, GitHub, email), protected routes, account purge window | M | 001 | done |
| EPIC-003 | Design system: Resolution tokens in Tailwind v4 `@theme`, base components with ARIA, light/dark, reduced motion | M | 000 | done |
| EPIC-004 | Observability + guardrails: Sentry, PostHog with typed events, uptime, structured logs, run budgets, metrics dashboard, Drizzle Studio access documented for staging and production | S | 002 | done |
| EPIC-007 | Compliance CI: REUSE lint, dependency-cruiser allow-list, Turborepo boundaries, SBOM + licence gate, mirror dry-run | S | 000 | done |
| EPIC-008 | Prebuilt images: GitHub Actions builds web + worker to private GHCR on `main` and `v*`, Coolify pulls fixed tags and deploys via webhook; no builds on the box. Owns the healthz `commit` criterion deferred from EPIC-001 F2 | S | 001 | done |

## Stage 1 · Decompiler, soft-public

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-080 | research: one 12-participant study on the decompiler prototype; "blok" comprehension, touch discoverability, summary trust | S | — | cut |
| EPIC-010 | core: deterministic segmenter with exact offsets, fixture corpus, property tests | M | 000 | done |
| EPIC-011a | core: blok classifier with labelled table; deterministic clustering into multi-range bloks | M | 010 | done |
| EPIC-011b | core: summariser interface (heuristic in core, model-backed in worker, cached); topic keys as data | S | 011a | done |
| EPIC-012a | core: detectors — repeated, contradiction, untestable, padding, too-long; Finding schema, severity | M | 011b | done |
| EPIC-012b | core: rules-without-checks detector; suggested-fix wording; false-positive audit on corpus | S | 012a | done |
| EPIC-013 | web: public `/decompile`; source map, bloks, bidirectional hover + keyboard pin, markers, dim, findings; touch default | M | 003, 012b | done |
| EPIC-017 | Legal minimum: terms, privacy, cookie choice, sub-processor page, retention table, transfer note, DPA-on-request draft | S | 002 | todo |
| EPIC-014 | Capture: permalink with `noindex` + removal endpoint, 30-day purge job, rate limits, Turnstile, abuse check before provider, waitlist capture | S | 013, 017 | done |
| EPIC-016 | Landing page v1: nav, hero with ask bar and compile pass, three-step strip, decompiler CTA, footer, sign in / sign up | M | 003, 013 | todo |
| EPIC-015 | Soft ship: `llms.txt`, companion article, PostHog funnel, Search Console; no announcement | S | 014, 016 | todo |
| EPIC-084 | research: read the live funnel and the blok-count distribution; size the canvas problem | S | 015 | todo |
| ▣ GATE 1 | Stage 1 exit: criteria in roadmap | — | 084 | — |

Stage 1 runs out of backlog order. **EPIC-080** (prototype study) and **EPIC-005** (interviews) are
`cut` — Soroush's decision, 2026-09-10: the prototypes in `docs/design/` and `docs/roadmap.md` are the
spec from here, and the per-milestone kill criteria in `docs/roadmap.md` are the only feedback
mechanism before Stage 2. Neither is deferred, so nothing waits on them and nothing may be blocked on
them. The `Depends` column of every epic that named one has been cleared; where a cut epic owed a
later epic an output, that debt is listed under its section in `docs/roadmap.md` rather than left
implicit. EPIC-010 was interview-proof anyway — no research finding moves where a paragraph ends.

## Stage 2 · Bloks and compiler

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-090 | research: clickable prototype study; override mental model, canvas at 60+ bloks, Draft/Live/Versions vocabulary | S | 084 | todo |
| EPIC-020 | core: blok model, per-blok compiler, span cache by content hash, manual override + drift, artifact schema v0 | M | 011b | todo |
| EPIC-021a | web: project + prompt CRUD, canvas with blok cards, add/edit/reorder/delete, seeded starter bloks | M | 020, 003 | todo |
| EPIC-021b | web: compiled pane, span linking, override, drift, update-from-blok, eject | M | 021a, 003, 090 | todo |
| EPIC-022 | Variables: `{{placeholder}}` extraction into a typed schema; validation | S | 020 | todo |

## Stage 3 · Checks and runs, one provider

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-030 | core: check model from expected bloks; deterministic graders; result schema | M | 020 | todo |
| EPIC-031 | worker: pg-boss runner, Anthropic adapter, raw payload retention with 12-month purge, hash cache, cost + latency, budget caps | M | 004, 030 | todo |
| EPIC-032 | web: input sets (CSV), run trigger, results by check, failure detail, attribution to blok, create-constraint-from-failure with preview | M | 031, 021b | todo |
| EPIC-033 | LLM-judge grader with pinned judge version; judge prompt stays proprietary | S | 031 | todo |
| EPIC-034 | Activation onboarding: signup → first passing run in under five minutes on a seeded prompt; measured | S | 032 | todo |
| ▣ GATE 3 | Stage 3 exit + loud launch decision: criteria in roadmap | — | 034 | — |
| EPIC-035 | Loud launch: Show HN, Product Hunt, one content piece from our own run data | S | GATE 3 | todo |

## Stage 4 · Versions and three providers

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-040 | core + db: version = blok-set snapshot, semantic diff, compiled byte delta, pass rate per version | M | 030, 032 | todo |
| EPIC-041 | web: history, restore, A/B two versions on one suite | S | 040 | todo |
| EPIC-043 | BYO-key threat model + breach runbook (before any user key is stored) | S | 004 | todo |
| EPIC-042 | Providers: OpenAI + Google adapters, BYO keys encrypted at rest, provider matrix, accessible heatmap pivot | M | 031, 043 | todo |

## Stage 5a · Delivery, minimum

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-050 | core: build artifact v1 (frozen), Live/Draft pointer, variable-contract compatibility check | M | 040, 022 | todo |
| EPIC-051 | API + storage: publish, undo, R2 with immutable headers, audit log, admin-only switch, gate on checks, publish-anyway with reason | M | 050, 042 | todo |
| EPIC-052 | sdk-ts (`@41prompts/sdk`): `resolve()`, memory → disk → bundled → network, never blocks, never throws, telemetry off | M | 050 | todo |
| EPIC-055 | web: Deploy page, Connect page (TypeScript only), API keys tab, Publishing tab, publish flow | M | 051, 052 | todo |
| ▣ GATE 5 | Demand check: criteria in roadmap | — | 055 | — |

## Stage 5b · Delivery, full

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-053 | cli: `41p link / pull / check / run / decompile`, TS + Python codegen, lockfile, bundled fallback | M | 052 | todo |
| EPIC-054 | sdks/python: `resolve()` parity, zero dependencies, PyPI publish | S | 053 | todo |
| EPIC-057 | SDK threat model + external review hour: artifact integrity, pointer abuse, dependency confusion | S | 052 | todo |
| EPIC-056 | Open-source split: public mirror with history, Apache-2.0, NOTICE, DCO, READMEs, trusted publishing, IP assignment executed | S | 054, 057 | todo |

## Stage 6 · Billing and launch

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-070 | Stripe: Free / Pro / Team, usage meter, run gating, BYO-key unlock, dunning | M | 004 | todo |
| EPIC-071 | Legal full: lawyer review, Team DPA, provider ToS re-check for published comparisons, trademark filing status | S | 017 | todo |
| EPIC-072 | Marketing site final: all pages from the mockup, run demo, rotator, counters wired to real data, third-party notices page | M | 016, 055 | todo |
| EPIC-073 | Launch 2: content series from run data, outreach to 30 teams paying for evals, launch dashboard | S | 035, 072 | todo |

## Stage 7 · Lessons

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-064 | research: paper-prototype Lesson 02 with two newcomers on an ICP team; record stalls | S | 034 | todo |
| EPIC-060 | Lesson engine: definition format, preloaded bloks, step tracker, canned cached runs, cheap-model tier, daily caps | M | 032, 064 | todo |
| EPIC-061 | Lessons 01–03 content + UI, run 5× demo, temperature control with `aria-valuetext`, sandbox unlock | M | 060 | todo |
| EPIC-062 | Lessons 04–09 content | M | 061 | todo |
| EPIC-063 | Companion text page per lesson, indexed and citable | S | 061 | todo |

## Ongoing

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-900 | Tech debt sweep and infra drill, every third sprint | S | — | todo |
| EPIC-901 | Dependency, licence and security audit, monthly; read the compliance artifacts | S | — | todo |

---

## Cut (do not reopen without a written reason)

- Phone, image, video AI testing
- Standalone prompt quality score
- Team collaboration in v1
- General LLM curriculum for students
- Percentage rollouts, cohorts, custom environments, gateway mode (all `later`)
- SDK telemetry on by default
- MIT for public packages (replaced by Apache-2.0)
- The word "block" anywhere in code, schema or UI
- EPIC-005, customer discovery interviews (2026-09-10). The prototypes and the roadmap are the spec;
  the kill criteria per milestone replace interviews as the feedback mechanism before Stage 2. The
  two survey responses that did arrive are in `docs/research/discovery/survey/`, marked n=2 and not
  actionable. Reopening this costs EPIC-034 its research-backed definition of "activated" and
  EPIC-070 its validated prices — both now rest on the roadmap's own numbers.
- EPIC-080, the 12-participant decompiler prototype study (2026-09-10). Same decision. "Blok" as a
  term, touch discoverability and summary trust are now settled by the prototypes and tested by
  EPIC-084's live read rather than by a study.

# Backlog

Status: `todo` · `current` · `done` · `blocked` · `cut`
Sizes: S one session · M two to three · L must be split

Stages ship in order. Nothing in a later stage starts until the stage before has a report for every epic.

---

## Stage 0 · Foundation

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-000 | Repo scaffold: monorepo, TS strict, lint, Vitest, CI, CLAUDE.md wired | M | — | current |
| EPIC-001 | Infra: Hetzner + Coolify, Docker Compose (postgres, web, worker), staging + prod, TLS, nightly backups to R2 | M | 000 | todo |
| EPIC-002 | Data + auth: Drizzle baseline schema, migrations, Better Auth (Google, GitHub, email), protected routes | M | 001 | todo |
| EPIC-003 | Design system: Resolution tokens into Tailwind v4 `@theme`, base components, light/dark, reduced motion | M | 000 | todo |
| EPIC-004 | Observability + guardrails: Sentry, PostHog, uptime check, structured logs, per-user run budget table | S | 002 | todo |

## Stage 1 · Decompiler, shipped publicly

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-010 | core: deterministic segmenter with exact offsets, fixture corpus, property tests | M | 000 | todo |
| EPIC-011 | core: blok classifier, topic clustering into multi-range bloks, summariser interface (model-backed, cached) | M | 010 | todo |
| EPIC-012 | core: diagnostics (repeat, contradiction, untestable, padding, too-long, zero-assertions) | M | 011 | todo |
| EPIC-013 | web: public `/decompile`; source map, bloks, bidirectional hover, leading markers, pin, dim, findings | M | 003, 012 | todo |
| EPIC-014 | Capture: permalink, rate limits, abuse controls, "create project from bloks" into signup | S | 013, 002 | todo |
| EPIC-016 | Landing page v1: nav, hero with ask bar and animated compile pass, three-step strip, decompiler CTA, footer, sign-in/sign-up pages; replaces the "in development" placeholder | M | 003, 013 | todo |
| EPIC-015 | Ship it: SEO pages, `llms.txt`, companion article, PostHog funnel, launch post | S | 014, 016 | todo |

## Stage 2 · Bloks and compiler

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-020 | core: blok model, per-blok compiler, content-hash block cache, manual override + drift, artifact schema v0 | M | 011 | todo |
| EPIC-021 | web: project + prompt CRUD, canvas, compiled pane, linking, type filter, override + reconcile, eject | L → split | 020, 003 | todo |
| EPIC-021a | web: project + prompt CRUD, canvas with blok cards, add/edit/reorder/delete | M | 020 | todo |
| EPIC-021b | web: compiled pane, span linking, override, drift, reconcile, eject | M | 021a | todo |
| EPIC-022 | Variables: `{{placeholder}}` extraction into a typed variable schema; validation | S | 020 | todo |

## Stage 3 · Assertions and runs, one provider

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-030 | core: assertion model from expected bloks; deterministic graders (contains, regex, json_schema, length, refusal); result schema | M | 020 | todo |
| EPIC-031 | worker: pg-boss runner, Anthropic adapter via AI SDK, raw payload retention, hash cache, cost + latency, budget caps | M | 004, 030 | todo |
| EPIC-032 | web: input sets (CSV), run trigger, results by assertion, failure detail, attribution to blok, create-constraint-from-failure | M | 031, 021b | todo |
| EPIC-033 | LLM-judge grader with pinned judge version and rubric bloks | S | 031 | todo |

## Stage 4 · Versions and three providers

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-040 | core + db: version = blok-set snapshot, semantic diff, compiled byte delta, pass rate per version | M | 030 | todo |
| EPIC-041 | web: history, restore, A/B two versions on one suite | S | 040 | todo |
| EPIC-042 | Providers: OpenAI + Google adapters, BYO keys encrypted at rest, provider matrix view, heatmap pivot | M | 031 | todo |

## Stage 5 · Delivery

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-050 | core: build artifact v1 (frozen), Live/Draft pointer, variable-contract compatibility check | M | 040, 022 | todo |
| EPIC-051 | API + storage: publish, undo, R2 upload with immutable headers, pointer TTL, audit log, admin-only switch, gate on assertions, override with reason | M | 050, 042 | todo |
| EPIC-052 | sdk-ts: `resolve()`, memory → disk → bundled → network, never blocks, never throws, background refresh | M | 050 | todo |
| EPIC-053 | cli: `41p link / pull / check / run`, TS + Python codegen, lockfile, bundled fallback | M | 052 | todo |
| EPIC-054 | sdks/python: `resolve()` parity, PyPI publish via CI | S | 053 | todo |
| EPIC-055 | web: Deploy page, Connect page, API keys tab, Publishing tab, publish flow with gate UI | M | 051, 053 | todo |
| EPIC-056 | Open-source split: public repo for core, cli, sdk-ts, sdks/python under MIT; READMEs; release automation | S | 054 | todo |
| EPIC-057 | SDK threat model + review: key handling, artifact integrity (signed sha), abuse of pointer endpoint | S | 052 | todo |

## Stage 6 · Lessons

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-060 | Lesson engine: lesson definition format, preloaded bloks, step tracker, canned cached runs, cheap-model tier, daily caps | M | 032 | todo |
| EPIC-061 | Lessons 01–03 content + UI, run 5× demo, temperature control, sandbox unlock | M | 060 | todo |
| EPIC-062 | Lessons 04–09 content | M | 061 | todo |
| EPIC-063 | Companion text page per lesson, indexed and citable | S | 061 | todo |

## Stage 7 · Billing and launch

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-070 | Stripe: Free / Pro / Team, usage meter, run gating, BYO-key unlock | M | 004 | todo |
| EPIC-071 | Legal: terms, privacy, cookie choice, provider ToS review, DPA template; one lawyer hour | S | — | todo |
| EPIC-072 | Marketing site final: Features, Delivery, Pricing, Learn, Docs, About, Security, Changelog, Blog, Guides, Careers, Contact; run-demo, rotator, counters | M | 016, 055 | todo |
| EPIC-073 | Launch: Product Hunt + HN plan, three content pieces from our own run data, outreach list | S | 015, 055 | todo |

## Ongoing

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-900 | Tech debt sweep, every third sprint | S | — | todo |
| EPIC-901 | Dependency + security audit, monthly | S | — | todo |

---

## Cut (do not reopen without a written reason)

- Phone, image, video AI testing
- Standalone prompt quality score
- Team collaboration in v1
- General LLM curriculum
- Percentage rollouts, cohorts, custom environments, gateway mode (see feature list, all `later`)

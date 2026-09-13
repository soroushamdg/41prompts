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
| EPIC-008 | Prebuilt images: GitHub Actions builds web + worker to private GHCR on `main` and `v*`, Coolify pulls fixed tags and deploys via webhook; no builds on the box. Owns the healthz `commit` criterion deferred from EPIC-001 F2 | S | 001 | done — staging half reverted by EPIC-009 |
| EPIC-009 | Actions budget: image builds move off `main` to `v*` tags only, staging builds on the box again, tags become releases, measured budget in the runbook | S | 008 | done — two criteria carried, see report §13 |
| EPIC-006b | Zero-downtime container replacement on staging: close the ~25 s apex gap on every deploy | S | 009 | deferred — not scheduled |
| EPIC-006c | Coolify control plane not on a public hostname: `coolify.41prompts.ai` is discoverable and named throughout the repo | S | 001 | deferred — not scheduled |

**EPIC-009 is a late Stage 0 entry (2026-09-12).** EPIC-008 moved both image builds to Actions at
6.58 billed minutes a merge; 81 builds, 73 of them from merges to `main`, helped spend **2,175 billed
minutes in the repository's first 8.4 days against a 2,000-minute month**. The allowance ran out,
which stopped every deploy and every CI run mid-epic. It sits in Stage 0 because it is foundation
work that should have been budgeted there, not because it was foreseen.

It does **not** bring the burn under the allowance on its own — it saves 22%, and the project stays
roughly 3× over at the observed merge rate. `infra/RUNBOOK.md` carries the measurement and the
remaining lever.

**EPIC-006b is late Stage 0 debt, not scheduled (2026-09-13).** Every staging deploy drops the apex
for about twenty-five seconds: `503` on both `staging.41prompts.ai` and `app.staging.41prompts.ai`
while the container is replaced. Measured twice on staging in EPIC-009 (§9.7 and §12), at ≤ 32 s and
≤ 23 s — the second on a deploy whose images were entirely cache hits, so the gap is the container
swap, not the build. The likely cause is that Coolify stops the old container before the new one is
answering; the fix is a healthcheck the orchestrator actually waits on, plus whatever Traefik needs to
hold traffic until it passes. EPIC-009 already declared `healthcheck:` for `web` and `worker` in all
three compose files, which makes readiness visible to Coolify but did **not** close the gap on the
next deploy; making Coolify *wait* for it is the unstarted part.

One correction to how this was scoped: **production is affected too.** It was measured at ≤ 38 s on
2026-09-13, the longest of the three gaps recorded that day. What production avoids is the *build*, not the swap — it pulls a
prebuilt image, so its deploy is shorter overall, and it deploys rarely because only a `v*` tag
triggers it. Rarely is the mitigation; immunity is not. Anyone treating a release as zero-downtime on
the strength of "production pulls an image" would be wrong.

**EPIC-006c is Stage 0 debt, not scheduled (2026-09-13).** The Coolify control plane answers on
`coolify.41prompts.ai`, and the 2026-09-13 public-repository audit found that name in ten places
across `infra/` and `docs/`, alongside the SSH alias `41p-box`, both application uuids, the GitHub
account, the GHCR image paths and the provider and region. None of that is a credential and none of
it was leaked — it is ordinary infrastructure documentation, and the audit found no live secret
anywhere in 160 commits. What changed is that the repository went public, so the single
highest-value target on the box is now discoverable by reading rather than by scanning: an attacker
who would previously have had to find the control plane is handed its hostname.

The fix is to stop serving the control plane on a guessable public name — a non-public hostname, or
no public hostname at all with access over the SSH tunnel that `infra/ACCESS.md` already assumes.
That is a DNS change, a Coolify `FQDN` change, a certificate, and an update to every document and
token that names it, which is why it is its own row: it is a bigger change than the audit that found
it, and doing it inside an unrelated PR would be the kind of quiet infrastructure edit that later
turns out to have broken deploys. Renaming it does not make the old name unpublished — the history
keeps it — so this is about the live endpoint, not about scrubbing the repository.

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
| EPIC-016 | Landing page v1: nav, hero with ask bar and compile pass, three-step strip, decompiler CTA, footer, sign in / sign up | M | 003, 013 | done |
| EPIC-015 | Soft ship: `llms.txt`, companion article, PostHog funnel, Search Console; no announcement | S | 014, 016 | done |
| EPIC-084 | research: read the live funnel and the blok-count distribution; size the canvas problem | S | 015 | cancelled — Soroush cancelled the measurement programme on 2026-09-12 |

Stage 1 runs out of backlog order. **EPIC-080** (prototype study) and **EPIC-005** (interviews) are
`cut` — Soroush's decision, 2026-09-10: the prototypes in `docs/design/` and `docs/roadmap.md` are the
spec from here, and the per-milestone kill criteria in `docs/roadmap.md` are the only feedback
mechanism before Stage 2. Neither is deferred, so nothing waits on them and nothing may be blocked on
them. The `Depends` column of every epic that named one has been cleared; where a cut epic owed a
later epic an output, that debt is listed under its section in `docs/roadmap.md` rather than left
implicit. EPIC-010 was interview-proof anyway — no research finding moves where a paragraph ends.

**Stage 1 is complete (2026-09-12)** and Stage 2 has started. Every Stage 1 epic that was going to be
built has shipped with a report: 010, 011a, 011b, 012a, 012b, 013, 014, 016, 015. EPIC-080 and
EPIC-005 are `cut`, EPIC-084 is `cancelled`.

**One item is carried rather than done, and it is named here so the stage line is not read as more
than it is: `EPIC-017` (legal minimum) is still `todo`.** Terms, privacy, cookie choice, the
sub-processor page and the retention table are stubs — EPIC-016's baseline literally captures a
placeholder that says it is one. EPIC-014 shipped against it anyway, which is how the dependency got
away. It is a Stage 1 obligation carried into Stage 2, not a Stage 2 epic, and the usual rule — a
report for every epic in a stage before the next one starts — is being waived for it by decision, not
met.

## Stage 2 · Bloks and compiler

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-090 | research: clickable prototype study; override mental model, canvas at 60+ bloks, Draft/Live/Versions vocabulary | S | 084 | todo |
| EPIC-020 | core: blok model, per-blok compiler, span cache by content hash, edited-by-hand spans + drift, artifact schema v0 | M | 011b | done |
| EPIC-021a | web: project + prompt CRUD, canvas with blok cards, add/edit/reorder/delete, seeded starter bloks; blok category colour (from EPIC-020) | M | 020, 003, 002 | built — awaiting the staging hand-drive |
| EPIC-021b | web: compiled pane, span linking, hand-edited spans, drift, update from blok, copy | M | 021a, 003 | current |
| EPIC-022 | Variables: `{{placeholder}}` extraction into a typed schema; validation | S | 020 | todo |

**Two Stage 2 rows read as in-flight, and that is not two epics being built at once.** EPIC-021a is
finished and merged; its status says `built — awaiting the staging hand-drive` because one criterion
needs a person to sign in to staging and look, which nothing here can do (its report §7 explains
why). EPIC-021b is the epic actually being worked on. When Soroush reports on staging, 021a's last
criterion is ticked and its row becomes `done`.

Its row title also drops "override" and "eject" for "hand-edited spans" and "update from blok":
ADR-003 replaced the first and the second is not in EPIC-021b's scope. Its `Depends` loses 090, which
is `todo` and gated behind the cancelled EPIC-084 — the epic file names only 021a and 003.

**EPIC-021a is built and its report is written** (`docs/epics/reports/EPIC-021a-report.md`). It stays
`current` rather than `done` for one reason, stated plainly: **the staging deploy and its screenshots
have not happened.** Staging tracks `main`, so that step can only follow the merge, and the criterion
is left unticked rather than ticked on the intention.

Decision 5 — a hand edit surviving an unrelated blok being added — is resolved structurally: the hand
edit lives on the blok row, so adding a blok is one INSERT that writes no other row. Both tests are
kept; the database one is the one that would catch the real failure, and it asserts the structure
directly by checking no other row's `updatedAt` moves.

Decision 1 was amended in the epic file on 2026-09-12: blok ids are minted, not content-derived.

**EPIC-020 shipped 2026-09-12** (`docs/epics/reports/EPIC-020-report.md`). Marked `done` because the
work is merged and every criterion is ticked with evidence — **the advisor's review has not happened
yet**, so if it turns something up this row goes back rather than a fix-up epic being invented around
it. `CURRENT.md` still points at EPIC-020 until the next epic is written.

Its row title says "edited-by-hand spans" rather than "manual override": ADR-003 replaced that word
and the backlog was still carrying it.

All four rulings it raised were made on 2026-09-12 and are shipped: the closing-band heading, a text
assertion on it in `page.test.tsx`, `BLOK_SEPARATOR` moved to a single newline to match the mockup
(`COMPILER_VERSION` now `compile@2`), and `CLAUDE.md`'s "Build sha" line corrected to "Build hash".

**Two things are carried into EPIC-021b as named requirements**, in `docs/epics/notes-EPIC-021b.md`:
what the pane does when a blok is **added** to a prompt with hand-edited spans — no answer exists in
the model on purpose, and getting it wrong loses somebody's typing silently — and the fact that the
mockup's single banner can express only one of the two states the model distinguishes.

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

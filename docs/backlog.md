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
| EPIC-006d | Staging and production postgres dumps share one R2 bucket and one `postgres/` prefix: neither environment's backups are distinguishable, isolated, or safe from the other's 30-day prune | S | 001 | todo — scoped, not scheduled |

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

**EPIC-006d is Stage 0 debt, scoped on 2026-09-14 and not scheduled.** Carried out of the
2026-09-13 production incident as an open item; scope only, no fix attempted here.

**What is true today.** `infra/backup.sh` writes `s3://$R2_BUCKET_BACKUPS/postgres/41p-<UTC
timestamp>.dump`. The prefix is the literal string `postgres`, the filename carries a timestamp and
nothing else, and **staging and production both run this same script against the same bucket**. Four
consequences, none of them hypothetical:

1. **A dump cannot be identified by its key.** `postgres/41p-20260913T030000Z.dump` does not say which
   environment produced it. Timestamp and object size are the only clues, and the two environments
   back up on the same schedule.
2. **`restore.sh` takes a key and asks nothing else.** `restore.sh postgres/<key>` will restore a
   staging dump into production, or the reverse, with no prompt and no mismatch check. The runbook's
   restore drill (`infra/RUNBOOK.md`) picks a key from a listing that mixes both.
3. **The 30-day prune is cross-environment.** `backup.sh` lists `--prefix "postgres/"` and deletes
   *every* object older than the cutoff, so **the staging backup container deletes production's
   backups** — and does so on a box where staging is the less-defended half.
4. **Staging's R2 credentials can read and delete production's dumps.** After 2026-09-13 that is not
   an abstract worry: eleven production environment variables were overwritten with staging's values
   in one paste, and the incident record names that as hazard 1.

**Scope of the fix, for whoever picks this up.** Separate the two, then prove it: either a distinct
bucket per environment or — cheaper — an environment segment in the prefix (`postgres/production/`,
`postgres/staging/`) with `backup.sh` and `restore.sh` both deriving it from `DEPLOY_ENV`, the prune
scoped to its own prefix, separate R2 tokens whose scope stops at their own prefix, and `restore.sh`
refusing a key from another environment rather than trusting the operator. Existing objects under the
bare `postgres/` prefix have to be attributed and moved or re-dumped, and `infra/RUNBOOK.md`'s restore
drill re-run afterwards, because a restore procedure nobody has executed since the change is not a
procedure.

**What is not being claimed.** Nothing is known to have been lost or cross-restored. This is an
isolation defect found by reading the script, not an incident.

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
| EPIC-017 | Legal minimum: terms, privacy, cookie choice, sub-processor page, retention table | M | 002 | done |
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

**EPIC-017 is done, 2026-09-14, and Stage 1 has no carried items left.** It was `todo` through
Stage 2 — terms, privacy, cookie choice, the sub-processor page and the retention table were all
stubs, and EPIC-016's visual baseline literally captured a placeholder that said so. EPIC-014 shipped
against it anyway, which is how the dependency got away.

It was closed under Soroush's ruling of 2026-09-14: **no lawyer**, written in full by Claude Code,
with one line at the top of terms and privacy saying it has not been reviewed by one. Its row size is
corrected from S to M, which is what it actually was.

**Its scope shrank in one place and grew in another, both deliberately.** The DPA-on-request draft
and the standalone Law 25 transfer assessment moved to **EPIC-071**, whose row already depends on
this one — they are documents for a service with business customers, which this is not yet, and the
assessment's substance is on the privacy page regardless. What grew: the retention table gained a
fourth number nobody's brief had (`RUN_COUNT_RETENTION_DAYS = 180`, enforced in
`purge-decompiles.ts`), and the processor list turned out to be **seven in use, not the roadmap's
eight** — AWS and GitHub were missing from it, and four of the eight are not wired at all.

Every retention number is imported from the constant that enforces it, so the page cannot drift from
the code, and a test walks each cited file path and fails if it does not exist.

## Stage 2 · Bloks and compiler

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-090 | research: clickable prototype study; override mental model, canvas at 60+ bloks, Draft/Live/Versions vocabulary | S | 084 | todo |
| EPIC-020 | core: blok model, per-blok compiler, span cache by content hash, edited-by-hand spans + drift, artifact schema v0 | M | 011b | done |
| EPIC-021a | web: project + prompt CRUD, canvas with blok cards, add/edit/reorder/delete, empty states; blok category colour (from EPIC-020) | M | 020, 003, 002 | done |
| EPIC-021b | web: compiled pane, span linking, hand-edited spans, drift, update from blok, copy | M | 021a, 003 | done |
| EPIC-022 | Variables: `{{placeholder}}` extraction into a typed schema; validation | S | 020 | done |

**The staging hand-drives are done, 2026-09-14, and the agent did them.** All three Stage 2 rows that
were waiting on "a person to sign in to staging and look" have been driven on
`app.staging.41prompts.ai` at `e5fa776`, by the mechanism `PROCESS.md` now records under "Driving a
deployed environment". EPIC-021a passed and is `done`. EPIC-021b's shipped behaviour drove clean but
the epic itself is unfinished (see below). EPIC-022 **failed** — BUG-022 below. Results and
screenshots: `docs/epics/sessions/2026-09-14-session.md` §6 and
`docs/epics/reports/screenshots/stage2-staging-drive/`.

EPIC-021a's report §7 said the driven-by-hand half "is a human step and is not done" and that "there
is no read-only path from this machine to a staging session". That was true when it was written and
is no longer: the path is one read-only `SELECT` of the magic-link token, granted as a standing
permission on 2026-09-14.

Its row title also drops "override" and "eject" for "hand-edited spans" and "update from blok":
ADR-003 replaced the first and the second is not in EPIC-021b's scope. Its `Depends` loses 090, which
is `todo` and gated behind the cancelled EPIC-084 — the epic file names only 021a and 003.

**EPIC-021a is `done`** (`docs/epics/reports/EPIC-021a-report.md`). The one criterion it was holding
open — the staging deploy and its screenshots — was driven on 2026-09-14: create a project, create a
prompt, add four bloks of four kinds, reorder, edit, delete, undo the delete, reload and find all of
it still there, at 1440px and at 390px. Every step passed.

**Seeded starter bloks were never owed — ruled 2026-09-14, and this row's title is corrected to say
"empty states".** The 2026-09-14 hand-drive found a new prompt opening with zero bloks and read it
against this row's old title, which promised three starter templates. `EPIC-021a-canvas.md`'s Scope
had already narrowed that to a seed script plus empty states, and empty states is what shipped.
Soroush's ruling: not owed, because "No projects yet. The first one is where a prompt lives" does the
job **without fabricating someone's content** — which matters on a product whose claim is that a blok
holds your verbatim text. `roadmap.md`'s task line is struck through with the date rather than
deleted, so the retired promise stays visible.

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

**Stage 2 is complete, 2026-09-14.** All four built epics are `done` with reports and session logs:
EPIC-020, EPIC-021a, EPIC-021b, EPIC-022. EPIC-090 (the clickable prototype study) is `todo` and
gated behind the cancelled EPIC-084; nothing was blocked on it and nothing waits on it now.

**EPIC-022 closed last**, on 2026-09-14. Its hand-drive criterion failed on 2026-09-13 — the
Variables tab did not see a `{{placeholder}}` until the page was reloaded — and the defect, BUG-022,
turned out to share one line with BUG-021b-compiled-pane-stale. Both were fixed in #73 and the drive
was re-run on `app.staging.41prompts.ai` at `d3bcc03`: the tab sees `customer` and `company` with no
reload. The row is `done` on the re-drive, not on the first attempt.

**EPIC-021b is `done`, with one criterion deliberately split and the split ruled on.** Every
criterion is met and evidenced (`docs/epics/reports/EPIC-021b-report.md` §2). The exception: the
staging drive happened and is screenshotted, and it shows **three** of the four states, because the
fourth is not reachable in the running product — `page.tsx` recompiles every non-hand-edited span on
each render, so an "out of date" span is `in-step` by construction. Proved on staging, not reasoned
about.

**Soroush ruled on 2026-09-14 that this is correct behaviour rather than a gap**: EPIC-020 modelled
two genuinely different facts and the product exercises three of the four combinations. The epic file
is amended to say so, the criterion stays split, and the row is `done` on that basis — which is not
the "ticked on the intention" failure `PROCESS.md` warns about, because the unticked half describes a
state the product cannot be in rather than work nobody did. **No path to state 4 is to be built
unless a later epic needs one**; it arrives with EPIC-040's versioning and EPIC-050's artefact.

## Stage 3 · Checks and runs, one provider

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-030 | core: check model from expected bloks; deterministic graders; result schema | M | 020 | done |
| EPIC-031 | worker: pg-boss runner, Anthropic adapter, raw payload retention with 12-month purge, hash cache, cost + latency, budget caps | M | 004, 030 | done |
| EPIC-031a | The first real Anthropic call, against staging: a planned event rather than a discovery | S | 031 | todo — scoped, not scheduled |
| EPIC-032 | web: input sets (CSV), run trigger, results by check, failure detail, attribution to blok, create-constraint-from-failure with preview | M | 031, 021b | todo |
| EPIC-033 | LLM-judge grader with pinned judge version; judge prompt stays proprietary | S | 031 | todo |
| EPIC-034 | Activation onboarding: signup → first passing run in under five minutes on a seeded prompt; measured | S | 032 | todo |
| ▣ GATE 3 | Stage 3 exit + loud launch decision: criteria in roadmap | — | 034 | — |
| EPIC-035 | Loud launch: Show HN, Product Hunt, one content piece from our own run data | S | GATE 3 | todo |

**Stage 3 has started, 2026-09-14, with EPIC-030 done.** Stage 2 closed with a report and a session
log for every epic, so `PROCESS.md`'s stage rule is met rather than waived for the first time.

EPIC-030 shipped the three outcomes that everything downstream reads: `pass`, `fail`, and
**`not_graded`**, which is neither. The summary carries two booleans rather than one — `noFailures`
gates Live per rule 9, and `fullyChecked` is the honesty half that is **never folded into a pass**.
There is deliberately no field called `passed`.

Two things it hands forward. **EPIC-032 owes the sentence** that `fullyChecked: false` gets at the
publish moment; the field exists, the words are a UI decision and should be in that epic before it is
built. **EPIC-033 inherits the `no_kind` queue** — `checkKindFor` declines to name a kind for a large
share of real expected bloks, which is honest and is also a lot of unchecked rules, and
`refuses_to_answer` is now explicitly `not_graded` with `needs_judgement` waiting for it.

**No browser drive, and that is not a skipped criterion**: the epic ships no route, no component and
no user-visible string. Its report says so in §11 rather than leaving an unticked box that reads like
an omission.

**EPIC-031 is done, 2026-09-14**, in two PRs: the retention and purge work first, then everything the
four rulings settled.

**It closed a promise the privacy page already made.** That page's retention row said "12 months —
not built yet" from EPIC-017; it now states `365 days` and cites the job that enforces it, and the
test that asserted the placeholder is inverted — the one place in the codebase where that inversion
was planned in advance rather than discovered.

**The money rules, because they are the ones a later epic will want to bend.** Reserve the worst case
before a call and release the overshoot after, because a cap any single call can blow is not a cap. An
unpriced model does not run, because reserving against a price you do not have is not a reservation. A
cache hit spends nothing. Hitting the cap keeps the work already done. And at the cap the answer is
**refuse**, not queue — *a queue that never drains is an outage that looks like patience*.

**Two things handed to EPIC-032**, both in its file rather than only in a report: the
`fullyChecked: false` sentence from EPIC-030, and — from this epic — that the cost shown to a user
must say what it counts, because a re-run is free and the number stops matching what they ran.

**EPIC-031a is scoped on 2026-09-14 and not scheduled.** Scope only; no work started.

**Why it is a row rather than a line in a report.** EPIC-031's adapter sits behind an interface and
**every test uses a fake — no test calls Anthropic.** That is the right design and it leaves one
thing untested by construction: the `@ai-sdk/anthropic` call site itself. The first time it runs
against the real provider, something will be wrong with a key, a header, a model id, a token count or
a response shape, and it should be a person doing that deliberately rather than whoever is unlucky.

**What it covers.** One real call from staging against one pinned model, with: the key present in
Coolify and never in a log; the resolved model id matching a priced row; `usage` arriving in the shape
`costCentsFor` expects; the reservation reconciling against a real token count rather than an
estimated one; the raw payload stored and `purge_after` stamped; and `latencyMs` plausible. Then the
same call a second time, to confirm the cache answers and calls nobody.

**What it is not.** Not the Runs page (EPIC-032), not a second provider, and not a load test. One
call, watched, with the result written down — including the real cost in cents, which is the first
number anybody will have for what a run actually costs.

**It needs a human step**: the Anthropic key is set in Coolify by Soroush, and the drive is against
deployed staging. That makes it the `built — awaiting` shape once the work is done rather than
something an unattended run can close on its own.

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

## Bugs found later

`PROCESS.md`'s `BUG-<epic>-<slug>` convention, used here for the first time. P0 data loss, security or
keys — 24 hours. P1 a broken acceptance criterion — before the next epic starts. P2 — into EPIC-900.

| ID | Bug | P | Found | Status |
|---|---|---|---|---|
| BUG-022-variables-stale-until-reload | The Variables tab does not see a `{{placeholder}}` typed into a blok until the page is reloaded | P1 | 2026-09-14 staging hand-drive | **fixed** — #73 |
| BUG-021b-compiled-pane-stale | A blok's span renders **empty** in the compiled pane until the page is reloaded; editing a blok's text never reaches the pane | P1 | 2026-09-14 helper audit | **fixed** — #73, same one line |
| BUG-069-app-chrome-wraps-below-414px | The signed-in header wraps to two rows below 414px and `Account` sits flush against the right edge with no gutter | P2 | 2026-09-14 staging hand-drive | **fixed** — #74 |
| BUG-002-account-page-unstyled | `/app/account` is a bare `<main>` with no container class; the body renders flush to the left edge | P2 | 2026-09-14 staging hand-drive | **fixed** — #74, with `/app/account/delete` |

**All four were fixed on 2026-09-14, in two PRs, and the two P1s turned out to be one line.**
`saveBlokTextAction` was the only write in `lib/canvas/actions.ts` without a `revalidatePath`, so the
compiled pane and the Variables tab learned that a blok *existed* and never learned what it *said*.
Both reloads came out of the e2e helpers **first**, so the suites failed on the real defect before
anything was fixed, and two named regression tests were each proved to fail without it. Rows are kept
rather than deleted so the shape stays findable; what follows is what they were.

**BUG-022 is the P1 and the only one that breaks a criterion.** Typing `{{customer}}` into a blok,
waiting for `Saved`, and opening **Variables** shows *"Nothing declared yet. Write `{{a_name}}` in a
blok and it will appear above."* — which is wrong, because the user just did. Reloading the page
makes both names appear under "Used but not declared" with their use counts. Reproduced twice on
`app.staging.41prompts.ai` at `e5fa776`, on a prompt with one `context` blok, with the compiled pane
showing the span correctly the whole time. So the compiled pane updates live and the variables panel
does not.

**Why no gate caught it, which is the part worth keeping.** `apps/web/e2e/variables.spec.ts`'s
`addBlok` helper ends with `await page.reload()`. Every variables test therefore reloads between
writing the placeholder and opening the tab, so **the suite cannot fail on this defect** — it does the
one thing that hides it, as a convenience, in a helper. This is the same shape as the `auth.spec.ts`
failure `PROCESS.md` already records: not a missing test, but a test that cannot observe the bug. The
fix needs the helper's reload removed, or a test that deliberately does not reload, before the
behaviour is changed.

**BUG-021b was found by the helper audit, not by driving**, and it is almost certainly the same bug
as BUG-022. Measured on staging: add a blok, type `FIRST TEXT`, wait for `Saved` — the compiled pane
shows **one span with no text in it**. Change the text to `SECOND TEXT, CHANGED` — still empty.
Reload — the text appears. Add a second blok — the first span now has its text (it came from the
server render) and the **new** span is empty. So the pane learns that a blok exists and never learns
what it says.

`apps/web/e2e/compiled-pane.spec.ts`'s `addBlok` ends with `await page.reload()`, exactly as
`variables.spec.ts`'s does, so no test in that file could see it either. Two helpers written the same
way in the same week, hiding what is probably one defect in how autosaved state reaches the rest of
the workbench. **Fix them together and remove both reloads first**, per `PROCESS.md`'s helper rule.

**BUG-069 came from the change that fixed the dead end**, and is recorded against the PR rather than
an epic because that is where the chrome was added — `apps/web/app/app/layout.tsx`. Measured on
staging: at 768px and up the header is 36px and one row; at 414, 390 and 360px it is 70px with the
`Sign out` form wrapped onto a second row, and `Account`'s right edge is exactly the viewport width
(0px gutter); at 320px `Account` wraps too. There is no horizontal page scroll at any width, so it is
untidy rather than broken — but a control touching the screen edge is a touch-target problem under
`CLAUDE.md` rule 12, and a header that silently doubles in height is not what the mockup draws.

**BUG-002 is the same class of defect as the one that opened the 2026-09-13 incident**, on a different
route: `/app/account` renders `<main>` with no `className` while its sibling `/app/projects` uses
`app-page`. It is reachable from the chrome on every signed-in route, so it is not obscure. Left as a
report rather than fixed in place because there is no account screen in `docs/design/`, so what it
should look like beyond "not flush to the edge" is a ruling, not an implementation detail.

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

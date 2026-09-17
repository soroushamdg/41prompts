# Backlog

Status: `todo` · `current` · `done` · `blocked` · `deferred` · `cut`
Sizes: S one session · M two to three · L must be split
Gates: ▣ marks a go/no-go checkpoint; nothing after it starts until it passes (criteria in `roadmap.md`).

ICP: AI engineers at companies of 10–500 people who own a production prompt. Everything is built for them.

Stages ship in order. Nothing in a later stage starts until the stage before has a report for every epic.

**Four rows are `deferred`, 2026-09-14, and `deferred` means later.** EPIC-006, EPIC-090, EPIC-031a
and EPIC-071 each wait on something only Soroush can do — an account and a payment method, recruited
participants, a key set in Coolify, a lawyer — so none of them is work an unattended run can start.
His ruling: they come back after the product is built. **They are not `cut`.** `cut` is the list at
the foot of this file and it means never; these four mean not yet. Each status cell names what a
person has to do, and the note under each stage says what deferring it costs.

---

## Stage 0 · Foundation

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-000 | Repo scaffold: monorepo, TS strict, lint, Vitest, CI, Apache-2.0 + SPDX on public packages, boundary allow-list | M | — | done |
| EPIC-005 | Customer discovery: 10 interviews with ICP engineers, 5 written use cases, pricing check, activation definition | S | — | cut |
| EPIC-006 | Namespaces and marks: npm org, GitHub org, PyPI names, trademark knockout search, domain check | S | — | deferred — Soroush must open the npm, GitHub and PyPI accounts and put a payment method behind the domain and the searches; 2026-09-14 |
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

**EPIC-006 is deferred, 2026-09-14.** Nobody else can take the names — but taking them needs
Soroush's npm, GitHub and PyPI accounts, and a payment method behind `41prompts.com` and the CIPO,
USPTO and EUIPO searches. None of that is reachable from a terminal, and no part of the epic is worth
doing without the part that registers something.

**Nothing declares a dependency on it and three rows need it anyway.** No `Depends` cell names 006.
But **EPIC-056** creates `github.com/41prompts/41prompts` and turns on npm and PyPI trusted
publishing — and `packages/core`, `packages/cli` and `packages/sdk-ts` each carry a `prepublishOnly`
that tests `GITHUB_REPOSITORY = 41prompts/41prompts`, so nothing publishes at all until that org
exists; **EPIC-054** publishes `fortyone-prompts` to PyPI; and **EPIC-071** confirms a trademark
filing this epic was to make. All three are Stage 5b or later, behind GATE 5, so the deferral blocks
nothing before then. What it costs meanwhile is that the names stay available to whoever registers
them first — which is the risk the epic exists to close, now knowingly carried.

**It also had no epic file**, which is why nothing told the unattended runner that it was
human-blocked: the row said `todo`, the picker picked it, and the run would have found out at the
first namespace. `scripts/pick-next-epic.mjs` now stops on a `todo` row with no epic file rather than
starting it.

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
| EPIC-090 | research: clickable prototype study; override mental model, canvas at 60+ bloks, Draft/Live/Versions vocabulary | S | 084 | deferred — Soroush must recruit and pay 6–8 ICP engineers, and its input EPIC-084 is cancelled; 2026-09-14 |
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
is `deferred` and gated behind the cancelled EPIC-084 — the epic file names only 021a and 003.

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
EPIC-020, EPIC-021a, EPIC-021b, EPIC-022.

**EPIC-090 is deferred, 2026-09-14**, and it is the row that would have stopped the unattended loop
second, after EPIC-006. It is a study: it needs Soroush to recruit and pay 6–8 ICP engineers, which
is not something a run can do, and its input — EPIC-084's live read — is cancelled, so it would start
without the numbers that were to tell it what to test.

**What it costs, since the stage it was to inform has already shipped.** No `Depends` cell names it —
EPIC-021b's dropped 090 when it shipped. What still cites it is `docs/roadmap.md`, in four Task and
Review lines: EPIC-021a's grouping-and-collapse and its 60-blok target (both `done`, so moot),
EPIC-021b's "Vocabulary from EPIC-090" (`done`), and **EPIC-040's "One vocabulary for version state
(EPIC-090)"**, which is not done and is in Stage 4. That last one is the only live consequence: the
Draft/Live/Versions wording EPIC-040, EPIC-041 and EPIC-055 share now rests on ADR-003 and Soroush's
ruling rather than on eight engineers being asked. It is a ruling to make, not a blocker.

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
| EPIC-031a | The first real Anthropic call, against staging: a planned event rather than a discovery | S | 031 | **done, 2026-09-16 — the call was made.** Two calls, $0.02, `claude-sonnet-5`, on deployed staging. 8 of 9 database checks passed; it found that rule 6's raw payload is not raw and the resolved model id was never captured. Three criteria stay unticked pending the next push — report §3. |
| EPIC-032 | web: input sets (CSV), run trigger, results by check, failure detail, attribution to blok, create-constraint-from-failure with preview | M | 031, 021b | done |
| EPIC-033 | LLM-judge grader with pinned judge version; judge prompt stays proprietary | S | 031 | done |
| EPIC-034 | Activation onboarding: signup → first passing run in under five minutes on an opt-in example; the path and the instrument, **not** the measurement | S | 032 | done — the measurement is blocked on EPIC-031a; see report §1 |
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

**EPIC-031a is scoped on 2026-09-14 and deferred the same day.** Scope only; no work started.

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
something an unattended run can close on its own. Deferred on that basis, 2026-09-14.

**One consequence, and EPIC-032 is where it lands.** Nothing declares a dependency on 031a — EPIC-032
depends on 031, not on 031a — so deferring it blocks no row. What it leaves is this: `execute.ts`
declares a `Provider` interface and **there is no `@ai-sdk/anthropic` call site in `apps/worker/src`
at all** (the dependency is declared in `apps/worker/package.json` and nothing imports it), and the
key is not in Coolify. EPIC-032 is the Runs page, and its step-10 drive on staging is "trigger a run
and read the results". Its own Tests line says the end-to-end test mocks the provider, so the tests
are fine — the deployed drive is the question, and it is the first place the missing call site and
the missing key become visible. Whoever builds EPIC-032 decides there whether the drive covers the
cached and refused paths only, or whether the first real call arrives inside that epic by accident,
which is the precise thing EPIC-031a exists to prevent.

## Stage 4 · Versions and three providers

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-040 | core + db: version = blok-set snapshot, semantic diff, compiled byte delta, pass rate per version | M | 030, 032 | **done, 2026-09-16.** A version is minted automatically — unchanged content writes nothing, the open draft is rewritten in place, a run pins it — so one episode of editing is one version and every run points at something immutable. Pass rate derived, never stored. 100x50 measured at 2.01 MiB. No route: report §8. |
| EPIC-041 | web: history, restore, A/B two versions on one suite | S | 040 | **done, 2026-09-16.** The Versions page: `Draft vN` history with derived pass rates, the semantic diff for any pair (in the URL, so it is a link), restore, and A/B as two runs sharing a `comparison`. Restore pins the open draft first, so the history only ever grows. The drive found an EPIC-040 defect — an `expected` blok emits no text, so a changed check set wrote no version: `snapshot_hash` is now the dedupe key. Report §3. |
| EPIC-043 | BYO-key threat model + breach runbook (before any user key is stored) | S | 004 | **built — awaiting Soroush's read of the threat model, 2026-09-16.** The sealed box (ephemeral X25519 + HKDF-SHA256 + AES-256-GCM from `node:crypto`, **not** libsodium — report §3), `provider_keys` holding ciphertext only, and value-shaped redaction wired into pino, all three `Sentry.init` calls — **none had a `beforeSend`** — and every PostHog property. `docs/security/byo-key-threat-model.md` has seven findings; its §8 has five rows written ready to paste, because this file is yours. **Two findings are `high` and open: EPIC-042 should not store the first real key until `043a` and `043e` are decided.** The Review line is yours. |
| EPIC-042 | Providers: OpenAI + Google adapters, BYO keys encrypted at rest, provider matrix, accessible heatmap pivot | M | 031, 043 | **done, 2026-09-16.** Three providers behind one `Provider` interface, seven pinned models, prices sourced and dated. A run picks its provider from its model and its owner: their key, then the deployment's, then a refusal in words. Settings → Providers stores a key **only after the provider accepts it**, and the test of a *stored* key is a worker job — so `web` never opens an envelope and **threat-model row `043a` is now one environment variable with no code change**, exercised by a suite whose web process holds only the public half. `043e` is decided and not built: two of the three providers do not expose a spend limit to an ordinary API key, and half a control is worse than words on a page (report §3). The matrix reuses EPIC-041's `comparison`; the heatmap's cells are focusable buttons named `input 17, fail` with a hatch for failure. **The drive found three things the tests could not** — the suite calling a real provider, an in-flight run rendering as "nothing graded", and its own all-passing fixture hiding the shape difference (report §4). Two new dependencies, both Apache-2.0 (report §7). **No provider has ever been called: everything here ran against the fake** (report §6.1). |

## Stage 5a · Delivery, minimum

| ID | Epic | Size | Depends | Status |
|---|---|---|---|---|
| EPIC-050 | core: build artifact v1 (frozen), Live/Draft pointer, variable-contract compatibility check | M | 040, 022 | **done, 2026-09-16.** Twelve fields, frozen, with ADR-005 declaring the format public and versioned and `artifact/schema.ts` now on the never-touch list. `buildHash` is **SHA-256 over a canonical encoding** — written out in pure TS because core may have no dependency and no `node:crypto`, and proved against the published FIPS 180-4 vectors; the old FNV-1a is collidable on a laptop and would have made EPIC-052's verification look like an integrity check while being none (report §3.1). The content address covers `model`, `params` and `checkSuiteId`, so identical text with a different proof is a different artifact — the one decision named as most likely to be reversed (§3.2). `LivePointer` is `LiveMarker`: vocabulary beats the roadmap, as it did for `buildHash`. `isCompatible` has **four** break kinds, not the roadmap's three. Golden fixtures fail when the bytes move. Two JSON Schemas whose enums derive from the code's own constants, and a validator that refuses a keyword it does not implement. No route: report §4. No new dependency. |
| EPIC-051 | API + storage: publish, undo, R2 with immutable headers, audit log, admin-only switch, gate on checks, publish-anyway with reason | M | 050, 042 | **done, 2026-09-17.** A prompt can leave the building: the gate is pure logic in `packages/core` with four rows, of which **checks** and **contract** block and **cost** and **diff** report — a gate that refuses a 4% cost rise teaches people to go around gates. `ChecksState` is a union so "nothing to prove", "never run on this model" and "ran and failed" cannot collapse into one another; a gate that conflates the first two is satisfied by not testing (report §2, C3). **Live is derived from `publish_events`**, not stored beside it — two copies diverging means the audit log says one thing and the CDN serves another. One `ArtifactStore`, two drivers: R2 with `immutable`/`max-age=30`, and the database, because **no artifact bucket exists** and a store that only works in production is a store nothing can drive. The R2 driver has never spoken to Cloudflare; it is proved against a fake S3 endpoint over a real socket (§4.2). **"Apps resolving" is not built** — it needs CDN logs, which need a CDN, which is yours; a client ping is what the roadmap names as the wrong answer (§4.1). `/v1/marker/:promptId`, not `pointer`. The mockup's "Require passing checks" switch is **not** built: an account-wide off-switch for rule 9 is not the same feature as a per-publish exception naming a person (§3). The drive found that publishing did not pin the version it published, so the next keystroke rewrote the blok set an immutable audit row names (§6a). One new dependency, `@aws-sdk/client-s3`, reasoned in §10. |
| EPIC-052 | sdk-ts (`@41prompts/sdk`): `resolve()`, memory → disk → bundled → network, never blocks, never throws, telemetry off | M | 050 | **done, 2026-09-17.** A program outside this repository can hold a prompt. `resolve()` is **synchronous** and the network is a background refresh that fills memory and disk — the only reading of rule 8's two sentences that survives a process which has just started, and the roadmap's own task line says "background network". The cost is stated rather than hidden: the first call in a cold process with no cache and nothing bundled returns nothing, and `bundled` and `await refresh()` are the two answers. **Zero dependencies means the tarball**: `@41prompts/core` is imported at source and inlined by esbuild, so there is one implementation of the hash and of variable binding and none of it reaches a customer's tree — proved by reading the built output, not the manifest (report §3.2). 15,121 B minified against a 15,360 budget, and **239 bytes of headroom is thin** (§7). The **never-throw fuzz found three real defects on its first run**, all in `createClient`, none reachable from TypeScript (§6b). Writing a client found a fourth in EPIC-051's `/v1/blob`: its ETag was derived from the **key**, and a marker's key is its prompt id, so **the first 304 would have been permanent and no publish would ever again have reached a running application** (§6a). `GET /v1/build/:buildHash` is the one new route, because the alternative was the SDK carrying a copy of the store's key layout. EPIC-013's parked question is answered with `publishConfig`: source in the monorepo, dist when published, and the Turbopack alias stays because it was never about publication. ADR-006 freezes three functions and asks you four questions. **"Apps resolving" is still not built** — it needs the CDN that needs your bucket. The drive is 17 of 17 against the built app with the built SDK. Two new devDependencies, neither shipped (§10). |
| EPIC-055 | web: Deploy page, Connect page (TypeScript only), API keys tab, Publishing tab, publish flow | M | 051, 052 | **done, 2026-09-17.** Publishing stops being an endpoint: Deploy shows Live beside Draft, the gate's four rows with a shape **and** a word, Publish / Publish anyway / Undo with typed reasons, and the history. The gate it renders is `previewPublish` — `publishVersion` split at the line where reads become writes, so the page and the endpoint are two callers of one evaluation rather than two implementations that drift (report §4.5). An API key now has a screen: shown once, rotate as **two rows** so "which key was in the field on Tuesday" has an answer, revoked rows kept and visible. **The drive is the first in this repository that mints its key by clicking** — 051's and 052's both say in their headers that they reach into the database because this tab did not exist. Settings is three routes joined by links with `aria-current`, not a `role="tab"` tablist: a control that changes the URL is a link. **The apps-resolving table is not built and the page says why** — no CDN, and an empty table is a claim rather than a neutral absence; GATE 5's demand measure is that number. The Connect page **generates** `prompts.ts` from your own rows instead of previewing a file `41p pull` would write. **The drive found that generated file could not fill its own prompt** — built from declared variables, it omitted a name the prompt uses, which ships `{{name}}` to a model (§6.2); found by reading the drive's output against its own label, which claimed a signature nothing had checked. Also: the Connect page overflowed 390px by 56px, and **two committed documents carried a NUL byte** that `binary-files.mjs` was not pointed at — then my own fix-test carried one, which only `gates.mjs ci` could see (§6.1, §6.4). One ruling is yours: core paints a moved cost amber and `docs/design/README.md` says ink; I followed core and corrected my own criterion (§3). No new dependency. |
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
| EPIC-071 | Legal full: lawyer review, Team DPA, provider ToS re-check for published comparisons, trademark filing status | S | 017 | deferred — Soroush must engage the lawyer, which he has declined for now; 2026-09-14 |
| EPIC-072 | Marketing site final: all pages from the mockup, run demo, rotator, counters wired to real data, third-party notices page | M | 016, 055 | todo |
| EPIC-073 | Launch 2: content series from run data, outreach to 30 teams paying for evals, launch dashboard | S | 035, 072 | todo |

**EPIC-071 is deferred, 2026-09-14.** Its first task is a lawyer review and Soroush has declined the
lawyer for now; the rest of the row — the Team DPA, the provider-terms re-check for published
comparisons, the trademark filing status — is either for business customers this service does not
have yet or reads a filing EPIC-006 was to make, and EPIC-006 is deferred too. Nothing declares a
dependency on it.

**The exposure is known and accepted, which is the reason to write it here rather than only in the
status cell.** EPIC-017 shipped the terms and privacy pages under the same ruling, in full, with a
line at the top of each saying they have not been reviewed by a lawyer. That line is live on the
deployed site today, and it stays true for as long as this row is deferred. It is a stated position,
not an oversight — and it is the one deferral of the four that is visible to a user.

**There is no EPIC-017b.** The DPA-on-request draft and the standalone Law 25 transfer assessment
that EPIC-017 dropped moved into this row on 2026-09-14 (see Stage 1), so this is where that work
lives and this is the row that carries the deferral.

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

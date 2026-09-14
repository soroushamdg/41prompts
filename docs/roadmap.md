# 41Prompts · Product roadmap

Version 2.0 · 2026-09-04 · Owner: Soroush (decisions), Claude (PM/CTO), Claude Code (build)
Revised after the September specialist review (`docs/reviews/2026-09-specialist-review.md`).

`backlog.md` is the index; this document is the plan behind each line. Every epic has **Goal**, **Tasks** in build
order, **Tests**, and **Review**. Every stage has an **exit state** and a **demo**. Three stages end in a **gate**
with measurable criteria; nothing after a gate starts until it passes.

## Who this is for

**ICP:** an AI engineer at a company of 10–500 people who owns at least one prompt running in production and has
been burned by a change that broke it. They already pay for something (LangSmith, Braintrust, or nothing but their
own time). Newcomers are served as the junior members of that engineer's team, never as a separate audience.

Every string, price, lesson and launch is written for this person. If a task on this roadmap only serves someone
else, it is in the wrong stage or the wrong product.

## Vocabulary

A prompt is made of **bloks** (cards). Each blok owns one or more **spans** of the compiled prompt. Expected-behaviour
bloks become **checks**. There is no "block", no "assertion" in the UI, no "label", "pointer", "artifact", "promote".
See ADR-003.

---

## Milestones, metrics, kill criteria

| Milestone | Stage | The product can… | Leading metric | Kill criterion |
|---|---|---|---|---|
| M0 Green build | 0 | Deploy to staging and production from `main`; sign in; see an error in Sentry | Five consecutive green deploys | **not measured; Soroush cancelled the measurement programme on 2026-09-12.** Was: Staging not auto-deploying 30 days after EPIC-001: stop and fix infra before anything else |
| M1 Decompiler soft-public | 1 | Turn any pasted prompt into named, multi-range bloks with findings, no signup | 300 unique decompiles in the first 30 days without announcement; ≥15% share or waitlist rate | **not measured; Soroush cancelled the measurement programme on 2026-09-12.** Was: Under 100 decompiles in 30 days: the wedge is not findable; rework EPIC-015 before Stage 2 |
| M2 Editor | 2 | Build and compile a prompt from bloks with override and drift | 20 signed-in users create ≥1 prompt; 7-day return ≥30% | **not measured; Soroush cancelled the measurement programme on 2026-09-12.** Was: 7-day return under 15%: run EPIC-090 findings before Stage 3 |
| M3 First run | 3 | Run checks on one provider and attribute every failure to a blok | 10 users complete a run; ≥60% of signups reach a passing run within 5 minutes (EPIC-034) | **not measured; Soroush cancelled the measurement programme on 2026-09-12.** Was: Under 5 users run in 30 days: two-week onboarding sprint before any new feature |
| M4 Three models | 4 | Compare versions and providers on one suite | ≥30% of runs use more than one provider | **not measured; Soroush cancelled the measurement programme on 2026-09-12.** Was: Under 10%: stay Anthropic-deep, defer provider breadth |
| M5a SDK live | 5a | Deliver a prompt into a running Node app and update it without a redeploy, gated by checks | ≥5 production apps resolving from the CDN (from access logs) | **not measured; Soroush cancelled the measurement programme on 2026-09-12.** Was: Under 3 by GATE 5: do not build 5b; ship YAML/CI export instead |
| M6 Revenue | 6 | Charge money, stay legal, be found | 5 paying customers, $1,000 MRR within 60 days of Stripe | **not measured; Soroush cancelled the measurement programme on 2026-09-12.** Was: Under $500 MRR at 90 days: pause features, 30 days of customer calls |
| M7 Lessons | 7 | Teach a junior member of an ICP team inside the product | ≥50% completion of Lesson 02 by invited testers | **not measured; Soroush cancelled the measurement programme on 2026-09-12.** Was: Under 25%: rework format before Lessons 04–09 |

### The measurement programme is cancelled

Soroush's decision, **2026-09-12**: the thirty-day M1 window is cancelled — no freeze, no no-changes
rule, no 11 October checkpoint — and **every kill criterion above is no longer measured**. GATE 1 is
removed and EPIC-084 is cancelled.

The criteria are kept in the table rather than deleted, each marked and followed by what it used to
say, so this document still shows what was given up rather than quietly forgetting it.

**What that leaves.** The earlier decision of 2026-09-10 stands: **EPIC-005** (ten ICP interviews) and
**EPIC-080** (the 12-participant prototype study) are cut, not deferred. With the kill criteria no
longer measured either, **there is now no planned feedback mechanism of any kind before Stage 2** —
not an interview, not a study, not a metric. The prototypes in `docs/design/` and this document are
the whole of the spec, and the first news about whether the wedge works will come from whatever
happens after it ships.

That is a deliberate choice and it is recorded here so it is a choice rather than a drift.

**GATE 5 is untouched**, and deliberately: it guards the frozen artifact format and the SDK surface,
which are irreversible for *technical* reasons rather than demand reasons. Nothing about cancelling a
demand measurement bears on it.

**What survives.** `decompile_runs` keeps recording — no action required, no cost, and the data is
there if anyone ever wants to look. `docs/research/m1-window.md` keeps the dates and the exceptions as
history.

The two survey responses that did arrive are committed at `docs/research/discovery/survey/`, marked
n=2 and explicitly not actionable. They are not evidence and are not a substitute for EPIC-005.

---

## Stage 0 · Foundation

**Stage goal.** A repository, a pipeline, a database, a login, a monitor, and the names reserved. Nothing a user sees; everything a user depends on.

**Exit state.** `main` deploys to staging on merge and production on tag. A user signs in with Google, GitHub or
email and lands on an empty authenticated page. An intentional error appears in Sentry. A PostHog event fires on
login. Nightly backups land in R2 and a restore has been rehearsed. Compliance CI is green. The npm and GitHub
orgs and the PyPI names are ours. (EPIC-005's ten interviews were an exit condition here until the epic was
cut on 2026-09-10; Stage 0 no longer waits on them.)

**Demo.** Sign in on staging, throw a test error, show it in Sentry, show the backup in R2, show the compliance job.

### EPIC-000 Repo scaffold · M
**Goal.** A green monorepo with the package boundaries from ADR-001, Apache-2.0 and SPDX on the public packages, and CI enforcing the boundary as an allow-list.
**Tasks.** pnpm + Turborepo; Node 22; stub every package with one passing test; `packages/core` without DOM lib and without runtime deps; public package.json shape (`repository`, `files`, `publishConfig`, `prepublishOnly` guard); `LICENSE` + `NOTICE` in public packages; SPDX headers; dependency-cruiser allow-list (public packages may import only public packages, builtins, and declared deps; core imports nothing); GitHub Actions `ci.yml`; PR template; docs copied in.
**Tests.** Fresh-clone install, lint, typecheck, test pass. A proprietary import in core fails lint with the boundary rule name. Second Turborepo run reports cache hits. `41p --version` prints.
**Review.** Layout matches ADR-001. Nothing beyond a stub in any package. No "will be needed later" additions.

### EPIC-005 Customer discovery · S — **cut, 2026-09-10**
**Cut, not deferred.** Soroush's decision: the prototypes and this roadmap are the spec; the
per-milestone kill criteria above are the feedback mechanism. Stage 1 no longer waits on this, and no
epic may be blocked on it. What it was: ten 30-minute interviews with ICP engineers, five written use
cases, a pricing reaction to $29/$79 per seat, and a definition of "activated".

**Debts this cut leaves, and who now carries them.** Each is a place where a later epic's task list
still names research that will not happen:

- **EPIC-034** loses its research-backed definition of "activated". It now takes the roadmap's own
  number: signup → first passing run in under five minutes on a seeded prompt, measured in PostHog.
- **EPIC-070** loses its price validation. $29/$79 per seat stands on this document alone until
  M6 measures it, and M6's kill criterion is the check.
- **EPIC-035** loses its outreach list of 20 engineers. It has no recruitment source; the launch
  reaches whoever Stage 1 and Stage 3 have already attracted.

Two survey responses arrived before the cut and are committed at `docs/research/discovery/survey/`,
marked n=2 and not actionable. `docs/research/discovery/README.md` describes the interview process
that was cut; it stays as the format if this is ever reopened.

### EPIC-006 Namespaces and marks · S
**Goal.** Nobody else can take the names.
**Tasks.** Create npm org `41prompts` with 2FA required and trusted publishing; create GitHub org `41prompts`; check and register PyPI `fortyone-prompts`, and `fortyone` and `41prompts` if free (if `fortyone` is taken, the Python import becomes `fortyone_prompts` now); trademark knockout search for "41 PROMPTS", "FORTY ONE PROMPTS", "41P" on CIPO, USPTO, EUIPO/TMview; check `41prompts.com`; record results.
**Tests.** Screenshots of ownership for each namespace in the report.
**Review.** Decision recorded on whether to file the word mark now (CIPO + USPTO, classes 9 and 42) or at the loud launch.

### EPIC-001 Infrastructure · M
**Goal.** One AWS Lightsail instance in Montréal running Coolify deploys web and worker from GitHub with TLS, staging and production, and backups that have been restored once. Claude Code writes infra as code; Soroush runs the bootstrap once; no agent holds SSH. Full detail in `docs/epics/EPIC-001-infrastructure.md`.
**Tasks.** Lightsail 4 GB, ca-central-1, static IP, snapshots; `infra/bootstrap.sh` (harden, Docker, Coolify) run by Soroush; staging on push to `main`, production on tag; `infra/docker-compose.yml` with postgres 16, web, worker, healthchecks; Dockerfiles; migrate-before-start entrypoint; DNS + TLS via Coolify; R2 `41p-backups`, nightly `pg_dump`, 30-day retention; secrets set by a human only; restore drill, timed, in `infra/RUNBOOK.md`.
**Tests.** `/healthz` returns git sha. Killed container restarts in 30 s. Restore drill completed.
**Review.** Runbook readable by a stranger. `gitleaks` clean. No-op tag deploy tested. Region recorded for the privacy policy.

### EPIC-008 Prebuilt images · S
**Goal.** No image is ever built on the box that serves production. GitHub Actions builds `web` and `worker`, pushes them to private GHCR, and Coolify pulls fixed tags.
**Tasks.** `build-images.yml` on push to `main` and on `v*` tags only (never on PRs; CI already tests them), buildx with registry cache, `--build-arg SOURCE_COMMIT=${{ github.sha }}`, tags `:staging` / `:production` / `:sha-<sha>`; `infra/docker-compose.staging.yml` and `.production.yml` with `image:` and `pull_policy: always`, `${...}` only for variables we set ourselves in Coolify (never for a value Coolify or the build supplies — Coolify locks every `${...}` it parses; see EPIC-001's F2 outcome); local dev keeps `build:` in `infra/docker-compose.yml`; registry credentials on the box (Coolify registry settings, else a documented one-time `docker login ghcr.io`); workflow's last step calls Coolify's deploy webhook with a `deploy`-scoped token stored as a GitHub secret; README/RUNBOOK updated; Actions minutes budget noted (Free plan 2,000/month).
**Tests.** A `main` merge produces a GHCR image whose `/healthz` `commit` equals the merge sha, with no build log on the box. A `v*` tag does the same for production. Rollback = redeploy the previous `:sha-` tag, timed in the runbook.
**Review.** Box CPU/memory flat during a deploy. No `${...}` in either deployed compose file. Images private.

### EPIC-009 Actions budget · S · late entry, 2026-09-12
**Why it exists.** EPIC-008's task list ends "Actions minutes budget noted (Free plan 2,000/month)." It was noted and never read. Measured over the repository's first 8.4 days: **2,175 billed minutes against a 2,000-minute month**, of which the image build on `main` was 533 across 81 runs. The allowance ran out mid-epic, which stopped every deploy and every CI run.
**Goal.** Stop spending Actions minutes on work the box does for nothing, and stop tagging things that are not releases. CI stays on GitHub, where a green tick before merge is worth paying for.
**Tasks.** `build-images.yml` loses its `push: branches: [main]` trigger and keeps `v*` plus `workflow_dispatch`; `infra/docker-compose.staging.yml` gets `build:` back for web and worker, with no `args:` (EPIC-001 F2); `PROCESS.md` gains "tags are releases, not checkpoints" and names the three things that do not warrant one; `infra/RUNBOOK.md` gains a budget section with measured minutes per merge and per tag, and says to read it at the close of every epic.
**Tests.** A merge to `main` runs CI and Compliance and no image build, with staging updating from Coolify's own build. A `v*` tag still builds, pushes and deploys production. The on-box staging build finishes under ten minutes without taking the apex `/healthz` down.
**Review.** The saving is 22%, not a fix: at the observed merge rate the project stays roughly 3× over its allowance, and the largest remaining item is CI running twice per change. Nothing about what production runs changes.

### EPIC-002 Data layer and auth · M
**Goal.** Users in our Postgres, three sign-in methods, protected routes, and an account purge window.
**Tasks.** Drizzle baseline: users, sessions, accounts, projects, api_keys (empty); migrations on deploy; Better Auth with Google, GitHub, magic link via Resend; `/app/*` protected; account page with delete (soft delete, 30-day purge job); seed script.
**Tests.** Playwright sign-up via magic link. Unauthenticated redirect. Purge job deletes after the window (clock-injected test). Migration round-trip.
**Review.** No user data in a third party. Cookie flags correct. Email templates use tokens.

### EPIC-003 Design system · M
**Goal.** Resolution tokens and accessible base components in `packages/ui`, light and dark.
**Tasks.** `@theme` tokens from the mockup; components: Button (44px targets on `sm` where touch), Pill, Badge with icon variants (pass ✓, fail ✕, drift !), Tag, BlokCard, Table, KpiStrip, Sheet, Switch, Input, Textarea, Tabs with full ARIA tabs pattern and arrow keys, Callout, Meter; motion primitives honouring reduced motion by showing end states; theme provider with cookie; `/dev/ui` gallery (staging only); focus rings; contrast script.
**Tests.** Visual regression of `/dev/ui` both themes. Contrast check passes. Keyboard test per component. Axe clean.
**Review.** Side by side with mockups. No colour outside tokens. Amber appears only in drift components.

### EPIC-004 Observability and guardrails · S
**Goal.** We see errors, usage and cost before a user tells us, and no user can run up an unbounded bill.
**Tasks.** Sentry web + worker with release tags; PostHog identify + typed events (`signup`, `login`, `decompile_view`, `decompile_run`, `decompile_share`, `project_created`, `run_started`, `run_passed`, `publish`); pino JSON logs; uptime checks; `run_budgets` table with plan defaults; a PostHog dashboard with the milestone metrics above.
**Tests.** Error → Sentry with release. Event → PostHog. Budget increment and cap unit tests.
**Review.** No PII in logs. Alert reaches a phone. Dashboard shows every milestone metric, even at zero.

### EPIC-007 Compliance CI · S
**Goal.** Licence and boundary violations fail a PR, and the public mirror is proven buildable on every PR.
**Tasks.** `REUSE.toml` + `reuse lint`; dependency-cruiser config from the licensing review; Turborepo boundaries with `public`/`private` tags; syft SBOM + grant allow-list; `pnpm licenses` strict gate for public packages; `scripts/mirror-dry-run.sh` (filter-repo, gitleaks, reuse lint, install, build, test in isolation); `.grant.yaml`; `.public-root/` with the mirror's root files.
**Tests.** A GPL dev dependency fails the gate. A `workspace:` dep on `packages/db` from `packages/core` fails boundaries. Dry-run passes.
**Review.** Artifacts uploaded. EPIC-901 references them.

---

## Stage 1 · Decompiler, soft-public

**Stage goal.** The free tool, live and indexed, unannounced. Data collection on real prompts begins; so does legal exposure, so the legal minimum ships in this stage.

**Exit state.** `/decompile` is public with terms and privacy linked beneath the button. Any paste returns named multi-range bloks mapped to source with hover, keyboard and touch linking, plus findings. Permalinks are `noindex` and removable. Anonymous pastes purge at 30 days. A waitlist captures interest where the editor would be. Landing page replaces the placeholder. `llms.txt` and a companion article are indexed. The funnel is visible in PostHog.

**Demo.** Paste the Northwind prompt on production from a phone; tap blok 3; three spans invert; contradiction finding visible; share the link; open it in a private window; confirm `noindex`.

### EPIC-080 research: decompiler prototype study · S — **cut, 2026-09-10**
**Cut, not deferred.** Soroush's decision, same as EPIC-005. What it was: 12 participants testing
three assumptions — that "blok" is learnable, that span linking is discoverable on touch, and that
generated summaries are trusted the right amount.

**Debts this cut leaves, and who now carries them.** All three assumptions are now taken as settled
by the prototypes, and the first real test of any of them is EPIC-084's live read:

- **The term "blok"** is settled. EPIC-011a shipped with it and it is written into ADR-003, the
  schema, and `packages/core`'s public types. Changing it after Stage 1 is a rename across a public
  package, so this is effectively irreversible now.
- **Touch discoverability** falls entirely to EPIC-013's own decision: first blok pinned with a
  one-line hint on small screens, tested by Playwright mobile emulation rather than by a person.
- **Summary trust** falls to EPIC-011b's shipped answer: every summary carries its `source`
  (`heuristic` or `model`) and the card shows it. Whether an "unverified" cue is *also* needed was
  EPIC-080's question and now has no owner; EPIC-013 decides it or it does not get decided.

### EPIC-010 core: deterministic segmenter · M
**Goal.** Any text cut into segments with exact offsets, identically every time.
**Tasks.** `segment(text)` → `{ text, start, end }[]`; atomic fenced code and XML; blank-line paragraphs; list items; sentence split only over N chars; headings as separators; offsets by scanning; 25-prompt fixture corpus; property test reconstructs input byte for byte; CRLF, tabs, emoji, RTL fixtures.
**Tests.** Fixture snapshots; 1,000 generated inputs; idempotence; 1 MB input under 200 ms.
**Review.** Rule order documented. No catastrophic regex.

### EPIC-011a core: classifier and clustering · M
**Goal.** Segments get a kind, and fragments of one rule become one multi-range blok.
**Tasks.** `classify(segment)` via ordered heuristics with a 60-example labelled table; `cluster(segments)` → bloks with `ranges[]`, merge on topic key or normalised-token overlap ≥ 0.6 with same kind, deterministic order; topic keys in `topics.json`.
**Tests.** ≥90% on the labelled table; Northwind yields the expected multi-range bloks; 100 runs identical.
**Review.** Topic keys checked for false merges. The term "blok" was EPIC-080's to confirm or change; with that epic cut it is settled as shipped, and it is now written into ADR-003, the schema and `packages/core`'s public types.

### EPIC-011b core: summariser interface · S
**Goal.** A summary for every blok, heuristic in core, model-backed in the worker, never confused with source.
**Tasks.** `Summariser` interface; heuristic implementation in core; model-backed implementation in `apps/worker` (prompt stays proprietary) cached by content hash; summaries carry `source: "heuristic" | "model"`.
**Tests.** Interface contract; core never reaches a model (boundary test).
**Review.** Summary card shows the source flag. Whether an "unverified" cue is *also* required was EPIC-080's question; with that epic cut it has no owner unless EPIC-013 takes it.

### EPIC-012a core: five detectors · M
**Goal.** Repeated instruction, contradiction, untestable language, politeness padding, over-long blok.
**Tasks.** `diagnose(bloks)` → `Finding { severity, code, title, body, blokIds, fix }`; vocabulary lists as data; severity policy; sort.
**Tests.** Positive and negative fixture per detector; Northwind yields the known findings; clean 3-blok prompt yields none.
**Review.** Wording readable by a junior engineer. Code identifiers never appear in `title` or `body`.

### EPIC-012b core: rules-without-checks, fix wording, audit · S
**Goal.** The sixth detector and the editorial pass.
**Tasks.** `rules_without_checks` detector; one-line suggested fix per finding; false-positive audit over the corpus.
**Tests.** Detector fixtures. Audit under 10% false positives, recorded.
**Review.** Every finding's fix is an action, not a description.

### EPIC-013 web: public /decompile · M
**Goal.** The decompiler in a browser, no account, on desktop and phone, accessible.
**Tasks.** Route with textarea, sample, Decompile; results from core server-side, summaries filled asynchronously without layout shift; source map with spans (`data-b`, `data-k`), hover + focus + click-to-pin on both sides, keyboard pin from spans, skip link, no per-word tab stops (one tab stop per blok, arrow keys within); leading markers; dim; findings panel as real buttons; fragment badges with accessible names; touch default: first blok pinned with a one-line hint on small screens; stats strip.
**Tests.** Playwright desktop and mobile emulation: paste → bloks → tap blok 3 → three spans. Axe clean. Lighthouse ≥ 90.
**Review.** Pixel check both themes. Ink inversion only. Terms and privacy links present beneath the button (from EPIC-017) before this goes to production.

### EPIC-017 Legal minimum · S
**Goal.** Public traffic is lawful on day one.
**Tasks.** Terms of use (content licence, warranty disclaimer, liability cap, indemnity for pasted content, Québec law); privacy policy naming OpenAI, Anthropic, Google, Cloudflare, Stripe, Resend, PostHog, Sentry as recipients, retention periods, Law 25 privacy officer contact, GDPR rights contact, cross-border note (EU hosting, US providers); cookie choice with privacy-preserving default; `/legal/subprocessors`; retention table (anonymous decompiles 30 days, run payloads 12 months, accounts 30 days after delete); one-page Law 25 transfer assessment; DPA-on-request draft; one lawyer hour booked.
**Tests.** Pages render; links from `/decompile` and footer; retention numbers match the code in 014, 031, 002.
**Review.** Lawyer's notes attached. Any "must" becomes a task before EPIC-015.

### EPIC-014 Capture · S
> **Carried forward from EPIC-013, before this is scoped: what gets stored is CRLF, whatever the author's editor used.**
> The HTML form-submission algorithm normalises a `<textarea>`'s value to CRLF, so a prompt pasted with `\n` reaches the
> server as `\r\n`. Measured in EPIC-013, not assumed: with two blank lines ahead of it, a range expected at offset 27
> arrived at 29 — one extra character per line break. Consequences for this epic: the `decompiles` table stores CRLF; the
> 20k-character cap counts characters that include a `\r` per line; a permalink replaying a stored source will not be byte-
> identical to what the author had in their editor; and any diff or hash over stored sources is line-ending-sensitive. The
> offsets `packages/core` produces index the string the server received, so they stay correct — it is the *stored bytes*
> that differ from the author's file. EPIC-013's report §1 has the measurement.
**Goal.** Sharing works, abuse is bounded, retention is enforced, and interest is captured where the editor would be.
**Tasks.** `decompiles` table (source encrypted at rest); permalink `/d/{id}` with `noindex` and `robots` disallow; "remove this content" endpoint open to anyone, with email confirmation; 30-day purge job; rate limit 20/IP/hour anonymous; 20k-character cap; Turnstile; abuse check (moderation endpoint or classifier) before forwarding anonymous text to a provider on our key; "Save these bloks" → waitlist capture (email) with the promise stated plainly ("the editor is coming; we will email you"), no fake "create project".
**Tests.** 21st request → 429. Permalink `noindex` header. Removal endpoint deletes. Purge job (clock test). Abuse check blocks a seeded bad input.
**Review.** Retention policy text in EPIC-017 matches the job. No other user's data reachable from a permalink.

### EPIC-016 Landing page v1 · M
**Goal.** A front door for the soft launch.
**Tasks.** Nav, hero, ask bar with grounded handoff sheet, suggestion chips, three-step strip, decompiler CTA, footer with legal links; hero compile-pass plays once, Replay button, reduced-motion shows the end state (not skipped); logo morph respects reduced motion; sign-in and sign-up pages; OG image; static favicon; robots, sitemap; fonts self-hosted via `next/font`; theme toggle.
**Tests.** Playwright home, ask sheet, sign-up. Lighthouse ≥ 90 all categories. Reduced-motion snapshot shows end states.
**Review.** No claim beyond what ships in Stage 1. "labelled" replaced with "named". Deep links tested this week.

### EPIC-015 Soft ship · S
**Goal.** Findable by people and models, without an announcement.
**Tasks.** `/llms.txt`, `/llms-full.txt`; companion article with three anonymised corpus examples; PostHog funnel dashboard `decompile_view → run → share → waitlist`; Search Console + sitemap.
**Tests.** Funnel fires end to end.
**Review.** Soroush approves every public sentence. No HN, no Product Hunt yet.

### EPIC-084 research: live read · S
**Goal.** Real numbers before Stage 2 design locks.
**Tasks.** After 30 days or 300 decompiles, whichever first: funnel conversion; distribution of blok counts and fragment counts per paste; top finding types; waitlist size. **Also judge one deferred affordance against real usage: "dim the rest"** — the decompiler prototype dims every span except the pinned blok's. EPIC-013 did not build it (it was in that epic's backlog line, never in its Scope or acceptance criteria; ruled 2026-09-10 to stay unbuilt). It is worth having only if the blok-count distribution shows prompts big enough that a pinned highlight gets lost, so this read-out decides it rather than taste.
**Tests.** A one-page read-out in `docs/research/`.
**Review.** Fed GATE 1, which no longer exists; decides whether blok grouping moves into EPIC-021a.

---

## Stage 2 · Bloks and compiler

**Stage goal.** The editor, with the override and drift mechanics that make it trustworthy.

**Exit state.** A signed-in user creates a project and a prompt from a seeded starter or an import, adds bloks of every kind, sees the compiled prompt update span by span, hand-edits one span, sees drift, updates from the blok, and can eject. Variables are extracted and typed. A 60-blok prompt is navigable.

**Demo.** Import Northwind, hover blok ↔ span, add a constraint blok, watch one span change, hand-edit span 4, see the banner, update from blok.

### EPIC-090 research: editor prototype study · S
**Goal.** The override mental model, canvas scale and Draft/Live vocabulary tested before EPIC-021b.
**Tasks.** Build a small clickable prototype of override → drift → update-from-blok (none exists; the mockup has no click path). Recruit 6–8 ICP engineers ($50). Script: fix a typo in the compiled pane (baseline); discover the override; predict what "Update from blok" does before clicking; on a seeded 60-blok canvas find the markdown blok, reorder it, count constraints; shown "v7 · unsaved", "Draft v7", "v7 · current", say whether they are the same thing.
**Tests.** ≤1 of 6 stuck >30 s on "why can't I edit"; ≥5 of 6 predict the update correctly; median find-time <45 s at 60 bloks; ≥6 of 8 identify one state.
**Review.** Failures change EPIC-021a (grouping/collapse pulled into v1), EPIC-021b (affordance, copy), EPIC-041/055 (one vocabulary for version state).

### EPIC-020 core: blok model and compiler · M
**Goal.** The data model and compiler everything depends on.
**Tasks.** Types `Blok { id, kind, content, order, ranges, manualOverride?, summary? }`, `CompiledSpan { blokId, text, hash, manual }`, `CompileResult`; `compile()` per kind, expected bloks emit no text, span hash = `sha256(kind + content + compilerVersion)`, cache passed in and returned; manual override emits verbatim and marks drift; `eject()` and `import()`; artifact schema v0.
**Tests.** One blok change → one span hash change; 100% cache hits on unchanged; import → compile → text identical; expected bloks absent from text.
**Review.** ADR-004 for artifact v0. No model call. No word "block" anywhere.

### EPIC-021a web: project, prompt, canvas · M
**Goal.** Create and arrange bloks, at scale, with a starting point.
**Tasks.** Schema `prompts`, `bloks` (ranges JSONB), `prompt_versions` stub; project and prompt lists; canvas: add (kind picker), inline edit, reorder by drag and keyboard, delete, filter, count; ~~seeded starter bloks for a new prompt (three templates) so the blank canvas never appears~~ **— replaced by empty states, 2026-09-14** (see below); grouping and collapse if EPIC-090 says so; autosave with conflict toast.
**Tests.** Playwright create/reorder/reload. Order integrity after delete. 60-blok fixture navigable within the EPIC-090 target.
**Review.** Matches mockup. Touch drag works. No blok logic outside `core`.

**Seeded starter bloks are not owed. Ruling, 2026-09-14.** The task line above promised three
starter templates "so the blank canvas never appears". It was written before EPIC-013 shipped the
empty states from the illustration system, and `EPIC-021a-canvas.md`'s Scope had already narrowed it
to `packages/db`: "a seed script" plus `apps/web`: "empty states" — which is what was built and what
the 2026-09-14 staging hand-drive found: a new prompt opens with zero bloks and a canvas that says
what to do next.

**"No projects yet. The first one is where a prompt lives" does the job without fabricating someone's
content**, and that is the reason rather than the cost being the reason. A seeded prompt hands a user
three bloks they did not write, on a product whose whole claim is that a blok stores your verbatim
text. The empty state says the same thing and lies about nothing.

The line is struck through rather than deleted so the promise is visibly retired rather than quietly
absent — it was carried in the backlog row and this task line for three epics after it stopped being
the plan, and the hand-drive read it as an unmet requirement before the Scope settled it.

**Named evaluation this epic must make: BlockNote, or a plain textarea per blok card.** Decide it in
the report before building the canvas, and judge it on three things: (a) whether a blok's verbatim
text and its ranges survive editing **byte for byte**; (b) whether it forces Mantine or ProseMirror
styling into `packages/ui`; (c) whether slash commands and drag-to-reorder are worth those costs on a
canvas of 40+ cards.

*The advisor's position, so the epic starts from it rather than from scratch:* bloks own exact UTF-16
offsets into one continuous source, so **any editor that stores a block tree needs a mapping layer** —
and that mapping is exactly where EPIC-013 lost two characters to CRLF. The burden of proof is on
BlockNote.

*And the stated reason for wanting it does not survive checking.* 41Prompts v1 used BlockNote
(`@blocknote/core`, `/mantine`, `/react` at 0.35) in a single component,
`src/components/EditorClient.tsx`, with image/file/video/audio and toggle/check-list blocks stripped from the schema.
It persisted **BlockNote's own JSON block array to localStorage and never converted to or from
markdown**: there is no `blocksToMarkdown` or `tryParseMarkdown` call anywhere in v1. So markdown —
the usual reason given for reaching for it — is not what v1 actually did, and is not evidence for it
here. No editor dependency is added before this evaluation.

### EPIC-021b web: compiled pane, override, eject · M
**Goal.** The right half of the editor.
**Tasks.** Compiled pane from `CompileResult.spans` with `data-b`, bidirectional hover/focus/pin, leading markers, screen-reader text naming the owning blok per span; per-span "Edit this text" → manual override; banner "Edited by hand · Update from blok"; "edited by hand" badge on the card; eject with confirmation; token count and cost estimate from a dated price table; resizable split, keyboard.
**Tests.** Playwright override → banner → update. Eject yields one blok equal to compiled text. Linking both directions by keyboard.
**Review.** Pane read-only except the override path. Drift survives reload. Vocabulary from EPIC-090.

### EPIC-022 Variables · S
**Goal.** `{{placeholders}}` become a typed schema.
**Tasks.** `extractVariables(bloks)`; Variables tab: optional flag, description, example value; warnings for undefined use; finding for unused declared.
**Tests.** Extraction fixture; rename updates schema; preview compile renders.
**Review.** Shape forward-compatible with the Stage 5 contract check.

---

## Stage 3 · Checks and runs, one provider

**Stage goal.** The eval loop with attribution, on Anthropic only, plus the onboarding that gets a new user to a passing run in five minutes.

**Exit state.** Expected bloks become checks; inputs upload; a run executes in the worker with caching, cost, caps and 12-month payload retention; results show by check; a failure resolves to its blok; a constraint can be created from it after a preview. A new user reaches a passing run on a seeded prompt in under five minutes and we measure it.

**Demo.** New account → seeded prompt → run → one failure → click → blok lights → preview the suggested constraint → add → re-run → pass. Under five minutes on a stopwatch.

### EPIC-030 core: checks and deterministic graders · M
**Goal.** Expected bloks become executable checks with a stable result shape.
**Tasks.** `Check { id, blokId, kind, params }` from expected bloks, for **the eight kinds in `CHECK_KINDS`** (`packages/core/src/compile/types.ts`) and no others; `grade()` pure; `RunResult`; suggestion engine for unmatched expected text. Display phrases are already fixed by ADR-003 and already implemented as `CHECK_KIND_PHRASES`; this epic uses them rather than inventing any.
**Tests.** 5 positive + 5 negative per grader; Northwind derivation fixture; evidence strings readable.
**Review.** No internal identifier is a display string.

> **Corrected 2026-09-14.** This line used to name the eight kinds itself, as `json_shape`,
> `contains`, `not_contains`, `pattern`, `max_words`, `max_chars`, `one_of`, `refusal` — the right
> *count*, the wrong *identifiers*. EPIC-020 shipped them as `json_shape`, `allowed_values`,
> `word_limit`, `character_limit`, `must_contain`, `must_not_contain`, `matches_pattern`,
> `refuses_to_answer`, with a compile-time exhaustiveness guard and ADR-003's phrases verbatim.
>
> **ADR-003 is authoritative and the roadmap was stale**, so the list is not restated here at all —
> it points at the code that already enforces it. A second copy of a list is how the last one drifted:
> `CLAUDE.md` records that the same set was once written down as a sample of four, read as the whole
> set, and cost a ruling when EPIC-012b went looking for a phrase for a prohibition that had been
> there all along. Fixed as its own change, before EPIC-030 is written, so the epic is written against
> a document that agrees with itself.

### EPIC-031 worker: run engine, Anthropic · M
**Goal.** Runs execute safely in the background.
**Tasks.** pg-boss queue; Anthropic adapter via AI SDK; raw response stored with a `purge_after` of 12 months and a purge job; cost from a dated price table; cache by `sha(compiled + input + model + params)`; budget enforcement; retries on 429/5xx; per-key concurrency; provider usage policy confirmed and linked in the report.
**Tests.** Mocked provider: 10 inputs → 10 results; re-run → 10 hits, 0 calls; cap blocks the 51st; retry on 429; purge job (clock test).
**Review.** Keys never logged. Price table sourced and dated. Worker survives a Postgres restart.

### EPIC-032 web: inputs, run, results, attribution · M
**Goal.** The Runs page, wired.
**Tasks.** Input sets from CSV and manual rows; run trigger (Anthropic only); results by check with meters and pass/fail icons alongside colour; KPI strip; polling progress; failure detail with the failing region highlighted; attributed blok card; "Create constraint from this failure" opens a preview of the suggested blok text before it is added; run history.
**Tests.** Playwright end to end with mocked provider including the preview step. Progress without reload.
**Review.** A failure with no attributable blok is shown honestly.

### EPIC-033 LLM-judge grader · S
**Goal.** Expectations that need judgement, graded by a pinned model.
**Tasks.** `judge` check kind; rubric derived from the expected blok; judge prompt in the worker (proprietary); pinned version in config; evidence includes the rationale.
**Tests.** Mocked judge fixtures; pinned version on every row.
**Review.** Judge prompt does not leak the expected answer. Judge cost shown separately.

### EPIC-034 Activation onboarding · S
**Goal.** Signup to first passing run in under five minutes, measured.
**Tasks.** Post-signup path: pick a seeded prompt (three templates, one already has a failing check) → run → see failure → fix → pass; progress indicator; `run_passed` event with time-from-signup; dashboard panel; "activated" defined as the roadmap's own number — first passing run within five minutes of signup — since EPIC-005 is cut.
**Tests.** Playwright timed path under five minutes with mocked provider. Event carries elapsed time.
**Review.** Five real users observed; stalls recorded.

### ▣ GATE 3 · Stage 3 exit and loud-launch decision
Measured: 100 test runs with zero cache misses on repeats, cost within 5% of expected; budget cap enforced; judge pinning verified by changing config; attribution correct on 10 seeded failures; five observed users activated; M2 and M3 leading metrics against kill criteria.
Go: proceed to EPIC-035 and Stage 4. No-go: fix-up epic (M) or a two-week onboarding sprint, then re-gate.

### EPIC-035 Loud launch · S
**Goal.** Announce, now that a paste leads somewhere.
**Tasks.** Show HN; Product Hunt; one content piece from our own run data; outreach to whoever Stage 1 and Stage 3 have attracted (EPIC-005's list of 20 engineers is cut and has no replacement source).
**Tests.** Signups by source on the dashboard.
**Review.** Provider terms re-read before any published comparison. Rate limits tightened for the day. Cloudflare cache on the landing page.

---

## Stage 4 · Versions and three providers

**Stage goal.** History and breadth.

**Exit state.** Every save is a version with a semantic diff and pass rate. Two versions run A/B. OpenAI and Google are live with BYO keys stored under a reviewed threat model. Results pivot to an accessible heatmap.

**Demo.** v6 vs v7 across three providers; heatmap shows where Gemini fails; restore v6.

### EPIC-040 core + db: versions and semantic diff · M
**Goal.** A version is a snapshot of the blok set; diffs are semantic.
**Tasks.** `prompt_versions` with snapshot, compiled text and hash, note, pass rate from the latest run; `diff(a, b)` → added, removed, changed, moved, byte delta; version on save and before run.
**Tests.** Diff fixtures per change type; moved ≠ removed + added.
**Review.** Snapshot size at 100 × 50 acceptable. One vocabulary for version state (EPIC-090).

### EPIC-041 web: history, restore, A/B · S
**Goal.** The Versions page.
**Tasks.** List with note, time, pass rate; diff panel; restore as a new version; A/B on one input set.
**Tests.** Playwright edit → save → diff → restore. A/B creates linked runs.
**Review.** Restore never deletes.

### EPIC-043 BYO-key threat model and breach runbook · S
**Goal.** User provider keys are protected on paper before one is stored.
**Tasks.** Threat model for the key store on a single box: master-key custody, rotation, exfiltration, insider, backup exposure; libsodium sealed box with master key in Coolify env only; key never in logs, Sentry, PostHog; `infra/RUNBOOK.md` breach section with Law 25 and PIPEDA notification steps; UI guidance to scope and cap keys at the provider.
**Tests.** Encryption round-trip; log scrubbing test; backup dump contains ciphertext only.
**Review.** Soroush reads it. Every high finding has an epic.

### EPIC-042 Providers, BYO keys, heatmap · M
**Goal.** Three providers, user keys, input pivot.
**Tasks.** OpenAI and Google adapters; price table extended; Settings → Providers with encrypted keys, toggle, test button; provider matrix; "By input" heatmap with focusable, labelled cells (`button` role, `aria-label` "input 17, fail"), keyboard navigation, and a shape difference in addition to colour; per-provider concurrency; provider usage policies confirmed.
**Tests.** Mocked three-provider run → matrix and heatmap; invalid key → clear error; keyboard reaches and opens a cell.
**Review.** Keys absent from every log sink. Heatmap readable at 500 inputs.

---

## Stage 5a · Delivery, minimum

**Stage goal.** The prompt leaves the platform and lives in a Node app, updatable without a redeploy, gated by checks. TypeScript only. Enough to prove the story and measure demand.

**Exit state.** `npm install @41prompts/sdk`; `resolve("pr_…", vars)` returns the Live prompt from cache with a bundled fallback; publishing is blocked when checks fail; "Publish anyway" needs a reason and is audited; Undo is instant; the Deploy and Connect pages exist; CDN logs show which apps resolve.

**Demo.** Stop the service; the app still answers. Start it; publish v7; the app changes within 60 s. Publish a failing version; watch it block.

### EPIC-050 core: build artifact v1, pointer, contract check · M
**Goal.** The public artifact format, frozen, and the compatibility rule.
**Tasks.** `BuildArtifact v1` (content-addressed sha, compiled, spans, variables, model, params, check suite id); `LivePointer`; `isCompatible()` (added required, removed, type change = breaking); JSON Schema for both; ADR-005 declaring the format public and versioned.
**Tests.** Schema fixtures; compatibility matrix.
**Review.** Nothing internal leaks through the format.

### EPIC-051 API + storage: publish, undo, gate, audit · M
**Goal.** The server side of Publish.
**Tasks.** `POST …/publish` runs the gate (checks on target model, contract check, cost delta), writes artifact to R2 with `immutable`, pointer with 30 s max-age, `publish_events`; "Publish anyway" requires a reason ≥10 chars, attributed; `POST …/undo`; admin-only switch; test/live keys hashed and project-scoped; `GET /v1/prompts`, `GET /v1/pointer/:id` redirect to CDN; "apps resolving" derived from CDN access logs, no client ping.
**Tests.** Pass → pointer moves; fail → 409 with reasons; anyway → recorded; undo → previous sha; wrong-scope key → 403; immutable headers via curl.
**Review.** Vocabulary: version, Live, Publish, Undo, Publish anyway. Nothing else.

### EPIC-052 sdk-ts `@41prompts/sdk` · M
**Goal.** The runtime library, three rules, telemetry off.
**Tasks.** `resolve()` memory → disk → bundled → background network; never throws, `onWarning`; variable validation; jittered refresh with ETag; artifact sha verified against pointer; zero dependencies; telemetry off by default with a documented opt-in; README documents exactly what opt-in sends.
**Tests.** Offline returns bundled; stale serves old then refreshes; 1,000 concurrent → one fetch; never-throw fuzz; sha mismatch rejected.
**Review.** Bundle under 15 KB. Public API frozen (ADR-006).
**Carried forward from EPIC-013 (parked 2026-09-10): `packages/core` is resolved two ways in this repo.** `apps/web` reads its **built** `dist` through a Turbopack alias, while `tsc` and Vitest read its **source** through the unchanged `main`. That is because core is `moduleResolution: NodeNext`, so its relative imports carry the `.js` extension TypeScript requires while the files are `.ts`, and Turbopack does not map one to the other (`transpilePackages` and `experimental.extensionAlias` were both tried and neither applies). It works — `predev` and turbo's `^build` keep `dist` current — but it is a published-surface question, not a web one: this epic has to settle core's `main`/`exports` for publication anyway, and should decide then whether the alias goes away. EPIC-013's report, open question 2.

### EPIC-055 web: Deploy, Connect (TypeScript), keys, publish flow · M
**Goal.** The delivery UI, TypeScript path only.
**Tasks.** Deploy page (Live vs Draft, gate list with icons, Publish / Publish anyway / Undo, apps-resolving table from CDN logs, history); Connect page with TypeScript steps and generated-file preview; Settings API keys (shown once, rotate) and Publishing tabs; editor header pill and Publish button; Runs page blocked banner; no bare shas in copy.
**Tests.** Playwright: failing suite → disabled; anyway with reason → history; undo → Live reverts.
**Review.** Forbidden-word grep over UI strings passes. Neutral ink for "unsaved"; amber only for drift.

### ▣ GATE 5 · Demand check
Measured, 30 days after EPIC-055: number of distinct production apps resolving from the CDN; number of paying or pilot customers asking for Python, CLI codegen, or source access.
Go to 5b: ≥5 apps and ≥2 explicit asks. No-go: ship YAML/CI export as a small epic and move to Stage 6.

---

## Stage 5b · Delivery, full

**Stage goal.** Codegen, Python, the open-source split, and the threat review.

### EPIC-053 cli `41p` · M
**Tasks.** `link` (flag, `.41prc`, key scope, interactive, fail in CI); `pull` (typed `prompts.ts`/`.py` by prompt id, lockfile, bundled artifacts; header "This file is yours; 41Prompts claims no rights in it"); `check`; `run`; `decompile <file>` (the open decompiler, no account); thin unscoped `41p` package wrapping `@41prompts/cli`.
**Tests.** Golden files TS + Python; stale lockfile detected; exit codes; `41p decompile` on the Northwind file yields the known findings.
**Review.** Generated code compiles under strict in a fresh project.

### EPIC-054 sdks/python · S
**Tasks.** `fortyone.resolve()` parity; standard-library HTTP, zero dependencies (tested via `importlib.metadata`); `.pyi`; PyPI trusted publishing; `41prompts` alias package.
**Tests.** Offline and stale tests; `mypy --strict` on generated bindings.
**Review.** Divergence table vs TypeScript.

### EPIC-057 SDK threat model · S
**Tasks.** Key theft, pointer tampering, artifact substitution, replay, DoS on pointer endpoint, dependency confusion; mitigations mapped; one external review hour; findings triaged.
**Tests.** Rejected mismatched artifact; rate-limited pointer endpoint.
**Review.** Every high finding has an owner and an epic.

### EPIC-056 Open-source split · S
**Tasks.** Public repo via history-preserving filter (from EPIC-007's dry-run); Apache-2.0 + NOTICE + SPDX; `DCO` file, `CONTRIBUTING.md`, DCO app required; `TRADEMARKS.md`; `SECURITY.md`; READMEs with the three-step quickstart; npm and PyPI trusted publishing from the public repo only; IP assignment from founder to the legal entity executed before the first push; `dependency-review-action` in the mirror.
**Tests.** Fresh `npm install @41prompts/sdk` resolves a bundled artifact; mirror job idempotent; a proprietary import fails the dry-run.
**Review.** Licence headers present everywhere. Legal entity named in every LICENSE/NOTICE.

**Creating `github.com/41prompts/41prompts` and re-pointing every URL to it is part of this epic, and
must not happen before it** (Soroush, 2026-09-11). An empty placeholder repository reads as abandoned
to a stranger; a private one reads as unreleased, which is what we are. So until the mirror is real,
every `repository`, `homepage` and `bugs` URL in `packages/core`, `packages/cli`, `packages/sdk-ts`
and `sdks/python`, and `REUSE.toml`'s `SPDX-PackageDownloadLocation`, point at
`soroushamdg/41prompts`. Re-point all of them in the same change that publishes the mirror.

One thing deliberately *not* re-pointed: the three `prepublishOnly` guards
(`test "$GITHUB_REPOSITORY" = 41prompts/41prompts`). That is a publish blocker rather than a URL, and
leaving it makes publishing impossible until the public repo exists — which is the intent. It is the
fourth thing to flip here, alongside npm and PyPI trusted publishing.

---

## Stage 6 · Billing and launch

**Stage goal.** Money, legality at scale, and distribution.

**Exit state.** Free, Pro, Team enforced through Stripe at the prices this document names, validated by M6's kill criterion rather than by EPIC-005, which is cut. Full legal review done. Full site up with real numbers. A second launch with content from our own data.

### EPIC-070 Stripe · M
**Tasks.** Products and prices as this roadmap names them ($29/$79 per seat, unvalidated — EPIC-005 is cut); checkout, portal, webhooks (idempotent); `run_budgets` by plan; BYO-key unlock on Pro; usage meter; dunning via Resend; refund path documented.
**Tests.** Webhook replay; downgrade at period end.
**Review.** Pricing page equals Stripe.

### EPIC-071 Legal full · S
**Tasks.** Lawyer review of EPIC-017 documents; Team DPA finalised; provider terms re-checked for any published comparison; trademark filing status confirmed (CIPO + USPTO, classes 9 and 42, Paris priority); third-party notices page generated from the SBOM.
**Tests.** Retention jobs observed in production logs.
**Review.** Every lawyer "must" resolved or in backlog.

### EPIC-072 Marketing site final · M
**Tasks.** Every page from the mockup; run demo, rotator, counters from real data; Ask-AI chips; `/legal/third-party-notices`; reduced-motion end states everywhere.
**Tests.** Lighthouse ≥ 90 all pages; links resolve; reduced motion verified.
**Review.** Every claim maps to a shipped epic.

### EPIC-073 Launch 2 · S
**Tasks.** Three content pieces from run data; outreach to 30 teams paying for evals; launch dashboard; rollback plan for the single box.
**Tests.** Signups by source.
**Review.** Soroush approves every public artefact.

---

## Stage 7 · Lessons

**Stage goal.** Teach the junior member of an ICP team inside the product, after the format has been tested on paper.

### EPIC-064 research: paper-prototype Lesson 02 · S
**Tasks.** Two newcomers on ICP teams walk a paper or Figma version of Lesson 02 (run 5×, temperature, first check); record stalls; decide format before any engine code.
**Tests.** Both complete in under ten minutes or the format changes.
**Review.** Findings written before EPIC-060 starts.

### EPIC-060 Lesson engine · M
**Tasks.** YAML lesson format (bloks, steps, check, canned outputs); step tracker; preloaded workspace; canned runs first, cheap tier with daily cap for live runs; sandbox unlock.
**Tests.** Lesson loads with zero provider calls; cap enforced; state persists.
**Review.** Cost per completion under $0.01.

### EPIC-061 Lessons 01–03 · M
**Tasks.** Content per EPIC-064's format; run 5× demo; temperature slider with `aria-valuetext`; sandbox unlock.
**Tests.** Playwright completes each.
**Review.** Two more newcomers observed; fix before 062.

### EPIC-062 Lessons 04–09 · M
**Tasks.** Constraints models ignore; examples that help; reading a failure; regressions; picking a model; agents that behave.
**Review.** Each ends inside a real product surface.

### EPIC-063 Companion pages · S
**Tasks.** Static page per lesson; `llms.txt` updated.
**Review.** Citable without the app.

---

## Ongoing

**EPIC-900** every third sprint: dead code, dependency upgrades, boundary and compliance report, infra drill, CLAUDE.md accuracy.
**EPIC-901** monthly: `pnpm audit`, `pip-audit`, gitleaks, read the SBOM and licence gate output, key rotation check.

---

## Review checklist at every epic close

1. Acceptance criteria all checked with evidence.
2. Lint, typecheck, test green in CI.
3. No `core` logic in `apps/*`; no proprietary import in a public package.
4. No colour outside tokens; green, red, amber only for pass, fail, drift.
5. Forbidden-word grep over UI strings passes (block, assertion, label, pointer, artifact, promote, enum, sha).
6. Pass/fail never by colour alone; every interactive element reachable by keyboard; reduced motion shows end states.
7. CLAUDE.md still true.
8. Backlog status updated; session log written; next epic written.

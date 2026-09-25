<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Epic checklist

Generated from `docs/roadmap.md` and `docs/epics/reports/` on 2026-09-25. **`docs/backlog.md` and
`docs/roadmap.md` remain the sources of truth** — this is a flattened view for reading, not a third
place to edit.

`[x]` means the epic has a report in `docs/epics/reports/`, which is what "shipped" means here:
merged into `main` with evidence for every acceptance criterion.

**Item checkmarks mirror the epic's status.** The roadmap records tasks per epic rather than per
task, so `[x]` on an item means "this epic shipped and this was in its scope" — not that somebody
ticked that line individually.

Statuses: **done**, **todo**, **deferred** (waiting on Soroush), **cut** and **cancelled** (decided
against, kept for the record).

## Counts

- **done**: 53
- **todo**: 7
- **deferred**: 3
- **cut**: 2
- **cancelled**: 1

**66 rows total.**

## Stage 0 · Foundation

#1 [x] EPIC-000 — Repo scaffold · M; A green monorepo with the package boundaries from ADR-001, Apache-2.0 and SPDX on the public packages, and CI enforcing the boundary as an allow-list
1- [x] pnpm + Turborepo.
2- [x] Node 22.
3- [x] stub every package with one passing test.
4- [x] `packages/core` without DOM lib and without runtime deps.
5- [x] public package.json shape (`repository`, `files`, `publishConfig`, `prepublishOnly` guard).
6- [x] `LICENSE` + `NOTICE` in public packages.
7- [x] SPDX headers.
8- [x] dependency-cruiser allow-list (public packages may import only public packages, builtins, and declared deps; core imports nothing).
9- [x] GitHub Actions `ci.yml`.
10- [x] PR template.
11- [x] docs copied in.
     -- tests: Fresh-clone install, lint, typecheck, test pass. A proprietary import in core fails lint with the boundary rule name. Second Turborepo run reports cache hits. `41p --version` prints.
     -- review: Layout matches ADR-001. Nothing beyond a stub in any package. No "will be needed later" additions.

#2 [] EPIC-005 — Customer discovery · S — **cut, 2026-09-10**; Customer discovery  **— CUT**
1- [] (the roadmap records no task list for this row)

#3 [] EPIC-006 — Namespaces and marks · S — **deferred, 2026-09-14**; Nobody else can take the names  **— DEFERRED**
1- [] Create npm org `41prompts` with 2FA required and trusted publishing.
2- [] create GitHub org `41prompts`.
3- [] check and register PyPI `fortyone-prompts`, and `fortyone` and `41prompts` if free (if `fortyone` is taken, the Python import becomes `fortyone_prompts` now).
4- [] trademark knockout search for "41 PROMPTS", "FORTY ONE PROMPTS", "41P" on CIPO, USPTO, EUIPO/TMview.
5- [] check `41prompts.com`.
6- [] record results.
     -- tests: Screenshots of ownership for each namespace in the report.
     -- review: Decision recorded on whether to file the word mark now (CIPO + USPTO, classes 9 and 42) or at the loud launch.

#4 [x] EPIC-001 — Infrastructure · M; One AWS Lightsail instance in Montréal running Coolify deploys web and worker from GitHub with TLS, staging and production, and backups that have been restored once. Claude Code writes infra as code; Soroush runs the bootstrap once; no agent holds SSH. Full detail in `docs/epics/EPIC-001-infrastructure.md`
1- [x] Lightsail 4 GB, ca-central-1, static IP, snapshots.
2- [x] `infra/bootstrap.sh` (harden, Docker, Coolify) run by Soroush.
3- [x] staging on push to `main`, production on tag.
4- [x] `infra/docker-compose.yml` with postgres 16, web, worker, healthchecks.
5- [x] Dockerfiles.
6- [x] migrate-before-start entrypoint.
7- [x] DNS + TLS via Coolify.
8- [x] R2 `41p-backups`, nightly `pg_dump`, 30-day retention.
9- [x] secrets set by a human only.
10- [x] restore drill, timed, in `infra/RUNBOOK.md`.
     -- tests: `/healthz` returns git sha. Killed container restarts in 30 s. Restore drill completed.
     -- review: Runbook readable by a stranger. `gitleaks` clean. No-op tag deploy tested. Region recorded for the privacy policy.

#5 [x] EPIC-008 — Prebuilt images · S; No image is ever built on the box that serves production. GitHub Actions builds `web` and `worker`, pushes them to private GHCR, and Coolify pulls fixed tags
1- [x] `build-images.yml` on push to `main` and on `v*` tags only (never on PRs; CI already tests them), buildx with registry cache, `--build-arg SOURCE_COMMIT=${{ github.sha }}`, tags `:staging` / `:production` / `:sha-<sha>`.
2- [x] `infra/docker-compose.staging.yml` and `.production.yml` with `image:` and `pull_policy: always`, `${...}` only for variables we set ourselves in Coolify (never for a value Coolify or the build supplies — Coolify locks every `${...}` it parses; see EPIC-001's F2 outcome).
3- [x] local dev keeps `build:` in `infra/docker-compose.yml`.
4- [x] registry credentials on the box (Coolify registry settings, else a documented one-time `docker login ghcr.io`).
5- [x] workflow's last step calls Coolify's deploy webhook with a `deploy`-scoped token stored as a GitHub secret.
6- [x] README/RUNBOOK updated.
7- [x] Actions minutes budget noted (Free plan 2,000/month).
     -- tests: A `main` merge produces a GHCR image whose `/healthz` `commit` equals the merge sha, with no build log on the box. A `v*` tag does the same for production. Rollback = redeploy the previous `:sha-` tag, timed in the runbook.
     -- review: Box CPU/memory flat during a deploy. No `${...}` in either deployed compose file. Images private.

#6 [x] EPIC-009 — Actions budget · S · late entry, 2026-09-12; Stop spending Actions minutes on work the box does for nothing, and stop tagging things that are not releases. CI stays on GitHub, where a green tick before merge is worth paying for
1- [x] `build-images.yml` loses its `push: branches: [main]` trigger and keeps `v*` plus `workflow_dispatch`.
2- [x] `infra/docker-compose.staging.yml` gets `build:` back for web and worker, with no `args:` (EPIC-001 F2).
3- [x] `PROCESS.md` gains "tags are releases, not checkpoints" and names the three things that do not warrant one.
4- [x] `infra/RUNBOOK.md` gains a budget section with measured minutes per merge and per tag, and says to read it at the close of every epic.
     -- tests: A merge to `main` runs CI and Compliance and no image build, with staging updating from Coolify's own build. A `v*` tag still builds, pushes and deploys production. The on-box staging build finishes under ten minutes without taking the apex `/healthz` down.
     -- review: The saving is 22%, not a fix: at the observed merge rate the project stays roughly 3× over its allowance, and the largest remaining item is CI running twice per change. Nothing about what production runs changes.

#7 [x] EPIC-002 — Data layer and auth · M; Users in our Postgres, three sign-in methods, protected routes, and an account purge window
1- [x] Drizzle baseline: users, sessions, accounts, projects, api_keys (empty).
2- [x] migrations on deploy.
3- [x] Better Auth with Google, GitHub, magic link via Resend.
4- [x] `/app/*` protected.
5- [x] account page with delete (soft delete, 30-day purge job).
6- [x] seed script.
     -- tests: Playwright sign-up via magic link. Unauthenticated redirect. Purge job deletes after the window (clock-injected test). Migration round-trip.
     -- review: No user data in a third party. Cookie flags correct. Email templates use tokens.

#8 [x] EPIC-003 — Design system · M; Resolution tokens and accessible base components in `packages/ui`, light and dark
1- [x] `@theme` tokens from the mockup.
2- [x] components: Button (44px targets on `sm` where touch), Pill, Badge with icon variants (pass ✓, fail ✕, drift !), Tag, BlokCard, Table, KpiStrip, Sheet, Switch, Input, Textarea, Tabs with full ARIA tabs pattern and arrow keys, Callout, Meter.
3- [x] motion primitives honouring reduced motion by showing end states.
4- [x] theme provider with cookie.
5- [x] `/dev/ui` gallery (staging only).
6- [x] focus rings.
7- [x] contrast script.
     -- tests: Visual regression of `/dev/ui` both themes. Contrast check passes. Keyboard test per component. Axe clean.
     -- review: Side by side with mockups. No colour outside tokens. Amber appears only in drift components.

#9 [x] EPIC-004 — Observability and guardrails · S; We see errors, usage and cost before a user tells us, and no user can run up an unbounded bill
1- [x] Sentry web + worker with release tags.
2- [x] PostHog identify + typed events (`signup`, `login`, `decompile_view`, `decompile_run`, `decompile_share`, `project_created`, `run_started`, `run_passed`, `publish`).
3- [x] pino JSON logs.
4- [x] uptime checks.
5- [x] `run_budgets` table with plan defaults.
6- [x] a PostHog dashboard with the milestone metrics above.
     -- tests: Error → Sentry with release. Event → PostHog. Budget increment and cap unit tests.
     -- review: No PII in logs. Alert reaches a phone. Dashboard shows every milestone metric, even at zero.

#10 [x] EPIC-007 — Compliance CI · S; Licence and boundary violations fail a PR, and the public mirror is proven buildable on every PR
1- [x] `REUSE.toml` + `reuse lint`.
2- [x] dependency-cruiser config from the licensing review.
3- [x] Turborepo boundaries with `public`/`private` tags.
4- [x] syft SBOM + grant allow-list.
5- [x] `pnpm licenses` strict gate for public packages.
6- [x] `scripts/mirror-dry-run.sh` (filter-repo, gitleaks, reuse lint, install, build, test in isolation).
7- [x] `.grant.yaml`.
8- [x] `.public-root/` with the mirror's root files.
     -- tests: A GPL dev dependency fails the gate. A `workspace:` dep on `packages/db` from `packages/core` fails boundaries. Dry-run passes.
     -- review: Artifacts uploaded. EPIC-901 references them.

## Stage 1 · Decompiler, soft-public

#11 [] EPIC-080 — research: decompiler prototype study · S — **cut, 2026-09-10**; research: decompiler prototype study  **— CUT**
1- [] (the roadmap records no task list for this row)

#12 [x] EPIC-010 — core: deterministic segmenter · M; Any text cut into segments with exact offsets, identically every time
1- [x] `segment(text)` → `{ text, start, end }[]`.
2- [x] atomic fenced code and XML.
3- [x] blank-line paragraphs.
4- [x] list items.
5- [x] sentence split only over N chars.
6- [x] headings as separators.
7- [x] offsets by scanning.
8- [x] 25-prompt fixture corpus.
9- [x] property test reconstructs input byte for byte.
10- [x] CRLF, tabs, emoji, RTL fixtures.
     -- tests: Fixture snapshots; 1,000 generated inputs; idempotence; 1 MB input under 200 ms.
     -- review: Rule order documented. No catastrophic regex.

#13 [x] EPIC-011a — core: classifier and clustering · M; Segments get a kind, and fragments of one rule become one multi-range blok
1- [x] `classify(segment)` via ordered heuristics with a 60-example labelled table.
2- [x] `cluster(segments)` → bloks with `ranges[]`, merge on topic key or normalised-token overlap ≥ 0.6 with same kind, deterministic order.
3- [x] topic keys in `topics.json`.
     -- tests: ≥90% on the labelled table; Northwind yields the expected multi-range bloks; 100 runs identical.
     -- review: Topic keys checked for false merges. The term "blok" was EPIC-080's to confirm or change; with that epic cut it is settled as shipped, and it is now written into ADR-003, the schema and `packages/core`'s public types.

#14 [x] EPIC-011b — core: summariser interface · S; A summary for every blok, heuristic in core, model-backed in the worker, never confused with source
1- [x] `Summariser` interface.
2- [x] heuristic implementation in core.
3- [x] model-backed implementation in `apps/worker` (prompt stays proprietary) cached by content hash.
4- [x] summaries carry `source: "heuristic" | "model"`.
     -- tests: Interface contract; core never reaches a model (boundary test).
     -- review: Summary card shows the source flag. Whether an "unverified" cue is *also* required was EPIC-080's question; with that epic cut it has no owner unless EPIC-013 takes it.

#15 [x] EPIC-012a — core: five detectors · M; Repeated instruction, contradiction, untestable language, politeness padding, over-long blok
1- [x] `diagnose(bloks)` → `Finding { severity, code, title, body, blokIds, fix }`.
2- [x] vocabulary lists as data.
3- [x] severity policy.
4- [x] sort.
     -- tests: Positive and negative fixture per detector; Northwind yields the known findings; clean 3-blok prompt yields none.
     -- review: Wording readable by a junior engineer. Code identifiers never appear in `title` or `body`.

#16 [x] EPIC-012b — core: rules-without-checks, fix wording, audit · S; The sixth detector and the editorial pass
1- [x] `rules_without_checks` detector.
2- [x] one-line suggested fix per finding.
3- [x] false-positive audit over the corpus.
     -- tests: Detector fixtures. Audit under 10% false positives, recorded.
     -- review: Every finding's fix is an action, not a description.

#17 [x] EPIC-013 — web: public /decompile · M; The decompiler in a browser, no account, on desktop and phone, accessible
1- [x] Route with textarea, sample, Decompile.
2- [x] results from core server-side, summaries filled asynchronously without layout shift.
3- [x] source map with spans (`data-b`, `data-k`), hover + focus + click-to-pin on both sides, keyboard pin from spans, skip link, no per-word tab stops (one tab stop per blok, arrow keys within).
4- [x] leading markers.
5- [x] dim.
6- [x] findings panel as real buttons.
7- [x] fragment badges with accessible names.
8- [x] touch default: first blok pinned with a one-line hint on small screens.
9- [x] stats strip.
     -- tests: Playwright desktop and mobile emulation: paste → bloks → tap blok 3 → three spans. Axe clean. Lighthouse ≥ 90.
     -- review: Pixel check both themes. Ink inversion only. Terms and privacy links present beneath the button (from EPIC-017) before this goes to production.

#18 [x] EPIC-017 — Legal minimum · S; Public traffic is lawful on day one
1- [x] Terms of use (content licence, warranty disclaimer, liability cap, indemnity for pasted content, Québec law).
2- [x] privacy policy naming OpenAI, Anthropic, Google, Cloudflare, Stripe, Resend, PostHog, Sentry as recipients, retention periods, Law 25 privacy officer contact, GDPR rights contact, cross-border note (EU hosting, US providers).
3- [x] cookie choice with privacy-preserving default.
4- [x] `/legal/subprocessors`.
5- [x] retention table (anonymous decompiles 30 days, run payloads 12 months, accounts 30 days after delete).
6- [x] one-page Law 25 transfer assessment.
7- [x] DPA-on-request draft.
8- [x] one lawyer hour booked.
     -- tests: Pages render; links from `/decompile` and footer; retention numbers match the code in 014, 031, 002.
     -- review: Lawyer's notes attached. Any "must" becomes a task before EPIC-015.

#19 [x] EPIC-014 — Capture · S; Sharing works, abuse is bounded, retention is enforced, and interest is captured where the editor would be
1- [x] `decompiles` table (source encrypted at rest).
2- [x] permalink `/d/{id}` with `noindex` and `robots` disallow.
3- [x] "remove this content" endpoint open to anyone, with email confirmation.
4- [x] 30-day purge job.
5- [x] rate limit 20/IP/hour anonymous.
6- [x] 20k-character cap.
7- [x] Turnstile.
8- [x] abuse check (moderation endpoint or classifier) before forwarding anonymous text to a provider on our key.
9- [x] "Save these bloks" → waitlist capture (email) with the promise stated plainly ("the editor is coming; we will email you"), no fake "create project".
     -- tests: 21st request → 429. Permalink `noindex` header. Removal endpoint deletes. Purge job (clock test). Abuse check blocks a seeded bad input.
     -- review: Retention policy text in EPIC-017 matches the job. No other user's data reachable from a permalink.

#20 [x] EPIC-016 — Landing page v1 · M; A front door for the soft launch
1- [x] Nav, hero, ask bar with grounded handoff sheet, suggestion chips, three-step strip, decompiler CTA, footer with legal links.
2- [x] hero compile-pass plays once, Replay button, reduced-motion shows the end state (not skipped).
3- [x] logo morph respects reduced motion.
4- [x] sign-in and sign-up pages.
5- [x] OG image.
6- [x] static favicon.
7- [x] robots, sitemap.
8- [x] fonts self-hosted via `next/font`.
9- [x] theme toggle.
     -- tests: Playwright home, ask sheet, sign-up. Lighthouse ≥ 90 all categories. Reduced-motion snapshot shows end states.
     -- review: No claim beyond what ships in Stage 1. "labelled" replaced with "named". Deep links tested this week.

#21 [x] EPIC-015 — Soft ship · S; Findable by people and models, without an announcement
1- [x] `/llms.txt`, `/llms-full.txt`.
2- [x] companion article with three anonymised corpus examples.
3- [x] PostHog funnel dashboard `decompile_view → run → share → waitlist`.
4- [x] Search Console + sitemap.
     -- tests: Funnel fires end to end.
     -- review: Soroush approves every public sentence. No HN, no Product Hunt yet.

#22 [] EPIC-084 — research: live read · S; Real numbers before Stage 2 design locks  **— CANCELLED**
1- [] After 30 days or 300 decompiles, whichever first: funnel conversion.
2- [] distribution of blok counts and fragment counts per paste.
3- [] top finding types.
4- [] waitlist size. **Also judge one deferred affordance against real usage: "dim the rest"** — the decompiler prototype dims every span except the pinned blok's. EPIC-013 did not build it (it was in that epic's backlog line, never in its Scope or acceptance criteria; ruled 2026-09-10 to stay unbuilt). It is worth having only if the blok-count distribution shows prompts big enough that a pinned highlight gets lost, so this read-out decides it rather than taste.
     -- tests: A one-page read-out in `docs/research/`.
     -- review: Fed GATE 1, which no longer exists; decides whether blok grouping moves into EPIC-021a.

## Stage 2 · Bloks and compiler

#23 [] EPIC-090 — research: editor prototype study · S — **deferred, 2026-09-14**; The override mental model, canvas scale and Draft/Live vocabulary tested before EPIC-021b  **— DEFERRED**
1- [] Build a small clickable prototype of override → drift → update-from-blok (none exists; the mockup has no click path). Recruit 6–8 ICP engineers ($50). Script: fix a typo in the compiled pane (baseline).
2- [] discover the override.
3- [] predict what "Update from blok" does before clicking.
4- [] on a seeded 60-blok canvas find the markdown blok, reorder it, count constraints.
5- [] shown "v7 · unsaved", "Draft v7", "v7 · current", say whether they are the same thing.
     -- tests: ≤1 of 6 stuck >30 s on "why can't I edit"; ≥5 of 6 predict the update correctly; median find-time <45 s at 60 bloks; ≥6 of 8 identify one state.
     -- review: Failures change EPIC-021a (grouping/collapse pulled into v1), EPIC-021b (affordance, copy), EPIC-041/055 (one vocabulary for version state).

#24 [x] EPIC-020 — core: blok model and compiler · M; The data model and compiler everything depends on
1- [x] Types `Blok { id, kind, content, order, ranges, manualOverride?, summary? }`, `CompiledSpan { blokId, text, hash, manual }`, `CompileResult`.
2- [x] `compile()` per kind, expected bloks emit no text, span hash = `sha256(kind + content + compilerVersion)`, cache passed in and returned.
3- [x] manual override emits verbatim and marks drift.
4- [x] `eject()` and `import()`.
5- [x] artifact schema v0.
     -- tests: One blok change → one span hash change; 100% cache hits on unchanged; import → compile → text identical; expected bloks absent from text.
     -- review: ADR-004 for artifact v0. No model call. No word "block" anywhere.

#25 [x] EPIC-021a — web: project, prompt, canvas · M; Create and arrange bloks, at scale, with a starting point
1- [x] Schema `prompts`, `bloks` (ranges JSONB), `prompt_versions` stub.
2- [x] project and prompt lists.
3- [x] canvas: add (kind picker), inline edit, reorder by drag and keyboard, delete, filter, count.
4- [x] **— replaced by empty states, 2026-09-14** (see below).
5- [x] grouping and collapse if EPIC-090 says so.
6- [x] autosave with conflict toast.
     -- tests: Playwright create/reorder/reload. Order integrity after delete. 60-blok fixture navigable within the EPIC-090 target.
     -- review: Matches mockup. Touch drag works. No blok logic outside `core`.

#26 [x] EPIC-021b — web: compiled pane, override, eject · M; The right half of the editor
1- [x] Compiled pane from `CompileResult.spans` with `data-b`, bidirectional hover/focus/pin, leading markers, screen-reader text naming the owning blok per span.
2- [x] per-span "Edit this text" → manual override.
3- [x] banner "Edited by hand · Update from blok".
4- [x] "edited by hand" badge on the card.
5- [x] eject with confirmation.
6- [x] token count and cost estimate from a dated price table.
7- [x] resizable split, keyboard.
     -- tests: Playwright override → banner → update. Eject yields one blok equal to compiled text. Linking both directions by keyboard.
     -- review: Pane read-only except the override path. Drift survives reload. Vocabulary from EPIC-090.

#27 [x] EPIC-022 — Variables · S; `{{placeholders}}` become a typed schema
1- [x] `extractVariables(bloks)`.
2- [x] Variables tab: optional flag, description, example value.
3- [x] warnings for undefined use.
4- [x] finding for unused declared.
     -- tests: Extraction fixture; rename updates schema; preview compile renders.
     -- review: Shape forward-compatible with the Stage 5 contract check.

## Stage 3 · Checks and runs, one provider

#28 [x] EPIC-030 — core: checks and deterministic graders · M; Expected bloks become executable checks with a stable result shape
1- [x] `Check { id, blokId, kind, params }` from expected bloks, for **the eight kinds in `CHECK_KINDS`** (`packages/core/src/compile/types.ts`) and no others.
2- [x] `grade()` pure.
3- [x] `RunResult`.
4- [x] suggestion engine for unmatched expected text. Display phrases are already fixed by ADR-003 and already implemented as `CHECK_KIND_PHRASES`.
5- [x] this epic uses them rather than inventing any.
     -- tests: 5 positive + 5 negative per grader; Northwind derivation fixture; evidence strings readable.
     -- review: No internal identifier is a display string.

#29 [x] EPIC-031 — worker: run engine, Anthropic · M; Runs execute safely in the background
1- [x] pg-boss queue.
2- [x] Anthropic adapter via AI SDK.
3- [x] raw response stored with a `purge_after` of 12 months and a purge job.
4- [x] cost from a dated price table.
5- [x] cache by `sha(compiled + input + model + params)`.
6- [x] budget enforcement.
7- [x] retries on 429/5xx.
8- [x] per-key concurrency.
9- [x] provider usage policy confirmed and linked in the report.
     -- tests: Mocked provider: 10 inputs → 10 results; re-run → 10 hits, 0 calls; cap blocks the 51st; retry on 429; purge job (clock test).
     -- review: Keys never logged. Price table sourced and dated. Worker survives a Postgres restart.

#30 [x] EPIC-032 — web: inputs, run, results, attribution · M; The Runs page, wired
1- [x] Input sets from CSV and manual rows.
2- [x] run trigger (Anthropic only).
3- [x] results by check with meters and pass/fail icons alongside colour.
4- [x] KPI strip.
5- [x] polling progress.
6- [x] failure detail with the failing region highlighted.
7- [x] attributed blok card.
8- [x] "Create constraint from this failure" opens a preview of the suggested blok text before it is added.
9- [x] run history.
     -- tests: Playwright end to end with mocked provider including the preview step. Progress without reload.
     -- review: A failure with no attributable blok is shown honestly.

#31 [x] EPIC-033 — LLM-judge grader · S; Expectations that need judgement, graded by a pinned model
1- [x] `judge` check kind.
2- [x] rubric derived from the expected blok.
3- [x] judge prompt in the worker (proprietary).
4- [x] pinned version in config.
5- [x] evidence includes the rationale.
     -- tests: Mocked judge fixtures; pinned version on every row.
     -- review: Judge prompt does not leak the expected answer. Judge cost shown separately.

#32 [x] EPIC-034 — Activation onboarding · S; Signup to first passing run in under five minutes, measured
1- [x] Post-signup path: pick a seeded prompt (three templates, one already has a failing check) → run → see failure → fix → pass.
2- [x] progress indicator.
3- [x] `run_passed` event with time-from-signup.
4- [x] dashboard panel.
5- [x] "activated" defined as the roadmap's own number — first passing run within five minutes of signup — since EPIC-005 is cut.
     -- tests: Playwright timed path under five minutes with mocked provider. Event carries elapsed time.
     -- review: Five real users observed; stalls recorded.

#33 [] EPIC-035 — Loud launch · S; Announce, now that a paste leads somewhere
1- [] Show HN.
2- [] Product Hunt.
3- [] one content piece from our own run data.
4- [] outreach to whoever Stage 1 and Stage 3 have attracted (EPIC-005's list of 20 engineers is cut and has no replacement source).
     -- tests: Signups by source on the dashboard.
     -- review: Provider terms re-read before any published comparison. Rate limits tightened for the day. Cloudflare cache on the landing page.

## Stage 4 · Versions and three providers

#34 [x] EPIC-040 — core + db: versions and semantic diff · M; A version is a snapshot of the blok set; diffs are semantic
1- [x] `prompt_versions` with snapshot, compiled text and hash, note, pass rate from the latest run.
2- [x] `diff(a, b)` → added, removed, changed, moved, byte delta.
3- [x] version on save and before run.
     -- tests: Diff fixtures per change type; moved ≠ removed + added.
     -- review: Snapshot size at 100 × 50 acceptable. One vocabulary for version state (EPIC-090 was to.

#35 [x] EPIC-041 — web: history, restore, A/B · S; The Versions page
1- [x] List with note, time, pass rate.
2- [x] diff panel.
3- [x] restore as a new version.
4- [x] A/B on one input set.
     -- tests: Playwright edit → save → diff → restore. A/B creates linked runs.
     -- review: Restore never deletes.

#36 [x] EPIC-043 — BYO-key threat model and breach runbook · S; User provider keys are protected on paper before one is stored
1- [x] Threat model for the key store on a single box: master-key custody, rotation, exfiltration, insider, backup exposure.
2- [x] libsodium sealed box with master key in Coolify env only.
3- [x] key never in logs, Sentry, PostHog.
4- [x] `infra/RUNBOOK.md` breach section with Law 25 and PIPEDA notification steps.
5- [x] UI guidance to scope and cap keys at the provider.
     -- tests: Encryption round-trip; log scrubbing test; backup dump contains ciphertext only.
     -- review: Soroush reads it. Every high finding has an epic.

#37 [x] EPIC-042 — Providers, BYO keys, heatmap · M; Three providers, user keys, input pivot
1- [x] OpenAI and Google adapters.
2- [x] price table extended.
3- [x] Settings → Providers with encrypted keys, toggle, test button.
4- [x] provider matrix.
5- [x] "By input" heatmap with focusable, labelled cells (`button` role, `aria-label` "input 17, fail"), keyboard navigation, and a shape difference in addition to colour.
6- [x] per-provider concurrency.
7- [x] provider usage policies confirmed.
     -- tests: Mocked three-provider run → matrix and heatmap; invalid key → clear error; keyboard reaches and opens a cell.
     -- review: Keys absent from every log sink. Heatmap readable at 500 inputs.

## Stage 5a · Delivery, minimum

#38 [x] EPIC-050 — core: build artifact v1, pointer, contract check · M; The public artifact format, frozen, and the compatibility rule
1- [x] `BuildArtifact v1` (content-addressed sha, compiled, spans, variables, model, params, check suite id).
2- [x] `LivePointer`.
3- [x] `isCompatible()` (added required, removed, type change = breaking).
4- [x] JSON Schema for both.
5- [x] ADR-005 declaring the format public and versioned.
     -- tests: Schema fixtures; compatibility matrix.
     -- review: Nothing internal leaks through the format.

#39 [x] EPIC-051 — API + storage: publish, undo, gate, audit · M; The server side of Publish
1- [x] `POST …/publish` runs the gate (checks on target model, contract check, cost delta), writes artifact to R2 with `immutable`, pointer with 30 s max-age, `publish_events`.
2- [x] "Publish anyway" requires a reason ≥10 chars, attributed.
3- [x] `POST …/undo`.
4- [x] admin-only switch.
5- [x] test/live keys hashed and project-scoped.
6- [x] `GET /v1/prompts`, `GET /v1/pointer/:id` redirect to CDN.
7- [x] "apps resolving" derived from CDN access logs, no client ping.
     -- tests: Pass → pointer moves; fail → 409 with reasons; anyway → recorded; undo → previous sha; wrong-scope key → 403; immutable headers via curl.
     -- review: Vocabulary: version, Live, Publish, Undo, Publish anyway. Nothing else.

#40 [x] EPIC-052 — sdk-ts `@41prompts/sdk` · M; The runtime library, three rules, telemetry off
1- [x] `resolve()` memory → disk → bundled → background network.
2- [x] never throws, `onWarning`.
3- [x] variable validation.
4- [x] jittered refresh with ETag.
5- [x] artifact sha verified against pointer.
6- [x] zero dependencies.
7- [x] telemetry off by default with a documented opt-in.
8- [x] README documents exactly what opt-in sends.
     -- tests: Offline returns bundled; stale serves old then refreshes; 1,000 concurrent → one fetch; never-throw fuzz; sha mismatch rejected.
     -- review: Bundle under 15 KB. Public API frozen (ADR-006).

#41 [x] EPIC-055 — web: Deploy, Connect (TypeScript), keys, publish flow · M; The delivery UI, TypeScript path only
1- [x] Deploy page (Live vs Draft, gate list with icons, Publish / Publish anyway / Undo, apps-resolving table from CDN logs, history).
2- [x] Connect page with TypeScript steps and generated-file preview.
3- [x] Settings API keys (shown once, rotate) and Publishing tabs.
4- [x] editor header pill and Publish button.
5- [x] Runs page blocked banner.
6- [x] no bare shas in copy.
     -- tests: Playwright: failing suite → disabled; anyway with reason → history; undo → Live reverts.
     -- review: Forbidden-word grep over UI strings passes. Neutral ink for "unsaved"; amber only for drift.

## Stage 5b · Delivery, full

#42 [x] EPIC-053 — cli `41p` · M; cli `41p`
1- [x] `link` (flag, `.41prc`, key scope, interactive, fail in CI).
2- [x] `pull` (typed `prompts.ts`/`.py` by prompt id, lockfile, bundled artifacts; header "This file is yours; 41Prompts claims no rights in it").
3- [x] `check`.
4- [x] `run`.
5- [x] `decompile <file>` (the open decompiler, no account).
6- [x] thin unscoped `41p` package wrapping `@41prompts/cli`.
     -- tests: Golden files TS + Python; stale lockfile detected; exit codes; `41p decompile` on the Northwind file yields the known findings.
     -- review: Generated code compiles under strict in a fresh project.

#43 [x] EPIC-054 — sdks/python · S; sdks/python
1- [x] `fortyone.resolve()` parity.
2- [x] standard-library HTTP, zero dependencies (tested via `importlib.metadata`).
3- [x] `.pyi`.
4- [x] PyPI trusted publishing.
5- [x] `41prompts` alias package.
     -- tests: Offline and stale tests; `mypy --strict` on generated bindings.
     -- review: Divergence table vs TypeScript.

#44 [x] EPIC-057 — SDK threat model · S; SDK threat model
1- [x] Key theft, pointer tampering, artifact substitution, replay, DoS on pointer endpoint, dependency confusion.
2- [x] mitigations mapped.
3- [x] one external review hour.
4- [x] findings triaged.
     -- tests: Rejected mismatched artifact; rate-limited pointer endpoint.
     -- review: Every high finding has an owner and an epic.

#45 [x] EPIC-056 — Open-source split · S; Open-source split
1- [x] Public repo via history-preserving filter (from EPIC-007's dry-run).
2- [x] Apache-2.0 + NOTICE + SPDX.
3- [x] `DCO` file, `CONTRIBUTING.md`, DCO app required.
4- [x] `TRADEMARKS.md`.
5- [x] `SECURITY.md`.
6- [x] READMEs with the three-step quickstart.
7- [x] npm and PyPI trusted publishing from the public repo only.
8- [x] IP assignment from founder to the legal entity executed before the first push.
9- [x] `dependency-review-action` in the mirror.
     -- tests: Fresh `npm install @41prompts/sdk` resolves a bundled artifact; mirror job idempotent; a proprietary import fails the dry-run.
     -- review: Licence headers present everywhere. Legal entity named in every LICENSE/NOTICE.

## Stage 6 · Billing and launch

#46 [x] EPIC-070 — Stripe · M; Stripe
1- [x] Products and prices as this roadmap names them ($29/$79 per seat, unvalidated — EPIC-005 is cut).
2- [x] checkout, portal, webhooks (idempotent).
3- [x] `run_budgets` by plan.
4- [x] BYO-key unlock on Pro.
5- [x] usage meter.
6- [x] dunning via Resend.
7- [x] refund path documented.
     -- tests: Webhook replay; downgrade at period end.
     -- review: Pricing page equals Stripe.

#47 [] EPIC-071 — Legal full · S — **deferred, 2026-09-14**; Legal full  **— DEFERRED**
1- [] Lawyer review of EPIC-017 documents.
2- [] Team DPA finalised.
3- [] provider terms re-checked for any published comparison.
4- [] trademark filing status confirmed (CIPO + USPTO, classes 9 and 42, Paris priority).
5- [] third-party notices page generated from the SBOM.
     -- tests: Retention jobs observed in production logs.
     -- review: Every lawyer "must" resolved or in backlog.

#48 [x] EPIC-072 — Marketing site final · M; Marketing site final
1- [x] Every page from the mockup.
2- [x] run demo, rotator, counters from real data.
3- [x] Ask-AI chips.
4- [x] `/legal/third-party-notices`.
5- [x] reduced-motion end states everywhere.
     -- tests: Lighthouse ≥ 90 all pages; links resolve; reduced motion verified.
     -- review: Every claim maps to a shipped epic.

#49 [] EPIC-073 — Launch 2 · S; Launch 2
1- [] Three content pieces from run data.
2- [] outreach to 30 teams paying for evals.
3- [] launch dashboard.
4- [] rollback plan for the single box.
     -- tests: Signups by source.
     -- review: Soroush approves every public artefact.

## Stage 7 · Lessons

#50 [] EPIC-064 — research: paper-prototype Lesson 02 · S; research: paper-prototype Lesson 02
1- [] Two newcomers on ICP teams walk a paper or Figma version of Lesson 02 (run 5×, temperature, first check).
2- [] record stalls.
3- [] decide format before any engine code.
     -- tests: Both complete in under ten minutes or the format changes.
     -- review: Findings written before EPIC-060 starts.

#51 [] EPIC-060 — Lesson engine · M; Lesson engine
1- [] YAML lesson format (bloks, steps, check, canned outputs).
2- [] step tracker.
3- [] preloaded workspace.
4- [] canned runs first, cheap tier with daily cap for live runs.
5- [] sandbox unlock.
     -- tests: Lesson loads with zero provider calls; cap enforced; state persists.
     -- review: Cost per completion under $0.01.

#52 [] EPIC-061 — Lessons 01–03 · M; Lessons 01–03
1- [] Content per EPIC-064's format.
2- [] run 5× demo.
3- [] temperature slider with `aria-valuetext`.
4- [] sandbox unlock.
     -- tests: Playwright completes each.
     -- review: Two more newcomers observed; fix before 062.

#53 [] EPIC-062 — Lessons 04–09 · M; Lessons 04–09
1- [] Constraints models ignore.
2- [] examples that help.
3- [] reading a failure.
4- [] regressions.
5- [] picking a model.
6- [] agents that behave.
     -- review: Each ends inside a real product surface.

#54 [] EPIC-063 — Companion pages · S; Companion pages
1- [] Static page per lesson.
2- [] `llms.txt` updated.
     -- review: Citable without the app.

## Shipped outside the roadmap

These have reports and are merged, but were added after `docs/roadmap.md` was written — the
mockup-parity programme (`docs/epics/plan-mockup-parity.md`), two follow-ups, and the two recurring
maintenance rows. Their scope lives in their own epic files and reports rather than in the roadmap,
so they are listed without task breakdowns.

#55 [x] EPIC-023 — App shell: a rail, a top bar, and nine destinations one click apart
     -- scope: `docs/epics/reports/EPIC-023-report.md`; stage: Stage 2 · Bloks and compiler.

#56 [x] EPIC-024 — App page composition — the pages laid out the way the mockup lays them out
     -- scope: `docs/epics/reports/EPIC-024-report.md`; stage: Stage 2 · Bloks and compiler.

#57 [x] EPIC-016b — The home page, in full
     -- scope: `docs/epics/reports/EPIC-016b-report.md`; stage: Stage 1 · Decompiler, soft-public.

#58 [x] EPIC-016c — The rotator, as the mockup draws it
     -- scope: `docs/epics/reports/EPIC-016c-report.md`; stage: Stage 1 · Decompiler, soft-public.

#59 [x] EPIC-016d — The landing page, everything that needs nothing else
     -- scope: `docs/epics/reports/EPIC-016d-report.md`; stage: Stage 1 · Decompiler, soft-public.

#60 [x] EPIC-072b — About and Careers, said honestly
     -- scope: `docs/epics/reports/EPIC-072b-report.md`; stage: Stage 6 · Billing and launch.

#61 [x] EPIC-074 — Managed Payments: Stripe is the merchant of record
     -- scope: `docs/epics/reports/EPIC-074-report.md`; stage: Stage 6 · Billing and launch.

#62 [x] EPIC-031a — The first real Anthropic call this project ever made
     -- scope: `docs/epics/reports/EPIC-031a-report.md`; stage: Stage 3 · Checks and runs.

#63 [x] EPIC-032a — Inputs typed in by hand, not only uploaded
     -- scope: `docs/epics/reports/EPIC-032a-report.md`; stage: Stage 3 · Checks and runs.

#64 [x] EPIC-011a-fixup — Two verbs missing from `constraint-output-verb`
     -- scope: `docs/epics/reports/EPIC-011a-fixup-report.md`; stage: Stage 1 · Decompiler, soft-public.

#65 [x] EPIC-900 — Tech-debt sweep and infra drill, every third sprint
     -- scope: `docs/epics/reports/EPIC-900-report.md`; stage: Ongoing.

#66 [x] EPIC-901 — Dependency, licence and security audit, monthly
     -- scope: `docs/epics/reports/EPIC-901-report.md`; stage: Ongoing.

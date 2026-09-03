# 41Prompts · Product roadmap

Version 1.0 · 2026-08-19 · Owner: Soroush (decisions), Claude (PM/CTO), Claude Code (build)

This is the working roadmap. `backlog.md` is the index; this document is the plan behind each line of it.
Every epic here has four parts: **Goal** (what becomes true), **Tasks** (what gets built, in order), **Tests**
(what proves it), **Review** (what a human checks before the epic closes). Every stage has an **exit state**:
the condition of the whole product when the stage is done, and the demo that proves it.

Stages ship in order. An epic may not start until its dependencies have a report in `docs/epics/reports/`.

---

## Milestones

| Milestone | Stage closes | The product can… | Proof |
|---|---|---|---|
| M0 Green build | 0 | Be deployed to staging and production from `main` with auth, DB, and monitoring in place | A logged-in page on `staging.41prompts.ai`, an error visible in Sentry |
| M1 Decompiler public | 1 | Take any pasted prompt and return labelled bloks with source spans and findings, with no signup | A stranger pastes a prompt at `41prompts.ai/decompile` and screenshots the result |
| M2 Editor | 2 | Build a prompt from bloks and compile it deterministically with manual overrides and drift | A prompt created from scratch, compiled, one block hand-edited, drift shown, reconciled |
| M3 First run | 3 | Run a prompt against inputs on one provider and attribute every failure to a blok | A failing cell clicked, the owning blok highlighted, a constraint created from it |
| M4 Three models | 4 | Compare versions and providers on the same suite with semantic diffs | v6 vs v7 A/B across GPT, Claude, Gemini with the heatmap |
| M5 SDK live | 5 | Deliver a prompt into a running app via a typed function and update it without a redeploy | A Node script prints a new prompt within 60 s of Publish, with the service stopped it still runs |
| M6 Lessons | 6 | Teach a newcomer nondeterminism and assertions inside the product | Lesson 02 completed by someone who has never used the app |
| M7 Revenue | 7 | Charge money, stay legal, and be found | First Stripe payment, terms live, Product Hunt listing |

---

## Stage 0 · Foundation

**Stage goal.** A repository, a pipeline, a database, a login, and a monitor. Nothing a user sees, everything a user
depends on.

**Exit state.** `main` deploys to staging on every merge and to production on tag. A user can create an account with
Google, GitHub, or email and land on an empty authenticated page. An intentional error appears in Sentry with a
stack trace. A PostHog event fires on login. Nightly database backup lands in R2 and a restore has been rehearsed once.

**Demo.** Sign in on staging, throw a test error, show it in Sentry, show the backup file in R2.

### EPIC-000 Repo scaffold · M

**Goal.** A green monorepo with the package boundaries from ADR-001 and CI enforcing them.

**Tasks.**
1. pnpm workspaces, Turborepo pipeline (`build`, `test`, `lint`, `typecheck`), Node 22 pinned.
2. Stub every package and app with one passing test each; `packages/core` has no DOM lib and no runtime deps.
3. Boundary rule: `core`, `cli`, `sdk-ts` cannot import `apps/*` or `packages/db`; lint fails on violation.
4. GitHub Actions `ci.yml`: install, lint, typecheck, test (TS + Python), pnpm cache.
5. PR template with the Definition of Done. Root README. Per-package MIT licences per ADR-002.
6. Copy `CLAUDE.md`, `docs/*` in; `docs/epics/CURRENT.md` points at the active epic.

**Tests.** Fresh-clone install and full test run pass. Boundary violation is caught by lint. Turborepo cache hits on second run. `41p --version` prints.

**Review.** Package names and layout match ADR-001 exactly. No package contains more than a stub. CI file is valid. Nothing was added "because it will be needed later".

### EPIC-001 Infrastructure · M

**Goal.** A Hetzner box running Coolify deploys the app and worker from GitHub with TLS, staging and production, and backups.

**Tasks.**
1. Provision Hetzner CX (Ubuntu 24), harden: SSH keys only, ufw, fail2ban, unattended upgrades.
2. Install Coolify. Connect the GitHub repo. Two environments: `staging` (deploys on push to `main`) and `production` (deploys on tag `v*`).
3. `infra/docker-compose.yml`: `postgres:16` with a named volume, `web`, `worker`. Healthchecks on all three.
4. DNS: `staging.41prompts.ai`, `app.41prompts.ai`, `41prompts.ai`. Coolify-managed TLS.
5. Cloudflare R2 bucket `41p-backups`. Nightly `pg_dump` to R2 via a Coolify scheduled task. Retention 30 days.
6. Secrets in Coolify env, never in the repo. `.env.example` lists every variable with a comment.
7. One restore drill: restore last night's dump into a scratch database, document the exact steps in `infra/RUNBOOK.md`.

**Tests.** `curl https://staging.41prompts.ai/healthz` returns 200 with git sha. Kill the web container; Coolify restarts it within 30 s. Restore drill completed and timed.

**Review.** Runbook is readable by someone who has never seen the box. No secret in git history (`gitleaks` run once). Production tag deploy tested with a no-op tag.

### EPIC-002 Data layer and auth · M

**Goal.** Users exist in our own Postgres, sign in with Google, GitHub, or email, and protected routes are protected.

**Tasks.**
1. Drizzle baseline schema: `users`, `sessions`, `accounts` (Better Auth tables), `projects`, `project_members` (owner only for v1), `api_keys` (empty for now).
2. Migrations wired: `pnpm db:generate`, `pnpm db:migrate`, run on deploy.
3. Better Auth with Google, GitHub, magic-link email via Resend. Session cookie, CSRF, secure flags.
4. Route protection: `/app/*` requires session; `/` and `/decompile` do not.
5. Account page: name, email, sign-out, delete account (soft delete + scheduled purge).
6. Seed script for local dev: one user, one project.

**Tests.** Playwright: sign up with email, receive magic link (mailpit locally), land on `/app`. Unauthenticated `/app` redirects. Delete account removes session and marks user. Migration up/down round-trips.

**Review.** No user data in a third party. Cookie flags correct in production. Email templates use the Resolution tokens, not defaults.

### EPIC-003 Design system · M

**Goal.** The Resolution tokens and the base components exist in `packages/ui`, used by the web app, in light and dark.

**Tasks.**
1. `tokens.css`: every variable from `docs/design/41prompts-full-mockup.html` `:root` and `[data-theme=dark]` as Tailwind v4 `@theme`.
2. Components: `Button` (primary, ghost, sm), `Pill`, `Badge` (pass/fail/warn/neutral), `Tag` (blok kinds), `BlokCard`, `Table`, `KpiStrip`, `Sheet`, `Switch`, `Input`, `Textarea`, `Tabs`, `Callout`.
3. Motion primitives: `reveal`, `pop`, `flash`, all honouring `prefers-reduced-motion`.
4. Theme provider: system default, manual toggle, persisted in cookie (not localStorage; SSR-safe).
5. Storybook-lite: one `/dev/ui` route in the web app rendering every component in both themes (staging only).
6. Accessibility pass: focus rings, 4.5:1 on all text-on-fill pairs, keyboard on every interactive component.

**Tests.** Visual regression via Playwright screenshots of `/dev/ui` in light and dark (stored as baseline). Contrast check script over token pairs passes. Every component has a keyboard test.

**Review.** Compare `/dev/ui` side by side with the mockups. Any colour outside the token file is rejected. Green, red, amber appear only in semantic components.

### EPIC-004 Observability and guardrails · S

**Goal.** We can see errors, usage, and cost before a user tells us, and no user can run up an unbounded bill.

**Tasks.**
1. Sentry in web and worker with release tagging by git sha; source maps uploaded in CI.
2. PostHog: identify on login; events `signup`, `login`, `decompile_run`, `project_created`. Event names in `packages/core/src/analytics/events.ts` so they are typed.
3. Structured JSON logs (pino) with request id; Coolify log retention 14 days.
4. Uptime check on `/healthz` for staging and production (Better Stack free tier), alert to email.
5. `run_budgets` table: per user, monthly run cap and cost cap, defaults for free tier. Enforcement hook stubbed for the worker.

**Tests.** Throw in a route → appears in Sentry with correct release. Event visible in PostHog within a minute. Budget table unit-tested for increment and cap.

**Review.** No PII in logs. Alert actually reaches Soroush's phone. Event list matches the funnel we intend to measure in Stage 1.

---

## Stage 1 · Decompiler, shipped publicly

**Stage goal.** The free tool. The one piece with no competitor and no run cost, live before anything else exists.

**Exit state.** `41prompts.ai/decompile` is public. Anyone pastes a prompt and gets labelled, multi-range bloks mapped to
source with hover linking, plus diagnostics. A permalink can be shared. A "create project" button leads to signup.
The landing page replaces the placeholder. `llms.txt` and a companion article are indexed. PostHog shows the funnel
paste → view → share → signup.

**Demo.** Paste the messy Northwind prompt on production, hover the JSON-only blok, three fragments light up, contradiction finding visible, share the link, open it in a private window.

### EPIC-010 core: deterministic segmenter · M

**Goal.** Any text is cut into segments with exact character offsets, identically every time.

**Tasks.**
1. `segment(text) → Segment[]` with `{ text, start, end }`. Rules in order: fenced code blocks and XML tags are atomic; blank-line paragraphs; numbered and bulleted list items; sentence split only for paragraphs over N chars; markdown headings are separators, not segments.
2. Offsets computed by scanning, never by `indexOf` on trimmed strings.
3. Fixture corpus: 25 real-world prompts (collected, anonymised) with expected segments checked in as JSON.
4. Property test: concatenating `text.slice(start,end)` for all segments plus the gaps reproduces the input byte for byte.
5. Unicode: CRLF, tabs, emoji, RTL text in fixtures.

**Tests.** Fixture snapshot tests. Property test over 1,000 generated inputs. Idempotence: segmenting the joined segments yields the same segments.

**Review.** Rule order is documented in the module header. No regex with catastrophic backtracking (run a 1 MB input under 200 ms).

### EPIC-011 core: classifier, clustering, summariser interface · M

**Goal.** Segments become bloks with a kind, and fragments of the same rule across the prompt become one multi-range blok.

**Tasks.**
1. `classify(segment) → BlokKind` via ordered heuristics; unit table of 60 labelled examples.
2. `cluster(segments) → Blok[]` where `Blok.ranges: Range[]`; merge on topic key or normalised-token overlap ≥ 0.6 with same kind. Deterministic order.
3. `Summariser` interface: `summarise(blok) → string`, with a heuristic implementation in core and a model-backed implementation in the worker (cached by blok content hash). Core never calls a model.
4. Topic keys as data (`topics.json`), not code, so they can be extended without a release.

**Tests.** Classifier accuracy ≥ 90% on the labelled table. Clustering fixture: the Northwind prompt yields exactly the expected multi-range bloks. Determinism: 100 runs, identical output.

**Review.** No model call reachable from `packages/core`. Topic keys reviewed for false merges (e.g. "format" merging unrelated rules).

### EPIC-012 core: diagnostics · M

**Goal.** The four bugs that hide in long prompts are found and named with the bloks they involve.

**Tasks.**
1. `diagnose(bloks) → Finding[]` with `{ severity, code, title, body, blokIds }`.
2. Detectors: `repeated_instruction`, `contradiction` (negated blok vs positive blok sharing a format keyword), `untestable_language` (vocabulary list as data), `politeness_padding`, `blok_too_long`, `rules_without_assertions`.
3. Severity policy documented. Findings sorted high → low, then by position.
4. Each finding carries a one-line suggested fix.

**Tests.** One fixture per detector with a positive and a negative case. Northwind prompt yields the known 7 findings. No finding on a clean 3-blok prompt.

**Review.** False-positive rate on the 25-prompt corpus under 10% by manual inspection. Wording of every finding readable by a junior developer.

### EPIC-013 web: public /decompile · M

**Goal.** The decompiler is usable in a browser with no account, matching `docs/design/41prompts-decompiler.html`.

**Tasks.**
1. Route `/decompile`: textarea, sample loader, Decompile button; results render from `core` on the server (route handler), summaries fetched async from the worker and filled in as they arrive.
2. Source map view with `<span>` per range, `data-b`, `data-k`; bidirectional hover and focus; leading colour marker; pin on click; dim-the-rest toggle.
3. Blok list with kind tag, summary, span count, flags. Findings panel; hovering a finding highlights its bloks.
4. Stats strip: bloks, spans, fragmented, findings.
5. Mobile: panes stack; source map above bloks; markers still visible.

**Tests.** Playwright: paste sample → bloks appear → hover blok 3 → three spans highlighted → click finding → correct bloks highlighted. Axe accessibility scan passes. Lighthouse performance ≥ 90 on the page.

**Review.** Pixel comparison against the mockup in both themes. Summaries arriving late do not shift layout. Ink inversion is the highlight; no yellow.

### EPIC-014 Capture · S

**Goal.** A decompile can be shared, abuse is bounded, and the path into signup exists.

**Tasks.**
1. `decompiles` table: id, source hash, source text (encrypted at rest), result JSON, created_at, optional user_id. Permalink `/d/{id}`.
2. Rate limit: 20 decompiles per IP per hour anonymous; unlimited signed in. Max input 20k characters.
3. "Create project from these bloks" → signup → project created with bloks pre-populated (writes to `projects` + a stub `prompts` row; editor comes in Stage 2, so the project page shows the bloks read-only with "Editor coming soon").
4. Turnstile on the anonymous form.

**Tests.** Rate limit returns 429 on the 21st request. Permalink loads in a private window. Signup from a decompile lands in a project containing the bloks.

**Review.** Source text retention policy written (delete anonymous decompiles after 30 days). Nothing on the permalink leaks another user's data.

### EPIC-016 Landing page v1 · M

**Goal.** A real front door for the decompiler launch, replacing the placeholder.

**Tasks.**
1. Nav, hero with headline, ask bar with grounded handoff sheet, suggestion chips, three-step strip, decompiler CTA, footer.
2. Hero window performs the compile-pass animation once on load; Replay button.
3. Sign-in and sign-up pages (auth chrome hidden), wired to EPIC-002.
4. OpenGraph image, favicon (static plate), `robots.txt`, sitemap.
5. Theme toggle in nav.

**Tests.** Playwright: home renders, ask sheet opens with prefilled brief, sign-up flow completes. Lighthouse ≥ 90 on all four categories. Reduced-motion snapshot shows end states.

**Review.** Copy proofread. No claim on the page the product cannot do yet (no mention of runs, delivery, or lessons beyond "coming"). Handoff deep links tested on all four destinations this week.

### EPIC-015 Ship it · S

**Goal.** The decompiler is discoverable by people and by models.

**Tasks.**
1. `/llms.txt` and `/llms-full.txt` describing the product and the decompiler.
2. Companion article: "Your prompt has a contradiction on line 40", with three real anonymised examples from the corpus.
3. PostHog funnel: `decompile_view → decompile_run → decompile_share → signup`. Dashboard saved.
4. Launch post drafted for Hacker News (Show HN) and one dev community; scheduled, not fired, until Soroush approves.
5. Search Console verified; sitemap submitted.

**Tests.** Funnel shows events end to end from a manual walkthrough. `llms.txt` validates.

**Review.** Soroush reads and approves every public sentence. Nothing in the launch post promises Stage 2+ features.

---

## Stage 2 · Bloks and compiler

**Stage goal.** The editor. A prompt is a set of bloks, compiled deterministically, with the manual-override and drift
mechanics that make it trustworthy.

**Exit state.** A signed-in user creates a project and a prompt, adds bloks of every kind, sees the compiled prompt
update block by block, hand-edits one block, sees drift, reconciles, and can eject to raw text. A prompt imported
from the decompiler opens in the editor with every blok marked manual and verbatim. Variables are extracted and typed.

**Demo.** Import Northwind, open in editor, hover blok ↔ span, add a constraint blok, watch exactly one block change, hand-edit block 4, see the drift banner, reconcile.

### EPIC-020 core: blok model and compiler · M

**Goal.** The data model and the compiler that everything else depends on, frozen enough to build on.

**Tasks.**
1. Types: `Blok { id, kind, content, order, ranges, manualOverride?, summary? }`, `CompiledBlock { blokId, text, hash, manual }`, `CompileResult { text, blocks, spans }`.
2. `compile(bloks, opts) → CompileResult`: per-blok template by kind; expected bloks produce no text; block hash = `sha256(kind + content + compilerVersion)`; cache map passed in and returned.
3. Manual override: if `blok.manualOverride` is set, emit it verbatim and mark `manual: true`; `drift = hash(content-derived) !== hash(last compiled)`.
4. `eject(result) → string` and `import(text) → Blok[]` using the decompiler with every blok `manualOverride = verbatim span`.
5. Artifact schema v0 (internal, not yet public): JSON with bloks, compiled text, spans, variable schema placeholder, compiler version.

**Tests.** Changing one blok changes exactly one block hash. Cache hit rate 100% on unchanged bloks. Import → compile → text equals the original byte for byte. Expected bloks never appear in compiled text.

**Review.** ADR-003 written for the artifact schema. Compiler templates reviewed for provider-neutral wording. No model call.

### EPIC-021a web: project, prompt, canvas · M

**Goal.** Users can create and arrange bloks in the canvas from the mockup.

**Tasks.**
1. Schema: `prompts`, `bloks` (with `ranges` JSONB), `prompt_versions` stub.
2. Project list page (cards), prompt list within a project, new prompt.
3. Canvas: add blok (kind picker), inline edit, reorder by drag and keyboard, delete, type filter, blok count.
4. Autosave with optimistic UI and conflict guard (last-write-wins with a toast for v1).

**Tests.** Playwright: create prompt, add three bloks, reorder with keyboard, reload, order persists. Unit: order integrity after delete.

**Review.** Matches mockup canvas. Drag works on touch. No blok logic in the web app beyond calling `core`.

### EPIC-021b web: compiled pane, linking, override, eject · M

**Goal.** The right half of the Blok Editor: the read-only compiled prompt with the mechanics from the spec.

**Tasks.**
1. Compiled pane rendering `CompileResult.spans` with `data-b`; bidirectional hover and focus with the canvas; leading markers.
2. "Edit this block" per block → manual override; banner with Reconcile; drift badge on the blok card.
3. Eject to text: confirmation, one-way, prompt becomes a single manual blok.
4. Token count and per-run cost estimate (tokeniser from the AI SDK, cost table as data).
5. Resizable split pane with keyboard.

**Tests.** Playwright: override block 4, banner appears, reconcile clears it. Eject produces one blok whose content equals the compiled text. Hover linking works both directions.

**Review.** The compiled pane is truly read-only except through the override path. Drift state survives reload.

### EPIC-022 Variables · S

**Goal.** `{{placeholders}}` in bloks become a typed variable schema.

**Tasks.**
1. `extractVariables(bloks) → VariableSchema` in core: name, inferred type (string default), required, first-seen blok.
2. Variables tab in the editor: list, mark optional, add description, set example value.
3. Validation: undefined variable used in a blok is a warning; unused declared variable is a finding.

**Tests.** Extraction fixture. Rename a variable in a blok → schema updates. Preview compile with example values renders.

**Review.** Schema shape is forward-compatible with the SDK contract in Stage 5 (reviewed against the delivery spec).

---

## Stage 3 · Assertions and runs, one provider

**Stage goal.** The eval loop with attribution, on Anthropic only, so correctness is proven before breadth.

**Exit state.** A user adds expected bloks, uploads inputs, runs the suite, sees results by assertion, clicks a failure,
sees the output, sees the owning blok highlighted, and creates a constraint from the failure. Runs are cached,
costed, capped, and their raw payloads stored.

**Demo.** Run Northwind on 20 inputs, watch the schema assertion fail, click the failure, blok 6 lights, create constraint, re-run, watch it pass.

### EPIC-030 core: assertions and deterministic graders · M

**Goal.** Expected bloks become executable checks with a stable result shape.

**Tasks.**
1. `Assertion { id, blokId, kind, params }` derived from expected bloks by pattern: `json_schema`, `contains`, `not_contains`, `regex`, `max_words`, `max_chars`, `enum_field`, `refusal`.
2. `grade(assertion, output) → { pass, evidence }` pure functions.
3. Result schema: `RunResult { runId, inputId, model, output, raw, latencyMs, costUsd, grades[] }`.
4. Suggestion engine: for an expected blok whose text does not match a pattern, suggest the nearest assertion kind.

**Tests.** Each grader: 5 positive, 5 negative. Derivation fixture from the Northwind expected bloks. Evidence strings are human-readable.

**Review.** Assertion kinds cover the mockup's examples. Result schema reviewed for forward compatibility with the heatmap and version diff.

### EPIC-031 worker: run engine, Anthropic · M

**Goal.** Runs execute in the background, safely, with caching and caps.

**Tasks.**
1. pg-boss queue `runs`; job = one (prompt build, input, model, params). Fan-out from a `run` row.
2. Anthropic adapter via AI SDK; raw response stored; latency and cost computed from a versioned price table.
3. Cache: key `sha(compiled + input + model + params)`; hit skips the call and marks `cached`.
4. Budget enforcement from `run_budgets`; job rejected with a user-visible reason when over cap.
5. Retry policy: 3 attempts with backoff on 429/5xx; permanent failure recorded, never silently dropped.
6. Concurrency limit per provider key.

**Tests.** Integration test with a mocked provider: 10 inputs → 10 results; re-run → 10 cache hits, zero calls. Budget cap blocks the 51st run. Retry on simulated 429.

**Review.** Keys never logged. Cost table has a source and a date. Worker survives a Postgres restart.

### EPIC-032 web: inputs, run, results, attribution · M

**Goal.** The Runs page from the mockup, wired to real runs.

**Tasks.**
1. Input sets: CSV upload mapped to variables; manual rows; sample set.
2. Run trigger with provider/model/param picker (Anthropic only, others greyed with "Stage 4").
3. Results by assertion table with meters; KPI strip; live progress via polling.
4. Failure detail: output with the failing region highlighted where the grader gives a range; attributed blok card; "Create constraint blok from this failure" pre-filled with the grader's suggestion.
5. Run history list per prompt.

**Tests.** Playwright end to end with mocked provider: upload CSV, run, see failure, create constraint, blok appears in canvas. Progress updates without reload.

**Review.** Matches mockup. A failure with no attributable blok (e.g. provider error) is shown honestly, not hidden.

### EPIC-033 LLM-judge grader · S

**Goal.** Expectations that cannot be checked deterministically are graded by a pinned judge model.

**Tasks.**
1. `judge` assertion kind with a rubric derived from the expected blok text.
2. Judge model pinned by exact version string in config; changing it requires a new run, never a re-grade.
3. Judge calls go through the worker with the same caching and budget.
4. Evidence includes the judge's one-line rationale.

**Tests.** Mocked judge: rubric passes/fails as expected. Pinned version appears in every result row.

**Review.** Judge prompt reviewed for leakage of the expected answer. Cost of judge runs shown separately in the KPI strip.

---

## Stage 4 · Versions and three providers

**Stage goal.** History and breadth. The product becomes a comparison tool.

**Exit state.** Every save is a version. Versions show semantic diff and pass rate. Two versions run A/B on one suite.
OpenAI and Google are live with BYO keys. Results pivot by assertion or by input with a heatmap.

**Demo.** v6 vs v7 across three providers; heatmap shows where Gemini fails; restore v6.

### EPIC-040 core + db: versions and semantic diff · M

**Goal.** A version is a snapshot of the blok set, and diffs are semantic.

**Tasks.**
1. `prompt_versions`: number, blok snapshot JSONB, compiled text, compiled hash, created_by, note, pass rate (nullable).
2. `diff(a, b) → SemanticDiff` in core: added, removed, changed, moved bloks; compiled byte delta; block-level identical count.
3. Version created on every explicit save and before every run.

**Tests.** Diff fixtures for each change type. Moving a blok yields `moved`, not `removed + added`.

**Review.** Snapshot size acceptable at 100 versions × 50 bloks. Diff wording matches the mockup.

### EPIC-041 web: history, restore, A/B · S

**Goal.** The Versions page from the mockup.

**Tasks.**
1. Version list with note, time, pass rate; current highlighted.
2. Semantic diff panel; compiled delta line.
3. Restore (creates a new version equal to the old one; never rewrites history).
4. A/B: pick two versions, run both on one input set, side-by-side pass rates.

**Tests.** Playwright: edit, save, see diff, restore, see new version. A/B run creates two run rows linked by an `ab_group`.

**Review.** Restore never deletes. A/B results readable at a glance.

### EPIC-042 Providers: OpenAI, Google, BYO keys, heatmap · M

**Goal.** Three providers, user keys, and the input pivot.

**Tasks.**
1. OpenAI and Google adapters via AI SDK; price table extended.
2. Settings → Providers: BYO keys encrypted at rest (libsodium sealed box, key in env), toggle per provider, test button.
3. Provider matrix in results (columns per model).
4. "By input" pivot with heatmap; cell hover shows input id and status; click opens failure detail.
5. Per-provider concurrency and rate-limit handling.

**Tests.** Mocked three-provider run yields a 3-column matrix and a 40×N heatmap. Key encryption round-trip. Invalid key surfaces a clear error on the test button.

**Review.** Keys never appear in logs, Sentry, or PostHog. Heatmap readable at 500 inputs (virtualised if needed).

---

## Stage 5 · Delivery

**Stage goal.** The prompt leaves the platform and lives in the user's app, updatable without a redeploy, gated by tests.

**Exit state.** `npx 41p pull` generates typed bindings. A Node app calls `refundClassifier({ email })` and gets the
Live prompt, cached, with a bundled fallback. Publishing to Live is blocked when assertions fail on the target model;
override requires a reason and is audited. Undo is instant. The SDK and CLI are public under MIT.

**Demo.** Stop the 41Prompts service; the demo app still answers. Start it, publish v7, the app changes within 60 s. Publish a failing version, watch it block.

### EPIC-050 core: build artifact v1, pointer, contract check · M

**Goal.** The public artifact format and the compatibility rule, frozen.

**Tasks.**
1. `BuildArtifact v1`: `{ version: 1, promptId, sha, compiled, blocks[], variables: VariableSchema, model, params, assertionSuiteId, createdAt }`. Content-addressed `sha`.
2. `LabelPointer`: `{ sha, updatedAt, variableSchemaVersion, minSdk }`.
3. `isCompatible(artifact, liveContracts[]) → { ok, breaking[] }`: a required variable added, a variable removed, or a type changed is breaking.
4. JSON Schema published for both; schema tests.
5. ADR-004: artifact format is public and versioned; changes require a major.

**Tests.** Schema validation fixtures. Compatibility matrix tests (add optional: ok; add required: breaking; remove: breaking).

**Review.** Format reviewed against the SDK resolve order and the CLI codegen needs. Nothing in it references internal ids that could leak.

### EPIC-051 API + storage: publish, undo, gate, audit · M

**Goal.** The server side of Publish.

**Tasks.**
1. `POST /api/prompts/:id/publish`: runs the gate (assertion suite on target model, contract check, cost delta), writes artifact to R2 with `Cache-Control: immutable`, writes pointer with `max-age=30`, records `publish_events`.
2. Override path: requires `reason` (min 10 chars), records actor and reason, flagged in history.
3. `POST /undo`: repoints to previous sha; audited.
4. Admin-only publishing switch per project. Test/Live API keys: `fp_test_`, `fp_live_`, hashed at rest, scoped to project.
5. `GET /v1/prompts` (for `41p pull`) and `GET /v1/pointer/:promptId` (for the SDK), both served from R2 via CDN URL redirect, never from the app server.

**Tests.** Integration: publish with passing suite → pointer updated; failing suite → 409 with reasons; override → recorded; undo → previous sha. Keys hashed; wrong-scope key → 403.

**Review.** Threat review with EPIC-057. Immutable headers verified with curl. Pointer TTL measured.

### EPIC-052 sdk-ts: resolve() · M

**Goal.** The runtime library, obeying the three rules.

**Tasks.**
1. `resolve(promptId, vars) → Message`: memory cache → disk cache (`~/.41p/cache` or `/tmp` fallback) → bundled artifact (from `pull`) → network in background.
2. Never throws: any failure returns the best available version and emits an `onWarning` callback.
3. Variable validation against the artifact's schema; missing required → warning + best-effort render.
4. Background refresh with jittered interval; ETag on pointer fetch.
5. Telemetry ping (opt-out): SDK version, schema version, prompt id, no user data.

**Tests.** Offline test: no network, bundled artifact → returns. Stale pointer → serves old, refreshes later. 1,000 concurrent `resolve` calls → one network fetch. Never-throw fuzz test.

**Review.** Bundle size under 15 KB. Zero dependencies. Public API reviewed and frozen (ADR-005).

### EPIC-053 cli: 41p · M

**Goal.** The developer's four commands.

**Tasks.**
1. `41p link`: picks project (flag, `.41prc`, key scope, interactive, or fail in CI).
2. `41p pull`: fetches prompt list, writes `prompts.ts` (and `.py` if requested) with typed functions by prompt id, writes `.41p/lock.json` and bundled artifacts.
3. `41p check`: fails if bindings are stale or code references undeclared variables (TS: type-level; Python: static scan).
4. `41p run`: executes the assertion suite via the API and prints a table; non-zero exit on failure.
5. Generated file headers, `// Do not edit`, stable ordering for clean diffs.

**Tests.** Golden-file tests for generated TS and Python. `check` detects a stale lockfile. `run` exit codes.

**Review.** Generated code compiles under `strict` in a fresh project. Error messages readable by a junior developer.

### EPIC-054 sdks/python · S

**Goal.** Parity with sdk-ts.

**Tasks.**
1. `fortyone.resolve()` with the same cache chain and never-throw behaviour.
2. Type hints and `.pyi` for generated bindings.
3. PyPI publish via GitHub Actions on tag; package `fortyone-prompts`, import `fortyone`.

**Tests.** Same offline and stale tests as TS. `mypy --strict` on generated bindings.

**Review.** Behaviour diff table TS vs Python; any divergence documented.

### EPIC-055 web: Deploy, Connect, keys, publish flow · M

**Goal.** The delivery UI from the mockup.

**Tasks.**
1. Deploy page: Live vs Draft, gate checklist, publish button state, override with reason, apps-calling table (from telemetry), publish history.
2. Connect page: four steps, language tabs, generated file preview, prompt id table, copy buttons.
3. Settings: API keys tab (create, copy once, rotate), Publishing tab (admin-only switch, require-passing switch).
4. Editor header pill and Publish button; Runs page blocked-publish banner.

**Tests.** Playwright: failing suite → publish disabled; override with reason → history row; undo → Live reverts. Keys shown once.

**Review.** Vocabulary check: no "label", "pointer", "artifact", "promote" anywhere in the UI. Matches mockup.

### EPIC-056 Open-source split · S

**Goal.** The MIT packages are public.

**Tasks.**
1. Public repo `41prompts/41prompts` mirrored from `packages/core`, `packages/cli`, `packages/sdk-ts`, `sdks/python` via a CI job on tag.
2. READMEs with the three-step quickstart; CONTRIBUTING; issue templates.
3. npm publish `@41prompts/sdk`, `@41prompts/cli`, `@41prompts/core`; PyPI `fortyone-prompts`.

**Tests.** Fresh `npm install @41prompts/sdk` in an empty project resolves a bundled artifact. Mirror job idempotent.

**Review.** Licence headers present. No proprietary import crossed the boundary (dependency-cruiser report attached).

### EPIC-057 SDK threat model · S

**Goal.** The delivery path has been attacked on paper before it is attacked in practice.

**Tasks.**
1. Threat model doc: key theft, pointer tampering, artifact substitution, replay, DoS on pointer endpoint, dependency confusion.
2. Mitigations: artifact sha verified by SDK against pointer; keys hashed; pointer endpoint behind CDN with rate limits; npm/PyPI names reserved.
3. One external review hour (a security-minded developer), findings triaged into the backlog.

**Tests.** SDK rejects an artifact whose sha does not match the pointer.

**Review.** Soroush reads the threat model. Every high finding has an owner and an epic.

---

## Stage 6 · Lessons

**Stage goal.** The product teaches. Newcomers who are building something and failing learn the concepts by using it.

**Exit state.** Nine lessons run inside the app on cached canned runs with a cheap-model tier and daily caps. Each has a companion text page.

**Demo.** A friend who has never used the app completes Lesson 02 in under ten minutes without help.

### EPIC-060 Lesson engine · M
**Goal.** Lessons are data, not code.
**Tasks.** Lesson definition format (YAML: bloks, steps, expected assertion, canned outputs); step tracker; lesson workspace loads a preloaded prompt; canned runs served first, live runs on the cheap tier with a per-user daily cap; sandbox unlock at the end.
**Tests.** Lesson loads with zero provider calls. Cap enforced. Step state persists.
**Review.** Cost per lesson completion under $0.01 on average.

### EPIC-061 Lessons 01–03 · M
**Goal.** The first three lessons from the design, live.
**Tasks.** Content for What a model does, Same prompt five answers (run 5×, temperature), Your first expectation. UI per mockup.
**Tests.** Playwright completes each lesson. Copy proofread.
**Review.** Test with two real newcomers; record where they stall; fix before 062.

### EPIC-062 Lessons 04–09 · M
**Goal.** The rest of the foundations track.
**Tasks.** Constraints models ignore; Examples that help; Reading a failure; Regressions; Picking a model; Agents that behave (single chain of two prompts).
**Tests.** Same as 061.
**Review.** Each lesson ends inside a real product surface, not on a course page.

### EPIC-063 Companion pages · S
**Goal.** Every lesson has an indexed text twin.
**Tasks.** Static page per lesson; `llms.txt` updated; internal links.
**Tests.** Pages render, sitemap includes them.
**Review.** Text is citable on its own without the app.

---

## Stage 7 · Billing and launch

**Stage goal.** Money, legality, and distribution.

**Exit state.** Free, Pro, Team plans enforce limits. Terms and privacy are live and reviewed. The full marketing site is up. Launch executed with three content pieces.

**Demo.** First paid invoice. Product Hunt page. A blog post citing our own run data.

### EPIC-070 Stripe · M
**Goal.** Plans exist and are enforced.
**Tasks.** Stripe products for Free/Pro/Team; checkout, portal, webhooks; `run_budgets` driven by plan; BYO-key unlock on Pro; usage meter in the sidebar; dunning emails via Resend.
**Tests.** Webhook replay idempotent. Downgrade reduces caps at period end, not immediately.
**Review.** Pricing page numbers match Stripe. Refund path documented.

### EPIC-071 Legal · S
**Goal.** We can take money without exposure we know about.
**Tasks.** Terms, privacy, cookie choice (privacy-preserving default); provider ToS review for eval use and data retention; DPA template; one lawyer hour; retention policy implemented for decompiles and run payloads.
**Tests.** Retention job deletes on schedule (integration test with clock).
**Review.** Lawyer's notes attached; every "must" resolved or in backlog.

### EPIC-072 Marketing site final · M
**Goal.** The full site from the mockup.
**Tasks.** Features, Delivery, Pricing, Learn, Docs, About, Security, Changelog, Blog, Guides, Careers, Contact; run demo, capability rotator, counters wired to real numbers; Ask-AI chips on feature sections.
**Tests.** Lighthouse ≥ 90 all pages. All internal links resolve. Reduced motion verified.
**Review.** Every claim on the site maps to a shipped epic. Counters read from real data, never hard-coded.

### EPIC-073 Launch · S
**Goal.** People find it.
**Tasks.** Product Hunt listing; Show HN; three content pieces from our own run data ("200 prompts, 3 models, here is what broke"); outreach list of 30 teams already paying for evals; launch-week PostHog dashboard.
**Tests.** Dashboard shows signups by source.
**Review.** Soroush approves every public artefact. A rollback plan exists if traffic overwhelms the single box (Cloudflare cache on the landing page, decompiler rate limits tightened).

---

## Ongoing

**EPIC-900 Tech debt sweep** every third sprint: delete dead code, upgrade deps, re-run the boundary report, re-read CLAUDE.md for accuracy.

**EPIC-901 Security audit** monthly: `pnpm audit`, `pip-audit`, gitleaks, dependency review, key rotation check.

---

## Review checklist used at every epic close

1. Acceptance criteria all checked with evidence in the report.
2. `pnpm lint && pnpm typecheck && pnpm test` green in CI, not just locally.
3. No logic that belongs in `packages/core` appeared in `apps/*`.
4. No new colour outside tokens; no green/red/amber outside semantics.
5. No forbidden vocabulary in UI strings.
6. CLAUDE.md still true.
7. Backlog status updated; next epic written.

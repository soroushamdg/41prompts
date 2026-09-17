<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-051: publish, the gate that blocks it, and the storage it writes to
Stage: 5a · Depends on: EPIC-050, EPIC-042 · Size: M

**Written by Claude Code in the advisor's chair**, 2026-09-17, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 to EPIC-043 and EPIC-050 set. The Goal, Tasks, Tests and Review
lines below are `docs/roadmap.md`'s, unchanged; everything else is this file's reading of them.

**This is the epic that makes EPIC-050's frozen artifact a thing that exists.** Until now nothing
outside a test has ever constructed one.

## Goal

Today a prompt lives in `bloks`, is frozen into `prompt_versions`, and is proved by `suite_runs`.
Nothing can leave the building. After this epic a person can **move a version to Live** — which
assembles the v1 artifact, runs a gate that refuses when the checks fail on the target model or when
the change breaks the callers already in the field, writes the artifact to immutable storage, moves
the Live marker, and records who did it and why — and a program holding a project-scoped key can
**read what is Live** over HTTP without a session.

## The roadmap's four lines, verbatim

> **Goal.** The server side of Publish.
> **Tasks.** `POST …/publish` runs the gate (checks on target model, contract check, cost delta),
> writes artifact to R2 with `immutable`, pointer with 30 s max-age, `publish_events`; "Publish
> anyway" requires a reason ≥10 chars, attributed; `POST …/undo`; admin-only switch; test/live keys
> hashed and project-scoped; `GET /v1/prompts`, `GET /v1/pointer/:id` redirect to CDN; "apps
> resolving" derived from CDN access logs, no client ping.
> **Tests.** Pass → pointer moves; fail → 409 with reasons; anyway → recorded; undo → previous sha;
> wrong-scope key → 403; immutable headers via curl.
> **Review.** Vocabulary: version, Live, Publish, Undo, Publish anyway. Nothing else.

## Scope

- **The gate, as pure logic in `packages/core`.** `publishGate()` in a new `packages/core/src/publish/`
  — not in `artifact/`, which is frozen. Four rows, two of which block: the checks on the target
  model, and `isCompatible(live, next)`. Cost delta and the blok diff summary are reported and never
  block. `CLAUDE.md` rule 1: logic that must be correct lives in core with tests, and "may this go
  live" is the one decision in this product that must be correct.
- **`publish_events`** — the audit log, and the **only** record of what is Live. One row per
  `published`, `published_anyway` and `undone`; the newest row for a prompt names the Live artifact.
- **Artifact storage behind one interface**, with two drivers: the database (development, tests, and
  any deployment with no bucket configured) and **R2** with `Cache-Control: public, max-age=31536000,
  immutable` on artifacts and `max-age=30` on markers. Keys are prefixed by `DEPLOY_ENV` so staging
  and production cannot write over each other — the mistake `EPIC-006d` exists to fix for backups.
- **`POST /api/prompts/:promptId/publish`** and **`POST /api/prompts/:promptId/undo`**, session
  authenticated, origin-checked. 200 on success, **409 with every gate reason** when blocked.
- **"Publish anyway"** — the same endpoint with a typed reason of at least 10 characters, recorded
  against the actor and the gate verdict it went past. `CLAUDE.md` rule 9.
- **Undo**, which moves Live back to the previously published artifact and records why.
- **The admin-only switch**, `projects.adminOnlyPublish`, defaulting on, enforced on both endpoints.
- **Project-scoped keys with an environment.** `api_keys.environment` is `test` or `live`; the
  plaintext is `41p_test_…` / `41p_live_…`, hashed as it already is.
- **`GET /v1/prompts`** and **`GET /v1/marker/:promptId`** — key authenticated, scoped to the key's
  own project, 403 for anything else. The marker route redirects to the artifact store's public URL.
- **`GET /v1/blob/:key`** — how the database driver serves bytes, with the same cache headers the R2
  objects carry, so the header assertion is a real HTTP response and not a unit test about a string.

## Out of scope

- **The Deploy page, the Connect page, the API-keys tab, the Publishing tab, the editor's Publish
  button.** Every one of them is EPIC-055's task line, verbatim. This epic ships no component and no
  page. It is the EPIC-030 shape and its report says so in a numbered section.
- **"Apps resolving", and the table that shows it.** The roadmap's own words are *"derived from CDN
  access logs, no client ping"* — and **there is no CDN**. Cloudflare in front of an R2 bucket is
  Soroush's to configure, and until it exists there are no logs to derive anything from. Building a
  client ping instead would be building the thing the roadmap names as the wrong answer. Reported as
  a human-blocked step, not faked. GATE 5's demand measure reads this number, so it matters that it
  is honest rather than early.
- **The mockup's second Publishing switch, "Require passing checks".** See ruling 4.
- **Signing an artifact, or any answer to integrity beyond the content address.** ADR-005 §6 defers
  it to EPIC-057's threat model, and a scheme chosen here would be chosen without it.
- **Serving the two JSON Schema documents** at the `$id`s ADR-005 gave them. See ruling 6.
- **Rate limiting `/v1`.** There is no traffic and no CDN in front of it. EPIC-055 or later.
- **Anything about billing, plans or usage metering on a published prompt.** EPIC-070.

## Rulings taken in the advisor's chair

Each of these is logged in `docs/decisions/AUTONOMOUS.md`.

### 1. The route is `/v1/marker/:promptId`, not `/v1/pointer/:id`

Identical to EPIC-050's ruling 1 and for the identical reason. `CLAUDE.md`'s Vocabulary section
forbids **pointer** in "UI strings, schema, or code identifiers" with no "(UI only)" qualifier, and a
URL path in a public API is the most permanent string this product will ever publish — it outlives
every identifier in the codebase, because an installed SDK keeps requesting it. The type is already
`LiveMarker`; the path follows it.

`:promptId` rather than `:id` because the thing being named is a prompt and there are four kinds of
id in this system.

### 2. Live is **derived** from the audit log, not stored beside it

There is no `prompts.liveBuildHash` column. What is Live is *the newest `publish_events` row for this
prompt*, and an undo is a new row rather than an edit to an old one.

The alternative — a column, kept in step — is a second place for one fact, which is the argument
`prompt_versions` already makes for having no `passRate` column and `suite_runs.comparison` makes for
being a shared key rather than a self-reference. Here it is worse than usual: the two copies
disagreeing means **the audit log says one thing was published and the CDN serves another**, and the
audit log is the thing a customer is asked to trust.

The cost is one `order by created_at desc limit 1` per read, against an indexed `(prompt, created_at)`.

### 3. An undo requires a reason, on the same ≥10 rule as "Publish anyway"

The roadmap attaches the rule only to "Publish anyway". The mockup's publish history shows a
rollback row carrying one — *"Rolled back · v5 · Rambod A. · latency spike on Gemini"* — and
`CLAUDE.md` says the mockups are the spec when product behaviour is unclear.

The reason it is the right answer rather than merely the sourced one: an undo moves Live for every
app in the field, without a deploy, and it happens during an incident. *"Why did Live move"* at 3 a.m.
is precisely what this log exists to answer, and it is the one moment nobody will write it down
voluntarily.

### 4. The mockup's "Require passing checks" switch is not built

The mockup's Settings → Publishing has two switches. **"Only admins can publish" is in the roadmap's
task line and is built.** "Require passing checks" is not in the task line, and building it would
give a project an off-switch for `CLAUDE.md` rule 9 — the rule that publishing to Live is blocked
when checks fail, and that going past it needs a typed reason and an audit entry.

An account-wide switch that silently disables the gate is not the same feature as a per-publish
exception that names a person and a reason. The first makes the product's central sentence — *"it
cannot go live if it breaks your tests"* — false for that account, permanently and invisibly. The
second is what rule 9 already sanctions. So: no switch; "Publish anyway" is the whole of the escape
hatch.

### 5. Publish and undo are route handlers, not server actions

Every other mutation in `apps/web` is a server action. These two are `POST` route handlers, for three
reasons:

1. **The roadmap names them as endpoints** — `POST …/publish`, `POST …/undo`.
2. **A server action has no caller until EPIC-055 exists**, and a server action cannot be invoked
   without the page that carries its id. That would leave this epic's central behaviour reachable
   only from a unit test — which is the "twenty epics green while the deployed page was unstyled"
   shape, and the browser-drive rule exists because of it. A route handler can be driven against the
   **built** app with the session cookie a real sign-in produced.
3. **409 is in the roadmap's test list.** A server action returns a value, not a status.

They are origin-checked, because a cookie-authenticated POST that is not is a CSRF hole.

### 6. The JSON Schema documents are not served here

EPIC-050's report §11.7 hands EPIC-051 the question of where `ARTIFACT_JSON_SCHEMA`'s and
`LIVE_MARKER_JSON_SCHEMA`'s `$id`s — `https://41prompts.ai/schema/…` — are served from. The answer is
**not yet, and not from this epic**: that host is the marketing site, whose final shape is EPIC-072,
and a schema document is a permanent public URL that should be published once, in the place it will
stay. Serving it from `app.` today and moving it later would break exactly the readers it exists for.
Recorded in the report as still open.

### 7. The store's keys carry the environment, and the R2 driver has never seen a bucket

Keys are `<DEPLOY_ENV>/artifacts/<buildHash>.json` and `<DEPLOY_ENV>/markers/<promptId>.json`.
`docs/backlog.md`'s EPIC-006d row is the whole argument: staging and production already share one R2
bucket and one prefix for Postgres dumps, and *"neither environment's backups are distinguishable,
isolated, or safe from the other's prune"*. Starting a second object class the same way would be
repeating a known defect on purpose.

**The R2 driver is written, and it has never talked to Cloudflare**, because no artifact bucket
exists and creating one is Soroush's step. It is proved against a fake S3 endpoint in-process — a
real HTTP round trip through the real client, asserting method, key, body bytes and cache header.
What that cannot prove is Cloudflare's own behaviour, and the report says so rather than implying a
bucket was written to.

### 8. `@aws-sdk/client-s3` is a new dependency in `apps/web`

The one new dependency, and the reason is the mirror image of EPIC-050's. There, SHA-256 was written
out by hand because `packages/core` may have no dependency at all *and* because FIPS 180-4 publishes
vectors to prove an implementation against. Neither holds here: `apps/web` is proprietary and already
carries fifteen dependencies, and hand-rolling **AWS SigV4** — a signing algorithm — with no
published vectors on hand would mean a security-critical implementation whose only test is itself.

`ADR-001` already names R2 as the object store. Apache-2.0, warned-not-blocked by `license-gate`
because `apps/web` is not a public package.

### 9. `test` and `live` keys differ in one recorded way, and it is the one that will matter

Both resolve the Live marker. A **test** key's resolutions are recorded as test traffic and are never
counted as a production app. That is not cosmetic: GATE 5's demand measure is *"the number of distinct
production apps resolving from the CDN"*, and a CI job that resolves a prompt on every push would
otherwise be indistinguishable from a customer shipping one.

The counting itself needs the CDN logs that do not exist. What this epic owes is that the **key**
carries the distinction, so that when the logs arrive the fact is already there to join on rather than
being backfilled by guesswork.

## Acceptance criteria

- [ ] **C1.** `publishGate()` blocks when the checks did not all pass on the target model, blocks when
      `isCompatible` reports any break, and passes when a prompt has no checks at all — which is a
      real and normal case, not an exception. Verified: `packages/core/src/publish/gate.test.ts`.
- [ ] **C2.** `publishGate()` never blocks on cost, and reports a cost delta as drift; it reports the
      blok diff summary and never blocks on it. Verified: `gate.test.ts`.
- [ ] **C3.** A version whose checks exist but were **never run on the target model** is blocked with
      a row that says so, distinct from the row for a run that failed. "Not proved" and "disproved"
      are different facts and a gate that conflates them is a gate that can be satisfied by not
      testing. Verified: `gate.test.ts`.
- [ ] **C4.** Publishing a passing version writes the artifact bytes `artifactBytes()` produced, under
      the key its `buildHash` names, and moves the Live marker to it. Verified:
      `apps/web/lib/deploy/publish.test.ts`.
- [ ] **C5.** Publishing a blocked version returns **409** with every gate reason, writes **nothing**
      to storage and **no** `publish_events` row. A refusal that leaves a partial write is a refusal
      that lied. Verified: `publish.test.ts`.
- [ ] **C6.** "Publish anyway" with a reason of at least 10 characters succeeds, records
      `published_anyway`, the reason, the actor and the gate verdict it went past. A reason under 10
      characters is refused, and so is a reason that is only whitespace. Verified: `publish.test.ts`.
- [ ] **C7.** Undo moves Live to the **previously published artifact's `buildHash`**, writes an
      `undone` row with its reason, and refuses when there is nothing to undo to. Verified:
      `publish.test.ts`.
- [ ] **C8.** Both endpoints refuse a request from another user's project as **404, not 403** — the
      house rule, because 403 confirms the id exists — and refuse a cross-origin POST. Verified:
      `apps/web/e2e/publish.spec.ts`.
- [ ] **C9.** `GET /v1/prompts` with a project's key lists that project's prompts and their Live
      version, and a key belonging to another project sees **403**. Verified: `publish.spec.ts`.
- [ ] **C10.** `GET /v1/marker/:promptId` redirects to the artifact store's public URL for that
      prompt's Live marker, and 404s for a prompt that has never been published. Verified:
      `publish.spec.ts`.
- [ ] **C11.** An artifact response carries `Cache-Control: public, max-age=31536000, immutable` and a
      marker response carries `max-age=30`, **measured on a real HTTP response** from the built app.
      Verified: the drive's curl output, in the report.
- [ ] **C12.** The R2 driver sends a `PUT` to the bucket with the artifact's exact bytes, the
      environment-prefixed key and the immutable cache header, proved against a fake S3 endpoint over
      a real socket. Verified: `apps/web/lib/deploy/r2-store.test.ts`.
- [ ] **C13.** Publishing a version whose stored `compiledText` no longer equals a fresh compile of
      its own snapshot is **refused**, naming the compiler version that moved. An artifact's proof is
      a run against text; if the text a fresh compile produces is not the text that was proved, the
      proof is about something else. Verified: `publish.test.ts`.
- [ ] **C14.** A stored artifact round-trips: the bytes read back from the store re-derive the
      `buildHash` they were stored under, through `buildHashOf()` and not through a second
      serialiser. Verified: `publish.test.ts`.
- [ ] **C15.** `adminOnlyPublish` is enforced on both endpoints. With no team model there is exactly
      one member and they are the admin, so this cannot refuse anybody yet — the test asserts the
      check runs and the report says plainly what it cannot yet prove.
- [ ] **C16.** `pnpm forbidden-words` passes, and no user-visible string or code identifier added by
      this epic uses **block** (the noun), **pointer**, **promote**, **override**, **sha**,
      **reconcile** or **drifted**. The mockup's "Override with a reason" becomes "Publish anyway".
- [ ] **C17.** `pnpm test`, `pnpm typecheck`, `pnpm lint` green with every package reporting, and
      `node scripts/gates.mjs ci` green on the commit.
- [ ] **C18.** The built app is started, a fresh throwaway user signs in, creates a project, a prompt
      and its bloks **through the product's own UI**, and the publish endpoints are driven from that
      page's own session. Screenshots in `docs/epics/reports/screenshots/EPIC-051/`.

## Verification

```
pnpm --filter @41prompts/core test
pnpm --filter @41prompts/db test
pnpm --filter @41prompts/web test
node scripts/gate-run.mjs
npx tsx scripts/drive-epic-051.mts     # against the BUILT app, see its header
```

The browser drive: this epic ships no page and no component, so the **visual** half is the EPIC-030
shape and the report says so. What it does ship is behaviour a real session reaches over HTTP, so the
drive signs in as a fresh `claude-drive-…@example.com`, builds the prompt through the canvas, and
calls `/api/prompts/:id/publish` from inside the page — which carries the real cookie, through the
real built server, exactly as EPIC-055's button will.

## Notes for the implementer

- **`packages/core/src/artifact/schema.ts` is on the never-touch list and this epic has no instruction
  to change it.** Everything here is a *caller* of it. If something seems to need a field the artifact
  does not have, that is a v2 and an ADR, not an edit.
- **`artifactBytes()` is what is stored and `buildHashOf()` is what verifies it.** Do not serialise an
  artifact anywhere else, in either direction. A second copy of "how an artifact is serialised" fails
  by making verification quietly always pass — ADR-005's own words.
- **The artifact is built from a `prompt_versions` row**, not from the live `bloks` table. Publishing
  what is on screen rather than what was proved is the whole failure this gate exists to prevent.
  `readSnapshotBloks` is the reader.
- **Every absence assertion needs a positive control.** Three of them went wrong in EPIC-050 and one
  was a false negative. "Nothing was written to storage" must be proved by a test that can see a write
  when there is one.
- **Do not seed the drive's data.** Create the project, the prompt and the bloks by clicking, per
  `docs/AUTONOMOUS.md`. The one thing with no UI yet is an API key — EPIC-055 owns that tab — so the
  drive mints one directly and the report says which step was not driven through the product.
- **`apps/web/e2e/env.mjs` holds the placeholders `next start` needs.** Do not write a fourth copy.

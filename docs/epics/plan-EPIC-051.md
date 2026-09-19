<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-051: publish, the gate that blocks it, and the storage it writes to

Written before any code, per `CLAUDE.md`'s "Plan first" and `docs/AUTONOMOUS.md` step 2.
Branch: `epic/051-publish-api-storage`.

## What already exists, checked rather than remembered

| thing | where | state |
|---|---|---|
| `artifactOf`, `artifactBytes`, `buildHashOf`, `liveMarkerOf` | `packages/core/src/artifact/schema.ts` | frozen, never-touch, **no caller outside its own tests** |
| `isCompatible` | `packages/core/src/artifact/compatibility.ts` | four break kinds, returns every break |
| `diff` | `packages/core/src/version/diff.ts` | added / removed / changed / moved |
| `readSnapshotBloks`, `compile` | core | the version → `PromptBlok[]` → `compile()` path, already used by `abAction` |
| `prompt_versions` | `packages/db` | `snapshot`, `compiledText`, `compiledHash`, `n`, `pinnedAt` |
| `suite_runs` / `suite_checks` / `suite_results` | `packages/db` | `model`, `version`, `state`, `costCents`, `totalInputs`; outcomes `pass`/`fail`/`not_graded` |
| `api_keys` | `packages/db` | project-scoped, `hashedKey` (SHA-256), `lastFour`, `revokedAt`. **No environment column.** |
| `projects` | `packages/db` | `owner`, `name`, `slug`. **No publishing settings.** |
| R2 | `infra/backup.sh` only | shell + `aws` CLI. **Nothing in app code has ever spoken to R2.** |

So: nothing to reuse for storage, and everything to reuse for the gate's inputs.

## The build, in order

### 1. `packages/core/src/publish/` — the gate, pure

`gate.ts`, `types.ts`, `gate.test.ts`. No IO, no dependency, zero knowledge of Postgres.

```ts
type GateRowKind = "checks" | "contract" | "cost" | "diff";
type GateVerdict = "pass" | "fail" | "drift" | "info";
type GateReason =
  | "nothing_to_prove" | "not_proved_on_target_model" | "nothing_could_be_graded" | "checks_failed" | "checks_passed"
  | "no_live_callers" | "contract_compatible" | "contract_broken"
  | "cost_unknown" | "cost_unchanged" | "cost_moved"
  | "no_live_to_compare" | "blok_diff";
interface GateRow { kind; verdict; reason; blocking: boolean; detail: …; }
interface GateReport { rows: readonly GateRow[]; blocked: boolean; }
```

Only `checks` and `contract` carry `blocking: true`. `blocked` is `rows.some(r => r.blocking && r.verdict === "fail")`.

**Reasons are codes, never sentences.** `apps/web` owns the words, the same split `CheckKind` →
`CHECK_KIND_PHRASES` already makes, and it keeps ADR-003's vocabulary grep pointed at one place.

The checks row's input is a small discriminated union rather than four loose numbers, because the
three states it must tell apart — *nothing to prove*, *not proved*, *proved and failed* — are
different facts and any encoding that can express "0 of 0 passed" for two of them is an encoding that
will eventually conflate them (C3).

### 2. `packages/db` — three schema changes and one new module

- `publish_events`: `id` (`pub_` + 8 hex), `prompt`, `version` (FK, `set null`), `buildHash`,
  `kind` (`published` | `published_anyway` | `undone`), `actor` (FK users, `set null`), `reason`,
  `gate` (jsonb — the verdict this went past or satisfied), `createdAt`. Index `(prompt, created_at)`.
- `published_artifacts`: `key` PK, `contentType`, `cacheControl`, `body` (text), `createdAt` — the
  database driver's bytes. Write-once: an insert that conflicts on an identical body is a no-op, and
  one that conflicts on a **different** body throws, because an immutable key that changed content is
  a corruption, not a retry.
- `projects.admin_only_publish` boolean, default true.
- `api_keys.environment` text, default `'live'` — existing rows are live keys, which is what they were.
- `publishes.ts`: `recordPublishEvent`, `liveFor(prompt)`, `publishHistory(prompt)`,
  `previousLiveFor(prompt)`, `liveForPrompts(prompts[])`, and the artifact store's row functions.
- `api-keys.ts`: `KEY_ENVIRONMENTS`, `newApiKeyPlaintext(env)`, `apiKeyByPlaintext(db, plaintext)`.

One migration via `pnpm db:generate`.

### 3. `apps/web/lib/deploy/`

- `store.ts` — `ArtifactStore { put(key, body, cacheControl), get(key), publicUrl(key) }`,
  `ARTIFACT_CACHE_CONTROL`, `MARKER_CACHE_CONTROL`, `artifactKey()`, `markerKey()`, `storeFor()`.
- `database-store.ts` — rows in `published_artifacts`, public URL `/v1/blob/<key>`.
- `r2-store.ts` — `@aws-sdk/client-s3`, `PutObjectCommand` with `CacheControl`, public URL
  `ARTIFACT_CDN_URL + '/' + key`. Used only when every `R2_*` value is present.
- `build.ts` — `artifactForVersion(db, prompt, version)`: snapshot → `PromptBlok[]` → `compile()` →
  refuse if `compiled.text !== version.compiledText` (C13) → `artifactOf({…})`.
- `gate.ts` — gathers the facts (`checksStateFor`, `costFor`, `diffAgainstLive`) and calls core.
- `publish.ts` — `publishVersion`, `undoPublish`. Storage write, then the event row. In that order,
  because an artifact in storage that nothing names is harmless and an event naming bytes that are
  not there is a broken Live.
- `api-auth.ts` — `projectForKey(request)`, returning the project and environment or a refusal.
- `origin.ts` — same-origin check for the two POSTs.

### 4. Routes

| route | auth | returns |
|---|---|---|
| `POST /api/prompts/[promptId]/publish` | session + origin | 200 `{ live }` · 409 `{ blocked, rows }` · 404 · 400 |
| `POST /api/prompts/[promptId]/undo` | session + origin | 200 · 409 · 404 · 400 |
| `GET /v1/prompts` | key | `{ prompts: [{ id, name, live }] }` |
| `GET /v1/marker/[promptId]` | key | 302 to the marker's public URL · 404 · 403 |
| `GET /v1/blob/[...key]` | none | the bytes, with the stored cache header |

### 5. Tests

- `packages/core/src/publish/gate.test.ts` — the whole matrix, including C1–C3.
- `packages/db/src/publishes.test.ts` — the event log, the derived Live, write-once storage rows.
- `apps/web/lib/deploy/publish.test.ts` — C4–C7, C13, C14, against a real database.
- `apps/web/lib/deploy/r2-store.test.ts` — a fake S3 endpoint on a real socket (C12).
- `apps/web/e2e/publish.spec.ts` — C8–C10 through the built app.

### 6. The drive

`scripts/drive-epic-051.mts`. Fresh `claude-drive-051-<ts>@example.com`, project → prompt → bloks
through the UI, then `fetch('/api/prompts/…/publish')` **from inside the page** so the real cookie
and the real origin are used. Mints a key directly (no UI until EPIC-055) and curls `/v1`.

## Risks, named before they happen

1. **The gate needs a finished run on the target model, and the drive has no provider key.** A run
   needs a provider. So the drive's prompt has **no expected bloks**, which makes its checks row
   `nothing_to_prove` — a real and normal case (C1) and the one a drive can actually reach. The
   failing path is proved by `publish.test.ts` against seeded rows, and the report says which half
   the drive covered.
2. **`@aws-sdk/client-s3` is large.** Server-only, one import site, behind `storeFor()`. If it drags
   the web build past anything noticeable, the fallback is a hand-rolled SigV4 and that trade gets
   re-argued in the report rather than silently.
3. **`compiledText` equality (C13) may fail on existing rows** if `COMPILER_VERSION` has moved since
   they were written. That is the check doing its job; the drive creates its own version, so it will
   not hit it, and the message names the two compiler versions.
4. **`next start` needs `apps/web/e2e/env.mjs`'s placeholders.** Third time this has cost somebody an
   hour (`HANDOVER.md` lesson 3).

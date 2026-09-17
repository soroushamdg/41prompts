<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-055: Deploy, Connect, keys, and the publish flow a person can actually reach

Branch `epic/055-delivery-ui`. Epic file: `docs/epics/EPIC-055-delivery-ui.md`.

Written before any code, per `CLAUDE.md`'s "Plan first". Unattended, "show the plan" means write it
down (`docs/AUTONOMOUS.md` step 2).

## The shape of the work

EPIC-051 and EPIC-052 left this epic almost nothing to decide about behaviour. The gate exists and
returns codes; `gateBody` in `lib/deploy/words.ts` already carries a comment saying it is "the shape
a route returns and EPIC-055's page renders"; `createApiKey` already says "EPIC-055's Settings tab
shows it once and then shows `last_four` for ever". **So this is mostly rendering, and the risk is
not in the logic — it is in rendering something that does not exist** (the CDN table), in writing a
second copy of something that does exist (the gate, the README's snippets), and in the drive.

Five surfaces, in dependency order. Each commits on its own.

## 1. `packages/db` — revoke, and rotate as two rows

`api_keys` has `revoked_at`; nothing writes it. Ruling 6 makes rotation revoke-and-mint.

- `revokeApiKey(db, { project, keyId }): Promise<boolean>` — scoped by project so a key is
  unreachable except through a project that resolved, the rule `variables.ts` and `canvas.ts` state.
  Returns whether a row moved, so "already revoked" is an answer rather than an error.
- `rotateApiKey(db, { project, keyId })` — one transaction: revoke the old, mint a new with the same
  `name` and `environment`. Returns `{ key, plaintext }` like `createApiKey`, plus the revoked row.
- Tests: the old plaintext stops resolving through `apiKeyForPlaintext` while the new one starts; the
  old row keeps its `created_at` and `last_used_at`; rotating a key of another project does nothing;
  rotating twice leaves three rows. **The "stops resolving" assertion gets a positive control** — the
  same lookup is proved to succeed before the rotation.

## 2. `apps/web/lib/deploy` — one gate evaluation, two callers

`publishVersion` today: resolve prompt → permission → version → reason length → compile → checks →
assemble → read Live → gate → **pin → commit**. Everything before the pin is a pure read.

Split at that line (ruling 5):

```ts
export interface PublishPreview {
  version: VersionRow; checks: ChecksState; artifact: Artifact;
  report: GateReport; live: PublishEventRow | null; liveArtifact: Artifact | null;
}
export async function previewPublish(request): Promise<
  { ok: true; value: PublishPreview } | { ok: false; refusal: PublishRefusal }>
```

`publishVersion` becomes `previewPublish` plus the blocked branch, the pin and the commit. **No
behaviour changes**; `publish.test.ts`'s existing assertions are the regression test that it did not.

New test (C6): on a version the gate blocks, `previewPublish().report.blocked` is true **and** the
POST answers 409 with the same row verdicts. Compared field by field, not by both being truthy.

## 3. `apps/web/lib/connect` — the generated file, as a pure function

`generatedPromptsFile({ prompts })` → the text of `prompts.ts`. Pure, in `lib/`, unit-tested, no DOM
and no query: the page hands it rows and renders the string.

- One exported function per prompt, named from the prompt's name in camelCase, with the id inline.
- The input type is the declared variables; a variable with a default is `?:`.
- A prompt whose name does not yield a usable identifier gets a stable fallback, and the test pins
  the cases: leading digit, punctuation only, a duplicate after normalisation, an empty list.
- The header says a person copied it, not that a tool wrote it (ruling 3).

`connectSteps()` returns the four steps' code, and `connect-readme.test.ts` asserts each snippet
appears in `packages/sdk-ts/README.md`. **Positive control**: the test mutates one snippet in memory
and asserts the matcher then fails.

## 4. `packages/ui` — three stylesheets

`deploy.css`, `connect.css`, `settings.css`, imported from `styles.css`. Tokens only; nothing new in
`tokens.css`.

Two rules this epic can break and must not:

- **Rule 10.** The gate's verdicts carry a glyph and a word as well as a colour. `runs.css` already
  does this for pass/fail and the heatmap does it with a hatch; the gate rows follow that.
- **Amber is drift only.** The cost row and the diff row are **neutral ink**, not amber, whatever the
  mockup's badges do — `docs/design/README.md`'s colour correction is explicit and this is exactly
  the page it was written about.

## 5. `apps/web/app` — the pages

| route | what |
|---|---|
| `app/app/settings/layout.tsx` | the navigation, `nav` + `aria-current="page"`, no `role="tab"` (ruling 1) |
| `app/app/settings/keys/page.tsx` | mint, list, rotate, revoke. Plaintext shown once (C10) |
| `app/app/settings/publishing/page.tsx` | the admin-only switch, and the sentence about rule 9 (ruling 7) |
| `app/app/pr/[promptId]/deploy/page.tsx` | Live/Draft, gate rows, Publish/anyway/Undo, history |
| `app/app/p/[projectId]/connect/page.tsx` | four steps, the project's prompts, the generated file |
| `app/app/pr/[promptId]/page.tsx` | header: `Draft vN` / `Live vM` + Publish (C14) |
| `app/app/pr/[promptId]/runs/page.tsx` | the blocked banner (C15) |

Server components do the queries; a client component per page holds only the buttons that call
actions, the way `versions-view.tsx` does.

**The keys page is account-level and keys are project-scoped**, so it lists every project the person
owns with its keys beneath. Naming the project on every key is the point: a key resolves prompts in
one project, and a list that did not say which would be a list of interchangeable secrets.

**Publish, Publish anyway and Undo go to the existing route handlers**, not to new server actions.
They exist, they are origin-checked, they return 409 with the gate — and EPIC-051 ruling 5 chose them
deliberately. The client component `fetch`es them and reloads.

## 6. The correction (ruling 9)

`scripts/binary-files.mjs`: `ROOTS` becomes `["packages", "apps", "docs", "sdks", "scripts"]`. Remove
the two NUL bytes from EPIC-052's report and session log. Add a test that **plants** a NUL-bearing
file under a new root and asserts the gate fails — an absence assertion needs a control, and "the
gate passes" is one.

## 7. Tests

| file | covers |
|---|---|
| `packages/db/src/api-keys.test.ts` | revoke, rotate, the two rows (C11) |
| `apps/web/lib/deploy/publish.test.ts` | `previewPublish` agrees with the POST (C6) |
| `apps/web/lib/connect/*.test.ts` | the generated file's shape and its edge cases |
| `apps/web/lib/connect/connect-readme.test.ts` | snippets pinned to the README, with a control (C8) |
| `apps/web/e2e/deploy.spec.ts` | C1–C5, C14, C17, C18 |
| `apps/web/e2e/connect.spec.ts` | C7, C9 |
| `apps/web/e2e/api-keys.spec.ts` | C10, C11 |
| `apps/web/e2e/settings-nav.spec.ts` | C13, with the control |
| `apps/web/e2e/runs-blocked.spec.ts` | C15, both directions |
| `scripts/binary-files.test.mjs` (or in `apps/web`) | C19, the planted file |

**No helper in a new spec reloads the page** unless it says in a comment what it waits for and what
it could hide (`PROCESS.md`). The Deploy page's actions do reload — that is what the route handlers
force — so each spec asserts on a condition after it, never on a duration.

## 8. The drive — `scripts/drive-epic-055.mts`

Against the built app. `turbo run build --filter=@41prompts/web`, `next start`, `BUILD_ID` checked in
the HTML before anything is asserted (lesson 17).

1. `delete from users where email like 'claude-drive-%@example.com'` first, then a fresh
   `claude-drive-055-<timestamp>@example.com` through the magic-link flow.
2. Create a project, a prompt, and its bloks **by clicking** — including one `expected` blok so there
   is a check to fail, and one variable so the SDK call binds something.
3. Runs page: run it. Provider key through `verifyProviderKeyOrFake`, as the last three drives did.
4. Deploy: the gate blocks; screenshot the disabled Publish and what it says.
5. Publish anyway with a reason; screenshot the history row.
6. Undo with a reason; screenshot Live reverting.
7. Publish properly after fixing the prompt so the checks pass.
8. **Settings → API keys: mint a live key through the page**, copy the plaintext once, reload and
   confirm only the last four is there.
9. A separate Node process, the built `@41prompts/sdk`, that key: `resolve()` returns the compiled
   text with the variable bound. Then stop the server and resolve again.
10. 390px and dark for every page; cleanup at the end.

## Order and commits

1. `db`: revoke + rotate, with tests.
2. `lib`: `previewPublish`, `connect`, their tests.
3. `ui`: the three stylesheets.
4. `app`: settings layout + keys + publishing.
5. `app`: Deploy, Connect, the editor header, the Runs banner.
6. The e2e specs.
7. The correction (ruling 9).
8. The drive, its screenshots, the report and the session log.

Then `node scripts/gate-run.mjs` on the commit, `git merge --no-ff` into local `main`, tick the row.
**Nothing is pushed.**

## What could go wrong, named in advance

- **The gate never blocks in the drive.** A prompt with no checks returns `no_checks`, which is
  `nothing_to_prove` — reporting, not blocking. The drive needs a real failing run, which means a
  real `expected` blok and a run that grades it false. If that proves flaky, the fallback is a
  deterministic check (a "must contain" the answer will not contain), not a fake.
- **`previewPublish` and the POST disagree because the draft moved between them.** They read the
  newest version and the page is a moment earlier than the button. That is correct behaviour, not a
  bug, and the page states the version it is talking about so the disagreement is visible rather
  than silent.
- **Splitting `publishVersion` changes behaviour by accident.** `publish.test.ts` is large and is the
  control; it runs before and after the split and must not change.
- **The settings navigation ends up with `role="tab"` from a copied component.** C13 asserts the
  absence, with a control proving the probe can find the role when it is there.

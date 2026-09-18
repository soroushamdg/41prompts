<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-055: Deploy, Connect, keys, and the publish flow a person can actually reach
Stage: 5a · Depends on: EPIC-051, EPIC-052 · Size: M

**Written by Claude Code in the advisor's chair**, 2026-09-17, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 to EPIC-043, EPIC-050, EPIC-051 and EPIC-052 set. The Goal,
Tasks, Tests and Review lines below are `docs/roadmap.md`'s, unchanged; everything else is this
file's reading of them.

**This is the epic where publishing stops being an endpoint.** EPIC-051 built the gate, the audit log
and `POST /api/prompts/:id/publish`; EPIC-052 built the library that reads the result. Nothing a
person can click has ever moved a prompt to Live. Every drive so far has published with `fetch`, and
both `drive-epic-051.mts` and `drive-epic-052.mts` mint an API key directly because **there is no
screen that mints one.**

**It is also the last epic before `▣ GATE 5`**, which is a full stop and Soroush's decision.

## Goal

A person who has written a prompt can put it in front of their application without leaving the
product: see what is Live and what is Draft, read why publishing is or is not allowed, publish or
undo, mint the key their program will use, and copy the four lines of TypeScript that resolve it.

## The roadmap's four lines, verbatim

> **Goal.** The delivery UI, TypeScript path only.
> **Tasks.** Deploy page (Live vs Draft, gate list with icons, Publish / Publish anyway / Undo,
> apps-resolving table from CDN logs, history); Connect page with TypeScript steps and generated-file
> preview; Settings API keys (shown once, rotate) and Publishing tabs; editor header pill and Publish
> button; Runs page blocked banner; no bare shas in copy.
> **Tests.** Playwright: failing suite → disabled; anyway with reason → history; undo → Live reverts.
> **Review.** Forbidden-word grep over UI strings passes. Neutral ink for "unsaved"; amber only for drift.

## Scope

- **`/app/pr/[promptId]/deploy`.** Live and Draft side by side; the gate's four rows with a shape per
  verdict and not only a colour; Publish, Publish anyway (with a typed reason), Undo (with a typed
  reason); the publish history. The gate rendered here is **the same evaluation the POST enforces**,
  reached through one function — see ruling 5.
- **`/app/p/[projectId]/connect`.** The TypeScript path, four steps, every one of which works today.
  The project's prompts with their ids and their declared inputs. A generated `prompts.ts` built
  from those rows, which a person can copy into their project now — ruling 3.
- **Settings becomes three pages behind one navigation**: Providers (exists), API keys, Publishing.
  Not a `role="tab"` tablist — ruling 1.
- **API keys.** Mint with a name and an environment; the plaintext is shown **once** and never again;
  the list shows the last four, the environment, when it was made and when it was last used; Rotate
  is revoke-and-mint, two rows — ruling 6.
- **Publishing settings.** The "Only admins can publish" switch, which is a column nothing has ever
  written. The mockup's second switch stays unbuilt — EPIC-051 ruling 4, restated in ruling 7.
- **The editor header says which version you are looking at**, in ADR-003's one vocabulary: `Draft v7`
  beside `Live v6`, and a Publish button that goes to Deploy.
- **The Runs page says when Live is blocked**, and links to the page that explains it.
- **`scripts/binary-files.mjs` is pointed at `docs/` and `sdks/` and `scripts/`**, and the two NUL
  bytes it would have caught are removed — ruling 9. A correction batched into this epic's branch
  per `PROCESS.md`, "One PR per epic".

## Out of scope

- **`41p pull`, codegen, the lockfile, bundled-artifact generation.** EPIC-053, and EPIC-052's Out of
  scope said the same. The Connect page shows a file it generates itself, not one a CLI wrote.
- **Python and Swift on the Connect page.** The roadmap's Goal line is "TypeScript path only" and the
  Python SDK is EPIC-054. A language tab that produces code for a package nobody can install is
  worse than its absence.
- **The apps-resolving table.** There is no CDN and therefore no access log. Ruling 2.
- **Team and Billing settings.** Stage 6, EPIC-070.
- **"Require passing checks".** EPIC-051 ruling 4 decided it and nothing here reopens it.
- **A second publish target, or a model picker on Deploy.** `DEFAULT_RUN_MODEL` is the one model the
  gate proves against today; the route already carries a `targetModel` and the day there are two,
  this page grows a control. Building the control first would be building a choice with one option.
- **Changing the artifact, the gate's rules, or `/v1`.** This epic renders EPIC-051's decisions; it
  does not revisit them.

## Rulings taken in the advisor's chair

Each of these is logged in `docs/decisions/AUTONOMOUS.md`.

### 1. Settings is three routes joined by links, not a tablist

`docs/design/README.md` lists "real ARIA tabs" among the things the prototypes get wrong and the
build owes. That correction is about the places where a tab **is** a tab — `Pivots` on the run page,
the workbench — where one page holds several panels and a button swaps them. `packages/ui`'s `Tabs`
is that pattern and there are three uses of it.

Settings is not that. Each of these pages does its own query, is worth linking to, and should survive
a reload on the page you were reading. **A control that changes the URL is a link**, and putting
`role="tab"` on a link tells a screen-reader user that a panel is about to swap when a navigation is
about to happen. So: `nav` with `aria-current="page"`, styled like the mockup's tabs.

`/app/settings/providers`'s own comment says "when the others arrive this page becomes the first
panel of them". This is the moment, and the answer is that they are pages rather than panels.

### 2. The apps-resolving table is not built, and the page says why in words

The mockup's "Apps calling this prompt" card has four rows of client names, SDK versions and call
counts. Its source is CDN access logs. `docs/roadmap.md`'s EPIC-051 line says "apps resolving" is
*"derived from CDN access logs, **no client ping**"*; EPIC-051 §4.1 and EPIC-052 both reported it as
not built and human-blocked; and there is still no R2 bucket and no CDN, which is Soroush's step.

Three options and only one is honest. **Fabricated rows** teach a person to believe a number nobody
computed. **An empty table** reads as "no apps are calling this", which is a claim — and it would be
the wrong one for a customer whose apps are calling it. So: **a short paragraph in the card's place**
naming what it will show and what it needs first.

This matters more than a card usually would: **GATE 5's demand measure is that number.** A table that
looks built is how a gate gets decided on a number that was never measured.

### 3. The generated-file preview is generated by the page, from the project's own prompts

The roadmap asks for a "generated-file preview" and the mockup shows `prompts.ts` under a header
saying `41p pull` wrote it. `41p pull` is EPIC-053 and does not exist.

Showing a preview of a file no one can obtain is showing somebody a thing they cannot have. But the
file itself is not the CLI's to own — it is twelve lines of TypeScript with one function per prompt,
and every fact in it (the prompt id, the declared variable names, whether each is optional) is
already in this project's rows.

**So the page generates it and a person copies it.** It is honest — the header says "Copy this into
your project", not that a tool wrote it — it works today, and when EPIC-053 ships `41p pull` this is
precisely the file it will write, so the page's copy becomes "or run `41p pull`" and nothing else
changes. A preview of a real file beats a screenshot of an imaginary one.

### 4. The Connect page's steps and `packages/sdk-ts/README.md` are pinned together by a test

EPIC-052's handover, item 2: *"`packages/sdk-ts/README.md` is now the canonical copy of the Connect
page's TypeScript steps, including the exact telemetry header. They must agree, and the README is the
one that goes to npm."*

Two copies of an install instruction is the same defect as two copies of an env placeholder
(`PROCESS.md`, `apps/web/e2e/env.mjs`) and two copies of a hash function (`artifact/schema.ts`): the
copy goes stale silently, and here the stale one is the one a customer follows. `apps/web` may not
import `packages/sdk-ts` (it is a public package and the boundary runs the other way), so the pinning
is a **test that reads both** and fails when the page's snippet is not in the README — the shape
`apps/web/e2e-env.test.ts` already uses for `ci.yml`.

### 5. The Deploy page evaluates the gate through the same function the POST does

The page has to render the gate **before** anything is published, and `publishVersion` does not have
a preview mode: it compiles, assembles, gates, and then pins and commits.

A second evaluation written for the page would be a second implementation of "may this be published",
and the two would disagree the first time either changed — with the page saying yes and the endpoint
saying no, or worse, the reverse. That is the `buildHashOf` argument (`artifact/schema.ts`: *"the
failure mode of a second copy being that verification quietly always passes"*) applied to the gate.

So `publishVersion` is split: everything up to and including the gate becomes `previewPublish`, which
returns the refusal-or-report and takes no writes; `publishVersion` calls it and then pins and
commits. The page calls `previewPublish`. **One evaluation, two callers.** A test asserts the page's
verdict and the endpoint's verdict agree on a version the gate blocks.

### 6. Rotate is revoke-and-mint — two rows, never an update

`api_keys` has `revoked_at` and `last_used_at`, and `apiKeyForPlaintext` already refuses a revoked
row. Rotation could be an update of `hashed_key` in place, which is one row and less code.

It is two rows. The question a key table gets asked after an incident is *"which key was in the field
on Tuesday, and when did it stop being"* — and an updated row cannot answer it: `created_at` then
describes a key that no longer exists and `last_used_at` mixes two credentials' traffic. The same
argument `publish_events` makes for deriving Live rather than storing it (EPIC-051).

The old row stays, revoked and visible, with its dates intact. The list shows revoked keys after
live ones rather than hiding them, because a key you revoked is a thing you may need to look at.

### 7. The Publishing tab has one switch, and says out loud that it is one

The mockup has two. EPIC-051 ruling 4 refused the second — *"Require passing checks"* — because an
account-wide off-switch for `CLAUDE.md` rule 9 makes the product's central sentence false for that
account, permanently and invisibly, while rule 9's own escape ("Publish anyway", typed reason,
audited) already exists and names a person.

Nothing here reopens that. What this epic adds is that the page **says** rule 9 is not optional,
beside the switch that does exist, rather than leaving its absence to be read as an oversight.

The switch that does exist is `projects.admin_only_publish`, which has defaulted to `true` since
EPIC-051 and which nothing has ever written. `mayPublish` already reads it.

### 8. The version state is `Draft v7` and `Live v6`, and a build hash never stands in for either

`docs/design/README.md`: *"Version state: one vocabulary everywhere: 'Draft v7' and 'Live v6'. Not
'v7 · unsaved', not 'v7 · current'."* The editor's header says the flat word `Draft` today; every
page in this epic says the version.

**"No bare shas in copy"** is the roadmap's own Review-adjacent line and the mockup breaks it:
`pr_9f2c4a71 · sha 3ab19c…`. Two things are wrong with that — `sha` is forbidden by ADR-003, and a
content address shown as a subtitle invites a person to identify a release by it. The build hash
appears **once per page, under a label, next to a copy control**, because a person debugging an SDK
resolution genuinely needs it. Everywhere else the identity is the version.

### 9. Two committed documents contain a literal NUL byte, and the gate that exists for that is not pointed at them

Found before this epic started, by scanning every tracked file. `docs/epics/reports/EPIC-052-report.md`
and `docs/epics/sessions/EPIC-052-session.md` each contain one — in the sentence describing lesson
20, which is the lesson about a NUL byte reaching a source file. `git` therefore classes both as
binary and `grep` silently finds nothing in them, which is lesson 20's own shape: *"a search that
cannot fire reads exactly like a search that found nothing."* These two files are handover artifacts
the next session greps.

`.gitattributes` did its half — `*.md diff` keeps the textual diff visible, verified by probe — so
the review hole is closed. The other half is missing: `scripts/binary-files.mjs`'s `ROOTS` are
`["packages", "apps"]`, and its own comment says *"`sdks/` and `scripts/` are not covered; widening is
one line here."* `docs/` was not even on that list.

Lesson 19, verbatim: **a gate only guards what it is pointed at.** The roots become
`packages`, `apps`, `docs`, `sdks`, `scripts`, the two bytes are removed, and a test proves the gate
fires on a file under each new root rather than merely passing.

Batched into this epic's branch rather than taken as its own change, per `PROCESS.md`'s "One PR per
epic. A separate PR needs a reason" — the three reasons that qualify are a measurement defect, a
security fix, and something that must be revertible on its own, and this is none of them.

## Acceptance criteria

- [ ] **C1.** `/app/pr/[promptId]/deploy` shows Live and Draft with their version names in ADR-003's
      vocabulary, what each was published or edited at, and — for Live — the build hash under a
      label. With nothing Live it says so rather than rendering an empty card. Verified:
      `deploy.spec.ts`.
- [ ] **C2.** The gate's four rows render with the verdict carried by **a shape and a word, not only
      a colour** (`CLAUDE.md` rule 10), each with the sentence `gatePhrase` returns, and blocking rows
      distinguished from reporting ones. Verified: `deploy.spec.ts` reads the computed style and the
      accessible name, per lesson 12.
- [ ] **C3.** **A failing suite disables Publish** — the button is disabled, and it says what is
      stopping it rather than being silently grey. Verified: `deploy.spec.ts`.
- [ ] **C4.** **Publish anyway with a reason appears in the history**, marked as having gone past the
      gate, with the reason and the person. A reason under `PUBLISH_REASON_MIN` is refused in words
      and nothing is published. Verified: `deploy.spec.ts`.
- [ ] **C5.** **Undo reverts Live**, requires its own reason, and both the undo and what it undid are
      in the history. Verified: `deploy.spec.ts`.
- [ ] **C6.** The page's gate verdict and the endpoint's verdict come from one function and agree on a
      blocked version — proved by a test that calls both, not by inspection. Verified:
      `publish.test.ts`.
- [ ] **C7.** `/app/p/[projectId]/connect` shows four TypeScript steps that work today, the project's
      prompts with their ids and declared inputs, and a `prompts.ts` generated from those rows.
      Verified: `connect.spec.ts`.
- [ ] **C8.** **The Connect page's snippets are the README's.** A test reads
      `packages/sdk-ts/README.md` and fails when a snippet the page renders is not in it, including
      the telemetry header's exact text. **With a positive control**: the test is proved to fail on a
      deliberately altered snippet. Verified: `connect-readme.test.ts`.
- [ ] **C9.** The apps-resolving card is **absent and explained**, not empty and not invented, and
      the words name the CDN as what it waits on. Verified: `connect.spec.ts` / `deploy.spec.ts`.
- [ ] **C10.** **An API key is shown once.** Minting displays the plaintext with a copy control and a
      sentence saying it will not be shown again; reloading the page shows only the last four.
      Verified: `api-keys.spec.ts`.
- [ ] **C11.** **Rotate leaves two rows**: the old one revoked with its dates intact, the new one
      live, and the old plaintext stops authenticating `/v1`. Verified: `api-keys.spec.ts` and
      `packages/db`'s own test for the revoke function.
- [ ] **C12.** The Publishing tab toggles `admin_only_publish` and the value survives a reload; the
      page states that rule 9 is not optional. Verified: `publishing-settings.spec.ts`.
- [ ] **C13.** Settings' three pages are reachable from one navigation with `aria-current="page"` on
      the one you are on, and **no element carries `role="tab"`**. Verified: `settings-nav.spec.ts`,
      which asserts both the presence of the navigation and the absence of the role, with a positive
      control that the absence assertion can fire.
- [ ] **C14.** The editor header shows `Draft vN` and, when something is Live, `Live vM`, and carries
      a Publish control that reaches the Deploy page. Verified: `deploy.spec.ts`.
- [ ] **C15.** The Runs page shows a banner when publishing is blocked, naming the reason and linking
      to Deploy; and **does not show it when publishing is not blocked** — the negative case asserted
      with a control. Verified: `runs-blocked.spec.ts`.
- [ ] **C16.** `pnpm forbidden-words` passes. No string added by this epic uses **block** (the noun),
      **assertion**, **label**, **pointer**, **artifact**, **promote**, **enum**, **sha**,
      **reconcile**, **override** or **drifted**. Verified: the gate, plus a reading of the diff.
- [ ] **C17.** **Amber appears only for drift.** On this page that is exactly one row — the cost row,
      when the cost has moved against a Live build, which is the `drift` verdict `packages/core`
      already returns. "Unsaved" and the blok-diff row are neutral ink. **This corrects the criterion
      as first written**, which said cost deltas are always ink and therefore contradicted shipped
      code; ruling 11 has the argument and says plainly that one line of `docs/design/README.md` is
      now wrong. Verified: `deploy.spec.ts` reads computed styles, with a control proving the probe
      can tell amber from ink.
- [ ] **C18.** **Every page works at 390px and by keyboard.** Publish, Publish anyway, Undo, Rotate
      and the settings navigation are all reachable and operable without a mouse; touch targets are
      44px. Verified: the drive's screenshots and `deploy.spec.ts`'s keyboard path.
- [ ] **C19.** `scripts/binary-files.mjs` covers `docs/`, `sdks/` and `scripts/`; the two NUL bytes
      are gone; and a test proves the gate **fires** on a planted file under a new root rather than
      merely passing. Verified: `binary-files` test and `pnpm binary-files`.
- [ ] **C20.** `pnpm test`, `pnpm typecheck`, `pnpm lint` green with every package reporting, and
      `node scripts/gates.mjs ci` green on the commit.
- [ ] **C21.** **The drive**: the built app, a fresh throwaway user, a project, a prompt and its
      bloks created **through the product's own UI**, a run, a blocked publish, a Publish anyway, an
      Undo, a key minted **through the keys page**, and that key used by a real `@41prompts/sdk`
      process to resolve the prompt. Screenshots in `docs/epics/reports/screenshots/EPIC-055/`.
      **The drive no longer mints a key directly** — EPIC-052 handover item 1.

## Verification

```
pnpm --filter @41prompts/web test
pnpm --filter @41prompts/db test
pnpm e2e --grep "deploy|connect|api-keys|settings|runs-blocked"
node scripts/gate-run.mjs
npx tsx scripts/drive-epic-055.mts     # against the BUILT app, see its header
```

## Notes for the implementer

- **This is the first epic whose drive can mint its own key.** `drive-epic-051.mts` and
  `drive-epic-052.mts` both mint one directly and say so in their headers; when this ships, both
  should stop. Changing them is in scope — it is the evidence that the tab works.
- **`gateBody` in `lib/deploy/words.ts` already exists for this page.** Its own comment says "the
  shape a route returns and EPIC-055's page renders". Use it; do not write a second mapping.
- **`gatePhrase` owns the sentences.** `packages/core` returns codes and this is where the words are,
  which is where the forbidden-word grep runs. A sentence written into a component instead is a
  sentence outside the gate.
- **Every absence assertion needs a positive control.** This is the fifth epic in a row to say so and
  the fourth to have needed it. C9, C13, C15, C17 and C19 are all absence assertions.
- **Do not seed the drive's data.** Create the project, the prompt and the bloks by clicking, per
  `docs/AUTONOMOUS.md`. The run needs a provider key — `verifyProviderKeyOrFake` and the published
  master key in `packages/db/src/sealed-box.ts` are how the last three drives did it.
- **`apps/web/e2e/env.mjs` holds the placeholders `next start` needs.** Do not write a fifth copy.
- **After rebuilding, prove the server is the build you just made** — `apps/web/.next/BUILD_ID`
  appears verbatim in the HTML. Lesson 17 cost an hour.
- **No named inner function inside a `page.evaluate`** in a `.mts` drive. Lesson 9.
- **`▣ GATE 5` is next and it is a full stop.** Do not start anything behind it. The report should
  say what GATE 5 can and cannot be decided on, the way `docs/epics/GATE-3-readiness.md` did.

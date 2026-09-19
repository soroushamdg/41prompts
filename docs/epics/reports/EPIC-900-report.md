<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-900 — report

**Tech-debt sweep, first run. 2026-09-19.** Branch `epic/900-tech-debt-sweep`, merged into local
`main`. Nothing pushed (`CLAUDE.md`, "Nothing is pushed").

`docs/roadmap.md`'s Ongoing line names five things: dead code, dependency upgrades, boundary and
compliance report, infra drill, CLAUDE.md accuracy. **Four are done. The infra drill is skipped and
§9 says exactly what it needs from you.**

---

## 0. Size

The backlog and the roadmap both size this **S**. It is **M**, recorded in the epic file and in
`docs/decisions/AUTONOMOUS.md`. The `Size` cell was **not** edited — `docs/AUTONOMOUS.md`'s carve-out
is the status cell of the epic being worked, which is EPIC-056's and EPIC-901's precedent.

---

## 1. What the sweep found, before anything was fixed

Worth stating first, because "we swept and found little" is a result and the next sweep should read
it rather than re-derive it:

| probe | result |
|---|---|
| `TODO` / `FIXME` / `HACK` / `XXX` across `packages/`, `apps/`, `sdks/`, `scripts/` | **2**, both `TODO(EPIC-006)` on a deferred row |
| source files nothing else mentions | **0** of 602 |
| declared dependencies the owning package never imports | **0** (one false positive: `react-dom` in `packages/ui`, a required peer of `@testing-library/react`) |
| `eslint-disable` directives | **1 file**, 2 directives — both dead, see §3 |
| skipped tests | 4, all the `-linux` visual baselines, deliberately |
| **exported values nothing else in the repository names** | **43** |

The last row is the epic.

---

## 2. `pnpm dead-code` — the deliverable

`scripts/dead-code.mjs`. Pure Node, no dependency, **0.8 seconds** over 790 files. It reports an
exported **value** — `const`, `let`, `var`, `function`, `class` — that no other file in the
repository names, and exits non-zero.

**Wired into three places in one commit**: `pnpm compliance`,
`.github/workflows/compliance.yml`'s `boundaries-and-forbidden-words` job, and
`scripts/gates.mjs`'s CI step list. `docs/AUTONOMOUS.md` is explicit that a mode claiming parity
with CI must run what CI runs and no more, so a check in one and not the others is the divergence
that rule exists to stop — in either direction. `dead-code.test.ts` fails if the three disagree.

**`ALLOWED` is empty.** Every one of the 43 was resolvable, so nothing needed an exemption. It is
checked in both directions anyway — an entry silences, an entry that no longer describes an orphan
**fails** — and both halves are proved on fixtures rather than on a list that happens to be empty.

### 2.1 It found two defects in itself, by being run rather than reasoned about

**Both are the same lesson, and the second is sharper than the first.**

**The first real run reported 35 where the survey had found 39.** The four missing ones were not
fixed and were not false positives. Prose was counting as a use, and **three of them were named in
`docs/epics/EPIC-900-tech-debt-sweep.md`, written minutes earlier** — the document describing the
dead code had made the dead code invisible to the gate that was written to find it. The other two,
`snapshotNow` and `withFakeJudge`, were each held alive by a single sentence, in
`plan-EPIC-041.md` and in `EPIC-033-report.md`.

That is not a rare shape in this repository. It writes long reports that name symbols, and a report
is permanent. Counting prose as a use would have meant every symbol any report had ever mentioned
was immortal, and the gate degrading silently, one epic report at a time. **Markdown is no longer
read.**

**One fix later it still protected those same two — now by its own header**, which had just been
edited to name them as the examples. That is `forbidden-words.mjs`'s first lesson arriving in a
second gate, verbatim: *"comments stripped first — a comment is neither a UI string nor an
identifier — this file's own comments would otherwise flag themselves."* Comments are now blanked
before a file is read for uses, **newlines preserved**, which matters because the declaration
pattern is `^`-anchored and a block comment collapsed to one space would join the line before it to
the line after.

Both are pinned by tests, not just fixed.

### 2.2 The class it does not check, and why

Types. A `type` or `interface` used once, inline, in the file that declares it is not debt, and
there are 113 of them. A check reporting 113 things nobody should act on teaches people to skip its
output, which costs more than it ever finds.

---

## 3. The 43, one at a time

| what | how many | what happened |
|---|---|---|
| deleted | **2** | `checkCountForRun` (`packages/db/src/versions.ts`), `variablesForOwner` (`apps/web/lib/variables/queries.ts`) — each exactly one `git grep` hit, its own declaration |
| turned into the test it was written for | **1** | `detectPatterns` — §3.1 |
| `export` keyword dropped | **40** | used inside their own file; the keyword was the only thing making them a surface |
| `ALLOWED` | **0** | — |

**`packages/core` and `packages/sdk-ts` are public and frozen** by ADR-005 and ADR-006. That surface
is `index.ts`, and nothing here touches it; `sdk-ts`'s `frozen.test.ts` stayed green throughout.

One of the 40 was not a plain keyword removal. `packages/core/src/detect/contradiction.ts` had
`export`, then a whole doc block, then `const SCOPED` — valid TypeScript, genuinely exported, and a
JSDoc between the keyword and the name attaches to nothing. The block moved above the declaration.

### 3.1 `detectPatterns`, and the test that was never written

`detect.ts` has carried this since EPIC-012a:

> `/** Every committed pattern in this module, for the pattern-safety test. */`

**That test did not exist.** `check/pattern-safety.test.ts` tests `isPatternSafe`, which is about a
pattern a *person* typed into an expected blok. Nothing had ever looked at our own 23 committed
detector regexes — and `/decompile` runs every one of them over text anybody can paste, with no
account. A committed pattern that backtracks exponentially is the same denial of service
`check/pattern-safety.ts` exists to prevent, with our name on it.

Deleting the helper would have thrown away the only record that somebody wanted the check. It was
measured first: **all 23 compile and none contains a nested quantifier.** So
`packages/core/src/detect/pattern-safety.test.ts` now asserts both, 47 cases, plus a third assertion
that there are patterns to check at all — without it, a `detectPatterns()` that silently returned
nothing would make every `it.each` pass by iterating an empty array.

**It is `findNestedQuantifiers` and deliberately not `isPatternSafe`.** That filter is over-strict by
design — it also refuses backreferences, lookbehind and anything past 400 characters, because it
cannot ask the author what they meant. We can ask ourselves. Holding our own corpus to the
user-facing filter would fail it for reasons that are not about safety, and would be deleted the
first time it was inconvenient.

### 3.2 Four knock-on fixes the de-exports exposed

1. `packages/db/src/publishes.ts` — `PUBLISH_EVENT_KINDS` was a `const` array read back with
   `(typeof …)[number]` and **never iterated**, so eslint reported a value used only as a type. It
   is a union now. `HISTORY_WORDS: Record<PublishEventKind, string>` still refuses a fourth kind
   without a word, which is the property the array was protecting.
2. `packages/db/src/versions.ts` — the `suiteChecks` import went with `checkCountForRun`.
3. `apps/web/lib/variables/queries.ts` — three imports, and **the module's own doc comment**, which
   described the function that had just been deleted. The comment now says what the module does.
4. `packages/core/src/version/size.test.ts` — two `eslint-disable-next-line no-console` directives
   disabling a rule `eslint.config.js` **never enables**. Both were dead; the reasons survive as
   plain comments. `pnpm lint` now has no standing warnings.

---

## 4. One red in `main`, fixed on the way past

**`changelog.test.ts` has failed since EPIC-901 merged.** It walks `docs/epics/reports/` and fails
on an epic that shipped and is neither in the changelog nor in `NOT_USER_VISIBLE`; EPIC-901 added a
report and did neither. **Proved pre-existing on the clean tree** — stashed this branch's changes,
ran the file, watched it fail on `main` alone — rather than assumed, per `docs/PROCESS.md`'s
"'Environmental' is a hypothesis, not a finding".

Fixing it exposed a second thing. **`NOT_USER_VISIBLE` was checked in one direction only.**
`CHANGELOG_EPICS` has always been checked against the reports directory; the exemption list never
was, so an id could sit there for an epic that never shipped — and would then silence that id, for a
reason nobody wrote down, if it ever did. That is the same hole as a stale entry in
`docs/security/audit-baseline.json` or in this epic's own `ALLOWED`, and this repository has now
closed it four times.

The new assertion was **proved to fire** before being trusted: a fabricated `EPIC-999` entry failed
it with the right message. One consequence is deliberate — an epic cannot declare itself invisible
before it has a report, so `EPIC-900`'s own entry is written in the same commit as this report and
not before it.

---

## 5. Dependencies

**20 same-major upgrades applied**, every one `pnpm outdated -r` offered:
`@ai-sdk/{anthropic,google,openai}`, `ai`, `next` 16.3.4→16.3.5, `@aws-sdk/client-s3`,
`@sentry/{nextjs,node}`, `pg-boss` 12.30→12.33, `posthog-node`, `react` and `react-dom`
19.2.8→**19.3.0**, `resend`, `turbo` 2.10→2.11, `prettier`, `jsdom`, `dependency-cruiser`,
`@typescript-eslint/*`, `@types/react`, `@types/react-dom`, `@types/node` 22.20.1→22.20.4.

### 5.1 `better-auth` is held at exactly 1.7.2, and that is a finding

1.7.3 added a startup schema check. Ours fails it:

```
Required columns Better Auth never writes — accounts.issuer
Inserts into accounts will fail.
note: If this column came from Better Auth 1.7.0 through 1.7.2, follow the upgrade guide
```

`accounts.issuer` is `NOT NULL` with no default and carries a unique index with `account_id`. It was
generated by `npx auth generate` at EPIC-002, against exactly the version range the error names.
Nothing in this repository has ever written it.

**It is not broken today, and that was measured rather than assumed.** A complete magic-link sign-in
against the built app produced **1 user row and 0 account rows** — Better Auth never inserts into
`accounts` on the only sign-in path this product has. So the column has never been exercised.

**It becomes a real defect the first day anything other than a magic link is added** — OAuth, a
password, a social login — because that is when `accounts` gets its first insert.

Fixing it is a migration on an auth table that runs against real users' rows at the next deploy,
plus a decision about the unique index that depends on the column. That is its own change with its
own blast radius, which is the argument this epic already makes for vitest 4. Pinned at `1.7.2`
**exact**, not `^1.7.2`, so the next `pnpm update` cannot pick it up silently.

### 5.2 Four majors held, and one of them is not staleness

| held | why |
|---|---|
| `eslint` 9→10, `@eslint/js` 9→10 | a flat-config major across nine packages; a sweep that also migrates a lint config is a sweep nobody can review |
| `typescript` 5→7 | same shape, larger |
| `vitest` 3→4 | already triaged in `docs/security/audit-baseline.json`, `reviewOn` 2026-12-18. Re-deciding it here would re-litigate a three-week-old decision |
| **`@types/node` 22→26** | **not stale.** `engines` pins the runtime to Node 22; 26.x types APIs that are not there at runtime. Written down so nobody "fixes" it |

`esbuild` `^0.25.12` → 0.28 in `packages/sdk-ts` is the same category: a `0.x` minor is a major under
caret semantics, and it is a build-time devDependency of a zero-dependency package.

### 5.3 Two consequences, both caught by tests that exist for it

`third-party-notices.generated.json` was stale and is regenerated — **428 packages**. That test
firing is the test working. And pnpm rewrote `keywords` and `files` in two public manifests from one
line to many; that is its canonical JSON output, it will recur on every update, so it is left rather
than fought.

---

## 6. CLAUDE.md accuracy

Three corrections, all factual, and **the third is the one that mattered**:

1. **`packages/cli-unscoped` was in neither the Stack list nor rule 11's public set.** It has been a
   real, publishable, Apache-2.0 package since EPIC-056 — and rule 11 is the import boundary, so the
   omission was in a rule rather than in prose.
2. `pnpm audit-run`, `pnpm compliance` and `pnpm gates:ci` were absent from Commands. EPIC-901 made
   the first one the monthly audit and nothing in the daily-driver list mentioned it.
3. **`pnpm e2e # playwright, needs dev running` was the opposite of true.** Since
   `playwright.config.ts` started building, `pnpm e2e` runs `turbo run build` and `next start`
   itself — and `reuseExistingServer: !CI` means **a server you started by hand is the thing that
   silently breaks the suite**. The line told a reader to do the one thing that breaks it.

A fourth entry was added rather than corrected: the Definition of Done now names `pnpm dead-code`
beside `pnpm binary-files`, because a new gate is a convention change.

Everything else in CLAUDE.md was checked against the tree and is accurate: blok kinds
(`classify/types.ts`), id prefixes (`db/src/ids.ts` — `pr_` + 8 hex, `proj_` + 4 hex), the
forbidden-word list (11 words, matching `forbidden-words.mjs` exactly), the eight
`rule_without_check` phrases, Node 22, Postgres 16, Next 16.3, Tailwind 4.3, Drizzle 0.45, pino 10,
and `41Prompts Inc.` as copyright holder.

---

## 7. The boundary and compliance report

Numbers rather than the word "clean" (`docs/PROCESS.md`, "A local gate is evidence only when it
reports every package's result").

| check | result |
|---|---|
| `pnpm lint` | **12 checked, 12 passed**, zero warnings |
| `pnpm typecheck` | **9 checked, 9 passed** |
| `pnpm test` | **9 checked, 9 passed**, throwaway database |
| `pnpm boundaries` (dependency-cruiser) | no violations — **579 modules, 1337 dependencies cruised** |
| `turbo boundaries` | **833 files in 9 packages**, no issues |
| `pnpm forbidden-words` | clean over six roots |
| `pnpm binary-files` | no NUL byte |
| `pnpm dead-code` | **888 exported values across 590 source files**, each named elsewhere; 0 allowed |
| `pnpm license-gate --sbom` | pass |
| `reuse lint` | 1304/1305 — see §8 |
| `pnpm mirror-dry-run` | the public tree installs, tests (289 pytest cases) and licence-lints standalone |

### 7.1 `node scripts/gates.mjs ci` — the only CI there is

**Commit `5dd04c9`. 17 steps, all passed, 13m15s wall.**

```
checkout        git clone + checkout 5dd04c9     PASS  0m03s
ci.yml          pnpm install --frozen-lockfile   PASS  0m09s
                pnpm lint                        PASS  0m31s
                pnpm typecheck                   PASS  1m19s
                pnpm db:migrate                  PASS  0m03s
                pnpm test                        PASS  1m20s
                playwright install chromium      PASS  0m02s
                pnpm e2e                         PASS  7m21s   4 skipped on darwin
                uv run pytest -q (sdks/python)   PASS  0m31s
compliance.yml  reuse lint                       PASS  0m06s
                pnpm boundaries                  PASS  0m06s
                turbo boundaries                 PASS  0m01s
                pnpm forbidden-words             PASS  0m01s
                pnpm binary-files                PASS  0m01s
                pnpm dead-code                   PASS  0m01s
                license-gate --sbom              PASS  0m03s
                pnpm mirror-dry-run              PASS  1m37s
```

**The closing block is part of the result** (`docs/PROCESS.md`), so here is what that green does not
cover:

1. **The runner is Linux and this is darwin.** The four visual-regression baselines are `-linux.png`
   and skipped. **This matters more than usual this epic**: React and Next both moved, and a layout
   shift is exactly what a `fullPage` baseline catches and this run cannot. Nothing in the drive
   suggests one — every page rendered and nothing overflowed at 390px — but that is not the same
   claim, and it is unticked rather than assumed.
2. **The runner is slower.** A test that only fails under load passes here.
3. **`--allow-dirty`: one uncommitted file was not part of the run** — §8.

A second `gates.mjs ci` run answers the docs-only commit that carries this report; §10 records it.

---

## 8. `app-icon.jpg`, which is not ours

An untracked `app-icon.jpg` sits in the repository root. It fails `reuse lint` (1304 of 1305 files
have licence information) and makes `gates.mjs ci` refuse to start, so this epic used
`--allow-dirty` exactly as EPIC-901 did on the same file the day before.

**It is reported, not deleted.** It arrived from a concurrent session and removing somebody else's
file is not a tech-debt fix. It is untracked, so CI would never see it. **It needs one decision from
you**: give it a licence header (or a `REUSE.toml` entry) and commit it, or delete it. Until then
every `gates.mjs ci` run in this repository needs `--allow-dirty`, which is a flag that says "one
file was not tested" — and that is a bad habit to own permanently.

---

## 9. The infra drill — skipped, not done, and here is what it needs

`docs/roadmap.md`'s EPIC-900 line names an infra drill. **It did not happen, and no part of it was
faked.**

`infra/RUNBOOK.md`'s restore drill is: SSH to `41p-box`, find the backup container by app uuid,
pull the latest dump from R2, restore it into a scratch database, and verify. Every step after the
SSH is a **mutating** command on the box, which `CLAUDE.md` server-access rule 3 makes one command,
one yes, and the R2 credentials live in Coolify rather than on this machine.
`docs/AUTONOMOUS.md` puts that category in the same place as touching production: not ours.

**What you would run**, from `infra/RUNBOOK.md`, "Restore drill":

```
ssh 41p-box
docker ps --filter "name=backup-pboa5wxrnggay30epiq0pmzd" --format "{{.Names}}"   # staging
# then the numbered steps under "Restore drill", recording the wall time of the restore
```

Record the time each run, which is what makes the next one a comparison rather than a repeat. If you
want it driven with a person watching, it is one `yes` per command and I can do it in a session.

---

## 10. Acceptance criteria

| | criterion | evidence |
|---|---|---|
| ✅ | **A1** `pnpm dead-code` reports file, kind and name, exits non-zero on a finding | §2, `dead-code.test.ts` "what fires" |
| ✅ | **A2** an unnamed export fails; the same export passes once in `ALLOWED` | `dead-code.test.ts`, positive and negative control |
| ✅ | **A3** an `ALLOWED` entry matching nothing also fails | `dead-code.test.ts`, both stale reasons distinguished |
| ✅ | **A4** framework-convention names do not fire | fixture `page.tsx` / `route.ts` / `middleware.ts`, **and** the real tree carrying none of them in `ALLOWED` |
| ✅ | **A5** green on the real tree; all 43 resolved | §3 table; `888 exported values … 0 allowed by name` |
| ✅ | **A6** runs in all three places, and a test fails if they disagree | §2; `dead-code.test.ts` "it runs everywhere it is supposed to" |
| ✅ | **A7** every same-major upgrade applied, four gates green after | §5, §7 |
| ✅ | **A8** CLAUDE.md names `cli-unscoped` twice and `pnpm audit-run` | §6 |
| ✅ | **A9** `gates.mjs ci` green, all steps | §7.1 — 17/17 on `5dd04c9` |
| ✅ | **A10** no user-visible surface change, plus a drive proving the upgrades broke nothing | §11 — **37/37** |

**Which gate answers which commit.** `5dd04c9` is the last code commit and carries the 17/17 above.
The two docs-only commits after it — this report, the session log and the `NOT_USER_VISIBLE` entry —
change `docs/`, `apps/web/lib/site/changelog.ts` and `docs/backlog.md`'s one status cell. The
changelog edit is application code, so it gets its own `gates.mjs ci` run rather than an argument
about whether a gate would have had anything to say (`docs/PROCESS.md`, "The question is whether the
gate would have told you something"). That run is recorded in the session log.

---

## 11. The drive — 37 of 37, watched

`scripts/drive-epic-900.mts`, against the **built** app (`turbo run build`, then `next start` on
:3120), never `pnpm dev`. Screenshots in `docs/epics/reports/screenshots/EPIC-900/`, transcript
beside them.

**This epic ships no route and no UI string**, so `docs/AUTONOMOUS.md` would let it answer the
browser-drive item with a numbered section. It does not qualify, and the reason is the dependency
set rather than the dead code: **React, Next and Better Auth are what renders every page, what
builds and serves them, and what makes signing in work.** The 40 de-exports are the quiet half and
`tsc` is their control — a keyword removed from a module nothing imported cannot change behaviour.
The upgrades are the half a type-checker cannot answer.

**It is watched, not headless** (your instruction of 2026-09-19): the drive opens the built app in
the IDE preview pane through the `local.drive-preview` bridge extension and drives a visible
Chromium at `slowMo: 350`, re-firing `pane(url)` at each step worth seeing. `DRIVE_HEADLESS=1` still
runs it headless, because `pnpm e2e` and `gates.mjs ci` must never wait on a window, and `pane()` is
fire-and-forget so a machine without the IDE logs one line and carries on.

What it proved:

| | |
|---|---|
| the server answering is the build just made | `BUILD_ID AOohmCBaYrb0BZQGuu5wv` in the HTML |
| the dependency set under test is the upgraded one | react 19.3.0 · next 16.3.5 · better-auth **1.7.2** exact |
| 15 public routes serve, styled | 200 each, stylesheet 84,706 bytes fetched and measured |
| 15 public routes at 390px | overflow 0px on every one |
| dark mode | `body` background `rgb(11, 11, 11)` |
| the decompiler runs `packages/core` inside the built app | **5 bloks, 2 findings** from a pasted prompt |
| a fresh account signs in and creates a project through the UI | `claude-drive-900-…@example.com`, project created, cleaned up at both ends |

The decompiler step is there because it is the one public page that executes `packages/core` —
`contradiction.ts`, `similarity.ts`, `generate.ts` and `detect.ts` are all files this epic edited,
and the prompt it pastes contains the scoped-precondition pair `SCOPED` exists for.

**The drive's first run failed and the failure was mine.** It waited 30 seconds for a `blok-card`
test id that does not exist — invented rather than read off `decompile.spec.ts`, where the selector
is `.blok-card` and the visible wait is `source-map`. Corrected by reading the spec, which is what
the repository's own rule says to do.

**What the drive does not cover**: the image build, the Coolify environment, Traefik, and migrations
against the real database. Nothing is pushed, so nothing deploys and **no staging URL is evidence
about anything in this report** — production is 206 commits behind and staging is behind local
`main` too.

---

## 12. Open questions, all yours

1. **`app-icon.jpg`** — licence it and commit it, or delete it. §8.
2. **`accounts.issuer`** — the `better-auth` upgrade needs a migration on an auth table. Not urgent
   (0 account rows are ever written today) and not optional forever (the first non-magic-link sign-in
   method makes it real). §5.1.
3. **`▣ GATE 3` and `▣ GATE 5` status cells still read `—`** and `pick-next-epic.mjs` still stops on
   the first. Both are decided — `GATE-3.md` Go on 2026-09-16, `GATE-5.md` Go on 2026-09-17 — and
   every epic behind both has shipped. One word in each cell unsticks the picker. Raised by
   `GATE-5.md`, by EPIC-056, by EPIC-072 and by EPIC-901 before this.
4. **The infra drill** — §9.
5. **A release is 206 commits overdue.** `docs/epics/RELEASE-DUE.md`, regenerated at EPIC-901's
   merge. Not made here.

---

## 13. Skipped, and said out loud

- **The infra drill** (§9) — needs the box and several mutating commands.
- **Every major dependency bump** (§5.2) — each named with a reason.
- **Deleting `app-icon.jpg`** (§8) — not ours to delete.
- **Unused-`type` detection** (§2.2) — 113 findings nobody should act on.

No new dependency was added by this epic.

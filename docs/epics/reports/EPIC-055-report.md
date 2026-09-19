<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-055 — report

Deploy, Connect, the API keys tab, the Publishing switch, the editor's version pill and the Runs
page's blocked banner. Built 2026-09-17 on `epic/055-delivery-ui`. Epic file:
`docs/epics/EPIC-055-delivery-ui.md`. Plan: `docs/epics/plan-EPIC-055.md`.

---

## 1. What is true now that was not true before

**Publishing has a screen.** EPIC-051 built the gate, the audit log and
`POST /api/prompts/:id/publish`; EPIC-052 built the library that reads the result. Until today
nothing a person could click had ever moved a prompt to Live — every publish in this repository's
history was a `fetch` from inside a drive script.

**And a key has a screen.** `drive-epic-051.mts` and `drive-epic-052.mts` both call `createApiKey`
directly and say in their headers that they do so *because there is no Settings → API keys tab*.
There is one now, and `drive-epic-055.mts` is the first drive in this repository that obtains a
credential the way a customer does.

The Stage 5a journey, run end to end by hand on the built app: write a prompt, see what is Live
beside what is Draft, read why publishing is allowed or is not, publish, undo, mint a key, copy four
lines of TypeScript, and resolve the prompt from a separate Node process.

---

## 2. Acceptance criteria

Every one is ticked against a named test or a named screenshot. `pnpm e2e` is **260 passed, 4 skipped**.

| | criterion | evidence |
|---|---|---|
| C1 | Live and Draft, in ADR-003's vocabulary, build hash labelled | `deploy.spec.ts` "says nothing is Live, names the Draft, and shows every gate row"; shot `02` |
| C2 | Four gate rows, shape **and** word, blocking distinguished | same test + "a verdict is never carried by colour alone"; shot `05` |
| C3 | A failing gate disables Publish and says what stopped it | `deploy.spec.ts` "a broken input contract disables Publish…"; drive check 9 |
| C4 | Publish anyway with a reason reaches the history; a short reason refused | same test; drive checks 10–11; shot `06` |
| C5 | Undo reverts Live, needs its own reason, both rows in the history | `deploy.spec.ts` "Undo moves Live back…"; drive check 12; shot `07` |
| C6 | Page and endpoint are two callers of one evaluation | `publish.test.ts` "agrees with the refusal the endpoint gives, row by row" + five more |
| C7 | Connect: four steps, the prompts, a generated `prompts.ts` | `connect.spec.ts` ×4; drive check 16; shot `10` |
| C8 | Snippets pinned to `packages/sdk-ts/README.md`, with a control | `lib/connect/steps.test.ts` (8 tests) |
| C9 | The apps-resolving card is absent **and explained** | `connect.spec.ts` / `deploy.spec.ts`, each with a control |
| C10 | A key is shown once and never again | `settings-keys.spec.ts` "shows a minted key once and never again"; drive checks 13–14; shot `08` |
| C11 | Rotate leaves two rows; the old key stops authenticating | `publishes.test.ts` ×4 in `packages/db`; `settings-keys.spec.ts` ×2; drive check 15; shot `09` |
| C12 | The Publishing switch toggles and survives a reload | `settings-keys.spec.ts` ×2 |
| C13 | Three pages, one navigation, `aria-current`, **no `role="tab"`** | `settings-keys.spec.ts`, with the control on a page that *has* tabs |
| C14 | The editor header names the version and reaches Deploy | `deploy.spec.ts` "the editor header names the version…"; drive checks 4–5; shot `01` |
| C15 | The Runs banner appears when blocked and **not** when it is not | `runs-blocked.spec.ts`, both directions; drive check 8; shot `04` |
| C16 | `pnpm forbidden-words` passes | gate green; it caught one identifier on the first run — §6.3 |
| C17 | Amber only for drift | `deploy.spec.ts` "no gate row is amber when nothing has drifted", with the control. **Criterion corrected mid-epic — ruling 11, §3** |
| C18 | 390px and keyboard | `deploy.spec.ts`, `connect.spec.ts`; drive checks 18–21; shots `11-*` |
| C19 | `binary-files` covers `docs/`, `sdks/`, `scripts/`, and **fires** there | `apps/web/binary-files.test.ts` (11 tests) |
| C20 | `test`, `typecheck`, `lint` green; `gates.mjs ci` green on the commit | §8 |
| C21 | The drive, key minted through the UI | 22/22, §5 |

---

## 3. The one ruling that changes a document of yours

**Ruling 11, and it is the only thing in this epic that needs your eye.**

`docs/design/README.md`'s colour correction says: *"the prototypes use amber for 'unsaved' and for
cost deltas. Amber means drift only. 'Unsaved' and cost deltas use neutral ink."*

`packages/core`'s `publish/gate.ts`, shipped in EPIC-051, gives a moved cost the **`drift`** verdict,
with its own comment: *"Rule 10 gives amber exactly one meaning and this is it: a number that
moved."*

Those are flatly contradictory and one of them is wrong. **I followed core**, for three reasons: the
README's correction was written about the *mockup's* badge, which paints a delta amber whether or not
there is anything to compare it against; core's row fires only when a Live build exists and the
number is genuinely different, which is what the word drift means; and `CLAUDE.md` rule 10 defines
what amber **means** rather than which rows may earn it. Re-deciding it from a page would also put
the meaning of a colour in two places.

The half of the README's correction that was always about this page — "unsaved" is ink — still binds
and is kept, along with the blok-diff row.

**C17 as I first wrote it said cost deltas are always ink, and therefore contradicted shipped code.**
I corrected the criterion rather than quietly building against it, and both the correction and the
reason are in the epic file.

---

## 4. What the epic decided, in one line each

Ten rulings, all in `docs/decisions/AUTONOMOUS.md`, plus ruling 11 above.

1. **Settings is three routes joined by links**, not a `role="tab"` tablist — a control that changes
   the URL is a link, and `role="tab"` promises a panel swap that is not happening.
2. **The apps-resolving table is not built.** There is no CDN. An empty table is a *claim*, and the
   wrong one for a customer whose apps are calling. GATE 5's demand measure is that number.
3. **The Connect page generates `prompts.ts` itself**, from this project's rows, rather than
   previewing a file `41p pull` (EPIC-053) would write.
4. **The page's snippets are pinned to the SDK README by a test**, with a positive control.
5. **`publishVersion` splits into `previewPublish` + commit.** One gate evaluation, two callers.
6. **Rotate is revoke-and-mint, two rows**, so "which key was in the field on Tuesday" has an answer.
7. **The Publishing tab keeps EPIC-051's one switch** and says beside it that rule 9 is not optional.
8. **The build hash appears once per page under a label**; the identity is `Draft vN` / `Live vM`.
9. **`binary-files.mjs`'s roots widened** and two committed NUL bytes removed — §6.1.

---

## 5. The drive

`npx tsx scripts/drive-epic-055.mts`, **22 of 22**, against `next build` + `next start` on
`localhost:3115` with the built `@41prompts/sdk` from `dist/`. Screenshots in
`docs/epics/reports/screenshots/EPIC-055/`.

`BUILD_ID` was checked in the served HTML before anything was asserted (lesson 17), and the server
was killed and restarted between builds rather than assumed.

It creates the project, the prompt and every blok **by clicking**, publishes, breaks the input
contract, reads the banner on Runs and the disabled button on Deploy, publishes anyway with a
reason, undoes with a reason, **mints and rotates a key through the keys page**, copies the
generated file, and then resolves the prompt from a separate Node process using that key. Then 390px
for all four pages and dark for two. It deletes its own account first and last.

**It declines the analytics banner before it starts.** Not tidiness: the banner is `position: fixed`
across the bottom 117px, so every `fullPage` screenshot had a consent notice composited across the
page it was evidence for. EPIC-033's drive hit the readable version of this.

**Checked rather than assumed: the banner does not block the Publish buttons.** It is fixed to the
viewport bottom at `z-index: 40`, and Playwright's actionability check fails on a covered element —
the clicks passed.

---

## 6. What was found that no test would have found

### 6.1 Two committed documents contained a NUL byte, and the gate for that was pointed elsewhere

Found **before the epic started**, by scanning every tracked file rather than by any gate.
`docs/epics/reports/EPIC-052-report.md` and `docs/epics/sessions/EPIC-052-session.md` each carried
one, in the sentence describing lesson 20 — which is the lesson about a NUL byte reaching a file.

`scripts/binary-files.mjs`'s roots were `packages` and `apps`. Its own comment said *"`sdks/` and
`scripts/` are not covered"*; `docs/` was not even on that list. **Lesson 19: a gate only guards what
it is pointed at.**

**Widening it exposed something about the gate itself.** It sniffed git's first 8000 bytes, matching
git's heuristic. The session log's NUL is at 5,755 and was caught. The report's is at **12,411** and
was not — `git diff` renders that file perfectly and it looks fine. `grep` has no window: it reads
the whole file, decides it is binary, and returns nothing. `grep -c '^#'` printed **0** for a report
with nineteen Markdown headings. That is lesson 20 happening to the document that records lesson 20.

The script now scans whole files and names which of the two harms each violation causes. Both bytes
are gone; grep finds 19 and 9 headings where it found zero.

`.gitattributes` needed no change — `*.md diff` had already kept the diff visible, verified by probe,
which is why the *review* hole was closed even while the bytes sat there. This is the other half.

### 6.2 The generated `prompts.ts` could not fill its own prompt

**The most valuable thing the drive found, and no unit test would have.**

The file was built from *declared* variables. A prompt whose text says `{{customer_name}}` while
nothing declares that name produced:

```ts
export function refundClassifier(v: { order_id: string })
```

— a function TypeScript will not let a developer pass `customer_name` to, on a prompt that needs it.
The model then receives the prompt with the placeholder still in it, which
`packages/sdk-ts/README.md` names in as many words as the failure *"nobody notices for a week"*.

The signature is now built from what the prompt **uses**; an undeclared name is always required
(optionality comes from a default and it has none); and the table marks it `not declared`, because a
variable with no contract is a real gap rather than a detail to paper over.

**How it was found is the part worth keeping.** The drive's check asserted the prompt id and the
function name, while its *detail string* claimed a signature it had never looked at — and that claim
was false. **A label is not an assertion.** The check now extracts the signature and asserts both
names.

### 6.3 Four smaller ones

- **The Connect page overflowed 390px by 56px.** Four columns, two of them unwrappable ids, and a
  table does not shrink below its min-content width. `e2e/overflow.ts` is new and names the offending
  elements rather than reporting a number — it skips elements inside a scroll container, because the
  first version listed three `<code>` elements above the one that was actually at fault.
- **Minting a key printed "Copy it now. This is the only time it is shown." twice.** Visible only in
  a screenshot.
- **The key list said "No keys yet" while a key was on screen above it**, for the moment between
  setting state and `router.refresh()` landing.
- **`pnpm forbidden-words` caught `block` as an identifier** in the generated-file writer, on the
  first lint. The gate did its job.

### 6.4 The NUL-byte test contained a NUL byte

Third instance of lesson 20, in the file whose subject is lesson 20 — a comment meant to name the
escape sequence and wrote the byte.

**The part worth keeping is why the local gate was green.** `pnpm binary-files` was run after
widening the roots and cleaning EPIC-052's documents, and **never again afterwards**, so it reported
"926 checked" for a set that did not include this file, which did not exist yet. That is failure 2 in
`PROCESS.md`'s "Local green is not CI green" table, verbatim: *"Local was asked about a set of files
that did not include the new one."*

`node scripts/gates.mjs ci` clones a commit, so it sees every tracked file. It went red in 9m32s on a
run whose other fifteen steps were green. **Nothing else in the loop would have caught it.**

---

## 7. Five failures that were my own test code, not the product

Recorded because the ratio matters when reading §6: of nine red results in this epic, four were the
product and five were the tests.

- Two ambiguous locators — the chrome's "Projects" matches a loose "Project"; a prompt named "Narrow
  connect" matches a loose "Connect". Playwright's strict mode was right both times.
- One loose `getByText` that also matched the generated file's own comment.
- One `textContent()` read that did not wait for the re-render, and **reported a rotation defect in
  code that was correct**.
- One drive locator where `/anyway$/` matched both the disclosure button and the confirm.

`HANDOVER.md` lesson 21: when a drive goes red, read the assertion before reading the code. It
applied four times out of five.

---

## 8. Gates

```
pnpm test        8 checked, 8 passed
pnpm typecheck   8 checked, 8 passed
pnpm lint       11 checked, 11 passed
pnpm e2e        260 passed, 4 skipped (Linux-only visual baselines; the reporter names them)
```

`node scripts/gate-run.mjs` → `gates.mjs ci` on commit `b2142dd7`: **16 steps, all passed, 9m33s.**

**What that green does not cover**, printed by the run and repeated here because it is part of the
result:

1. **The runner is Linux and this is darwin.** The four visual-regression baselines are `-linux.png`
   and their specs skip here. A layout change can pass this run and fail CI (CI #206). **This epic
   adds three stylesheets and changes a shared page head**, so that gap is wider than usual.
2. **The runner is slower than this machine.** A test that only fails under load passes here.

And, since nothing is pushed: no second machine builds this, no image is built, nothing deploys, and
Coolify's environment, Traefik and migrations against the real database are all untested.

**One environment event, named so it is not read as a gate result.** The first `gates.mjs ci` run
after the NUL fix failed at *setup* with "the throwaway database would not start" — Docker Desktop's
VM disk was full while the host had 18 GB free, which is the distinction `PROCESS.md` records. 68
dangling volumes, 3.485 GB, pruned after checking that all three in-use volumes were attached to
running containers. The three containers and their volumes survived. `docker volume prune` without
`-a`, so no stopped project's named volume was touched.

---

## 9. Not built, and why

1. **The apps-resolving table.** Ruling 2. Needs CDN access logs, which need a CDN, which needs an R2
   bucket — **yours**. Part of GATE 5's demand measure, so it matters that it stays honest.
2. **Python and Swift on Connect.** The roadmap's Goal line is "TypeScript path only".
3. **`41p pull` and the lockfile.** EPIC-053.
4. **"Require passing checks".** EPIC-051 ruling 4, restated and now explained on the page.
5. **Team and Billing settings.** Stage 6.
6. **A model picker on Deploy.** One model exists; the route already takes `targetModel`.

---

## 10. Open questions, all yours

1. **Ruling 11 changes a line of `docs/design/README.md`.** §3. Amber on the cost row when it has
   moved — core's call, followed rather than re-decided. If you disagree, the change is one line in
   `deploy.css` and one verdict in `packages/core`.
2. **`drive-epic-051.mts` and `drive-epic-052.mts` still mint keys directly.** EPIC-052's handover
   said both *"should stop"* when this tab shipped. I did not change them: they are the committed
   evidence of their own epics and re-pointing them means re-running two drives to prove they still
   work. EPIC-055's drive is the evidence that the tab works. Say if you want them re-pointed.
3. **An undeclared variable now appears in the generated file.** §6.2. The alternative reading is
   that Connect should refuse to generate until every used name is declared. I chose the working
   file plus a visible marker, because a developer who cannot build is a developer who does not
   connect — but "make them declare it first" is a defensible product call and it is yours.
4. **`packages/ui`'s `token-contract.test.ts` names `0` as an allowed `border-radius` and then
   rejects it.** Its title says "(999px pill, 0)"; the assertion allows only `999px` and
   `var(--radius…)`. I removed my redundant declaration rather than change somebody else's gate.

---

## 11. No new dependencies

None. Nothing was added to any `package.json`.

---

## 12. Verify it

```
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate

pnpm --filter @41prompts/db test          # revoke and rotate
pnpm --filter @41prompts/web test         # previewPublish, the generated file, the README pinning
E2E_PORT=3100 pnpm e2e --grep "Deploy|Connect|Settings|blocked"
node scripts/gate-run.mjs                 # the whole of CI, on the commit

# the drive — see scripts/drive-epic-055.mts's header for the four commands before it
npx tsx scripts/drive-epic-055.mts
```

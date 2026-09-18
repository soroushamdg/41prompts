<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-032 report — web: inputs, run, results, attribution

Date: 2026-09-15 · Branch `epic/032-runs-web` · Commits `b550035`, `1f982fc` (plus `4c5c904`, the
process change this session also carried)

**This epic was started by an unattended run on 2026-09-14 and stopped mid-`implement` by the STOP
file.** About three thousand lines of it were on disk, uncommitted, when this session picked it up.
Everything below the "What was already on disk" line was verified rather than assumed: the tests
were run, the e2e was run, and the drive found two things nothing had driven.

---

## 1. What changed about how this project works, and why it is in this report

Soroush's ruling of 2026-09-15: **nothing is pushed**. No `git push`, no pull request, no GitHub
Actions. The reasons and the full replacement pipeline are in `CLAUDE.md`, "Nothing is pushed", and
`docs/PROCESS.md`, "The local pipeline"; the three rulings it took are in
`docs/decisions/AUTONOMOUS.md`.

**The one part that needed a decision rather than a deletion was the browser drive.** The Definition
of Done said "the deployed page was loaded in a browser and looked right", and there is no deploy
now. Dropping it was the alternative, and it is the failure this project has already paid for —
twenty epics passed every gate while the deployed `/app` rendered as unstyled text. So it moved onto
the **built** app: `next build`, `next start`, driven by hand, screenshotted. A built app fails the
way a build fails; `pnpm dev` cannot.

**What that gives up is named in §8 rather than implied.**

---

## 2. What was already on disk, and what this session did to it

Already written by the stopped run: `packages/core/src/inputs/` (CSV, binding, column checks),
migration 0007 and its four tables, the worker's Anthropic call site and `run-suite` queue, both web
routes, and four e2e specs. It typechecked. Its unit tests passed.

**It had never been linted, never been run end to end, and never been opened in a browser.** This
session found and fixed:

| # | what | where it was found |
|---|---|---|
| 1 | 10 lint errors (`NodeJS` is not defined ×9, a literal BOM inside a comment about BOMs ×1) | `pnpm lint` |
| 2 | An enqueue failure recorded as `provider_not_configured` | reading the diff |
| 3 | `worker-process.ts` killed `pnpm` and left the `node` worker it started alive on the queue | the e2e, failing in a way that looked like a product bug |
| 4 | Two e2e fixtures that were wrong where the product was right | the e2e |
| 5 | Better Auth's rate limits failing the suite as a broken sign-in | the e2e, after probing rather than guessing |
| 6 | Every run detail page headed with the literal `Run` | the browser drive |
| 7 | `execFileSync` never returning from a backgrounded process | the browser drive, hanging twice |

Items 3, 5, 6 and 7 were invisible to `pnpm test`. Item 6 was invisible to the e2e as well, which is
the whole argument for keeping a drive at all.

---

## 3. The three defects in shipped code

**3.1 `executeRun` sent the input twice.** It built `` `${compiled}\n\n${input}` ``. Once the row is
*substituted into* the compiled prompt — which is what decision 1 means by "the columns are the
variable bindings" — appending it sends every value a second time. **Nobody would have noticed**:
the model still answers plausibly. The epic file's note 1 predicted this and asked for the failing
test first, and `execute.test.ts` has it. `RunRequest.input` stays the canonical row serialisation,
hashed for the cache key, never appended.

**3.2 An enqueue failure told the user to fix the wrong thing.** `startRunAction`'s catch recorded
`provider_not_configured`, which reads as "no model provider is configured here" — on a deployment
where the key may be set and the *queue* is what failed. `queue_unavailable` is now its own
`RefusalReason` with its own sentence, and `view.test.ts` asserts the two differ. Two reasons rather
than one because they send a person to different places.

**3.3 The e2e leaked a worker on every run.** `worker-process.ts` spawned `pnpm`, which spawns
`node`, and killed `pnpm`. The node worker kept its pg-boss connection and **kept claiming jobs**.
Seven had accumulated before anyone looked, and the symptom was not a stray process: it was a
results spec whose run came back `provider_not_configured`, because a worker left over from the
*refusal* spec claimed the job first. The child is now its own process group, killed as a group,
with an `exit` handler for the runs that never reach `stop()`.

---

## 4. The rate limits, and why the fix is a hatch rather than a hole

Two limits bite a Playwright suite that neither is aimed at. **Probed rather than assumed** — the
numbers below are measured against the running app:

- `/api/auth/get-session`: request **101** is the first `429`. Better Auth's own limiter, 100 per
  minute per IP, and every navigation in a signed-in app asks for a session.
- `/api/auth/sign-in/magic-link`: request **16** is the first `429`. 15 per five minutes per IP.

A serial suite of 200 tests on one machine is one IP that exceeds both. **The symptom is not a
message about rate limiting.** The magic-link verify returns 429 and simply does not redirect, so
the failure reads as a broken sign-in — which is why this took two rounds of diagnosis before the
endpoints were probed directly.

`rateLimitEnabled()` in `apps/web/lib/auth.ts` turns the limiter off for `E2E_RATE_LIMIT_OFF=1`,
with the three guards `apps/worker/src/runs/provider.ts` already established for `FAKE_PROVIDER`:

1. **Off unless set.** The flag appears nowhere in `infra/` — checked, not assumed.
2. **Refused when `DEPLOY_ENV` is production**, whatever the flag says.
3. **Announced** at construction, so a process that is not limiting requests is never quiet about it.

**What still proves the limits work:** `auth.rate-limit.test.ts` does not set the flag, and asserts
both limits against a real database. Three new tests assert the guards themselves. That is the
difference between an escape hatch and a hole.

---

## 5. Two e2e fixtures were wrong where the product was right

Worth recording because the first instinct in both cases was to suspect the code.

**`I am sorry, no.` has a comma in it.** Unquoted, against a one-column header, that is two fields —
and `parseCsv` refused it with "Line 3 has 2 values where the header names 1." Correct, by RFC 4180,
and named precisely. Every test that ran a suite then failed looking for a Run button that the
refusal meant was never rendered. The fixture is now quoted, with the comment kept: a person pasting
a sentence into a spreadsheet column will hit exactly this.

**The cache is keyed by content, not by prompt id.** `cacheKey` is the prompt hash, the input hash
and the model, so six tests building the same bloks and uploading the same CSV had already filled
the cache for that content. The one test that needs a *charged* first run was reading a cache hit.
That is EPIC-031 decision 5 working exactly as specified; the fixture had to become unique, not the
cache weaker. `promptWithChecks` takes an optional marker for that one test alone.

---

## 6. Acceptance criteria

**Group A — driven in a browser.** Driven against the built app at `localhost:3000`, not deployed
staging (§1). Screenshots in `docs/epics/reports/screenshots/EPIC-032/`.

- [x] A CSV whose header names the prompt's variables uploads, and its rows are listed with their
      count. `runs.spec.ts:42`; drive check 6–7; shot `03-input-set-uploaded.png`.
- [x] A CSV with a column matching no variable is refused at upload, naming the column, and the rows
      are not stored. `runs.spec.ts:52`; drive checks 4–5 ("The column “urgency” matches no variable
      this prompt declares. Nothing was saved."); shot `02-upload-refused-names-the-column.png`.
- [x] A CSV missing a required variable's column is refused naming the variable; one missing only an
      optional variable is accepted. `runs.spec.ts:64`.
- [x] A prompt with no declared variables says so instead of accepting a file. `runs.spec.ts:88`.
- [x] Triggering a run with no provider produces a run **refused with its reason named in words**.
      `runs-refusal.spec.ts:43`; drive check 9 ("Refused — no model provider is configured here, so
      there was nothing honest to run against"); shot `04-run-refused-no-provider.png`.
      **Note what this needed**: a worker that is *up and has no key*. With no worker at all the job
      stays `queued` and the page says "Waiting to start" indefinitely — see §9.
- [x] Run history lists runs newest first with their state, and a refused run is legible as refused.
      `runs-refusal.spec.ts:60`; drive check 10; shot `05-history-shows-the-refusal.png`.
- [x] Every interactive element works by keyboard and at 390px. `runs.spec.ts:126` (keyboard, 390px,
      axe); drive check 17 measured 0px of horizontal overflow; shots `11-` and `12-`.

**Group B — the results surface.** Playwright against the deterministic fake, plus the drive.

- [x] Results listed **by check**, each with its owning blok, a meter, and a pass/fail icon beside
      the colour. `runs-results.spec.ts:92` asserts the glyph, not the colour; drive checks 12–14;
      shot `06-results-by-check.png`.
- [x] A failing check opens a detail with the failing region highlighted from `Evidence` offsets.
      `runs-results.spec.ts:121`; drive check 16 (`sorry`); shot `07-`.
- [x] The failure names **exactly one** owning blok and renders its card. Same test and shot.
- [x] "Create constraint from this failure" previews before adding; cancelling adds nothing;
      confirming adds one and **no existing blok's `updatedAt` moves**, asserted at the database.
      `runs-results.spec.ts:141`; drive checks 18–19; shots `08-`, `09-`.
- [x] A run whose checks are all `not_graded` does not render the same text as one whose checks all
      passed, and the sentence says how many and why. `runs-results.spec.ts:182` and `:199`;
      `view.test.ts`; shot `10-` shows "2 of 6 could not be checked: 2 because the rule does not say
      what to measure."
- [x] The cost says what it counts; a re-run shows zero calls and zero spend.
      `runs-results.spec.ts:228`; drive check 20 read "This run spent $0.02 — what its 2 calls cost,
      not the cost of everything on this page."
- [x] Progress advances without a reload while a run is in flight. `runs-results.spec.ts:245`.

**Group C — the first real call.**

- [ ] **Not done, and not skipped silently.** `ANTHROPIC_API_KEY` is set nowhere reachable from this
      machine, so **no call has ever been made to Anthropic by this project**. Group C's second
      bullet is what happened instead: the refusal path is what the drive shows, and it is ticked
      above. `apps/worker/src/runs/anthropic.ts` exists and is imported, and **nothing has executed
      it** — the fake is what every test and the drive ran against. EPIC-031a is still the row that
      closes this, and it still needs Soroush. **There is no real cost-in-cents number yet**; the
      `$0.02` on the screenshots is the price table applied to the fake's token counts, not money
      anybody spent.

---

## 7. Verification

```
pnpm test                    8/8 packages pass
pnpm typecheck               8/8 packages pass
pnpm lint                    11/11 checks pass
pnpm e2e                     196 passed, 4 skipped (Linux-only visual baselines)
node scripts/gates.mjs ci    16/16 steps pass on 1f982fca, 6m40s
node scripts/drive-epic-032.mjs   20/20 drive checks pass, 12 screenshots
```

To re-run the drive, the header of `scripts/drive-epic-032.mjs` carries the five commands.

---

## 8. What a green here does not cover

`gates.mjs ci` prints this itself and it is part of the result, not a footer. Both of its points
stand, and **the no-push ruling adds four more**:

1. **The four visual-regression baselines are `-linux.png` and skipped on darwin.** A layout change
   can pass everything here and fail on Linux — CI #206. This epic added CSS (`runs.css`, 320 lines)
   and a new page head, so it is exactly the kind of change that gate exists for.
2. **This machine is faster than a CI runner.** A test that only fails under load passes here.
3. **No second machine ever built this.** `gates.mjs ci` is a clean checkout on the one machine whose
   caches are already warm.
4. **No image was built.** A `Dockerfile` regression is invisible until the next push.
5. **Nothing was deployed.** Coolify's environment, Traefik, the migration against a real database,
   and the apex under a container swap are all untested for this change.
6. **`pg-boss` in `apps/web` is new**, and `serverExternalPackages` is a build-output decision that a
   local `next start` exercises but a container image may not identically.

`docs/PROCESS.md`, "Local green is not CI green", catalogues five consecutive CI failures on
locally-green PRs, three of them from the Linux/clean-checkout difference. **The first push after
this gap should be expected to go red**, and that is a prediction rather than a worry.

---

## 9. Open questions for Soroush

1. **A run with no worker at all sits `queued` for ever.** The page says "Waiting to start", which
   is true and has no timeout behind it. The epic's criterion — a refusal in words rather than a
   spinner that never ends — is met for the case it names (a worker that is up with no key), and
   this is the neighbouring case it does not. In production a worker is always up, so this is a
   staging-and-local shape. Should a `queued` run older than *n* minutes say something? Not built;
   not in scope; flagged rather than invented.
2. **EPIC-031a is still the only path to a real call**, and it needs the key in Coolify and a person
   watching. Nothing in this epic changed that. It is now the single largest untested surface in
   Stage 3.
3. **The `$0.02` figure is synthetic.** Anyone quoting a cost-per-run from these screenshots would be
   quoting the price table, not an invoice.
4. **`E2E_RATE_LIMIT_OFF` is a flag in production code.** Guarded three ways and tested, and
   still worth your eye, because that is the shape that goes wrong quietly.

---

## 10. For the advisor

- The epic file's decisions 1–7 all landed as written; none was reinterpreted.
- Two things EPIC-031 handed forward both shipped on the surface it named: the `fullyChecked: false`
  sentence and the cost-says-what-it-counts sentence, both in `view.ts`, both unit-tested, both in
  shot `10-`.
- `RefusalReason` gained **two** members, not one: `provider_not_configured` as the epic asked, and
  `queue_unavailable` which it did not — §3.2 has the reason.
- The workbench's third tab is still unbuilt and still called **Checks**, per the note EPIC-021b
  left. Untouched.
- `docs/roadmap.md`'s "CSV **and manual rows**" stays narrowed to uploaded CSV, per decision 1.

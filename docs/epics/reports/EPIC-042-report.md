<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-042 — three providers, the key a person brings, and the two pivots

**Built 2026-09-16.** Branch `epic/042-providers`, merged into local `main` with `--no-ff`.
Nothing pushed (`CLAUDE.md`, "Nothing is pushed").

**This is the last row in Stage 4.**

## 1. What is true now that was not this morning

A person brings their own key at Anthropic, OpenAI or Google; runs one prompt against every
provider they have a key for in one press; and reads the answer two ways — by check across
providers, and by input across a run.

Concretely:

- **Two new adapters** behind EPIC-031's `Provider` interface, and one shared body: `ai-sdk.ts` is
  now the only place this project calls `generateText`.
- **Seven pinned models across three providers**, in a catalogue both apps read, with a price row
  each carrying the provider, the date it was read and the page it came from.
- **`/app/settings/providers`** — paste, see the last four, switch off, test, remove. Linked from
  the chrome on every signed-in page.
- **A run picks its provider from its model and its owner**: their key, then the deployment's, then
  a refusal in words.
- **The provider matrix** on the run detail page, and **the "By input" heatmap** behind real ARIA
  tabs beside the by-check results.
- **`docs/providers/usage-policies.md`**, read 2026-09-16, with the three providers' own terms on
  what happens to somebody's prompts.

## 2. Acceptance criteria, with evidence

| | criterion | evidence |
|---|---|---|
| A1 | `openaiProvider` and `googleProvider` exist, implement `Provider`, unit-tested against a fake `fetch` | ✅ `apps/worker/src/runs/ai-sdk.test.ts`, 11 tests. Three wiring tests assert the **URL each adapter is actually constructed against** and that the key travelled in a header — `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, and `/chat/completions` for OpenAI |
| A2 | every catalogue model has a price row with provider, `readOn` and `source` | ✅ `apps/worker/src/runs/prices.test.ts`, 11 tests, both directions (no unpriced model, no priced model the catalogue lacks) |
| A3 | `providerForRun` prefers the owner's enabled key, falls back to the deployment's, then refuses | ✅ `apps/worker/src/runs/provider-for-run.test.ts`, 10 tests, all three branches plus the cross-provider case |
| A4 | opening a stored key stamps `last_used_at` | ✅ same file, "stamps last_used_at when it opens a stored key"; and `packages/db/src/provider-keys.test.ts` asserts that the *plain* read deliberately does not |
| A5 | the settings page renders three providers and EPIC-043's guidance | ✅ `providers.spec.ts` "is reachable from the chrome"; drive §01, §04 |
| A6 | a rejected key stores **nothing** and says so naming the provider | ✅ `providers.spec.ts` "refuses a key the provider will not take"; drive checked the **table**, not the sentence: 0 rows |
| A7 | a key can be switched off and back on without being removed, and a run honours it | ✅ unit (`provider-for-run.test.ts`), e2e (`providers.spec.ts`), and the drive: Google switched off ⇒ **two** runs, not three |
| A8 | testing a stored key is a job, and `apps/web` contains no call that can open an envelope | ✅ `apps/web/no-key-opening.test.ts` greps every `.ts/.tsx/.mts/.mjs` under `apps/web` for four function names, and proves the grep would catch one |
| A9 | "Run on every provider" creates one run per keyed provider, sharing one `comparison` | ✅ `providers.spec.ts` asserts it in the **database** — three runs, one comparison — because the page cannot tell a comparison from three coincidental runs |
| A10 | the matrix renders a row per check and a column per run, with counts and an icon | ✅ `providers.spec.ts`; drive §06, §09 |
| A11 | real ARIA tabs, "By check" and "By input" | ✅ `packages/ui`'s `Tabs`, third use; `providers.spec.ts`; drive §07 |
| A12 | every cell a `button` named `input 17, fail`, keyboard-reachable, with a shape difference | ✅ `providers.spec.ts` + drive: 12 cells, every name matching `^input \d+, (pass\|fail\|not checked)$`, **one tab stop** for the whole grid, Enter opens, arrows move both ways. The shape difference is read off the **computed** style — the failing cell is `repeating-linear-gradient(45deg, …)` and the passing one is `none` |
| A13 | concurrency above one, with the budget still unbreachable | ✅ `apps/worker/src/runs/concurrency.test.ts`, 7 tests, including one that records the **peak** number in flight and one that proves results are placed by index when they complete out of order. The cap is unchanged: `incrementRunBudget` is a single conditional `UPDATE` and `suite.test.ts`'s "stops at the budget cap" still passes |
| A14 | `docs/providers/usage-policies.md` exists, names the three, cites and dates | ✅ written, four documents read 2026-09-16, each quoted with its URL |
| A15 | no provider key reaches any log sink from any of the new paths | ✅ `apps/worker/src/runs/test-key.test.ts` "never writes the key into the row, even when the provider echoes it back" — the stub answers `Incorrect API key provided: <key>` and the stored detail contains `[redacted]`. The drive checked `runs.payload`, `suite_runs.params` and `suite_runs.prompt_text`: 0 rows |
| A16 | the heatmap is readable at the largest input set the product allows | ⚠️ **Partly. See §6.** Driven at 6 inputs; `MAX_INPUTS` is 100 and the roadmap's 500 is not reachable |
| A17 | `node scripts/gates.mjs ci` green on the commit | ✅ 16 steps, all passed, 8m55s, on `22a16bf` |
| A18 | driven by hand against the built app, screenshotted | ✅ 11 screenshots, `docs/epics/reports/screenshots/EPIC-042/` |

## 3. The two decisions EPIC-043 left for this epic

EPIC-043's report §11 made one recommendation: *EPIC-042 should not store the first real key until
`043a` and `043e` are decided.* Both are decided, and the first is effectively built.

**`043a` — where does the "test this key" call run? In the worker.** So `apps/web` never opens a
sealed envelope, and the split the threat model asks for is one environment variable with no code
change. This is not a claim — it is exercised: the e2e suite and the drive both run a web process
holding **only** `KEY_ENCRYPTION_PUBLIC_KEY`, and it seals three keys. `apps/web/no-key-opening.test.ts`
is the other half.

**The split is additive and breaks nothing on deploy.** `masterKeysFrom` prefers the secret when a
process has it, so a Coolify environment that gives both containers the same block keeps working
exactly as it does now. Making the split real is setting one variable on each container; that is
`043a`'s row and it is still Soroush's to schedule.

**`043e` — refusing an unrestricted key at entry. Decided: not now, and here is the finding that
decides it.** "Is this key valid" is one call every provider answers. "What is this key allowed to
spend" is an organisation-scoped billing read that two of the three do **not** expose to an ordinary
API key at all. Building half of it would ship a control silently absent for two providers, which is
worse than EPIC-043's words on a page. The entry path now makes the validity call; the scope call
goes in when a provider offers one. That finding belongs in `043e`'s row.

## 4. What the browser drive found that the tests did not

Three things, and this is the third epic running in which the drive earns its place.

**4.1 — the e2e suite made a real HTTPS call to `api.anthropic.com`.** The fake verifier started in
`apps/web`, on the reasoning that the web is where a person pastes a key. The worker's "test this
stored key" job called `verifyProviderKey` directly, so a suite with an invented key got a genuine
`401 authentication_error` back from Anthropic. **A seam in one of two callers is not a seam**: it
moved into `packages/db`, is the only way either process asks, and carries the three guards.

**4.2 — a partner run still in flight rendered as "nothing graded".** A comparison's runs are queued
together and the worker takes them one at a time, so the first to finish showed a matrix whose other
columns were empty. "Nothing graded" is a statement about a *prompt* — no check here could be decided
— and reading it about a run that has not got there yet is being told a verdict that does not exist.
A cell now says "still running" or "did not run", and the page keeps polling while any partner is in
flight. **The e2e could not have caught this**: it waits on a state the database already has.

**4.3 — the drive's own fixture was six passing inputs**, so every heatmap cell was green and the
shape difference rule 10 turns on had never been rendered for anybody to look at. One input now
fails; §09 is the screenshot, and the assertion reads the *computed* background rather than a class
name.

**And one thing the drive found by being looked at:** `google.ts` claimed the settings page told
people about the unpaid Gemini quota's data terms, and it did not. It does now.

## 5. One diagnosis worth keeping, because it cost forty minutes

Fixing 4.1 was one line. Working out why **three other tests** failed alongside it took much longer,
and the answer is not in this product at all:

> **Playwright shuts its worker down after a test times out and starts a fresh one, which re-runs
> `beforeAll`.** `beforeAll` here signed in as `providers-${Date.now()}@example.test`, so the
> replacement worker had a **different user** — and three tests that used a key stored by an earlier
> test failed for a reason that had nothing to do with them.

It was settled by polling `provider_keys` and `users` from outside the run, once every two seconds,
which showed the user count going `1 → 0 → 1` mid-suite. That is `docs/PROCESS.md`'s "probe the
thing rather than reasoning about it": forty minutes of hypotheses, ninety seconds of `psql`.

The rule it produces is the same shape as PROCESS.md's helper rule: **a test asserts about state it
created itself.** Every test in `providers.spec.ts` now calls an idempotent `ensureKey`, and the
keyboard walk moved inside the test that makes the run it walks over. One defect now produces one
failure.

## 6. What is not covered, stated plainly

**6.1 — no provider was called, by anything, at any point.** `FAKE_PROVIDER=1` in the e2e and in the
drive means both the key verification and the model calls are the deterministic fake. So nothing
here proves that OpenAI or Google accept a key, answer a prompt, or price a call the way the table
says. **The first real call to either is still ahead**, and it is the EPIC-031a shape: it will find
things a fake cannot.

**6.2 — A16 is partly met.** The roadmap's review line says "heatmap readable at 500 inputs".
`MAX_INPUTS` is **100** and this epic does not raise it, so 500 is not reachable through the
product. The drive rendered 6 inputs × 2 checks and the layout is a flex row inside a horizontally
scrolling panel, so 100 is a 100-cell row — but **nobody has looked at 100**, and 500 would be 500
buttons per row in the accessibility tree, which is a real question and not a styling one. Not
ticked on the intention.

**6.3 — the local drive is not a deployed one.** No image build, no Coolify environment, no Traefik,
no migration against a real database. `origin/main` is 21 commits behind local `main` and staging is
serving `da42eee`, so **no staging URL is evidence about any of this**.

**6.4 — `gates.mjs ci` printed its own two gaps** and they are part of the result: the runner is
Linux and the four visual-regression baselines are `-linux.png`, so they skipped here; and the
runner is slower, so a test that only fails under load passes here for the same reason it passed
before.

**6.5 — the crypto is still unreviewed.** Unchanged from EPIC-043 and repeated because this is the
epic that starts storing keys in earnest: nobody has reviewed the sealed-box construction.

**6.6 — nothing retries a 429.** Concurrency is a limit, not a rate limiter. Google's is 1 for that
reason; the other two are conservative. A retry policy is its own epic with its own failure modes.

**6.7 — `last_used_at` is not an audit log.** Threat model finding 4 wants a row per open naming who
and when. This is one timestamp, which is enough for a settings page and not enough for an
investigation. Row `043c`, unchanged.

## 7. New dependencies

Two, both Apache-2.0, both with exactly the two transitive dependencies `@ai-sdk/anthropic` already
has:

- **`@ai-sdk/openai@^4.0.69`** — `CLAUDE.md`'s stack line is "Vercel AI SDK for providers".
- **`@ai-sdk/google@^4.0.74`** — same.

`@ai-sdk/anthropic` and `ai` were bumped to `^4.0.56` and `^7.0.104` so that all four align on
`@ai-sdk/provider@4.0.17`. Mixed versions are a **type** error — two structurally identical
`LanguageModelV4` types from two copies of the package — not a runtime risk, and the bump is the
smaller fix. `license-gate --sbom` passed.

## 8. Verify it

```
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate

pnpm test          # 8 packages, all PASS, no PARTIAL
pnpm typecheck     # 8 packages
pnpm lint          # 11 checks including the forbidden-word grep
pnpm e2e           # 225 passed, 4 skipped (the Linux-only visual baselines)
node scripts/gates.mjs ci

# the drive — see scripts/drive-epic-042.mjs's header for the two server commands
node scripts/drive-epic-042.mjs
```

## 9. Numbers

| | |
|---|---|
| `gates.mjs ci` | 16 steps, all passed, **8m55s**, commit `22a16bf` |
| `pnpm e2e` | **225 passed, 4 skipped**, 5.6 min |
| new tests | 11 adapters · 11 prices · 7 concurrency · 10 provider selection · 6 test-key job · 16 verifier · 10 key store · 12 view models · 2 no-key-opening · 5 master key · 6 e2e |
| new migration | `0014_odd_meteorite.sql` — five columns on `provider_keys`, all additive |
| drive | 11 screenshots, 24 checks, all passed |

## 10. Files worth reading first

- `packages/db/src/verify-key.ts` — the one place either process asks whether a key is real, and
  the reason the key never reaches a URL at any provider.
- `apps/worker/src/runs/provider.ts` — `providerForRun`, and why a key that will not open throws
  rather than quietly spending our money against somebody's intent.
- `apps/worker/src/runs/prices.ts` — three concurrency numbers with three different reasons.
- `apps/web/lib/runs/view.ts` — `heatmapRows` and `matrixRows`, both pure, both tested, neither
  deriving a fact the database does not have.
- `docs/providers/usage-policies.md` — the Google unpaid-quota finding.

## 11. Open questions for Soroush

**11.1 — the judge now has its own provider, and that is a product decision as well as a fix.**
`JUDGE_MODEL` is a pinned **Anthropic** model. Until today every run was Anthropic's, so calling the
judge through the run's own provider happened to work; with three providers it would have asked
OpenAI for a Claude model. So the judge is resolved separately — **on the owner's Anthropic key when
they have one**. The consequence: somebody who brings only an OpenAI key, on a deployment with no
Anthropic key, gets deterministic checks graded and `refuses_to_answer` checks left `not_graded`.
That is honest and the page already renders it as "nothing could be checked", but it means **the
judge silently costs Anthropic money on a run against OpenAI**. If you would rather the judge always
be the platform's key, or be refused rather than skipped, say so.

**11.2 — does a normalised view satisfy rule 6? Still yours, and now three adapters wide.**
EPIC-031a's question is unchanged: `result.response?.body` came back undefined on the first real
call, so the stored "raw provider payload" is the SDK's normalised view. It was cheapest to answer
before this epic and it was not answered, so it now applies to OpenAI and Google too. The handling is
in **one** place (`ai-sdk.ts`) rather than three, so the fix — a `fetch` wrapper — is still one
change. I did not make it: your report flagged it as your call and I have no ruling to act on.

**11.3 — the platform-key fallback and the providers' reselling clauses.**
`docs/providers/usage-policies.md` has this in full. With a key a person brings it is not our
question. With **our** key it is: we are providing model access to an end user on our agreement, and
all three providers forbid reselling the service. Nothing changed here — it is what every run has
done since EPIC-031a — but it is now written down, and **EPIC-070 (Stripe, BYO-key unlock) is the
row that has to answer it**, with EPIC-071's lawyer hour.

**11.4 — `MAX_INPUTS` is 100 and the roadmap's heatmap line says 500.** §6.2. Raising it is a
product decision about cost, not a styling one: 500 inputs at a real model's prices is well past the
free plan's monthly cap.

**11.5 — the published master key is in the repository, both halves.** It is how the suite proves
the `043a` split, `masterKeysFrom` refuses it outright when `DEPLOY_ENV` is production, and three
copies of it are pinned together by a test. If you would rather it were generated per run, that
costs the split demonstration and I would want to hear it from you first.

**11.6 — five threat-model rows are still written and not added.** `docs/security/byo-key-threat-model.md`
§8 has `043a`–`043e` ready to paste. `043a` is now decided *and* built except for the environment
variable; `043e` is decided with the finding above. The other three are unchanged.

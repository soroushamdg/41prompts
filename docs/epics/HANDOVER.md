<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Handover

Where things stand as of **2026-09-18, after EPIC-072**, for whoever picks this up — person or
unattended run.
One page on purpose. `docs/PROCESS.md` is how to work; this is what is true right now.

**Check it against git before trusting it.** The version of this page dated 2026-09-14 said
"next epic: EPIC-032" for two days after EPIC-032 shipped, and a session started on it would have
rebuilt a finished epic. `git log --oneline -15`, `ls docs/epics/reports/`, and the `/healthz` of
both environments take a minute and are the truth.

## Start here

**EPIC-072 merged on 2026-09-18 (`637a669`) and Stage 6 has begun.** The marketing site has the
pages the nav promises: `/features`, `/delivery`, `/docs`, `/security`, `/changelog`, `/guides` and
`/legal/third-party-notices`.

**The thing to know before touching any page copy**: `apps/web/lib/site/claims.ts` holds every
marketing sentence as data, each naming the epic that shipped it and a path to the evidence, and
three tests bind it. A page may only render a sentence that is in the registry; a claim may only
name an epic that has a report in `docs/epics/reports/`; and `changelog.test.ts` walks those reports
in **both** directions, so an epic that ships user-visible work and is not mentioned fails the
build. If you want new copy and cannot name the epic that shipped it, that is the test telling you
something.

**Five of the mockup's site pages are deliberately not built**, each with its reason in
`docs/epics/EPIC-072-marketing-site-final.md`'s Out of scope: `/pricing` (needs EPIC-070 — no
checkout, no metering, and the roadmap marks its prices unvalidated), `/learn` (Stage 7), `/blog`
(EPIC-073 owns real content), **`/about`** and **`/careers`** — the last two need facts only Soroush
has, and `/about`'s mockup names a second co-founder. Do not build them from the mockup.

**What is next.** Stage 6's remaining rows are **EPIC-070** (Stripe — needs an account),
**EPIC-071** (`deferred`, lawyer) and **EPIC-073** (depends on EPIC-035, which GATE 3 deferred). So
the next buildable row is not in Stage 6: it is **Stage 7's EPIC-064** (a paper-prototype study,
which needs two recruited people) or **EPIC-060**, the lesson engine, which depends on it. There is
also unscheduled Stage 0 debt — **EPIC-006d**, staging and production sharing one R2 backup prefix,
which is a real isolation defect and is scoped in the backlog. **Nothing in Stage 6 or 7 has an epic
file**, so `pick-next-epic.mjs` would stop on the first `todo` row without one even if the gate cells
were fixed.

**`pick-next-epic.mjs` still stops on `▣ GATE 3`.** Both gates are decided — `GATE-3.md` Go on
2026-09-16, `GATE-5.md` Go on 2026-09-17 — and every epic behind both has shipped. The picker reads
the **status cell**, which still says `—` in `docs/backlog.md`. One word in each unsticks it and
both are Soroush's; `GATE-5.md`'s closing section is titled "One thing this decision cannot do for
itself".

**What EPIC-072 settled**, so it is not rediscovered:

1. **`apps/web/lib/site/public-routes.json` is the route table.** `links.ts`, `app/sitemap.ts`, the
   Lighthouse runner and `lib/site/routes-agree.test.ts` all read it, and that test fails if any of
   them grows its own copy. It exists because `sitemap.ts` had a hand-written list and simply did not
   mention six live pages — linked from the nav and invisible to a crawler that starts there.
2. **The nav's section links collapse below 900px**, as `41prompts-full-mockup.html`'s `.navlinks`
   does. With all four inline the nav is **185px wider than a 390px viewport**, and since the nav is
   on every page that made *every* public page scroll sideways — 17 e2e failures across three spec
   files, two of them belonging to other epics. Wrapping to a second row is BUG-069. Decompiler stays
   inline because `landing.spec.ts` asserts a 44px Decompiler link at 390px.
3. **The skip link lives in `SiteNav`**, not in each page. It was on two public pages out of eight.
   `/sign-in` and `/sign-up` render no nav and correctly still have none.
4. **Lighthouse is run by hand**, `scripts/lighthouse-site.mjs` against the built app, never from
   `gates.mjs` — a server, a browser and minutes, which is PROCESS.md's measured argument about the
   e2e container. Read `$?`, not the table. Its `is-crawlable` adjustment for `/contact`, `/sign-in`
   and `/sign-up` is **checked in both directions**; do not make it one-way, or a page silently
   dropping out of search becomes invisible.
5. **A spelled-out count is a claim the digit guard cannot see.** "Twelve things this does today"
   went stale inside one session. Prefer a lede with no number in it.
6. **`scripts/forbidden-words.mjs` exempts a string that resolves to a real path** in this
   repository — the filesystem, not a pattern, because a pattern is satisfiable by prose. Four
   controls, including "the artifact/schema is frozen".

**Stage 5b closed with EPIC-056 on 2026-09-18.** `41Prompts Inc.` is the copyright holder in every
licence header, `LICENSE` and `NOTICE`, and the public tree extracts, installs, tests and
licence-lints standalone with all six distributions. **Nothing is published and the repository has
not been created**: `docs/epics/reports/EPIC-056-report.md` §8 lists seven steps that need a person,
none ticked. Two package names — npm `41p` and PyPI `fortyone-prompts` — are **available and
unregistered**, which is EPIC-057's row `057b` and the one finding in this project that expires.

`docs/decisions/GATE-5.md` records Soroush's ruling of 2026-09-17: the **technical** reading. The row
is titled *Demand check* and its criteria are two demand numbers the same document marks *not
measured* elsewhere — but `roadmap.md`'s own reason for exempting this gate from the 2026-09-12
cancellation is technical: it guards the frozen artifact format and the SDK surface, both of which
are built, driven, and frozen in ADR-005 and ADR-006. `docs/epics/GATE-5-readiness.md` is the input
that decision was made on; it offered three readings and chose none.

**Neither demand number was measured and both are zero.** Not "measured and found low" — there is no
CDN, no deployed production carrying `/v1`, no published package and no customers. The decision
proceeds without the gate's own word, exactly as GATE 3's did, and `GATE-5.md` says so.

**EPIC-053 merged 2026-09-17** (`80d8ccb`). `41p` is real: `link`, `pull`, `check`, `run`,
`decompile`, plus the unscoped `41p` wrapper. A developer can hold their prompt the way they hold the
rest of their code.

**EPIC-054 merged 2026-09-17** (`db96cfc`). `fortyone` is real: `resolve()` answers from memory, disk or what
the deploy bundled, never waits for the network, never raises, and picks up a new published version
in about thirty seconds. Zero dependencies. A real Python process resolving a prompt published two
minutes earlier from the built app is the drive, 17 of 17. **Its PyPI publish was skipped, not
faked** — EPIC-006 is `deferred` and EPIC-056 is not reachable; report §8.

**EPIC-057 merged 2026-09-17** (`81efdc0`). The delivery path has a threat model —
`docs/security/sdk-threat-model.md`, six triaged findings — and the three weaknesses modelling it
found are closed in code. `/v1` is rate limited where it had no limit at all.

**What EPIC-057 settled**, so it is not rediscovered:

1. **A content address is not a signature, and `disk.ts` said so without drawing the conclusion.**
   Re-deriving `buildHash` proves a document *intact*, not *ours* — anyone who can write where an SDK
   reads can write any prompt text, compute the hash and pick the `promptId` too. On Linux and in
   every container `tmpdir()` is `/tmp` at `1777`, whoever creates our directory first sets its mode,
   and **`mkdir(mode=0o700)` does nothing to a directory that already exists**, so the `stat`
   afterwards is the control. `fortyone` refuses a non-private cache directory; `@41prompts/sdk` does
   not — see 2 below. **Only a signature fixes this properly**, and that is row 057c.
2. **ADR-006's 15 KB bundle budget refuses all three `@41prompts/sdk` mitigations**, measured four
   ways: baseline 15,121 of 15,360, and the cheapest single one is 290 bytes against 239 spare. There
   is no slack — `client.ts` 3,450 B, `verify.ts` 1,756 B, core's `sha256.ts` 2,178 B and
   `canonical.ts` 1,416 B are all load-bearing. ADR-006 predicted the budget binding and said to
   *measure what got in, not widen the number*, so working code was reverted. **The two SDKs now
   have different security postures and the Node one is weaker and in the majority.** Row 057a is
   Soroush's, with three options. **Do not re-attempt this without answering the budget question
   first** — the code is in the epic's history if the answer is "move it".
3. **`WarningCode` is NOT frozen against additions.** ADR-006 §7 says adding one is *"explicitly
   minor … the right trade against never being able to name a new failure"*, and it costs zero bundle
   bytes because the type is erased. EPIC-057's ruling 7 first claimed the opposite and was corrected.
   There is no `rate_limited` code only because `@41prompts/sdk` has no 429 behaviour to raise it and
   `test_divergence.py` holds both unions identical; the code arrives with the behaviour, in 057a.
4. **A rate limit must be counted AFTER authentication, never before.** EPIC-057's first version
   gated on the caller's address pre-auth, which meant **anyone could spend a target's shared egress
   budget and have that customer's whole fleet refused before it was authenticated** — a denial of
   service introduced by the mitigation for one. And it bounded nearly nothing: `keyFromRequest` does
   no query with no header and `apiKeyForPlaintext` refuses a malformed token before it reaches one.
   `v1-limits.test.ts` names the removed function so the shape cannot come back by copying an old
   diff. **Found by asking how the browser drive would demonstrate the limit, before the drive was
   written.**
5. **`fetch` really does drop `Authorization` across an origin** — measured now
   (`packages/sdk-ts/src/redirect.test.ts`), with a same-origin control. The comment had asserted it
   since EPIC-052 and EPIC-054 found the same claim was *false* for `urllib`.
6. **Five package names are unregistered on npm and PyPI**, `pip install fortyone` included, and the
   only mitigation is an account. **This is the one finding in the document that expires** — a name
   someone else takes first cannot be recovered. Row 057b, Soroush's, EPIC-006 is `deferred`.
7. **The two Python distributions have no mechanical publish guard.** `prepublishOnly` is an npm
   lifecycle script and there is no publish workflow; the four npm packages have both it and
   `provenance: true`. EPIC-056 is the change that has to carry the Python check.

**What EPIC-054 settled**, so it is not rediscovered:

1. **`refresh()` with no argument fetches nothing on a fresh client**, in both SDKs, and four
   documents said otherwise — the npm README, the package's own example, the Connect page's fourth
   step and the new Python README. Fixed; both SDKs now have a test. The behaviour is right and
   cannot change: neither package is ever told which prompts an application will use.
2. **`sdks/python/fortyone/_canonical.py` is a second implementation of core's encoding**, and it
   has to be. It is pinned by `tests/canonical_golden.json` (331 cases from Node) *and* by
   re-deriving `packages/core`'s own frozen v1 fixture. **Do not "simplify" it to `json.dumps`** —
   `json.dumps(1.0)` is `1.0` and `JSON.stringify(1.0)` is `1`, and the symptom is `hash_mismatch`
   on every build, which reads as tampering.
3. **The disk cache is one format shared with `@41prompts/sdk`**, same directory. Each language's
   suite reads a record the other wrote. `scripts/write-cross-language-cache.mts` regenerates both.
4. **`urllib` forwards `Authorization` across a cross-origin redirect and `fetch` does not.** Fixed
   in `_network.py`; `/v1/marker` redirects to a CDN, so without it a customer's key reaches
   somebody else's access log. **An input for EPIC-057.**
5. **`py.typed`, no `.pyi`** (ruling 1), and `mypy --strict` over the package and its suite.

~~**EPIC-056 is not reachable.**~~ **Superseded: it shipped on 2026-09-18.** `GATE-5.md` recorded it
as needing `github.com/41prompts/41prompts`, npm and PyPI trusted publishing, and an IP assignment to
a legal entity that did not exist — and Soroush reported all three done that morning. Kept struck
through rather than deleted, because the paragraph below it is still live and because a reader
arriving at `GATE-5.md`'s table should be able to see which row moved. **EPIC-057**'s external review
hour still needs a person and is still not ticked.

6. **The gate was starving itself, and the paragraph that used to sit here blamed the laptop.**
   Three `gates.mjs ci` runs failed `pnpm test` on timeouts — never assertions — in packages the
   epic never touched. Measured with `ps` during one run: **71 concurrent vitest processes and a
   load average of 262, on 8 cores**, because nine packages each size a vitest fork pool to the host
   while `turbo run` schedules ten tasks. `scripts/gates.mjs` budgets the total now, and the run got
   **faster**: 16 processes, load 60, `pnpm test` 1m26s to 1m03s, `@41prompts/db` 52.6s to 17.8s,
   `cli-generated-code.test.ts` 76.2s to 21.6s. Lessons 31 and 32 below.

**Node here is still translated, and that is now a second-order effect (2026-09-17).**
`/usr/local/bin/node` is a Mach-O **x86_64** binary on an **arm64** Mac — `oahd-helper`, Rosetta 2's
daemon, was the largest single CPU consumer during a gate run at 88%. `docs/PROCESS.md` has called a
native arm64 Node "the cheapest single change available to this number" since 2026-09-14 and it is
still unmeasured. It is worth doing and it is **not** what was failing the gates; installing a
toolchain is Soroush's machine, not this repository's.

**What EPIC-053 settled**, so it is not rediscovered:

1. **The bindings generator lives in `packages/core/src/codegen/`.** `apps/web/lib/connect/generate.ts`
   is a re-export and `41p pull` is the other caller. They write the same bytes and a test asserts it
   with a control. Do not add a second generator anywhere.
2. **The generated header changed** — it carries `docs/roadmap.md`'s *"This file is yours; 41Prompts
   claims no rights in it."* The Connect page's wording changed with it, deliberately (ruling 9).
3. **`41p run` does not call a model** and the report §8 says why. If that should change, it needs a
   `/v1` run endpoint with quota and rate limiting, and that is its own epic.
4. **Project ids collide and now retry.** `packages/db/src/create-project.ts`. `proj_` + 4 hex is
   65,536 values; the retry makes it safe and the id is still short enough to fire routinely on a
   busy account. **Widening it is Soroush's** — it is a `CLAUDE.md` naming rule and a migration.
5. **`scripts/pack-41p.mjs`** assembles the tree npm would install. Any drive or test that runs the
   binary uses it; running `tsx src/bin.ts` is the `next dev` failure in a new costume.

**The earlier state, for context. EPIC-050, EPIC-051 and EPIC-052 are done.** The artifact format is frozen
at v1 (ADR-005), a prompt can be **published**, and as of 2026-09-17 **a program outside this
repository can read one**: `@41prompts/sdk` resolves the Live prompt from memory, disk or what the
deploy bundled, never waits for the network, never throws, and picks up a new version in about thirty
seconds without a redeploy. ADR-006 freezes its public API.

**What EPIC-055 settled**, so it is not rediscovered:

1. **The API key can now be created by clicking**, and `drive-epic-055.mts` does. `drive-epic-051.mts`
   and `drive-epic-052.mts` **still mint directly** — they are committed evidence of their own epics
   and re-pointing them means re-running two drives. EPIC-055 report §10.2 asks whether you want that.
2. **`packages/sdk-ts/README.md` is the canonical copy of the Connect page's steps**, and
   `apps/web/lib/connect/steps.test.ts` now fails when the page shows a snippet the README does not
   have. The pinning exists; it is not something to remember.
3. **"Apps resolving" is still not built.** Ruling 2: the page says why in words rather than showing
   an empty table, because an empty table is a *claim*. Still part of GATE 5's demand measure.
4. **A bundled artifact has no version number** (EPIC-052 §8). `41p pull` writes builds under `41p/builds/<buildHash>.json`, so the file name is the address and the version is in `41p.lock.json` beside it — which answers it for the CLI's output and not for a hand-assembled bundle.
5. **One ruling of EPIC-055's changes a line of `docs/design/README.md`** — core paints a moved cost
   amber and the README says cost deltas are ink. Core was followed. Report §3.

**ADR-005 §7 is no longer cheap to reverse**, and is now read by a published SDK as well as by the
server. From here it is a v2 of the format.

**What EPIC-050 and EPIC-051 left open** is unchanged except that EPIC-013's parked question is now
answered — core's entry points are settled with `publishConfig`, source in the monorepo and dist when
published, and the Turbopack alias stays because it was never about publication
(`packages/core/src/package.test.ts` has the whole argument).

**`▣ GATE 3`'s status cell in `docs/backlog.md` still says `—`, and the gate is decided.**
`docs/decisions/GATE-3.md` records it: Go for Stage 4, loud launch deferred. `scripts/pick-next-epic.mjs`
reads the cell, not the decision file, so it stops on that row and will keep stopping.
**One word in that cell (`—` → `go`) unsticks it**, and only Soroush may write it — a run may edit
only its own epic's status cell.

## Stages

| stage | state |
|---|---|
| Stage 0–2 | **done.** Every epic has a report and a session log. |
| Stage 3 | **done.** 030 ✅ · 031 ✅ · 031a ✅ · 032 ✅ · 033 ✅ · 034 ✅ |
| **GATE 3** | **decided 2026-09-16** — `docs/decisions/GATE-3.md`. Go for Stage 4; **loud launch deferred**. |
| **Stage 4** | **done.** 040 ✅ · 041 ✅ · 042 ✅ · 043 ✅ (still awaiting Soroush's read of the threat model) |
| **Stage 5a** | **done.** 050 ✅ (artifact frozen, ADR-005) · 051 ✅ (publish, the gate, the store, `/v1`) · 052 ✅ (`@41prompts/sdk`, ADR-006) · 055 ✅ (Deploy, Connect, keys, the publish flow). |
| **GATE 5** | **decided 2026-09-17** — `docs/decisions/GATE-5.md`. Technical reading, go to Stage 5b. Neither demand number was measured; both are zero. |
| **Stage 5b** | **done, 2026-09-18.** 053 ✅ (`41p`) · 054 ✅ (`fortyone`) · 057 ✅ (the threat model, the `/v1` rate limit; its **external review hour did not happen** and is not ticked — report §8) · 056 ✅ (the split, the holder named, the mirror real — **but nothing published**, report §8). |
| **Stage 6** | **started.** 072 ✅ (the site's six pages and the claims registry; **five mockup pages deliberately refused**, report §8) · 070 Stripe (needs an account) · 071 `deferred` (lawyer) · 073 launch 2 (depends on 035, which GATE 3 deferred). No remaining row has an epic file. |

**EPIC-035 (loud launch) is behind the gate and stays `todo`.** It is not `cut`. Soroush deferred it
until the judge has run against a real model and the rule-6 question is answered.

## The first real model call happened

**2026-09-16, EPIC-031a.** Two calls to `claude-sonnet-5` from deployed staging through the Runs
page. **$0.02**, 59 in / 607 out tokens, 3.8s and 8.4s. Before that date every run in every test,
screenshot and drive was answered by a fake.

It found what it was built to find: **`result.response?.body` came back undefined**, so rule 6's
"raw provider payload" was the SDK's normalised view and **the resolved model id was never
captured**. Fixed in `ca70def` without pretending the body was obtained — `modelId` is captured and
the fallback labels itself `normalised: true`.

## Open, and who owns it

| what | owner |
|---|---|
| **EPIC-031a's three unticked criteria** — the resolved model id, a cached repeat at zero, one real judge call. Drivable **only against staging**, which is well behind local `main`. About thirty minutes once he pushes. | next session, or Soroush |
| **`▣ GATE 3`'s backlog status cell is still `—`** while the gate is decided in `docs/decisions/GATE-3.md`. `pick-next-epic.mjs` reads the cell and stops there on every pass. One word fixes it; `docs/backlog.md` is his file. | Soroush |
| **ADR-005 §7, provenance inside the content address.** Reversible today at the cost of one schema version, expensive the moment EPIC-051 publishes anything. | Soroush |
| **An R2 artifact bucket and a CDN in front of it** — `R2_BUCKET_ARTIFACTS` and `R2_PUBLIC_BASE_ARTIFACTS`. Without them the database store is used, the R2 driver stays unexercised against Cloudflare, and **"apps resolving" cannot exist** — which is part of GATE 5's demand measure. | Soroush |
| **Nobody has reviewed the hand-written SHA-256** that addresses every build, and it is now read by two SDKs in two languages. **EPIC-057 did not close this** — its external review hour needs a person who is not the agent, and `docs/epics/reports/EPIC-057-report.md` §8 lists what the hour should cover, in order, with this first. Row 057e. | Soroush |
| **The 15 KB bundle budget, and whether a security fix may move it.** Three `@41prompts/sdk` mitigations are written, measured and reverted. Row 057a. Until it is answered the Node SDK is the weaker of the two. | Soroush |
| **Registering the five package names** on npm and PyPI. Row 057b, and the only finding that *expires*. | Soroush |
| **Signing the build** — ADR-005 v2, four decisions, and the new one: Python's standard library has no signature verification at all, so it also asks whether `fortyone`'s zero dependencies or authenticity matters more. Row 057c. | Soroush |
| **Rate limits that survive a second web container.** The window store is process memory; true today, wrong the day there are two. Row 057d. | unscheduled |
| **EPIC-043's Review line** — "Soroush reads it. Every high finding has an epic." The threat model is written and the five rows are drafted; reading it and pasting them is his. | Soroush |
| **The two open `high` findings**, `043a` and `043e`. See "Start here". | Soroush |
| **Does a normalised view satisfy rule 6?** The privacy page describes that retention to users. Obtaining the real body means a `fetch` wrapper. **Cheaper to answer before EPIC-042** puts two more providers behind the same adapter. | Soroush |
| **A release is overdue, and `RELEASE-DUE.md` is stale.** It was generated at `f3fa8a2`; local `main` is well past that, and **seven** epics have merged since the last release — 040, 041, 043, 042, 050, 051, 052 — rather than the three `docs/AUTONOMOUS.md` allows. Regenerate with `node scripts/release-due.mjs`. Cutting it starts with a push only he can make. | Soroush |
| **Four questions ADR-006 asks**, all small and all his: is the 15 KB bundle budget minified or gzipped (239 bytes of headroom either way it is read strictly); is the module-level `resolve()` singleton worth its cost; should the SDK's default warning handler write to `console.warn` at all; and is `41p-client` the right name for a header that becomes a public wire format the moment anyone opts in. | Soroush |
| **EPIC-042's six open questions**, report §11. The three above change what gets built next. | Soroush |
| **`privacy@41prompts.ai` must exist.** Both legal pages name it. A Cloudflare routing rule, not code. | Soroush |
| **EPIC-006b/c/d** — Stage 0 debt, all unscheduled: the ~25s deploy gap, the public Coolify hostname, staging and production sharing one R2 prefix. | unscheduled |
| **`/about` and `/careers` are not built.** Both need facts only he has — whether there is a second founder and what their role is, and whether he is hiring. The mockup names *Rambod Azimi, Co-founder, Engineering* and a founding year of 2025; none of that is on a page. EPIC-072 report §11. | Soroush |
| **`/pricing` is not built.** $29/$79 are marked unvalidated and EPIC-005, which would have validated them, is cut. The page belongs in EPIC-070, which needs a Stripe account. | Soroush |
| **EPIC-006, EPIC-090, EPIC-071** — `deferred`, each waiting on something only Soroush can do. | Soroush |

## Where the code is

Measured 2026-09-18 with `git log --oneline origin/main..main`, not remembered:

| | commit | |
|---|---|---|
| local `main` | `637a669` | EPIC-072, merged 2026-09-18 |
| `origin/main` / staging | `da42eee` | **115 behind** — still EPIC-040's epic file and GATE 3's decision |
| production | `af089c7` = `v0.5.0` | only a `v*` tag moves it |

**So staging is not serving anything from EPIC-040, 041, 042, 043, 050, 051, 052, 055, 053, 054, 057,
056 or 072**, and no staging URL is evidence about any of them. Check `/healthz`'s `commit` before quoting one.

**`/healthz` cannot identify a locally built app either** — with no `COMMIT_SHA` it answers
`"commit":"unknown"`. The proof that the server you are about to drive is the build you just made is
`apps/web/.next/BUILD_ID`, which appears verbatim in the HTML the server returns. EPIC-052's drive
did that first, and it is the cheap version of the hour EPIC-051 lost (lesson 17).

**A release is due, and more so again.** `docs/AUTONOMOUS.md` stops the loop after every third
completed epic, and 040, 041, 042, 043, 050, 051, 052, 055, 053, 054, 057, 056 and 072 are
**thirteen**. `RELEASE-DUE.md` was regenerated at EPIC-072's merge: **198 commits** ahead of
production, which is still `af089c7` = `v0.5.0`. Nothing is tagged or pushed by an agent.

## Process, as it currently stands

- **Nothing is pushed. Soroush pushes.** `CLAUDE.md`'s rule, and it stands. He asked for one push by
  hand on 2026-09-16 and confirmed in the same breath that it was a one-off and the rule does not
  change. **Do not push on your own initiative, and do not edit the rule.**
- **`node scripts/gates.mjs ci` is the only CI there is** for anything not yet pushed. Run it on the
  commit, before the merge. Read its closing "what a green here still does not cover" block — it is
  part of the result.
- **`main` moves by `git merge --no-ff` from a branch**, and the merge message carries what a PR
  description carried.
- **The browser drive is a Definition-of-Done item**, against the **built** app — `turbo run build`,
  then `next start`. Never `pnpm dev`.

## Thirty-seven things recent epics cost, worth not relearning

1. **A helper that normalises state hides the defect from every test that uses it.** `PROCESS.md`
   has the rule and the three instances.
2. **A cleanup that always runs last will eventually delete the thing the run was for.** EPIC-031a's
   drive cascaded away its own evidence and the call had to be paid for twice. Verify, then tidy.
3. **`next start` needs `apps/web/e2e/env.mjs`'s placeholders**, not invented ones. Hand-made values
   give *"Something went wrong."* on sign-in — Better Auth failing to construct. That file is the
   single copy of them by design; do not write a fourth.
4. **Read the existing spec before guessing a selector.** EPIC-040 lost several minutes inventing
   `.compiled-span` + "Edit" when `compiled-pane.spec.ts` had the real flow all along.
5. **An `expected` blok emits no text**, so its words appear in no compiled prompt and no
   `prompt_text`. Two EPIC-041 drive assertions looked for them there; chasing why found a real
   defect underneath (report §3). Assert against the **snapshot** when the fact is about a blok set.
6. **The canvas reorders optimistically**, so the card moving is not the move being saved. Wait on
   the version the move records, never on the DOM order, before navigating away.
7. **When a symptom looks environmental, probe the thing.** Print the value, load the page, read the
   row. Three mysteries in three epics were each settled in under a minute that way after being
   reasoned about for much longer.
8. **Every assertion about an absence needs a positive control.** EPIC-043 wrote three that could
   never fail: `COPY ... TO STDOUT` returns `rows: []` through node-postgres, a `#hex` token never
   equals a computed `rgb()`, and `"".startsWith("")` is true of everything. Each read as a green
   tick over a claim nobody had tested. Before asserting a thing is missing, prove the search can
   find it.
9. **No named inner function inside a `page.evaluate`** in a `.mts` drive. `tsx` compiles with
   esbuild's `keepNames`, which rewrites it to `__name(fn, "...")`; Playwright serialises the
   function into the page, where `__name` does not exist, and it throws a `ReferenceError` that says
   nothing about the cause.

10. **A test asserts about state it created itself.** Playwright shuts its worker down after a
    timeout and starts a fresh one, which **re-runs `beforeAll`** — so a `Date.now()` identity is a
    different user afterwards, and every test that depended on an earlier test's data fails for
    reasons of its own. EPIC-042: one real defect, four failures, three of them fiction. Settled by
    polling the table from outside the run, not by reading the code (lesson 7, again).
11. **A test seam in one of two callers is not a seam.** EPIC-042's fake key-verifier lived in
    `apps/web`; the worker's job called the real verifier directly, and the suite made a genuine
    HTTPS call to `api.anthropic.com`. It is now one function in `packages/db` that nothing bypasses.
12. **A fixture where everything passes cannot show a difference.** EPIC-042's drive rendered six
    green heatmap cells, so the shape difference `CLAUDE.md` rule 10 turns on had never been looked
    at by anybody. Put a failure in the fixture, then read the **computed** style rather than a
    class name.
13. **Lesson 8 again, three times in one epic, and one of them was a false *negative*.** EPIC-050's
    canonical-order test needed its two objects built with keys inserted in **opposite** orders (two
    identical literals would pass against `JSON.stringify` itself); its leak denylist matched
    substrings, so `ip` matched inside `description`; and its built-app style probe read `--ink`,
    which does not exist, and reported a styled page as unstyled. **A wrong instrument reads both
    ways.** Every absence assertion now carries a control that proves it can fire.
14. **`typeof x === "object"` is true of a `Map`, a `Set`, a `RegExp` and every class instance**, and
    `Object.keys` of all four is `[]`. EPIC-050's canonical encoder serialised a populated `Map` as
    `{}` — inside the one module whose whole job is refusing values `JSON.stringify` would silently
    alter. Test the **prototype** when you mean "a plain object".
15. **A gate that goes red on a commit that changed only Markdown is still a real finding.**
    EPIC-050's CI-parity run was green on the code commit and red on the docs commit, in
    `packages/db`'s sealed-box tests, which that epic never touched. Every surface fact argued
    "flaky" — and the helper was flipping a base64url **character** rather than a byte, so when that
    character happened to be `A` it changed only a padding bit and the envelope was unchanged.
    Measured at **191 undetected flips in 3,000 seals (6.4%)**. A security test that can silently do
    nothing reads as coverage. Re-running would have hidden it for months.
16. **A `.json` file in a public package needs a `.json.license` companion**, not a `REUSE.toml`
    edit — `REUSE.toml` is on `CLAUDE.md`'s never-touch list and the repository already has nine of
    these companions under `packages/core/src`. Found before `reuse lint` had to say it.
17. **After rebuilding, prove the server you are about to drive is the one you just built.**
    EPIC-051 lost an hour to a `pkill -f "next-server.*3111"` that matched nothing — `next start`
    spawns a child whose command line does not carry the port — so the old process kept the socket
    and the "restarted" server was the previous build. The drive then reported a defect in code that
    was correct, and both intermediate conclusions drawn from it were wrong. Settled in one run by a
    twenty-line script that published through the real API and dumped the table (lesson 7, again).
18. **A defect can live in the seam between two features, where no test written from either
    feature's spec will look.** EPIC-051's publish endpoints did not pin the version they published,
    so the next keystroke rewrote the blok set an immutable audit row named. Every test was green;
    the Versions page — another epic's — was where it showed. The drive looks at the product, which
    is why it keeps finding what the suite does not.

19. **A gate only guards what it is pointed at.** `scripts/forbidden-words.mjs` scanned the three
    trees a browser renders and nothing else, so `packages/sdk-ts` — whose warning strings land in a
    customer's log — had never been checked. It joined the roots in EPIC-052 and eleven strings failed
    immediately. Before trusting a gate about a new area, check that the area is in its argument list.

20. **`grep -P` does not exist on macOS, and it fails by finding nothing.** A literal NUL byte reached
    a source file in EPIC-052 (written as `"\u0000"`, landed as the byte) and `grep -rlP '\x00'`
    reported it clean. `od -c` found it in one line. This is lesson 8 wearing a different hat: the
    instrument could not fire, and a search that cannot fire reads exactly like a search that found
    nothing. `pnpm binary-files` is the gate that would have caught it after staging; reading the
    bytes caught it before.

21. **A drive's own assertion can be the thing that is wrong.** EPIC-052's drive failed one check on
    its first run by asserting that the SDK raised no warning other than `not_found`, while the drive
    itself provokes a `missing_variables` two lines earlier on purpose. An assertion a correct system
    fails costs the same investigation as one a broken system passes. When a drive goes red, read the
    assertion before reading the code.

22. **A gate only guards what it is pointed at — and check what it *scans*, not only where.**
    EPIC-055 found a NUL byte in two committed documents because `scripts/binary-files.mjs`'s roots
    were `packages/` and `apps/`. Widening them caught one of the two. The other was at byte 12,411
    and the script sniffed git's 8000-byte window — so `git diff` rendered that file perfectly while
    `grep -c '^#'` returned **0** for a report with nineteen headings. Both the *area* and the *depth*
    of a gate are assumptions worth reading before trusting a green.

23. **A label is not an assertion.** EPIC-055's drive reported `refundClassifier(v: { customer_name,
    order_id })` in its detail string while asserting only the prompt id and the function name. The
    real signature omitted `customer_name` — so the generated file could not fill its own prompt, and
    the check that would have caught it was printing the right answer as decoration. When a check
    passes, read what it actually compared.

24. **Run the local gate again after writing the last file.** EPIC-055's own NUL-byte *test* contained
    a NUL byte. `pnpm binary-files` had been run before that file existed and never after, so it
    reported "926 checked" over a set that excluded it. Only `gates.mjs ci`, which clones a commit,
    could see it — `PROCESS.md`'s "Local green is not CI green" failure 2, arriving in the session
    that was fixing failure-mode 19.

25. **Docker Desktop's VM disk is not the host disk.** A `gates.mjs ci` run failed at *setup* with
    "the throwaway database would not start" while `df -h /` showed 18 GB free; `initdb` said "No
    space left on device". 68 dangling volumes, 3.485 GB. `docker volume prune` (without `-a`, so no
    stopped project's named volume is touched) after checking every in-use volume is attached to a
    running container.

26. **A gate can be green over a package that does not compile.** `tsconfig.base.json` sets
    `types: []`, and `packages/cli`'s `process` and `node:fs` resolved **only because its test files
    pull in `vitest`, whose types reference Node's**. `tsconfig.build.json` excludes tests, so
    `pnpm typecheck` passed and `pnpm build` failed. Before trusting a typecheck, ask which program
    it built — two tsconfigs in one package are two different questions.

27. **A test that shells out to a build races the run that invoked it.** `packed.test.ts` ran
    `pnpm build` while turbo was already executing the test task, rewriting `dist` underneath the
    packages testing beside it. It failed `@41prompts/sdk`'s tarball test in one run and
    `@41prompts/web`'s suite in another — two different-looking failures, one cause, and both looked
    like flakiness. Ordering belongs in `turbo.json`, not in a test.

28. **Lesson 19's other half: a test in a public package may only read the public tree.**
    `packed.test.ts` read `scripts/`, which `mirror-dry-run` deliberately excludes — green
    everywhere, `Cannot find module` in the one job that filters. That is `PROCESS.md`'s "Local green
    is not CI green" **failure #1**, reproduced within the hour of being read. Repo-level tests live
    in `apps/web`, which the mirror does not contain; `forbidden-words.test.ts` is the precedent. A
    skip was the alternative and a skip reads as a pass.

29. **A retry that cannot be forced cannot be tested.** The project-id collision survived because
    `newProjectId` draws an unused id nearly every time, so any suite that inserts projects passes
    identically against code with no retry at all. `insertProject` takes the generator as a
    parameter with the real one as its default — both callers share the seam — and the test hands
    back an already-taken id and counts the draws. **Before asserting a safeguard works, force the
    thing it guards against.**

30. **Read the server log, not only the test output.** Three CI-mode runs failed e2e on a different
    test each time, each looking like a timeout. The cause was one sentence nothing in the test
    output carried: `duplicate key value violates unique constraint "projects_pkey"`.

31. **Nine packages each sized a vitest fork pool to the machine, and turbo ran ten at once.**
    Measured during one `pnpm test`: **71 concurrent processes and a load average of 262 on 8
    cores.** Every unexplained `Test timed out in 5000ms` in this repository was that, plus a
    sixty-second `onTaskUpdate` RPC in a package reporting 581 of 581 passed. Three CI-gate runs
    were lost to it while it was being called a busy laptop. `scripts/gates.mjs` budgets the total
    now — `--concurrency` and `VITEST_MAX_FORKS`, both from `availableParallelism()` — and the run
    got **faster**. **Before blaming the host, count the processes.**

32. **`turbo.json` declaring `globalPassThroughEnv` puts turbo in strict environment mode**, so a
    task sees only the names on that list. An environment variable set anywhere else and not
    declared there is silently filtered out one process later. The gate would have printed `4 x 2`
    and spawned 71. `apps/web/gates-parallelism.test.ts` pins the two files together and was proved
    to fire; any new knob needs the same two edits.

33. **A gate's exit code is the only machine-checkable part of it, and a pipe throws it away.**
    `pnpm binary-files 2>&1 | tail -3 && git commit` committed on a **red** gate, because a
    pipeline's status is the *last* command's and `tail` succeeded. Lesson 24 says run the gate again
    after the last file; this is its companion — **read `$?`, not the last three lines.** Every gate
    in the second half of EPIC-057 was checked with `echo $?`.
34. **A wrong invocation of a gate reads exactly like a failing gate.** `uvx reuse lint` exited 1
    here on a missing encoding module; the repo's script is
    `uvx --with charset-normalizer reuse lint`, which passes 1226/1226. That is lesson 20's shape
    (`grep -P` on macOS) with a different tool: **run the repository's own command, not your
    reconstruction of it.**
35. **A document about a defect carries it as readily as a test about one.** EPIC-055 put a NUL byte
    in its NUL-byte test; EPIC-057 put four across three files — twice in the limiter's own warning
    about them, then once each in the report and session-log paragraphs *about* that. Every one was a
    tool interpreting the escape being named. **The only safe way to name that escape is to describe
    it in words, or to write bytes through something that cannot interpret them.** And the sweep must
    walk every tracked, modified and untracked file: the gate names the *first* NUL in the *first*
    offending file, so fix-and-rerun says nothing about how many there are.
36. **A mitigation can be a worse vulnerability than the thing it mitigates, and its own tests will
    not say so.** EPIC-057's first rate limiter gated on the caller's address before authenticating,
    which let anyone lock out a customer's whole fleet by spending their shared egress budget. Every
    test passed, because each was written from the same premise —`PROCESS.md`'s "a test written from
    the implementation asserts the implementation". **It was found by asking how the browser drive
    would demonstrate the feature**, and noticing the demonstration would have to show a customer
    being harmed. Ask that question before writing the drive, not while writing it.
37. **A budget is a real constraint even when what it refuses is a security fix**, and ADR-006 wrote
    down the response in advance: *measure what got in, do not widen the number.* EPIC-057 wrote three
    mitigations, measured them four ways, and reverted them. **Measuring a negative properly is most
    of an hour and it is not wasted** — it is what turns "it did not fit" into a table somebody can
    decide from. See also lesson 26: before trusting a budget, ask which program it measured.

## Gates and the local loop

`pnpm test`, `pnpm typecheck`, `pnpm lint` each report **every package** with its own verdict; paste
the table, not the word "clean". `pnpm e2e` builds, so it tests the artifact that ships, and it needs
its own Postgres:

```
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
```

The four visual-regression baselines are Linux-only and skip on macOS. A skip is not a pass, and the
suite says so at the end of every run.

## Housekeeping

A `STOP` file has sat in the repository root since 2026-09-14. It halts `scripts/run-epics.sh`
between and during epics; it does not affect a session a person starts by hand. Remove it when the
unattended runner should move again.

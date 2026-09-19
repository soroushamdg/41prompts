<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-017 report — Legal minimum

Date: 2026-09-14 · Branch `epic/017-legal-minimum`

Stage 1's last unmet obligation, carried past EPIC-014 and EPIC-015 and closed here. The epic file
did not exist either and was written alongside the work — part of how it got carried.

## 1. The ruling, and what it changed

**No lawyer.** A portfolio project with no users, and no legal dependency in the critical path. All
of it drafted here from research rather than a template, with **one line at the top of terms and
privacy saying no lawyer reviewed them** — and nowhere else. That line is the whole difference
between a draft and a misrepresentation, and repeating it on every page would have turned it into
noise.

`legal.test.ts` asserts both halves: the two pages carry it, the other two do not, and the body never
repeats it.

## 2. The build: the gate already existed, the control did not

The most useful thing found before writing any code. **`hasAnalyticsConsent` in
`lib/analytics/posthog-server.ts` has been correct since EPIC-004**: an anonymous visitor in
production is not sent to PostHog without an explicit yes, `DNT: 1` and `Sec-GPC: 1` outrank
everything, and the cookie's name was already reserved with the comment *"the cookie EPIC-017's
banner will write"*.

So this epic did **not** build a gate, and nothing was switched off that was on. It built the two
things missing around it:

- **The banner**, which asks once.
- **A permanent control on the privacy page**, which is the part that makes the choice real — Law 25
  and the GDPR both require withdrawal to be as easy as consent, and a banner somebody dismissed
  three weeks ago is not a way to withdraw anything.

### No dark patterns, measured rather than asserted

Decision 2 was written concretely so it could be tested, and it is:

| claim | how it is checked |
|---|---|
| same size | bounding boxes compared; heights within 2px, widths within 24px (they differ only because "Decline" is a longer word) |
| same treatment | the two buttons' `class` attributes compared for equality |
| neither pre-selected | neither is focused on load; neither carries `aria-pressed` |
| declining is one click | a single click from the banner, no "manage preferences" step |
| it does not come back | asserted across a reload and a navigation |
| keyboard operable | focus, `Enter`, choice recorded |
| 44px touch targets | measured at 390px — 44px there, 34px at desktop, which is the design system already doing the right thing |

### The default, asserted as behaviour rather than as a cookie

The test that matters most intercepts every request and asserts **nothing reaches
`i.posthog.com`** while the question is still on screen. A test that only read the cookie would pass
even if something fired anyway.

## 3. A defect this epic introduced, found by the suite

Worth writing down because of how it surfaced. The banner is `position: fixed` at the bottom of the
viewport on **every** page, so it sat *over* the last control on any long page. The canvas and the
variables tab both broke — and they broke as **two click timeouts in unrelated specs**, not as
anything resembling a consent bug.

The fix reserves the space: the banner measures itself on mount and through a `ResizeObserver`, and
sets `padding-bottom` on `body` to its own height — measured rather than hardcoded, because the text
wraps differently at every width and one number would be wrong at one of them. 117px at 1280, 177px
at 390, both matching the bar exactly. `legal.spec.ts` now has a named test for it, so the next
fixed-position thing cannot make the same hole quietly.

## 4. The retention table, which is the verifiable part

Every number is **imported from the constant that enforces it**, so a page that disagrees with the
code cannot be written. `roadmap.md`'s own test for this epic is exactly that.

| What | How long | Constant | Enforced by |
|---|---|---|---|
| A pasted prompt | not kept at all | — | `apps/web/lib/decompile/record-run.ts` |
| A shared decompile link | **30 days** | `DECOMPILE_RETENTION_DAYS` | `apps/worker/src/jobs/purge-decompiles.ts` |
| A counted decompile run | **180 days** | `RUN_COUNT_RETENTION_DAYS` | `apps/worker/src/jobs/purge-decompiles.ts` |
| An account after deletion | **30 days** | `ACCOUNT_PURGE_WINDOW_DAYS` | `apps/worker/src/jobs/purge-deleted-users.ts` |
| Raw model responses | **12 months — not built yet** | — | nothing; EPIC-031 |

**Two things the brief did not have, and both matter:**

1. **There is a fourth retention number.** `RUN_COUNT_RETENTION_DAYS = 180` exists and is enforced in
   `purge-decompiles.ts`. It was in nobody's list of three, and a retention table that omitted it
   would have been incomplete about the one row describing a keyed hash of a visitor's address.
2. **The 12-month row is a plan, not a behaviour**, and says so in the table itself, naming EPIC-031.
   Stating it flat would have been describing the future as the present in the one document whose
   entire value is that it is accurate. A test asserts the wording.

A second test walks every cited path and fails if the file does not exist — a citation that reads as
verifiable and is not is worse than no citation.

## 5. The processors: seven, not eight

Checked against the code rather than against the roadmap's list.

**In use today**: Amazon Web Services (the box and the database, Montréal), Cloudflare (R2 backups,
Turnstile), Resend (the sign-in email), Google and GitHub (OAuth, only if you choose them), PostHog
(consent-gated), Sentry (errors).

**In the roadmap's list of eight but not wired**: Anthropic, OpenAI, Google as an *AI provider*, and
Stripe. None of them processes anything today; the features that would use them are EPIC-031, 042 and
070. They are listed on the sub-processor page under "Not in use yet" rather than omitted, so the
page is not quietly incomplete when they arrive.

**AWS and GitHub were in nobody's list** and are two of the seven. A processor we use and do not name
is the failure mode that matters here, so the list is derived from `package.json`, the environment
variables the code reads, and `requireEnv` calls.

A test pins the exact list, and a second asserts the privacy page's copy of it is identical to the
sub-processor page's — two lists that can disagree eventually will.

## 6. One asymmetry reported rather than silently changed

**`hasAnalyticsConsent` grants for a signed-in user in production who has never chosen.** Declining
still wins for everyone — the cookie check runs before the signed-in branch — so the banner's choice
is authoritative once made. But a signed-in account that has not answered is counted.

That is **EPIC-004's tested decision** (`posthog-server.test.ts` line 27 asserts it), so this epic did
not change it. The privacy page states it precisely instead, in its own sentence, rather than
glossing it:

> One thing stated precisely rather than glossed: if you are signed in and have not yet made a
> choice, sign-up and sign-in events are recorded against your account id. Declining stops that too.

**Ruling wanted:** should consent be universal? It is a one-line change and it would let the privacy
page lose that paragraph, but it belongs to EPIC-004 rather than here.

## 7. Two tests that asserted the placeholders

`landing.spec.ts` had a test literally named *"the legal stubs are honest and not indexable"*, which
checked the body said "not written yet" and that the page was `noindex`. Both were true and both were
the problem: **a site collecting email addresses behind unwritten legal pages, with a gate that could
only fail if somebody wrote them.** The same family as the failures `PROCESS.md`'s helper rule
covers. It now asserts real content, indexability, and the one honest caveat.

The sitemap test had the three indexable pages hardcoded; the legal pages join it and robots.txt at
the same time, because listing a page in one that the other disallows is a contradiction a crawler
reports.

## 7b. Four visual baselines went red, and the fix was determinism rather than new baselines

CI failed on the four visual-regression tests: the landing page and the `/dev/ui` gallery had grown
by **exactly 117px**, which is the banner's reserved padding at 1280px. The obvious response is to
regenerate the `-linux` baselines.

**That would have been wrong, and the reason is worth keeping.** The banner mounts from a
`useEffect` that reads a cookie, so whether it is on screen when a screenshot fires depends on
whether an effect has run — a baseline containing it is **flaky by construction**, not merely
different. It would have passed on the run that made it and failed intermittently forever after.

So the visual tests now answer the question deterministically before taking the picture, with the
justification `PROCESS.md`'s helper rule asks for: what it hides is the banner's own appearance and
its reserved space, and both are covered directly in `legal.spec.ts`, including a test that the page
underneath stays reachable.

**Verified in the Playwright Linux image, both ways** (`mcr.microsoft.com/playwright:v1.63.0-noble`,
the procedure from EPIC-016 §9):

- `--update-snapshots` rewrote **nothing** — the four committed baselines were already byte-identical.
- Run the way CI runs it, without that flag: **4 passed**.

So the pages render exactly as they did before this epic, the diff carries no baseline churn, and
the check that failed is the check that now passes for the right reason.

One incidental trap for the next person: macOS `tar` writes AppleDouble `._*` files into the archive,
and Playwright picks them up as spec files and fails to parse them. `find /repo -name "._*" -delete`
inside the container, or `COPYFILE_DISABLE=1` when creating it.

## 8. Verification

```
e2e        178 passed, 4 skipped, 0 failed   (against the BUILT app)
           legal.spec.ts alone: 22 passed
           One flake on an earlier run — `Failed query: insert into "projects"` under full-suite
           load. Not called environmental: the test was re-run 22/22 in its own suite and 3/3 with
           --repeat-each, and the next full run was 178/178. Recorded rather than swept.
test       8 checked, 8 passed    (throwaway container, no PARTIAL)
typecheck  8 checked, 8 passed
lint       11 checked, 11 passed
compliance reuse, boundaries, forbidden words, binary files, licence gate, mirror dry-run — all OK
```

**The forbidden-word grep earned its place.** The first draft named the content type `LegalBlock`
with a `blocks` array; ADR-003 forbids "block" in code identifiers and the gate failed the build.
Renamed to `LegalPart`/`parts` — and the blanket rename then corrupted one line of prose
("…and **blocks** any further sign-in" became "…and **parts** any further sign-in"), which was caught
by reading the diff. It now says "prevents", which is both allowed and clearer.

## 9. Driven

Against the built app, then on staging after the deploy (§10). Screenshots in
`docs/epics/reports/screenshots/EPIC-017/`: the banner, the privacy page in full, terms,
sub-processors, the privacy page at 390px, and dark theme.

## 10. The staging drive

Driven 2026-09-14 on the deployed site at `4913f3e`, as a first-time visitor with no cookie, on
`staging.41prompts.ai` and `app.staging.41prompts.ai`. Every request was intercepted for the whole
drive.

| what | result |
|---|---|
| banner offered on the deployed apex | **PASS** |
| **nothing sent to `i.posthog.com` before a choice** | **PASS** — 0 calls |
| no consent cookie exists before choosing | **PASS** |
| the banner reserves the space it covers | **PASS** |
| declining dismisses it, and is recorded | **PASS** — `denied` |
| `/legal/terms` · `/privacy` · `/sub-processors` · `/security` render (200) | **PASS** — 4048 / 6232 / 1328 / 1243 characters |
| retention numbers match the code (30 / 180 / 30) | **PASS** |
| the 12-month row says not built, and names EPIC-031 | **PASS** |
| all seven processors named | **PASS** |
| the not-reviewed line appears once | **PASS** |
| the permanent control is there, and changes the choice | **PASS** — `denied` → `granted` |
| `robots.txt` allows `/legal/`, sitemap lists all four | **PASS** |

The first two rows are the epic. A visitor arrives, is asked, and **nothing about them has left the
site while the question is on screen** — measured on the deployed build rather than inferred from the
cookie.

Screenshots `80-staging-banner.png` and `81-staging-privacy.png`.

**Cleanup:** this drive created no account and wrote nothing to the database — it is an anonymous
visitor throughout — so `PROCESS.md`'s drive-cleanup statement had nothing to remove. Worth stating
because "no cleanup was needed" and "cleanup was skipped" look identical in a report that does not
say which.

## 10b. Consent went universal after this epic shipped, and was driven again

Soroush ruled on §6's open question on 2026-09-14: **consent is universal**, and a signed-in user who
has never chosen is not counted. Shipped in #81, driven on staging at `d3fb87f`.

| what | result |
|---|---|
| the privacy page says the choice covers everyone, account or not | **PASS** |
| …and covers the sign-up / sign-in record | **PASS** |
| the old signed-in caveat is gone from the page | **PASS** |
| a signed-in user who never chose is still offered the choice | **PASS** |
| no consent cookie exists after signing in | **PASS** |
| a signed-in user can decline | **PASS** — `denied` |
| …and change it later from the permanent control | **PASS** |

Screenshot `92-staging-signed-in-banner.png` — the banner, on a signed-in page, for a user who has not
answered. Before #81 that user was counted and the banner was the only thing that would have suggested
otherwise.

**Two corrections to this report's own work came out of that change**, and both are recorded rather
than quietly fixed:

1. **§6 described the smaller problem.** It said the gate *granted* for signed-in users. The larger
   one underneath: `lib/auth.ts` called `captureEvent` **directly**, so `signup` and `login` never
   reached the gate at all — not the cookie, not `DNT`, not `Sec-GPC`. This report's §2 and the
   privacy page both already claimed declining stopped everything. It did not, for exactly the two
   events a signed-in person generates.
2. **§2's "asserted as behaviour rather than as a cookie" was not true.** That e2e test intercepted
   **browser** traffic, and PostHog is called server-side through `posthog-node` with no client-side
   tag anywhere — so it could never observe a capture and would have passed if every event fired. It
   is kept, renamed and re-commented for what it genuinely catches (a client-side tag appearing and
   bypassing the server gate), and the gate is proved where captures are observable: the unit tests,
   with the capture function mocked.

Both are the same family as everything else this week — a claim that reads as evidence and is not.
`docs/epics/sessions/EPIC-017-session.md` and `EPIC-004-observability.md` carry the rest.

## 11. Out of scope, and where it went

The roadmap's task list also named a DPA-on-request draft, a standalone Law 25 transfer assessment,
and one lawyer hour. The ruling removed the lawyer; the other two are documents for a service with
business customers, which this is not yet. **EPIC-071 carries them** and its row already depends on
this epic. The cross-border assessment's *substance* is on the privacy page under "Data leaving
Canada"; what is deferred is producing it as a separate document.

No copyright line was added. `CLAUDE.md` keeps the holder as `<legal entity>` until incorporation.

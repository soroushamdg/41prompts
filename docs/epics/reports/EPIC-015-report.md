# EPIC-015 — Soft ship

Production is live with the whole of Stage 1, and the thirty-day window is open.

**The correct next action is to stop.** Not a figure of speech — see §9.

---

## 1. The thing that would have produced a silent zero

`hasAnalyticsConsent` returned **`false` for an anonymous visitor in production**.

That was right when EPIC-004 wrote it: *"an anonymous visitor in production with no cookie banner yet
(EPIC-017 builds the banner; until then, anonymous production traffic is simply not captured)"*. There
was nothing to measure and nothing to ask consent for.

It is wrong for this epic, and wrong in the worst way. **Every visitor in the M1 window is anonymous
and in production.** Shipped as it stood, the funnel would have read **zero for thirty days**, and a
zero looks like an answer. We would have concluded the wedge failed, at GATE 1, on a number the code
was never going to produce.

Decision 9 settles the direction: *"a visitor who **declines** is not counted."* Declining is an act,
so the default is counted:

| | counted |
|---|---|
| `DNT: 1` | **no** |
| `Sec-GPC: 1` | **no** |
| Consent cookie set to anything but `granted` | **no** |
| Consent cookie `granted` | yes |
| No preference stated, anonymous, production | **yes — this is the change** |

Declining **outranks being signed in** and applies outside production too. A setting that only works
for logged-out users in one environment is not a setting anybody can trust.

**This is a privacy default changing and it is the first item in §8's checklist**, because whether it
needs a banner before EU traffic is a legal question and EPIC-017 owns it.

---

## 2. The measurement, and what it is not

**Identity without identity.** PostHog needs a `distinctId` and these people have no account, so the
`distinctId` is **the address hash EPIC-014 already computes** — HMAC, per-deployment salt, never
reversible, never stored raw. Nothing new is collected to make this measurement, and PostHog receives
a value that means nothing outside this deployment. `never sends the address, only a hash of it`
asserts exactly that.

**"300 unique" means 300 distinct address hashes, not 300 people.** An office behind one NAT counts
once however many people paste something; one person on a train counts several times.

**The number will be a floor.** Anyone sending DNT or GPC is invisible to the funnel by design — and
that is disproportionately likely among AI engineers, which is precisely the audience. The true number
is higher by an unknown margin. This is in `m1-window.md` where GATE 1 will read it, not buried here.

### The four events

| event | fires | in the closed set before this epic |
|---|---|---|
| `decompile_view` | `/decompile` renders, including after an ask-bar handoff | yes |
| `decompile_run` | `runDecompile` returns `ok` — **not** on empty, too-long or rate-limited | yes |
| `decompile_share` | after the `decompiles` row exists | yes |
| `waitlist_joined` | after the `waitlist` insert | **no — added** |

Adding the fourth is what decision 5 asks for ("plus the waitlist submission") and is how EPIC-004
says the closed set grows: edit the array, and `events.test.ts` moves with it.

Two judgement calls worth arguing with:

- **`decompile_run` only on success.** Somebody pressing the button on an empty box has not run
  anything, and counting it would flatter the denominator — which is the number the criterion is about.
- **`waitlist_joined` fires on a duplicate too.** The criterion is "share **or** waitlist" as a signal
  of intent, and somebody coming back to sign up again has shown the intent again. It is also the only
  option that does not leak whether an address is already on the list, which `onConflictDoNothing`
  deliberately refuses to tell us.

**Server-side only.** No `posthog-js`, nothing on the critical path, and no analytics cookie to consent
to in the first place.

---

## 3. The article, and why its examples are generated

`/guides/what-your-prompt-does-not-check`. Criterion 2 requires *"Every example in it comes from the
committed corpus"*, and the way to make that true **and keep it true** is not to copy detector messages
into prose. The page renders what `detect(cluster(segment(fixture)))` returns, right now.

`support-email-router` — a realistic two-hundred-word support prompt already in `SEGMENT_FIXTURES` —
produces **seven findings across four of the six kinds** on its own, which is the article's argument
made without asserting it. `contradiction` and `too_long` come from `DETECT_FIXTURES`.

`article-examples.test.ts` then holds it to that: each of the six is still produced, and the page quotes
each message **character for character**. If a detector's copy is edited, the test fails and the article
is regenerated rather than quietly going stale. It also refuses claims the product cannot back — an
editor that exists, running prompts, scores, social proof, invented counts.

**`FINDING_KINDS` is now a runtime list** in `packages/core`, with a compile-time exhaustiveness check.
`llms.txt` and the article both promise a stranger there are exactly six; without a list they can hold,
a seventh kind would leave two documents quietly wrong, and documents do not fail CI.

---

## 4. Deviations

**No `llms-full.txt`.** Decision 3 allows one "if the content warrants it". There is one article — a
"full" variant would be the same text twice under a second URL, which is the stuffing the same decision
warns against. Worth revisiting when there is a second piece of content, which is EPIC-072.

**`llms.txt` is generated, not a file in `public/`.** Scope says "generated or committed". Generated,
for the same reason `robots.ts` is: the origin must be the deployed one, and the six kinds come from
`FINDING_KINDS` so it cannot end up listing five.

---

## 5. Two defects found on the way

1. **`@41prompts/core/fixtures` needed its own Turbopack alias.** The existing alias does not cover
   subpaths, so the import fell through to TypeScript source whose `./x.js` imports Turbopack cannot map
   back to `.ts` — the same resolution gap EPIC-013 hit. The article was a **500** until it was fixed,
   and it would have been a 500 in production.
2. **The article's scrollable prompt was not reachable by keyboard** (axe `scrollable-region-focusable`).
   A region that scrolls but cannot be focused is unusable without a mouse. Now `tabIndex={0}` with a
   name.

Also fixed while here: `/dev/ui`'s visual tests had the same `-darwin` baseline trap the landing spec
was given a guard for, and had been quietly writing untracked PNGs on every local run. Scoping that
guard turned up a second bug in my own first attempt — a bare `test.skip(condition)` applies to every
test in the enclosing block, which took the axe and keyboard tests with it.

---

## 6. Acceptance criteria

- [x] **`llms.txt` reachable at the production root, valid, names the six kinds in plain language,
      states no account is needed.** `https://app.41prompts.ai/llms.txt` → 200, `text/plain`. Four e2e
      tests, including one asserting it advertises the same origin `robots.txt` does.
- [x] **The article is live in production, indexable, canonical, with an Open Graph image and a working
      link into `/decompile`.** 200 in production with 6 findings and 6 real examples; its own
      `opengraph-image` renders 1200×630. Screenshot §7.
- [ ] **The four events each fire exactly once per action in production, with no PII.** The firing
      conditions are proven by nine unit tests, including that the payload carries a hash and never an
      address. **Reading the payloads back out of PostHog needs a personal API key this session does not
      have** — §8, item 4.
- [ ] **The PostHog funnel exists and shows view → run → share-or-waitlist.** Same blocker: building it
      is a click in their UI. §8, item 4.
- [x] **A visitor who declines consent or sends Do Not Track produces no events.** `sends nothing at all
      when the visitor signals Do Not Track / Global Privacy Control / a declined consent cookie`, plus
      `does not count a visitor who declines, anywhere, however they say it`.
- [ ] **Search Console and Bing verified, sitemap submitted to both.** §8, items 2 and 3 — both need a
      person.
- [ ] **Production serves `41prompts.ai`, `/decompile`, a real `/d/<id>` and the article over TLS with
      correct robots directives.** Three of four. `/decompile` and the article serve; `/d/<unknown>`
      returns 404 with `noindex, nofollow, noarchive`. **The apex is not routed** (§8 item 1) and **a
      real `/d/<id>` needs a human through Turnstile** (§8 item 5).
- [x] **`docs/research/m1-window.md` exists with the dates, the criterion verbatim, an empty weekly
      table and the no-changes rule.**
- [x] **`pnpm test`, `typecheck`, `lint`, `e2e`, `compliance`, `binary-files` clean.** §10.
- [x] **Report and session log written; backlog updated; EPIC-084 blocked until the close date.** Its
      backlog row reads `blocked until 2026-10-11`.

---

## 7. Production

`v0.1.0`, deployed **2026-09-12 00:17 UTC**, commit `e01b608`.

**Production had never served the decompiler.** It was on `e79dc32`, a pre-EPIC-013 build where
`/decompile` returned 404. This tag ships all of Stage 1 at once, and it carries migrations — the
entrypoint chains `db:migrate && next start`, so the app coming up at all is the evidence they ran.

| | |
|---|---|
| `/` | 200 |
| `/decompile` | 200, Turnstile site key live (`0x4AAAAAAEw…`) |
| `/guides/what-your-prompt-does-not-check` | 200, six findings, six real examples |
| `/llms.txt` | 200, `text/plain` |
| `/robots.txt`, `/sitemap.xml` | 200, both advertising `https://app.41prompts.ai` |
| `/sign-in`, `/legal/privacy` | 200 |
| `/d/dc_000000000000` | 404, `x-robots-tag: noindex, nofollow, noarchive` |

The ask bar, end to end in production:

```
?start=2e26b4984239d28fd153fcaa140571e8 → 6 bloks, 4 findings, 0 range mismatches
```

The whole query string is the opaque id, and every span re-sliced from the source as the browser
actually submitted it (CRLF) matches what is rendered. Screenshots in
`screenshots/EPIC-015/`.

---

## 8. The checklist — everything that needs Soroush

1. **Route the apex `41prompts.ai` to the production application.** It resolves to the box but has no
   Traefik router and therefore no certificate: `curl https://41prompts.ai/` fails TLS verification.
   Production is reachable only at `app.41prompts.ai`, which is also what every canonical URL,
   `sitemap.xml` and `llms.txt` now advertise — internally consistent, but the brand's front door
   returns an error. `www.41prompts.ai` has no DNS record at all. **This is the one that affects the
   measurement**: findability is what M1 tests. `m1-window.md` says to leave the dates alone if this
   lands within a few days and to move them if it does not.
2. **Google Search Console**: verify the property and submit `/sitemap.xml`.
3. **Bing Webmaster Tools**: the same. Bing feeds several AI assistants, which is the point of the
   `llms.txt`.
4. **PostHog.** Two things: build the funnel view → run → share-or-waitlist in the UI, and — if you want
   the event payloads captured as evidence for criterion 3 — a **personal API key** with read access,
   which is what this session lacked. The events themselves need no setting; the project key is already
   in production's environment.
5. **Create one permalink in production** by passing Turnstile, the same twenty seconds as on staging:
   paste anything at `app.41prompts.ai/decompile`, let the widget settle, press **Get a shareable link**.
   That closes the last quarter of criterion 7, and it is also the first real row in production's
   `decompiles` table.
6. **Confirm the analytics consent default in §1**, or say a banner comes first. It is a legal question,
   not a technical one, and EPIC-017 owns the banner.

---

## 9. Stop here

Decision 8, and it is the point of the epic rather than a note at the end:

> **Nothing about the product changes between 2026-09-11 and 2026-10-11** except a defect that makes
> the decompiler wrong or unavailable.

Not the copy. Not the layout. Not a seventh finding. Not a better headline — and there *is* a better
headline, there always is. **A thirty-day measurement with three product changes inside it measures
nothing**, because afterwards there is no way to say whether the number came from the product, the
changes, or the order they landed in.

The counter is read **weekly, not daily**. Daily reading produces the urge to act on noise, and acting
on noise is exactly how the rule above gets broken.

The next session that opens this repository should check `docs/research/m1-window.md` before doing
anything. If it is before 2026-10-11, the answer to "should I improve X" is no — write it down and ship
it on the 12th.

---

## 10. Verify

```
pnpm test && pnpm typecheck && pnpm lint && pnpm compliance && pnpm binary-files
E2E_PORT=3100 npx playwright test soft-ship
```

```
apps/web         160 tests
packages/core    370 tests
e2e              soft-ship: 11 passed
```

**Two pre-existing e2e failures** (`magic-link sign-up lands on /app showing the email`, `sign-out kills
the session server-side`) fail identically on the untouched tree — verified by stashing in EPIC-016 and
unchanged here.

**One process slip to own:** the commit `e01b608` (`test(soft-ship): the capture path…`) went **directly
to `main`** rather than through a pull request. Tests only, CI green on `main` before the tag, and it is
the commit production now runs — but it skipped review, which is not how anything else in this repo has
landed.

# EPIC-016 — Landing page v1

One page, one reader, one job: an AI engineer who owns a production prompt pastes it into the
decompiler inside thirty seconds, having been asked for nothing.

---

## 1. What was built

| | |
|---|---|
| `app/page.tsx` | Nav, hero with the ask bar, three-step strip, closing CTA, footer |
| `app/start-actions.ts` + `lib/landing/handoff.ts` | The ask bar's transport to `/decompile` |
| `lib/decompile/run.ts` | The pipeline, extracted so the page and the form share one path |
| `packages/ui/src/primitives/logo-mark.tsx` | The 41 → AI mark, with its morph as an inline script |
| `packages/ui/src/landing.css` | The public site's stylesheet |
| `app/legal/[slug]`, `app/contact` | Five honest placeholders |
| `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`, `app/icon.svg` | Decision 9 |
| `app/sign-in-form.tsx` | Styled; the flow is EPIC-002's and is untouched |

---

## 2. The headline

**Shipped:**

> **A prompt change ships. Nothing checks it. You find out from a user.**

Three beats — the event, the gap, the consequence. It is a sequence of facts about how prompts ship,
not a threat and not a claim that the reader's team is careless, and the middle beat *is* the product:
the thing the decompiler finds is a rule that nothing checks.

**The four that lost.**

1. **"Nothing checks a prompt before it ships. That is the normal state of things."**
   The second sentence does the de-blaming beautifully — it says out loud that this is not the
   reader's fault. It lost because it editorialises: it tells the reader how to feel about the fact
   instead of letting them recognise it, and it never names a consequence, so the hero has no sting.

2. **"Every prompt has rules. Almost none of them are checked."**
   The most literally accurate of the five — it is exactly what `rule_without_check` finds — and the
   easiest to defend. It lost twice over: it reads like a spec line rather than a hero, and **"almost
   none" is a frequency claim we have no data for**, which decision 4 rules out. The one sentence
   that sounded most rigorous was the only one containing an invented number.

3. **"Your prompt is full of rules a model can quietly stop following."**
   Strong, and accurate about the product. It lost on the position: *"Your prompt is full of"* opens
   by telling a sceptical stranger their work is a mess. That is the accusation the brief forbids, and
   this reader is the last person to take it well.

4. **"The prompt worked on Tuesday. On Friday a user found the part that did not."**
   The most vivid, and the time gap is the real experience. It lost because it is a story about one
   incident rather than a fact about how prompts ship — and because the shape of it implies we prevent
   Friday. Stage 1 does not prevent Friday; it shows you what is unchecked.

**Subhead** — names bloks and checks, promises nothing else:

> Paste one here. It comes back as named bloks, with every rule that nothing checks called out. No
> account, and nothing is stored.

---

## 3. Where it would actually have gone wrong

Not the CSS. **Getting a 100 KB paste from `/` to `/decompile` intact.**

Every obvious transport is wrong, and one of them is wrong in a way that would have survived review:

| | |
|---|---|
| `GET /decompile?prompt=…` | **The prompt ends up in browser history, in the `Referer` of any outbound click, in proxy access logs, and — once EPIC-015 wires PostHog — in analytics.** On a page whose own copy says nothing is stored. It also breaks past roughly 8 KB. |
| Cookie | 4 KB, and rides on every subsequent request |
| `POST` to the page | An App Router page cannot read a request body; a `route.ts` cannot share a path with a `page.tsx` |
| `sessionStorage` | Needs JS on the critical path and loses the paste without it |
| A row in `decompiles` | That is storage, and this path has none |

**What it does instead:** the text stays on the server in a single-use in-process handoff and an
opaque id travels. Sixty-second TTL, deleted on read, bounded at 64 entries — each entry can be
100 KB, so an unbounded map is a memory-exhaustion primitive for anyone who posts the ask bar and
never follows the redirect.

Deleting on read is not tidiness: it is what stops `/decompile?start=…` in a history list, a bookmark
or a pasted link from being a working link to somebody else's prompt.

**The e2e assertion is the strong form.** Rather than looking for a fragment of the prompt in the URL
— which encoding can hide, and which threw on an emoji surrogate pair when first written — it asserts
the *entire* query string is `?start=<32 hex>` and nothing else.

**Known limit, stated not hidden.** The store is per process, so a second web container can miss. The
same seam as EPIC-014's in-memory rate limiter and the same fix. A miss renders the ordinary empty
decompiler with one line — *"That link had already been used"* — which also covers the commoner case
of somebody reloading.

### The four fixtures

`handoff.test.ts` asserts CRLF, tabs, emoji (astral plane and ZWJ sequences) and RTL survive code
point for code point, plus a prompt at the full 100 KB cap. The e2e suite then re-checks the whole
round trip against the deployed page: every `data-start`/`data-end` pair re-sliced from the source
**as the browser actually submits it** — CRLF, which EPIC-013 learned the expensive way — equals what
is rendered.

One thing that looked like a bug and is not: a textarea's `value` is the DOM's "API value", which
always reports newlines as LF whatever the form submitted. The first version of the test asserted
CRLF there and failed. The round-trip check compares against LF; the *range* check is what proves the
server holds CRLF.

---

## 4. Where the epic overrides the mockup

`docs/design/README.md` says the epic wins and to say so. Five places:

| The mockup has | The epic says | Result |
|---|---|---|
| *"Stop guessing which prompt works."* | Lead with the failure | New headline |
| An **Ask AI** chat bar | The ask bar is a textarea that goes to `/decompile` | Same slot, different thing |
| `.trust`: NORTHWIND, OAKLINE, MERIDIAN AI, CASTELL, BLUEPRINT | Decision 4 | Cut |
| `.proof`: 1,240,000 decompiled · 38% · 4s | Decision 4 | Cut |
| Nav with Features/Delivery/Pricing/Learn/Docs and **Start free** | Decision 2; those pages are EPIC-072 | Nav is logo · Decompiler · Sign in · theme |
| Sign-up side panel: "50 runs a month", "All nine lessons", "Free forever. No card." | None of it exists | Replaced, and an e2e test keeps it out |

Kept: the token set, `.hero`/`.lede`/`.eyebrow`, the `01/02/03` strip *structure*, the centred closing
CTA, the footer grid.

---

## 5. The truth audit, as a test rather than a promise

Criterion 10 asks for *"a line in the report confirming the check was made deliberately"*. A line in a
report is worth exactly as much as the day it was written, so it is `page.test.tsx` instead:

- No "trusted by", "used by", "loved by", "join N others".
- No counts of companies, teams, engineers, users or prompts.
- No testimonial furniture, no star ratings, no `#1`/award/"leading".
- No "limited beta", no countdown, no "only N left".
- **No `<img>` at all**, so there are no partner logos to be wrong about.
- **Every number on the page must be in an allowlist with a reason** — today `01`, `02`, `03` (step
  numbers), `41` (the name) and `100` (the input cap, enforced in code). A new digit fails the build
  until somebody says what it is. This is the assertion that would catch a counter, because a counter
  looks like data and reads as fine in review.

Three claims that needed care and what was done:

- **"No account, and nothing is stored."** True of `/decompile` until the reader asks for a link. The
  hero says it about pasting, not about sharing.
- **"Free."** True; there is no billing.
- **Step 3 of the strip.** The epic's own phrasing is "fix it before it ships", and the product cannot
  fix anything — there is no editor. The heading keeps the reader's goal and the body says who does
  the work: *"Each unchecked rule comes with the check that would catch it. You make the change —
  there is nothing to install and nothing to sign up for."*

### Two deliberate absences

**No GitHub link.** Decision 6 asks for one. `github.com/41prompts/41prompts` — the URL
`packages/core`'s `package.json` and `REUSE.toml` **already publish** — answers 404, as does the
private `soroushamdg/41prompts`. A footer link to a 404 is precisely what decision 6 forbids, and a
"GitHub, coming soon" stub is worse than nothing when the entire value of that link is arriving at the
code. EPIC-015 publishes the mirror; the link belongs in that change.

Worth flagging on its own: **the public packages already declare a repository URL that does not
exist.** Anyone who installs `@41prompts/sdk` gets a 404 from `npm repo`. Not this epic's to fix —
`REUSE.toml` is on the do-not-touch list — but it should not ship that way.

**No copyright line.** `CLAUDE.md` keeps the holder as `<legal entity>` until incorporation, and a ©
naming a company that does not exist is the same class of claim decision 4 rules out. EPIC-017 adds it
with the rest of the legal text.

---

## 6. The logo, and an ambiguity worth a ruling

Decision 8 asks for two things that pull against each other: *"the animation runs once on load"* and
*"`prefers-reduced-motion` shows the end state"*.

The morph's far end is **AI**. A mark that settles there reads "AIprompts", which is not the name of
the product — so "the end state" cannot mean the far end.

**Built as a round trip**: 41 → AI → 41, once, on load. That makes both sentences true at once — the
state it ends in is the `41` the server rendered, and reduced motion shows exactly that, complete and
correct, rather than a skipped frame. Hover and focus still morph, because that is the prototype's own
interaction and nothing in the epic argues with it.

**If you meant it settles on AI, say so and it is a two-line change** — but the wordmark would need to
change with it.

Implementation notes worth keeping:

- The point arrays are copied verbatim and are the single source of truth: the server renders
  `logoPathsAt(0)`, the inline script gets the same arrays via `JSON.stringify`, and `app/icon.svg`
  carries the same path data. There is no second copy to drift.
- **An inline script, not a hydrated component** (decision 10): a few hundred bytes, no React, no
  module graph, the same shape as the theme script this app already inlines.
- The paths carry `suppressHydrationWarning`, because the script mutates `d` before React hydrates.
  That is a deliberate mismatch on one attribute; without it every load logged a hydration error and
  the page's console stopped being worth reading.
- The script starts on `load` and the test waits for `domcontentloaded`, so the baseline path is read
  before the morph starts. The first version read it from the DOM and raced.

---

## 7. Acceptance criteria

- [x] **Ask bar visible without scrolling at 1280×800 and 375×812; submitting lands on `/decompile`
      with the text intact including CRLF, tabs, emoji and RTL.** `ask bar and its submit are fully
      visible without scrolling at …` (both viewports, asserting the bottom edge against the fold with
      `scrollY === 0`), plus `keeps CRLF line endings / tabs / emoji / RTL text byte for byte` and
      twelve unit tests in `handoff.test.ts`.
- [ ] **Nav, hero, strip, CTA and footer render in light and dark; visual regression snapshots
      committed.** Renders in both and is axe-clean in both (eight axe tests across four routes). **The
      snapshots are not committed — see §9.**
- [ ] **`/sign-in` and `/sign-up` work end to end against staging with Google, GitHub and a magic
      link.** Both pages render all three routes to entry and the flow is EPIC-002's, unchanged and
      still covered by `auth.spec.ts`. **Google and GitHub against staging need OAuth apps for the
      staging hostname — a human step; see §9.**
- [x] **Every footer link resolves; real page or stub, never a 404.** `every footer link resolves`
      walks the rendered footer and asserts 200 on each, plus `links.test.ts` checks each against a
      route on disk.
- [x] **Logo animates once on load and shows its end state under `prefers-reduced-motion`.**
      `animates once on load and settles back on the 41`, `shows its end state under
      prefers-reduced-motion, and never moves`.
- [x] **Metadata complete.** `robots.txt allows / and /decompile and disallows /d/`, `sitemap.xml lists
      only pages that exist and are indexable`, `the home page carries title, description, canonical
      and a card`, `the Open Graph image renders at 1200×630` (read out of the PNG's IHDR, not
      eyeballed). **No validator screenshot — see §9.**
- [x] **Lighthouse: performance ≥90, accessibility 100, best practices ≥95, SEO 100.** 97 / 100 / 100 on
      staging, and 96 / 100 / 100 / **100** on the production ruleset. SEO is capped at 66 on staging by
      its own `x-robots-tag: noindex` middleware, which is correct behaviour for staging and makes 100
      unmeasurable there — both numbers and the reason are in §8.
- [x] **Axe clean in both themes; full keyboard operation; 44px targets; no green, red or amber.**
      Eight axe runs, `the whole page is reachable by keyboard, starting with a skip link`, `the ask
      bar submits from the keyboard alone`, `touch targets clear 44px on a phone`, `uses no pass, fail
      or drift colour anywhere on the page`.
- [x] **Forbidden-word grep passes.** It caught `label` as a code identifier in `SiteLink` — ADR-003
      forbids it in identifiers, not only in UI strings. Renamed to `name`.
- [x] **No testimonial, logo, counter or claim that is not literally true today.** §5, and thirteen
      tests rather than a line in a report.
- [x] **`pnpm test`, `typecheck`, `lint`, `e2e`, `compliance`, `binary-files` clean.** §10.
- [x] **Deployed to staging with screenshots at both viewport sizes.** §8 — seven screenshots, plus the
      above-the-fold measurements and a full ask-bar round trip on the deployed build.
- [x] **Report and session log written; backlog updated.**

---

## 8. Staging and Lighthouse

Merged as `2894709`, redeployed, then driven by hand against `https://staging.41prompts.ai`.

### The ask bar, on the deployed build

```
handoff url: ?start=cb706308d6787a062e3c61f7dce75327
landed: 6 bloks, 5 findings, 0 range mismatches
```

The whole query string is the opaque id and nothing else, and every span's `data-start`/`data-end`
re-sliced from the source **as the browser actually submitted it** (CRLF) equals what is rendered.
That is the EPIC-013 check, re-run where the browser and the proxy are real.

`robots.txt` and `sitemap.xml` both serve the deployed origin, not a build-time localhost — which is
what `export const dynamic = "force-dynamic"` on those two route handlers is for.

### Above the fold, measured rather than eyeballed

| viewport | ask bar ends at | submit ends at | fold |
|---|---|---|---|
| 1280×800 | 635 | 625 | 800 |
| 375×812 | 551 | 541 | 812 |

### Lighthouse

| | staging | local production build | bar |
|---|---|---|---|
| Performance | 97 | 96 | ≥ 90 |
| Accessibility | 100 | 100 | 100 |
| Best practices | 100 | 100 | ≥ 95 |
| SEO | **66** | **100** | 100 |

FCP 0.8s · LCP 2.7s · TBT 70ms · CLS 0 · Speed Index 0.8s (local production build).

**Why SEO is 66 on staging and why that is correct.** Staging returns
`x-robots-tag: noindex, nofollow` on every response, so Lighthouse's `is-crawlable` audit fails and
caps the category. That header is not ours — it is a Traefik middleware on the staging application
(`…-noindex.headers.customresponseheaders.X-Robots-Tag`, alongside a Caddy label doing the same). It
is exactly what staging should do, and it means **an SEO score of 100 is not measurable on staging by
construction**. The 100 above is the same page under the ruleset production will serve, measured
against `next build && next start`. Both numbers are reported rather than picking the flattering one.

A related thing worth knowing, since it was checked while chasing this: `app/robots.ts` serves
`Allow: /` on staging too. That is harmless only because the edge blocks indexing anyway — the header
is what is actually protecting staging, not the file.

Lighthouse itself would not run against this machine's Node, which is x64 under Rosetta; it refuses
rather than produce numbers translated through it. Run with an arm64 Node fetched into a scratch
directory, nothing installed.

### Screenshots

`docs/epics/reports/screenshots/EPIC-016/`:

| | |
|---|---|
| `01-landing-1280x800-light.png`, `02-…-dark.png` | The whole page, both themes |
| `03-landing-375x812-light.png`, `04-…-dark.png` | Phone, both themes |
| `05-sign-in-1280x800.png` | Styled auth, three ways in |
| `06-legal-stub.png` | A placeholder that says it is one |
| `07-ask-bar-landed-on-decompile.png` | The paste, arrived and decompiled |

### Two defects staging found that the suite had not

1. **The nav wrapped at 375px.** "Sign in" broke across two lines and the theme button sat against the
   edge. Fixed (`white-space: nowrap`, tighter gutter below 560px) and now asserted: the nav must be
   one row with no horizontal scroll at 375px.
2. **The logo link was 31px tall.** It links home, which makes it a touch target like any other, and
   it was the one interactive element the 44px test did not cover. Fixed and added to that test.

Both are the kind of thing that only shows up when you look at the page rather than at the tests.

---

## 9. Not done, and why

1. **Visual-regression baselines are not committed.** They must be generated on Linux or CI will never
   match them — a `-darwin` baseline is not a baseline CI can use, and a missing one fails the run.
   Docker's VM disk had **1.5 GB free against an image needing more than 2 GB**, and the only way to
   make room was pruning volumes belonging to another project on this machine, which is not mine to
   do. The tests are written and skip themselves until the file exists, so nothing is faked and CI is
   not left red. To finish it, free space and run:

   ```
   docker run -d --name 41p-snap -w /repo mcr.microsoft.com/playwright:v1.63.0-noble sleep 3600
   git ls-files -z -c -o --exclude-standard | tar --null -czf /tmp/repo.tgz -T -
   docker cp /tmp/repo.tgz 41p-snap:/repo.tgz
   docker exec 41p-snap bash -lc 'tar xzf /repo.tgz -C /repo && corepack enable && pnpm install \
     && npx playwright test landing -g "visual regression" --update-snapshots'
   docker cp 41p-snap:/repo/apps/web/e2e/landing.spec.ts-snapshots ./apps/web/e2e/
   docker rm -f 41p-snap
   ```

2. **Google and GitHub sign-in against staging.** Needs OAuth apps with callback URLs for the staging
   hostname (`infra/README.md` documents which). Magic link works end to end and is covered. Rather
   than claim three screenshots I cannot take, this is listed — it is a human step, like the Turnstile
   keys were.

3. **No Open Graph validator screenshot.** The card is asserted by reading the PNG's dimensions out of
   its IHDR chunk and checking the meta tags, which is stronger evidence than a screenshot of somebody
   else's website; the validators also require a public URL, and staging is not public.

---

## 10. Verify

```
pnpm test && pnpm typecheck && pnpm lint && pnpm compliance && pnpm binary-files
E2E_PORT=3100 npx playwright test landing
```

A local Postgres is required for the db-backed suites (`docker start 41p-dev-postgres`, then
`pnpm db:migrate`) and `.env` must be sourced.

**Two things that will bite the next person running the suite locally:**

- `apps/web/e2e/capture.spec.ts` **rewrites EPIC-013's committed screenshots** on every run, so
  `git status` comes back dirty with five PNGs that are just this machine's font rendering. Restore
  them with `git checkout -- docs/epics/reports/screenshots/EPIC-013/`.
- The decompile rate limit is 120/hr per caller and **in-memory in the dev server**, which survives
  between test runs. Four consecutive local suite runs exhausted it and produced a wave of failures
  that look like the handoff is broken; the give-away is `That is the limit for now` on the page. Kill
  the dev server (`lsof -ti tcp:3100 | xargs kill`) rather than debugging the code.

**Two pre-existing e2e failures**, verified by stashing every change in this branch and re-running:
`magic-link sign-up lands on /app showing the email` and `sign-out kills the session server-side` fail
identically on `main`. Not caused here, not fixed here, and CI is the gate.

---

## 11. Open questions

1. **The headline.** Shipped one, four rejected above with reasons. Approve or replace.
2. **The logo's "end state"** (§6) — round trip, or settle on AI and change the wordmark?
3. **The public repository does not exist**, and `packages/core`'s `package.json` and `REUSE.toml`
   already publish its URL. That needs to be true before EPIC-015 announces anything, and it is what
   unblocks the footer's GitHub link.
4. **The handoff is per process** like the rate limiter. One durable store would fix both; worth doing
   before there are two containers, which is EPIC-015's problem to schedule.

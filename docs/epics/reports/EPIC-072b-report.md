<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-072b — About and Careers, said honestly

**Built 2026-09-21.** Branch `epic/072b-about-and-careers`. Epic file
`docs/epics/EPIC-072b-about-and-careers.md`; row 4 of `docs/epics/plan-mockup-parity.md`.

## 0. The short version

`/about` and `/careers` exist, are linked from the footer's `Company` group, and say only what is
true: **one person, in Montréal, since 2026**, and **no roles open**. Both are in the five lists
that decide what the public site is, both are under every guard the EPIC-072 pages are under, and
both scored Lighthouse ≥90 with accessibility 100.

**The epic's own finding is not on either page.** The drive measured **thirteen links across seven
pages** — five of them built by other epics — rendering in the *same colour, the same weight and
with no underline* as the text around them. Not "distinguished only by colour", which is the WCAG
failure everybody quotes. Distinguished by nothing. `axe` cannot see that class and never could, so
nine pages had been axe-clean and Lighthouse-100 over it since EPIC-072. §4 is the whole of it.

## 1. What was built

| | |
|---|---|
| `apps/web/app/about/page.tsx` | eyebrow, the mockup's headline in the first person, the origin paragraph with the year corrected, **one** person row, and a closing section that answers the question an engineer actually has about a one-person company. |
| `apps/web/app/careers/page.tsx` | the answer as the heading, three rows saying what is open (nothing), where it will appear when that changes, and the one route to a person. |
| `apps/web/app/company-pages.test.tsx` | 55 assertions: the count of people, the two words `/about` may not use, the sentence `/careers` has to carry, the chrome, and the footer's shape. Every absence paired with the mockup's own sentence as its control. |
| `packages/ui/src/landing.css` | the prose-link rule — §4. |
| `scripts/drive-epic-072b.mts` | the watched drive, 20/20. |

Changed to let them exist: `lib/site/links.ts` (`Elsewhere` → `Company`), `public-routes.json`,
`app/sitemap.ts`, `app/robots.ts`, `lib/site/hosts.ts`, `app/site-page.tsx` (`current` optional),
`app/site-claims.test.tsx`, `e2e/site-pages.spec.ts`, `lib/site/changelog.ts`.

## 2. The three things the mockup says that these pages do not

| | the mockup | here | why |
|---|---|---|---|
| people | two cards, both "Co-founder" | **one**, "Founder" | Soroush, 2026-09-20: not a current co-founder, omit the name. `company-pages.test.tsx` counts `data-person` and has a control proving the counter counts. |
| the year | `started in Montréal in 2025` | **2026** | `git log --reverse` → `2134832`, 2026-09-03. The epic file says to check it rather than copy it, and it is wrong by one. |
| the voice | "We built the tool we wanted" | "It is the tool **I** wanted" | The epic's scope rules out *any sentence implying a team*. `not-true-yet.ts` refuses `\bour team\b` outright; "Founder" does not match `\bco-founders?\b`, which was checked before the line was written. |

`/careers` drops all three invented openings. The page says so, and says why, rather than silently
not having them.

## 3. The phrase the epic's own criterion is written in, and why the page does not use it

Acceptance criterion: *"`/careers` states plainly that there are no open roles."*
`site-claims.test.tsx`'s `UNBACKED` refuses `/\bopen (?:roles|positions)\b/i` **on every page**.

The page says **"No roles are open right now."** The guard is not widened and the pattern is not
narrowed — the guard is right, it is there so no page can imply a company larger than this one, and
the criterion is about the meaning rather than the words. `company-pages.test.tsx` asserts both
halves: the phrase is absent from the page, **and** the guard still fires on `"We have three open
roles"`. Nobody reading this later can take it for the guard having been routed around.

## 4. The finding: thirteen links nobody could see

### What was measured

The first drive's screenshot of `/careers` showed "How to reach a person" looking exactly like the
two headings above it. Rather than reason about it, the computed styles were read off every public
route:

```
/security     2/2 indistinguishable   "Privacy"  "our security policy"
/guides       3/3                     "What your prompt does not check"  "Take a prompt apart"  "Docs"
/about        2/2                     "Privacy"  "Security"
/careers      1/1                     "How to reach a person"
/contact      1/1                     "the decompiler"
/sign-in      2/2                     "prompts"  "Create one"
/sign-up      2/2                     "prompts"  "Sign in"
                                      13 of 13 prose links
```

Each one: `color` equal to its parent's, `text-decoration-line: none`, `font-weight` equal to its
parent's. On `/security` that is `rgb(17, 17, 17)` on `rgb(17, 17, 17)`. A reader could only find
these with a mouse.

### Why nothing caught it

- **`axe` is out of scope by construction.** `link-in-text-block` fires on a link that differs from
  its surroundings *by colour alone*. A link that differs by **nothing** is not what that rule
  looks at. Nine pages have been axe-clean over this since EPIC-072.
- **Lighthouse scores accessibility 100** on all nineteen routes, before and after.
- **No stylesheet test could have.** The rule did not exist, so there was nothing to assert about.

### The fix, and the authority for it

`41prompts-full-mockup.html` sets `a{color:inherit;text-decoration:none}` globally — which is where
ours comes from — and then writes `text-decoration:underline` **inline on every link it puts inside
a sentence** (its "Forgot?", "Create one" and "Sign in", lines 811–848). Ours took the first half
and not the second. This is mockup parity, not a new design decision.

The rule **enumerates prose containers** rather than blanketing `main a`, because the mockup
deliberately leaves wordmark-shaped and button-shaped links bare. Two of the original thirteen were
the wordmark and were never the defect; the honest count fixed is **eleven**.

### It is a gate now, and it was proved to fire

`site-pages.spec.ts` walks every public route for it — 19 routes plus a control that injects the
defect into a real paragraph and asserts the probe still reports it. **With the CSS rule removed, 7
of 20 fail**, and they are exactly the seven pages the measurement named.

## 5. The list this epic's plan had missed, and the guard that found it in a minute

The plan named four readers of the route list — the sitemap, the robots agreement, the Lighthouse
sweep, the e2e walk. There is a fifth: **`PUBLIC_PATHS` in `apps/web/lib/site/hosts.ts`**, which
decides which of the two hosts serves a path. `hosts.test.ts` failed on the first full run of the
web suite, two minutes after the pages existed.

Both routes were already served correctly — everything outside `APP_PATHS` is marketing by default
— so nothing was broken. What was missing was the **classification**, which is the only thing that
list is for, and the guard says so in its own comment: *"this list exists only for the test's
benefit and for documentation."* That is the argument for having written it out rather than
deriving it, and it is worth recording that it paid for itself here.

**It is genuinely a different list** and was not folded into `public-routes.json`: that file holds
`/sign-in` and `/sign-up`, which are `APP_PATHS`, and omits `/robots.txt`, `/opengraph-image`,
`/waitlist` and `/d`, which are public paths. Two lists answering two questions.

## 6. The drive — 20/20, watched, against the built app

```
npx turbo run build --filter=@41prompts/web
node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3131)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/072b.env
set -a && . /tmp/072b.env && set +a
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p
export E2E_RATE_LIMIT_OFF=1
pnpm --filter @41prompts/web start --port 3131 &
npx tsx scripts/drive-epic-072b.mts
```

Transcript: `docs/epics/reports/screenshots/EPIC-072b/transcript.txt`. Eight screenshots beside it.

It signs in as nobody, deliberately: neither page changes with a session, and a drive that creates
an account it has no use for is a drive that has to delete one. The
`claude-drive-%@example.com` cleanup still runs at both ends, and reported `0 removed` both times.

**What the drive caught that the tests did not**, and it is two things:

1. **`/about`'s person card looked unfinished.** Every assertion passed on the first version — one
   person, correct name, correct year — and the screenshot showed a 1200px-wide box holding two
   short lines. The mockup's `.two` leaves half a row empty when there is one person, and an empty
   half reads as a card that failed to load. Moved to the `.site-row` idiom that `/guides` and
   `/changelog` already use: a key column against a sentence, which fills its width the way half a
   card does not. `02-about-1440.png` is the after.
2. **The thirteen invisible links**, §4.

## 7. The Linux visual baselines did not move, and that is a measurement

The footer's fourth group changed heading and gained two links, so the two `/` baselines were
expected to need regenerating. They did not, and the number rather than the expectation is what
settles it.

Rerun in `mcr.microsoft.com/playwright:v1.63.0-noble` (the procedure in EPIC-016d's report §8) at
**`maxDiffPixelRatio: 0`**:

| baseline | pixels differing | image | budget at the configured 0.01 |
|---|---|---|---|
| `landing-light-linux.png` | **693** | 1280 × 5134 = 6,571,520 | 65,715 |
| `landing-dark-linux.png` | **3,253** | same | 65,715 |

Both are 20× to 95× under the tolerance EPIC-016d set for font hinting, so both pass and neither
file changed. `--update-snapshots` left them byte-identical, and the `/dev/ui` gallery pair is
byte-identical too. The footer is not taller because `Company`'s three links are still fewer than
`Product`'s five.

**Stated plainly because it cuts both ways:** a 1% tolerance absorbed a real copy change. That is
the tolerance working as designed — it exists so a font-hinting difference on a runner is not a
failure — but it means the visual gate is not the instrument that would notice a footer word
changing. The tests that noticed are `links.test.ts`, `company-pages.test.tsx` and the drive.

## 8. Lighthouse — every route at or above 90, accessibility 100 on all nineteen

`node scripts/lighthouse-site.mjs http://127.0.0.1:3131`, against the built app.

| route | perf | a11y | best practices | SEO |
|---|---|---|---|---|
| `/about` | 96 | 100 | 100 | 100 |
| `/careers` | 96 | 100 | 100 | 100 |

The other seventeen routes: performance 95–99, accessibility 100, best practices 100, SEO 100
(`/contact`, `/sign-in`, `/sign-up` with `is-crawlable` dropped, which is EPIC-015's intent and is
checked in both directions by the script). Full table in the session log.

## 9. Acceptance criteria

| | criterion | evidence |
|---|---|---|
| A1 | `/about` matches neither `\bco-founders?\b/i` nor `\bour team\b/i`; `claims.test.ts` green with controls intact | `company-pages.test.tsx` "says nothing about a co-founder" / "…about our team" + the two mockup-sentence controls; `claims.test.ts` 152 passed; drive line 7 |
| A2 | `/about` names exactly one person | `company-pages.test.tsx` "names exactly one" + "would count two if there were two"; drive line 6 |
| A3 | `/careers` states there are no roles open and offers a contact route | `company-pages.test.tsx` "says no roles are open", "offers a contact route", "is phrased so the site-wide hiring guard still passes"; drive lines 11, 14, 15, 16; `05-careers-1440.png` |
| A4 | both in `public-routes.json` and `sitemap.xml`; the sitemap test still fails on a missing page | `routes-agree.test.ts` — 51 passed, including its "would have caught the EPIC-072 gap" control; `company-pages.test.tsx` "are public routes" |
| A5 | both carry the skip link and the shared nav and footer | `company-pages.test.tsx` "carries the skip link, the nav and the footer"; `site-pages.spec.ts`'s per-route walk + its no-nav control |
| A6 | Lighthouse ≥90 on both, accessibility 100 | §8 |
| A7 | neither scrolls sideways at 390px | `site-pages.spec.ts` "does not scroll sideways at 390px" for both; drive lines 17 and 18 — 0px on each |
| A8 | `pnpm forbidden-words` passes; all gates green per package; `gates.mjs ci` green before merge | §10 |
| A9 | both loaded in a browser from the built app, screenshots in the report | §6, 20/20, eight screenshots |
| A10 | report and session log written | this file and `docs/epics/sessions/EPIC-072b-session.md` |

## 10. The gate, and what a green here does not cover

`node scripts/gates.mjs ci` — see §11 for the run. Its closing block prints three things every
time, and they are part of the result:

1. **The runner is slower.** Nothing here is timing-sensitive; the two new pages are static and the
   one new e2e walk reads computed styles rather than waiting on anything.
2. **The runner is Linux, and the four visual baselines skip on darwin.** For this epic that gap is
   **closed further than usual**: both `/` baselines were compared inside
   `mcr.microsoft.com/playwright:v1.63.0-noble` — at zero tolerance, not merely at the configured
   one — and the `/dev/ui` pair was compared byte-for-byte (§7). What remains uncovered on Linux is
   everything *else* in the suite that darwin and Linux could render differently, which is the
   standing gap and not one this epic narrows.
3. **A `pull_request` run tests the merge, not the branch tip.** There is no pull request; nothing
   is pushed. `origin/main` is 48 commits behind local `main` before this epic.

**And what nothing local covers, stated so no line above reads as more than it is:** no second
machine built this, no image was built, nothing deployed, and no migration ran against a real
database. There is no migration in this epic and no schema change, which narrows that last one to
nothing — but the image build and the Coolify environment are untested here as always.
**No staging URL is evidence about any of this**: staging serves whatever commit Soroush last
pushed, which is far behind.

## 11. Verify it

```
# unit
pnpm --filter @41prompts/web exec vitest run app/company-pages.test.tsx app/site-claims.test.tsx \
  lib/site/links.test.ts lib/site/routes-agree.test.ts lib/site/claims.test.ts lib/site/hosts.test.ts

# the link guard, and the proof it fires
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
npx playwright test site-pages -g "links in running text"     # 20 passed
#   remove the `.site-lede a, …` block from packages/ui/src/landing.css → 7 fail

# the whole suite
pnpm e2e                                                      # 394 passed, 4 skipped on darwin

# the drive
# (the block in §6)

# Lighthouse
node scripts/lighthouse-site.mjs http://127.0.0.1:3131
```

## 12. Open questions — three, all Soroush's, none blocking

1. **`docs/epics/RELEASE-DUE.md` has been waiting since 2026-09-20.** Six epics have merged into
   local `main` since the last push, counting this one. Nothing is pushed and nothing is tagged;
   cutting the release is yours.
2. **`/about`'s closing line is an editorial choice, not a fact.** The page ends on *what happens if
   the one person stops* — the engine is Apache-2.0, and the SDK never needed us to be up — because
   that is what the ICP is actually asking. If you would rather it ended on a mission sentence, it
   is one section.
3. **`/careers` exists rather than 404ing**, which the epic file flags as an assumption to be
   corrected if wrong: *"close them"* was read as *the openings are closed, the page stays*. If you
   would rather it not exist, the route and the `Company` footer entry come out together and the
   e2e 404 control gains it back. Ten minutes.

## 13. No new dependency

None added. `pnpm dead-code`: 935 exported values, 0 orphaned, `ALLOWED` still empty.

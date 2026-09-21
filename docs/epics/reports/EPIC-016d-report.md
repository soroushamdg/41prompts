<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-016d — The landing page, everything that needs nothing else

Built 2026-09-21. Branch `epic/016d-landing-parity`. Epic file
`docs/epics/EPIC-016d-landing-parity.md`; plan `docs/epics/plan-EPIC-016d.md`; the count of
differences this closes is `docs/epics/plan-landing-parity.md`.

## 0. The four questions were asked, not assumed

`plan-landing-parity.md` counted twenty-three remaining differences between the mockup's home page
and the built one and marked four **[ASK]** — three that publish something about the company that is
not true, and one that reverses a rule in `CLAUDE.md`. `docs/epics/CURRENT.md` held the epic on
them.

**This session was interactive, so they were put to Soroush before a line of code was written.**

| # | question | answer | what it cost to build |
|---|---|---|---|
| B7 | the trust row — five invented customer names | **Leave it out** | nothing; the row was never built |
| D1 | the three fabricated counters | **Keep the three true sentences** | nothing; `HomeProof` stands |
| B2 | the hero headline | **Restore the mockup's** | one line and a pinned test |
| C2 | persistent blok kind colour | **EPIC-021a's palette, made persistent** | §4 |

Two of the four are "build nothing". **That is why there is no EPIC-016e** — the plan held those
three back into a separate epic precisely so each would land in a change whose commit message says
who decided and when, and two of them turned out to be decisions not to change anything.

`docs/AUTONOMOUS.md`'s "never stop to ask" exists because an unattended run has nobody to ask. This
run had somebody, and the four answers plus nine build-time decisions are in
`docs/decisions/AUTONOMOUS.md`.

## 1. What is on the page that was not

**Sixteen of the twenty-three differences are closed.** Every one that does not depend on a page
that does not exist.

**The nav** — `Product` opens the row and points home, the order is the mockup's, `Sign in` and
`Go to dashboard` are bordered `.btn .btn-sm`, and `Start free` is the primary. `Decompiler` moved
into the group that collapses below 900px, so a phone sees what the mockup's phone sees: the logo,
Theme, Sign in, Start free.

**The hero** — the mockup's eyebrow, headline and lede, verbatim; the `No credit card` pill; the
`See the workbench` link; the Ask-AI bar with its rotating placeholder; the four suggestion chips.
The paste box keeps its place and its job.

**The product shot** — a `read-only` pill, a token count, a blok count and a `Run 5 checks` control
in the pane bar, and **every card in the canvas now carries its kind rail and a coloured kind tag**.

**Blok kind colour is persistent everywhere** — the shot, the rotator's illustrations, the
decompiler, the canvas and the runs table, all through `packages/ui`.

**The three steps** read Decompile · Assert · Ship. **The closing band** and **the footer blurb** are
the mockup's.

## 2. What is still different, and what each one waits on

Seven differences remain, and **none of them is a decision** — each is a page that does not exist:

| # | difference | waits on |
|---|---|---|
| A2 | `Pricing` in the nav | EPIC-070 |
| A3 | `Learn` in the nav | Stage 7 |
| D3 | the lessons teaser, three lesson cards | Stage 7 |
| D4 | the closing band's second button, `See pricing` | EPIC-070 |
| E1 | `Pricing` in the footer | EPIC-070 |
| E2 | `Lessons` and `Blog` in the footer | Stage 7, EPIC-073 |
| E3 | `About` and `Careers` in the footer | EPIC-072b |

EPIC-016's rule holds for all seven: **a nav link to a 404 is worse than no nav.**

And two differences are closed by a decision rather than by code — B7 and D1, which Soroush ruled
out. The page will never have them; they are not outstanding work.

## 3. The four things a drive found and a test could not

`scripts/drive-epic-016d.mts`, **23/23**, against the built app on `next start`, watched in the IDE
preview pane. Transcript and twelve screenshots in
`docs/epics/reports/screenshots/EPIC-016d/`.

1. **The Ask sheet's promise, checked at the URL.** The sheet's label says *"This is exactly what
   will be sent"*. The drive intercepts `window.open` and reads the query string: it carries the
   typed question, encoded, and exactly one parameter. That is the only place the promise is either
   true or false, and nothing else in the repository looked at it.
2. **The kind palette as a palette.** Six hues on a rail and on a tag, at rest, read off three
   separate surfaces — the shot, the rotator, the real decompiler — with the rail's computed colour
   and the tag's printed side by side. A stylesheet assertion says a rule exists; it cannot say the
   variable resolved. A rail whose `--blok-kind` resolves to nothing is `background: ` and invisible.
3. **The hero after everything it gained.** An eyebrow, a second CTA, an Ask bar and four chips.
   The ask bar ends at 657px of 950 and the page still reads as a hero rather than a pile —
   `02-hero-1440.png`.
4. **The nav at 375px**, which is where this epic's one e2e failure was, seen rather than asserted:
   `08-nav-375.png` is the mockup's phone nav, one row.

**And the drive found a defect in itself, twice over.** `innerText` is the *rendered* text and
`.eyebrow` is `text-transform: uppercase`, so a case-sensitive `includes` failed on a page that is
correct — the same shape as EPIC-032a's `REQUEST` against a variable named `request`, except that
there the transform was the defect and here the mockup draws it uppercase. Worse: **the failing line
printed "eyebrow · headline · lede, all the mockup's" while failing**, because its detail was a
fixed string rather than what it had measured. Every detail in that script is now built from the
check it reports.

## 4. Blok kind colour: what persistent actually cost

Soroush's answer was EPIC-021a's palette made persistent, not the mockup's `--kc` — two of whose six
values are `--color-pass` and `--color-warn` character for character, which would have needed
`CLAUDE.md` rule 10 amended across the whole product.

- `.blok-card[data-kind]::before` — the mockup's rail: 5px, inset 9px top and bottom, at `left:-2px`
  so it covers the card's own border rather than adding to it.
- `.blok-card[data-kind] .tag` takes the kind's colour for border and text; the leading glyph
  follows instead of lighting up only on interaction.
- **The mapping is no longer scoped to `.blok-card`.** Resolving a custom property paints nothing,
  so `[data-kind="context"]` can hand the answer to anything that declares a kind while every rule
  that *paints* still names its own element. That is what lets the product shot's `li` — a picture of
  a card, not a card — draw the same rail without a second copy of the six mappings going stale.
- **The contrast tier moved with it, and was measured before it was written.** A coloured 9.5px kind
  tag is normal text, so `CONTRAST_PAIRS` went from six pairs at 3:1 against `surface` to eighteen at
  4.5:1 against `surface`, `bg` and `sunken`. **The worst of the eighteen is `--color-kind-context`
  on light `bg` at 5.97:1.** No value was renumbered to make that pass — the palette EPIC-021a chose
  for a 3:1 job already cleared the 4.5:1 one everywhere.

`blok-card.test.tsx`'s guard was **rewritten, not deleted**: it pinned the opposite rule and now
pins this one, with the reserved-token assertion unchanged. It was proved to fire by ungating the
rail rule and watching it go red.

**The `/dev/ui` gallery baselines did not move, and that was measured rather than claimed.** They
are the control on the whole change: the gallery renders `BlokCard` with no `kind`, every painting
rule is gated on `[data-kind]`, and the claim that an unkinded card is byte-identical is worth
exactly what a Linux screenshot says about it. Both passed in update mode and in compare mode
without being rewritten.

## 5. Two defects in the tests, both found by running them

**1. `.site-nav-link` has carried `white-space: nowrap` since EPIC-016 and `.btn` never needed it.**
At 375px "Sign in" broke across two lines *inside its own button*: the button was 59px wide and its
word wanted 66, so it stood 52px against everything else's 46 and the nav-row assertion read the
different `top` as a second row. Until this epic nothing in that nav was a button with a two-word
name.

**2. A zero-height spacer was being counted as a row.** `.site-nav-spacer` is `flex: 1` on an empty
span, so whenever the row has slack its rect is a 0px box at the row's vertical centre — a `top` no
real control shares. **At 390px and above this test would have failed on a nav that was perfectly
fine**, and it did not only because the old nav was wide enough that the spacer had no width at
375px. The filter now wants height as well as width.

Neither is a product defect and both were invisible until something moved.

## 6. The nav row, measured

Seven viewports, against the built app, printed rather than reasoned about:

| | before | after |
|---|---|---|
| content at 375px | 386px against 375 available | 339px |
| rows, 360–900px | 2 (the wrap) | 1 |
| `scrollWidth`, 320–900px | 415px at every width | equal to the viewport at every width |

`gap` 8→6, inner padding 16→12, `.btn-sm` 11→9, logo 20px→17 below 560px. The logo needed
`LogoMark`'s `size` prop **dropped from the nav**: `size` is written as an inline custom property and
an inline property cannot be answered by a media query, so a nav that wanted a smaller mark on a
phone could not ask for one.

Below about 340px it still does not fit, and the two ways to lose are a second row or a page that
scrolls sideways. **It wraps.** BUG-069 rejected wrapping when it happened at 390px with four links
— a nav that wrapped on a phone anybody owns. This one cannot wrap above 340px.

**One thing was probed rather than guessed**, and it cost a minute instead of an afternoon: the
first measurement run reported an unstyled page at every width. The server log said `EADDRINUSE` —
the restart had silently failed and a stale `next start` was serving a `.next` that had been
overwritten underneath it, so every chunk 404'd. `docs/PROCESS.md` says to print the value and list
the processes, and it was right again.

## 7. The rotating placeholder, and why it settles rather than freezes

The mockup cycles five questions through the ask field every 3400ms and has **no mechanism to stop
it**, which is a WCAG 2.2.2 failure. This has the three gates `capability-rotator.tsx` already
established — never starts under reduced motion, stops for good on focus, never while the field has
a value — and one more: **on stopping it settles back on the first question** rather than freezing
wherever the interval happened to be.

That last part is not a nicety. A full-page baseline that captured whichever of five sentences the
timer had reached would be flaky by construction — `docs/PROCESS.md`'s own rule about waiting on a
condition rather than a duration, arriving as a screenshot instead of as an assertion. The first
question is what every reader sees on arrival, so it is what the baseline holds, and
`landing.spec.ts` gets there by doing what a reader does: focusing the field.

## 8. Verification

```
pnpm test        9 of 9 packages, 1437 tests
pnpm typecheck   9 of 9 packages
pnpm lint        12 of 12, forbidden-word grep clean
pnpm reuse-lint  1456 / 1456 files, compliant with REUSE 3.3
pnpm dead-code   933 exported values across 623 files, none orphaned
pnpm binary-files 1189 checked in full, including staged and untracked
pnpm e2e         370 passed, 4 skipped (the Linux-only baselines) on darwin
linux e2e        370 passed, **0 skipped**, twice, in
                 mcr.microsoft.com/playwright:v1.63.0-noble — see below
linux baselines  2 rewritten and 4 compared clean in the same container
drive            23/23
```

**The full suite was run on Linux, and that is beyond the Definition of Done.**
`docs/PROCESS.md` names "the runner is Linux" as one of three things a green `gates.mjs ci` cannot
cover, and explains at length why the e2e step does **not** move into that container permanently:
it does not fit on Docker's VM disk and it roughly doubles a mode whose whole value is that people
actually run it. Running it once by hand, with a person watching, is a different act from making it
a gate — which is the same argument that file already makes about regenerating baselines. So this
is evidence for this epic and not a proposal to change the gate.

It ran twice: once on the tree as of the nav fix (370 passed) and again on the final tree after the
shot's kind rails landed (370 passed, 9.7m). **Nothing skipped in either**, where every run on this
machine skips four.

Exact commands:

```
pnpm test && pnpm typecheck && pnpm lint
node scripts/gates.mjs ci

# the drive, watched:
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
npx turbo run build --filter=@41prompts/web
node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3131)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/016d.env
set -a && . /tmp/016d.env && set +a
export E2E_RATE_LIMIT_OFF=1
pnpm --filter @41prompts/web start --port 3131 &
npx tsx scripts/drive-epic-016d.mts
```

The Linux baselines, which is the one step this file should spell out because the old procedure in
EPIC-016's report drives `next dev` and that is no longer allowed:

```
git ls-files -z -c -o --exclude-standard | COPYFILE_DISABLE=1 tar --null -czf /tmp/repo.tgz -T -
docker run -d --name 41p-snap --add-host=host.docker.internal:host-gateway -w /repo \
  mcr.microsoft.com/playwright:v1.63.0-noble sleep 7200
docker exec 41p-snap mkdir -p /repo && docker cp /tmp/repo.tgz 41p-snap:/repo.tgz
docker exec 41p-snap bash -lc 'tar xzf /repo.tgz -C /repo && cd /repo && corepack enable && pnpm install --frozen-lockfile'
docker exec -e UPDATE_VISUAL=1 -e DATABASE_URL=postgres://41p:41p@host.docker.internal:55435/41p \
  -e E2E_PORT=3100 41p-snap bash -lc 'cd /repo && npx playwright test landing dev-ui -g "visual regression" --update-snapshots'
docker cp 41p-snap:/repo/apps/web/e2e/landing.spec.ts-snapshots/. apps/web/e2e/landing.spec.ts-snapshots/
```

**`COPYFILE_DISABLE=1` is not optional on macOS.** Without it `tar` writes AppleDouble `._*` files
beside every source file, Playwright collects `._landing.spec.ts` as a spec, and the run dies on a
`SyntaxError` in a resource fork. That cost one round trip here and is written down so it costs
nobody another.

## 9. Acceptance criteria

| | criterion | evidence |
|---|---|---|
| A1 | `Product` first, points home, `aria-current` on `/` | `site-chrome.test.tsx` "opens with Product, in the mockup's order" + the control that it is not always marked; drive line 2 |
| A2 | nav order, every link 200 | `site-pages.spec.ts` "every nav link answers 200"; drive line 1 |
| A3 | 375px: one row, no sideways scroll, 44px targets | `landing.spec.ts` "touch targets clear 44px on a phone"; drive line 21 — 1 row, shortest 46px, overflow 0px |
| A4 | `Sign in` bordered, `Start free` primary and signed-out only | `site-chrome.test.tsx`, both session states + "exactly one primary"; drive lines 3 and 23 |
| B1 | eyebrow, headline, lede verbatim | `page.test.tsx`; drive line 4 |
| B2 | ask bar whole above the fold at both viewports | `landing.spec.ts`, unchanged; drive line 6 — 657px of 950 |
| B3 | pill and `See the workbench`, no reserved hue on the dot | `page.test.tsx`; drive lines 5, 7 and 16 |
| B4 | Ask bar: Enter, rotation, and what stops it | `landing.spec.ts` ×4; drive lines 8–11 |
| B5 | four suggestions, seven chips in total | `page.test.tsx` |
| C1 | pane bar, counts derived, run control not a button | `page.test.tsx` ×3; drive lines 12 and 13 |
| C2 | no `assertion` anywhere | `pnpm forbidden-words` PASS; `page.test.tsx` asserts the rendered text |
| D1 | kind rail and tag at rest; unkinded card untouched | `blok-card.test.tsx` rewritten, proved to fire; drive lines 14, 15 and 22; the `/dev/ui` baselines did not move |
| D2 | 4.5:1 on three grounds, both themes | `contrast.test.ts`, 18 pairs |
| D3 | no kind rule reaches a reserved token | `blok-card.test.tsx`, unchanged |
| E1 | strip, band, footer blurb | `page.test.tsx`; drive lines 17–19 |
| E2 | axe clean, both themes, both viewports | `landing.spec.ts` |
| E3 | no reserved hue outside a marked example | `landing.spec.ts` + `reserved-colour.spec.ts`'s six controls; drive line 16 |
| E4 | Linux baselines regenerated, visual suite green | §4 |
| F1 | `gates.mjs ci` green | §10 |
| F2 | driven by hand against the built app | §3, 23/23, twelve screenshots |

## 10. The gate, and what a green here does not cover

`node scripts/gates.mjs ci` on **`ab6e5f6`** — clean `git clone` of that commit, frozen lockfile,
cold turbo cache, no inherited environment, its own throwaway Postgres.

```
checkout      git clone + checkout ab6e5f6f    PASS  0m01s
ci.yml        pnpm install --frozen-lockfile   PASS  0m08s
              pnpm lint                        PASS  0m27s
              pnpm typecheck                   PASS  1m09s
              pnpm db:migrate                  PASS  0m02s
              pnpm test                        PASS  1m12s
              playwright install chromium      PASS  0m01s
              pnpm e2e                         PASS  9m20s   4 test(s) skipped on darwin
              uv run pytest -q (sdks/python)   PASS  0m28s
compliance    reuse lint                       PASS  0m04s
              pnpm boundaries                  PASS  0m05s
              turbo boundaries                 PASS  0m01s
              pnpm forbidden-words             PASS  0m01s
              pnpm binary-files                PASS  0m01s
              pnpm dead-code                   PASS  0m01s
              license-gate --sbom              PASS  0m02s
              pnpm mirror-dry-run              PASS  1m12s
17 step(s), all passed, 14m17s wall
```

The mode prints two caveats every time, and `docs/PROCESS.md` says they are part of the result
rather than a footer. Both are read rather than repeated:

1. **"The runner is Linux and this is darwin: the four visual-regression baselines skip here."**
   **Closed for this epic, and more than usual.** The two `/` baselines were regenerated inside
   `mcr.microsoft.com/playwright:v1.63.0-noble` and all four compared clean there — and then the
   **whole suite** was run in the same container, twice, 370 passed with nothing skipped. This epic
   was the one most exposed to that caveat: it moves the nav, the hero, the shot and every blok
   card's rail.
2. **"The runner is slower than this machine."** Not closed, and not closeable locally. This epic
   adds three timing-sensitive e2e tests — the placeholder rotation is 3400ms and one assertion
   waits out more than one tick. They are written to wait on a **condition** (`expect.poll` against
   the attribute, 12s budget against a 3.4s interval) rather than on a duration, which is the
   mitigation `docs/PROCESS.md` names for CI #209. A 2-core runner under load is still the one thing
   this machine cannot reproduce.

And the standing one, which `CLAUDE.md` states rather than the gate: **nothing is pushed**, so no
second machine builds this, no image is built, and Coolify, Traefik and a real database are
untested. They wait for Soroush's next push.

**One thing the gate could not tick and nor can anything else: `docs/backlog.md` has no row for
this epic.** The mockup-parity programme is sequenced in `docs/epics/plan-mockup-parity.md` and
`docs/epics/plan-landing-parity.md`, because `CLAUDE.md` reserves the backlog for Soroush. Step 8
of `docs/AUTONOMOUS.md`'s loop — tick the epic's own status cell — has nothing to tick, which is
stated here rather than silently skipped. EPIC-023, 024, 016b and 016c are in the same position.

## 11. Open questions

1. **The run demo's heading says "Six checks" over five rows.** Pre-existing — it is the mockup's
   own copy, shipped by EPIC-016b — and this epic put it out of scope rather than re-deciding it
   quietly. Either the heading becomes "Five checks" or the table gains a row. One line either way.
2. **`See the workbench` goes to `/features`, not to the workbench.** The mockup sends it to the
   signed-in editor, which for a signed-out reader is a sign-in wall. `/features` answers the
   button's promise without an account, and `Start free` beside it is the control that asks for one.
   If Soroush wants the mockup's destination, it is one href.
3. **The hero is long now.** Headline, lede, paste box, a second CTA, an Ask bar and four chips that
   wrap to two rows at 1440px. Everything is the mockup's and the fold assertion passes; whether it
   should be *shorter* than the mockup is a judgement no gate can make.
4. **Nothing is pushed, so the deployed drive did not happen**, and `origin/main` is now 40 commits
   behind local `main`. `docs/epics/RELEASE-DUE.md` has been waiting since 2026-09-20.

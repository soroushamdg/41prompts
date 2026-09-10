# EPIC-013 report: Public decompiler

Branch `epic/013-decompiler-web`. 2026-09-10.

**Status: done.** `/decompile` is public, server-rendered, no account. **370 tests in `packages/core`,
38 in `apps/web`, 67 in `packages/ui`, 28 Playwright end to end**, axe clean in both themes and on the
empty state. `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e`, `pnpm compliance` and
`pnpm binary-files` are clean. Both carried debts are paid: EPIC-011a's fixture gap and EPIC-012a's
cross-kind `repeated` presentation.

The steer named where this would go wrong. It was right, and the failure was not where I expected.

---

## 1. Offset-to-DOM mapping: three separate things eat characters

The four text fixtures were built first, before any highlighting, and each one found something.

### Carriage returns do not survive server rendering

Measured before writing the mapping, by server-rendering a span for each required shape and reading
back `textContent`:

| input | source length | DOM length | intact? |
|---|---|---|---|
| `"One.\r\nTwo.\r\n"` | 12 | **10** | **no** |
| `"One.\rTwo."` (lone CR) | 9 | 9 | **no** — every `\r` became `\n` |
| `"\tindented\t\tdeep"` | 15 | 15 | yes |
| `"See 🙂 and é and 👩‍👩‍👧"` | 26 | 26 | yes |
| `"1. أجب دائماً JSON فقط."` | 23 | 23 | yes |
| BOM, lone surrogate, nbsp, leading/trailing spaces | — | — | yes |

React writes the raw `\r` into the HTML and the parser's input-stream preprocessing replaces `\r\n`
and lone `\r` with `\n` before any script runs. Spec behaviour, not a React bug, and unpreventable
short of emitting `&#13;` through `dangerouslySetInnerHTML` — which on a public page rendering
arbitrary pasted text is the last place I would hand-roll escaping.

Two consequences, and the second is the one that would have shipped:

1. A naive `textContent === source.slice(start, end)` assertion passes three of the four required
   fixtures and fails only CRLF.
2. **Hydration would break on every Windows-pasted prompt** — React's expected text node holds `\r\n`
   where the DOM holds `\n`.

**The design that follows:** offsets stay in source space, the DOM carries display text, and one
function — `toDisplayText` — sits between them. The input is *not* normalised: `Range` offsets keep
indexing the original string, because EPIC-014 captures that string and a blok owning its verbatim
span is a rule worth not eroding from the edge.

### The browser rewrites line endings on the way in

Then the e2e suite found the other half. Three of the four shapes failed with offsets exactly two
characters out, and CRLF — the hard one — passed.

**The HTML form-submission algorithm normalises a textarea's value to CRLF.** A prompt pasted with
`\n` arrives at the server as `\r\n`. Measured: with two blank lines ahead of it, a range the test
expected at offset 27 came back at 29 — one extra character per line break. CRLF passed *because it
was already what the server saw*.

So in practice **almost every submission is CRLF at the server**, which makes `toDisplayText` load-
bearing on the common path rather than an edge case. It also means EPIC-014 will capture CRLF
whatever the author's editor used, which is worth knowing before that epic writes its retention tests.

### The prototype's fragment badge would have broken exactness outright

`docs/design/41prompts-decompiler.html` renders `<span class="frag">1/3</span>` **inside** the
highlighted span, so `textContent` would be the range plus `"1/3"`. Here it is a CSS `::after` fed
from `data-fragment`, and its accessible name moved to `aria-describedby`, which adds to a
description instead of replacing the content.

### What is proven, and how

- Per range, in DOM space: `span.textContent === toDisplayText(submitted.slice(start, end))`, for all
  four shapes, in the browser.
- Whole-document reconstruction: concatenating every piece rebuilds `toDisplayText(source)` exactly —
  over every corpus prompt, every named edge case and **500 generated inputs**.
- An overlapping range is dropped rather than emitted twice. Synthetic, because clustering cannot
  produce one, which is exactly why it needs a test rather than a comment.

---

## 2. The debts

### EPIC-011a's fixture gap, paid

EPIC-011a refused to paper over this and said so: *"25 real prompts, and not one of them multimodal
or written as a check… padding that table with text written to match my own patterns would only make
the headline number dishonest."*

Four whole prompts, written as prompts somebody would paste: a design reviewer handed screenshots
(`image_ref` as markdown, an `<img>`, and a bare path), an invoice reader handed a photo
(`image_input` as a tag, a phrase and a variable), a sheet of expectations, and an API-contract check.
Corpus 25 → 29; 32 of their segments joined the labelled table, hand-labelled by reading the prompt.

> **Accuracy: 96.7% on 60 rows before → 96.7% on 92 rows after** (2 misses of 60, 3 of 92).

The number barely moved, which is the point: the three previously-uncovered kinds are now scored on
real prompts and the heuristics hold up. **All three misses are now the same shape** — a numbered list
item whose verb `constraint-output-verb` cannot see because the list marker precedes it
("1. Report differences in spacing…", "1. Read the failing job's logs…", "Anything not covered here…").
Reported rather than tuned: changing a heuristic is EPIC-011a's territory and would move clustering
snapshots across the package. **Open question 1.**

One further thing this bought: `expected-output-sheet` states a rule an `expected` blok covers, so
**`rule_without_check`'s coverage path is now exercised on real text**. Before this, no corpus prompt
contained an `expected` blok at all and only a synthetic fixture had ever taken that branch. Pinned by
a named test.

Audit moves with the corpus: **20 findings across 29 fixtures**, `rule_without_check` **16 across 11
of 29**. Both ceilings raised with the reason written down — they exist so a change that floods the
panel has to say so, not so that adding a fixture trips them.

### EPIC-012a's cross-kind `repeated`, paid

A `repeated` finding reports the pair clustering *refused*, which by construction is a pair whose
kinds differ — so "these two bloks say the same thing" reads as a mistake unless the card shows that
one is context and the other a constraint. Both kinds are on the card now
(`05-repeated-shows-both-kinds.png`), asserted by an e2e test.

---

## 3. Taking the prototype's interaction, not its algorithms

Per the steer. Four departures, each a correction rather than taste:

| The prototype | Here | Why |
|---|---|---|
| `tabindex="0"` on every span | One tab stop per blok, arrow keys within it | `docs/design/README.md`'s correction. A forty-span prompt is otherwise forty tab stops before the reader reaches anything else. |
| Fragment badge as a DOM child | CSS `::after` from `data-fragment` | Otherwise `textContent` is the range plus `"1/3"`. |
| `high` painted `--fail`, `med` painted `--warn` | Severity by position, weight and a word | Green, red and amber mean pass, fail and drift. Findings are not pass/fail. |
| `--kc` per-kind colour scale reusing `--pass`/`--warn` | Ink marker | `docs/design/README.md` records EPIC-003's deviation as accepted, with EPIC-020 owning a real per-kind mapping. Decision 4's "category colours appear only during interaction" is satisfied vacuously — there are none yet. **The README's correction wins, as the epic's notes instruct.** |

---

## 4. Things only running the page could find

- **A `"use server"` file may export only async functions.** Exporting the cap, the state type and
  the copy from `actions.ts` made the route a 500 — not a type error. They live in
  `lib/decompile/limits.ts`.
- **Turbopack does not map `.js` to `.ts`.** `packages/core` is `moduleResolution: NodeNext`, so its
  imports carry the extension TypeScript requires while the files are `.ts`. `transpilePackages`
  (already listed core), `experimental.extensionAlias` (a webpack-only option, accepted by the schema
  and inert) and aliasing to core's *source* were each tried and each failed identically. The app now
  reads core's built output through one alias — and **the alias path resolves relative to the app
  directory, not to `turbopack.root`**, which took three forms to establish: a bare relative path is
  silently ignored, an absolute path is read as relative and yields `Can't resolve './Users/...'`.
  Scoped to this app: tsc and vitest still resolve core's source through its unchanged `main`, so no
  public entry point moved and no other package gained a build step. **Open question 2.**
- **The sample button never worked.** A second submit button carrying `name="prompt"` loses to the
  form's own `<textarea name="prompt">` in `FormData.get`, so the sample never arrived. It submits a
  flag now, and the sample text lives server-side — still one code path.
- **The 44px touch target was 37px.** A source span is an *inline* box: line-height does not grow its
  hit rectangle, only padding does, and vertical padding on an inline box bleeds into neighbouring
  lines. Padding now reaches 44px with the line-height opened to match, or adjacent ink-inverted
  highlights would overlap.
- **Port 3000 was held by an unrelated container**, and `reuseExistingServer` accepted it as our app
  — every assertion failed against someone else's HTML with no hint why. The port is `E2E_PORT` now.

Three test defects worth recording, because each looks exactly like a product bug:

- A `::before` background read synchronously after `hover()` samples t=0 of a 140ms transition and
  returns `rgba(0, 0, 0, 0)` — indistinguishable from a rule that never matched. Cost a round of
  debugging; polled now.
- Next injects its own empty `role="alert"` route announcer, so every unscoped alert assertion is a
  strict-mode violation.
- `:focus-visible` only applies after a real keyboard interaction, so programmatic `.focus()` reports
  no ring on an element that visibly has one. The tests reach each control by keyboard — which is how
  the criterion is written anyway.

---

## 5. Decisions taken

- **`uncheckedRuleCount` added to `packages/core`.** The closing line names how many rules nothing
  checks; the detector caps at three and states the remainder inside a sentence. The alternative was a
  regular expression over a message, which would make a headline depend on prose. It shares
  `collectCandidates` with the detector, so the count and the rows can never disagree.
- **Touch default built.** The epic's criteria do not require it but the roadmap's task list for this
  epic does, and it is the substance of decision 3: on a small screen the first blok arrives pinned
  with one line saying what that means. **This is where EPIC-080's cut lands** — that study would have
  measured whether tap-to-pin is discoverable within 30 seconds. Taken on the prototypes' authority,
  to be read against the funnel in EPIC-084.
- **`Summary.source` shown as plain words** — "summarised by rule" / "summarised by model". No badge,
  no icon, no colour (decision 6). This is EPIC-080's *other* orphaned question answered.
- **`scrollIntoView({ block: … })` exempted from the ADR-003 grep**, on the same terms the script
  already grants `<label>` and `aria-label`: a platform API name we cannot rename. Both exemptions
  require the API on the same line *and* every match on that line to be the one word, because "blok"
  and "block" one letter apart is the defect ADR-003 exists to prevent. Verified it still catches a
  plain "a block of text". **Open question 3.**
- **Screenshots are report evidence, not visual-regression baselines.** EPIC-003's baselines were
  generated in a Linux container to match CI; this machine is macOS, so baselines added here would be
  images CI could never reproduce.

---

## 6. Acceptance criteria

- [x] **`/decompile` renders server-side for a pasted prompt with no account.** Test:
      `renders a pasted prompt as bloks with no account`.
- [x] **Hover, focus and tap each highlight every range, with a leading marker at each; pinning
      survives pointer-away; Escape and a second tap unpin.** Four tests:
      `hovering a blok card highlights every one of its ranges, each with a leading marker`,
      `focusing a blok card highlights its ranges`,
      `a tap pins, the pin survives the pointer moving away, and a second tap unpins`,
      `Enter pins from the source side and Escape unpins`.
- [x] **Hovering a highlighted range surfaces its owning blok.** Test:
      `hovering a highlighted range surfaces its owning blok`.
- [x] **Offsets map correctly for CRLF, tabs, emoji with combining characters and RTL; the highlighted
      characters are exactly the range.** Four fixtures, four browser tests
      (`highlights exactly the range for …`), plus `lib/decompile/view-model.test.ts`'s 17 tests
      including reconstruction over 500 generated inputs. See §1 for the two normalisations involved.
- [x] **The findings panel places `rule_without_check` in its own closing section with a count line;
      the other five appear above in `detect()` order.** Test:
      `puts rule_without_check in its own closing section with a count line` — which also asserts every
      other finding is above it in the DOM. Screenshot `04-findings-closing-section.png`.
- [x] **A `repeated` finding across two kinds shows both kinds.** Test:
      `a repeated finding across two kinds shows both kinds`. Screenshot
      `05-repeated-shows-both-kinds.png`.
- [x] **Each blok card states whether its summary came from a rule or a model, as plain text.** Test:
      `states where each summary came from, in plain words`. Screenshot
      `06-blok-card-summary-source.png`.
- [x] **Input over 100 KB refused server-side with a message naming the limit; empty and
      whitespace-only show the empty state.** Three tests:
      `refuses input over the limit, naming it`, `shows the empty state for empty input`,
      `shows the empty state for whitespace-only input`. Screenshots `01-empty-state.png`,
      `08-over-the-limit.png`.
- [x] **Axe clean in both themes; highlight changes announced.** Three axe tests (light, dark, empty
      state), all `[]`. ARIA test: `a highlight change is announced to assistive technology`.
- [x] **Full keyboard operation with a visible focus ring; touch targets ≥44px at the small
      breakpoint; reduced motion shows end states.** Three tests:
      `every interactive element has a visible focus ring when reached by keyboard`,
      `touch targets clear 44px at the small breakpoint`,
      `reduced motion shows the end state rather than skipping it` — the last asserting both that the
      transition is 0s *and* that the ink inversion and full-height marker are present.
- [x] **Grep proves green, red and amber are unused on this route.**
      `lib/decompile/route-guards.test.ts` greps the tokens and recipe classes in the route's source
      and in `decompile.css`; the e2e test `uses no pass, fail or drift colour anywhere on the route`
      reads the *computed* colours, catching what a grep cannot.
- [x] **No segmentation, clustering or detection code in `apps/web`; dependency-cruiser confirms the
      import direction.** Rule name: **`web-uses-core-through-its-public-surface`**. Verified it
      bites — a deep import of `@41prompts/core/src/cluster/similarity.js` fails with the rule named,
      and the tree is clean once removed (197 modules, 343 dependencies). Plus 21 guard tests.
- [x] **Corpus extended with two multimodal and two expectation prompts; classifier accuracy re-run
      and reported.** §2. **96.7% of 60 → 96.7% of 92.**
- [x] **Forbidden-word grep passes over every string on the route.** `pnpm forbidden-words` clean; see
      §5 on the `scrollIntoView` exemption.
- [x] **`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e`, `pnpm compliance`, `pnpm binary-files`
      clean.** REUSE compliant; no dependency violations; turbo boundaries clean; 323 tracked source
      files checked, none binary; licence gate clean; mirror dry-run installs and tests the public-only
      tree. Performance with the larger corpus: `detect` 100 KB **22.1 ms warm**, whole pipeline
      **34.6 ms**, growth exponent **1.37** against a gate of 1.6.
- [x] **Deployed to staging and driven by hand; URL and screenshot in the report.** §8.
      <https://staging.41prompts.ai/decompile>, driven twice — once on the merge commit and again
      after the panel-fill fix. Zero range mismatches both times.
- [x] **Report and session log written; backlog updated.**

---

## 7. Open questions for the advisor

1. **All three classifier misses are now one shape.** A numbered list item whose verb the
   `constraint-output-verb` anchor cannot see, because `^` matches before the list marker. Three of
   three is a pattern rather than a coincidence, and the fix is one anchor in `heuristics.json` — but
   it moves clustering snapshots across the package and belongs to EPIC-011a, not here. Worth a
   fix-up epic before EPIC-020 depends on the classifier further?

2. **`apps/web` consumes `packages/core` as built output, through a Turbopack alias.** Scoped to this
   app, so nothing else changed — but it means the served app depends on `dist` being current
   (`predev` and turbo's `^build` enforce that) while tests and typecheck read the source. Two
   resolutions of the same package in one repo is a seam worth a decision: leave it, or have EPIC-052
   settle core's entry points properly when it prepares the package for publication?

3. **`scrollIntoView({ block: … })` is exempted from the ADR-003 grep.** Same category as `<label>`,
   and deliberately narrow — but it is the first exemption added since the script was written, and the
   principle ("platform API names we cannot rename") will admit more. Confirm the principle, or
   require the code to avoid such APIs entirely?

4. **The decompiler prototype has "Dim the rest" and "Edit source" toggles.** Neither is in this
   epic's Scope or criteria, and neither was built. "Dim the rest" appears in the backlog line for this
   epic ("markers, dim"). Deferred deliberately rather than forgotten — EPIC-013's own criteria are the
   contract, and adding an unrequested toggle to the first page a stranger sees is not a decision to
   take silently. Add it, or drop it from the backlog line?

---

## 8. Staging

**<https://staging.41prompts.ai/decompile>** — deployed automatically from `main`, driven by hand,
twice: once on the merge commit `a8965c7` and again on `a2c2d5a` after the panel-fill fix below.

```
healthz: {"ok":true,"commit":"a2c2d5aa1c62662bc87af0764f96f3b62d111d89","env":"staging"}
empty state visible: true
spans=8 bloks=8 findings=6
closing line: "4 rules here have no check."
pinned spans after clicking the JSON card: 1
range mismatches: 0
phone: hint visible: true  auto-pinned spans: 1
STAGING OK
```

Screenshots: `09-staging-result.png` (desktop, a blok pinned) and `10-staging-phone.png` (390px, the
first blok pinned with the touch hint).

**The line that matters is `range mismatches: 0`.** It re-checks, against a deployed build rather
than a dev server, that every highlighted span's `textContent` equals its own source slice — so the
whole path holds end to end: the browser normalising the textarea to CRLF on submit, the server
segmenting what it actually received, and the HTML parser stripping carriage returns on the way back
out. That is the failure this epic was most likely to ship, and it is verified on the real thing.

### One defect the staging capture found

The first staging screenshot showed **a band of panel background below the shorter column's sunken
surface**. The height cap was on the scrolling surface inside each panel, where it fought `flex: 1`,
so whichever column was shorter stopped at 640px instead of filling. Fixed in `a2c2d5a`: the cap moved
to the panel, the surfaces got `flex: 1; min-height: 0`, and below 1020px the panel cap is removed so
the stacked page scrolls rather than each panel scrolling inside itself.

Caught by *looking at the capture*, not by any test — worth recording, because it says the screenshots
are a review surface and not only evidence. No test would have caught it: every assertion in the suite
was about behaviour, and this was a panel that worked correctly and looked unfinished.

---

## 9. Verify

```
pnpm test && pnpm typecheck && pnpm lint && pnpm compliance
E2E_PORT=3100 npx playwright test apps/web/e2e/decompile.spec.ts
curl -s https://staging.41prompts.ai/decompile | head
```

Expected: 370 core tests, 38 web, 67 ui; 28 Playwright tests pass; the audit prints
`20 finding(s) across 29 fixtures` and `rule_without_check: 16 finding(s) across 11 of 29`; the
classifier prints `labelled-table accuracy 96.7% (3 miss(es) of 92)`.

`E2E_PORT` only matters where 3000 is occupied; `pnpm e2e` uses 3000 as before. Note that
`apps/worker`'s `purge-deleted-users` test and `apps/web`'s `auth.rate-limit` test need `DATABASE_URL`
and fail locally without Postgres — pre-existing on `main`, unrelated to this branch, and green in CI.

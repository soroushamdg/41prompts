# EPIC-013 session log

**Date.** 2026-09-10.

**Prompt sent.** Rulings on EPIC-012b's four open questions first: `rule_without_check` closes the
findings panel as the call to action (written into EPIC-013's decision 5); the `contradiction`
silencing rule stays one kind wider than the epic asked, with the reason recorded in the report; six
check phrases stay and `CLAUDE.md`'s vocabulary section is corrected, in the EPIC-013 branch;
extracting the quoted object of a "must contain" rule is parked for EPIC-030.

Then EPIC-013 with the same autonomy: commit the advisor's epic file as-is, mirror it into
`CURRENT.md`, mark it current, plan into `docs/epics/plan-EPIC-013.md`, implement, self-review, push,
PR, squash-merge on green. Two warnings: *"offset-to-DOM mapping is where it will actually go wrong,
so build the four text fixtures before the highlighting; and take the prototype's interaction, not its
algorithms."* Two debts carried in: EPIC-011a's missing multimodal and expectation fixtures, and
EPIC-012a's cross-kind `repeated` presentation. Finish with the report, session log, backlog status,
a staging deployment with a screenshot, and `CURRENT.md` pointing at EPIC-013.

**Plan summary.** `docs/epics/plan-EPIC-013.md`, written after measuring what a browser does to
server-rendered text rather than after reading about it. The measurement changed the design before any
of it was written: **carriage returns do not survive server rendering**. React writes a raw `\r` into
the HTML and the parser's input-stream preprocessing eats it, so `"One.\r\nTwo.\r\n"` is 12 characters
in the source and 10 in the DOM, while tabs, emoji with ZWJ sequences, RTL, BOM and lone surrogates
all pass through intact. Left alone that breaks hydration on every Windows-pasted prompt. So: offsets
stay in source space, the DOM carries display text, one tested function between them, and the input
itself stays verbatim.

**Decisions made and why.**

- **The steer was right twice over.** Building the four fixtures first found the CR problem before any
  highlighting existed; the e2e suite then found a *second* character-eater — the HTML form-submission
  algorithm normalises a textarea to CRLF, so a prompt pasted with `\n` reaches the server as `\r\n`.
  Three of four shapes failed by exactly two characters and CRLF passed, because CRLF was already what
  the server saw. That also tells EPIC-014 what it will be capturing.
- **Four departures from the prototype**, all corrections: one tab stop per blok rather than per span
  (`docs/design/README.md`); the fragment badge as generated content rather than a DOM child, or
  `textContent` would be the range plus `"1/3"`; no colour on severity; and no per-kind colour, since
  the prototype's scale reuses `--pass`/`--warn` verbatim and EPIC-003's deviation on that is recorded
  as accepted.
- **`uncheckedRuleCount` added to core** rather than parsing a number out of a message. The panel's
  closing line and the rows beneath it now come from one candidate set.
- **The touch default was built although the epic's criteria do not require it** — the roadmap's task
  list for this epic does, and it is the substance of decision 3. It is also where EPIC-080's cut
  lands: that study would have measured whether tap-to-pin is discoverable, and this is the answer
  taken on the prototypes' authority instead.
- **`apps/web` reads core's built output through one Turbopack alias**, scoped to this app, rather
  than repointing core's `main` at `dist` (a public entry point, EPIC-052's job) or dropping core's
  `.js` extensions (which exist so Node consumers can import it). Flagged as open question 2.
- **Reports are historical records and were left alone.** EPIC-012b's report still says "13 findings
  across 9 of the 25 fixtures"; that was true when it was written. Live code and docs describing the
  *current* corpus were updated to 29.

**What took longer than expected / went wrong and was caught.**

- **Ten of twenty-six e2e tests failed on the first run**, and unpicking them was the bulk of the
  session. Three were real product bugs: the sample button never worked (a second submit button with
  `name="prompt"` loses to the form's own textarea in `FormData.get`); the 44px touch target was 37px
  (a source span is an inline box, so only padding grows its hit rectangle, and vertical padding on
  an inline box bleeds into neighbouring lines); and the CRLF-on-submit finding above.
- **Three of the failures looked exactly like product bugs and were not.** A `::before` background
  read straight after `hover()` samples t=0 of a 140ms transition and returns `rgba(0, 0, 0, 0)` —
  identical to a rule that never matched, and I spent a round of debugging on the CSS before probing
  the browser and finding the rule was fine. Next injects its own empty `role="alert"` route
  announcer. And `:focus-visible` only applies after a real keyboard interaction, so programmatic
  `.focus()` reports no ring on an element that visibly has one.
- **The route was a 500 the first time it was loaded**, because a `"use server"` file may export only
  async functions — the cap, the state type and the copy exported from `actions.ts` broke the module
  at request time rather than at typecheck. `apps/web/AGENTS.md` says to read the bundled Next docs
  before writing code; I read the forms guide and still missed this, which is an argument for loading
  the page early rather than for reading more.
- **Turbopack cost more than everything else combined.** `transpilePackages` (core was already
  listed), `experimental.extensionAlias`, aliasing to source, and three different spellings of the
  alias path — the working form is relative to the app directory, not to `turbopack.root`, and the
  two wrong forms fail differently (one silently ignored, one read as a relative path producing
  `Can't resolve './Users/...'`).
- **Port 3000 was held by an unrelated Docker container**, and `reuseExistingServer` accepted it as
  our app. Every assertion failed against someone else's HTML with no hint why. The port is
  `E2E_PORT` now, with the reason written above it.
- **The first screenshot showed a band of panel background** below the shorter column's sunken
  surface. Caught by looking at the capture rather than by any test — worth remembering that the
  screenshots are evidence *and* a review surface.

**Verification tail.**

```
packages/core   Tests  370 passed (370)
apps/web        Tests   38 passed (38)
packages/ui     Tests   67 passed (67)
playwright      28 passed (21.8s)

labelled-table accuracy 96.7% (3 miss(es) of 92)
false-positive audit: 20 finding(s) across 29 fixtures
rule_without_check: 16 finding(s) across 11 of 29 fixtures

detect 100 KB (244 bloks): 89.5 ms cold, 22.1 ms warm
segment + cluster + detect, 100 KB: 34.6 ms warm
detect growth exponent 1.37 (29.1 ms -> 193.5 ms for 4x input)

Congratulations! Your project is compliant with version 3.3 of the REUSE Specification :-)
✔ no dependency violations found (197 modules, 343 dependencies cruised)
Checked 329 files in 8 packages, no issues found
Forbidden-word grep clean (packages/ui/src, apps/web/app, apps/web/lib).
No tracked source file under packages, apps is binary (323 checked).
[mirror-dry-run] OK -- the public-only tree installs and tests standalone
```

**Open questions.** Four, at the end of `docs/epics/reports/EPIC-013-report.md`: all three classifier
misses are now one shape and the fix belongs to EPIC-011a; `apps/web` resolving core's `dist` while
tests resolve its source is a seam EPIC-052 may want to settle; the `scrollIntoView` exemption is the
first added to the ADR-003 grep and the principle will admit more; and the prototype's "Dim the rest"
toggle is in this epic's backlog line but not its criteria, so it was deliberately not built.

**Staging.** <https://staging.41prompts.ai/decompile>, driven by hand twice — on the merge commit and
again after the panel-fill fix. `range mismatches: 0` both times, which re-checks the whole
character-mapping path against a deployed build rather than a dev server. The first capture found the
one defect no test could: a panel that worked correctly and looked unfinished, because its height cap
fought `flex: 1`. Screenshots are a review surface, not only evidence.

**After staging, a second round.** Soroush drove `/decompile` on staging and the bloks read as an
undifferentiated list. Grouping by kind, a per-kind shape marker and a view control followed; report
§9 and §10. Two things are worth carrying: the prototype's per-card marker **cannot be ported at all**
(its bar works only because it is coloured per kind, and an ink bar is invisible against the card's
own ink border), and driving the deployed thing found two defects the suite structurally could not —
a marker that was present, correct and invisible, and a heading whose `textContent` read "context3
bloks" while its accessible name was fine.

**A CI note for whoever reads a red build next.** Two failures this session, and they were not the
same kind of thing. `segment.perf.test.ts` flaked — a timing-ratio gate measuring 1.74 against a 1.6
bar, in a file the change could not reach, and 1.10 locally; that test's own comment already recorded
one prior flake, so this is the second. The other was mine: I deleted the CSS an assertion depended on
and re-ran the capture spec rather than the behavioural one. Worth telling apart, because treating the
second as a flake is how a suite stops meaning anything.

**For the next session.** Stage 1's remaining epics are EPIC-017 (legal minimum, which must land
before `/decompile` reaches production traffic), EPIC-014 (capture, purge, rate limits, abuse checks —
and it now knows it will be storing CRLF), EPIC-016 (landing page) and EPIC-015 (soft ship). Nothing
in this epic pre-built any of them. M1's kill criterion — 300 unique decompiles in 30 days — starts
counting from EPIC-015, and EPIC-084 reads it.

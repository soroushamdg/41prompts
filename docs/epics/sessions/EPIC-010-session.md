# EPIC-010 session log

**Date.** 2026-09-09.

**Prompt sent.** Stage 1 starts out of backlog order. EPIC-080 (prototype study) and EPIC-005
(interviews) are deferred, not cancelled; their findings arrive mid-stage and will change
EPIC-011a, EPIC-011b and EPIC-013. EPIC-010 is interview-proof, so it goes first. Same autonomy as
EPIC-007: commit the advisor's `docs/epics/EPIC-010-segmenter.md` as-is, mirror it into
`CURRENT.md`, mark EPIC-010 current and EPIC-080 deferred in `docs/backlog.md`, plan into
`docs/epics/plan-EPIC-010.md`, implement, self-review, push, PR, squash-merge once CI is green.
Read `docs/design/41prompts-decompiler.html` first — its JavaScript is the reference
implementation and its sample prompt becomes a fixture with a known segment count. Write the
reconstruction property test before writing any rule. Finish with report, session log, backlog
status, and `CURRENT.md` left pointing at EPIC-010 until the advisor writes the next epic.

**Plan summary.** `docs/epics/plan-EPIC-010.md`, written after reading the epic, `PROCESS.md`,
`CLAUDE.md`, the decompiler prototype, `.dependency-cruiser.cjs`, `REUSE.toml` and
`scripts/forbidden-words.mjs`. It reads the prototype's twelve lines of `segment()` as what they
are — a real spec for three rules, with three defects the epic's decisions independently forbid —
and fixes the six deviations up front rather than discovering them mid-implementation. Six passes,
one per rule group; the property test written first, against an invariant a stub cannot satisfy.

**Decisions made and why.**

- **The property test asserts "gaps are whitespace only", not just reconstruction.** Reconstruction
  alone is satisfied by `return []`. The stronger invariant — every non-whitespace code unit
  belongs to exactly one segment — is what makes "nothing is dropped" checkable. Verified by
  writing the test first and running it against a `return []` stub, which it rejected on 19 of the
  25 named edge cases; the six that passed were the inputs that are whitespace all the way
  through. Only then were the rules written.
- **Offsets carried by index through every pass.** The prototype's `text.indexOf(str, cursor)` is
  correct until a prompt repeats itself, which prompts do constantly — that is the entire premise
  of a blok owning a set of ranges.
- **A real line scanner over `\n`, `\r\n` and lone `\r`.** The prototype's `split(/\n{2,}/)` cannot
  see a CRLF paragraph break at all. This was not a theoretical worry: it makes every prompt
  pasted from a Windows editor a single paragraph.
- **Tag matching by one stack pass, not a forward scan per opener.** The obvious implementation is
  O(n²) on a prompt full of unclosed tags, which is a plausible paste and an easy way to hang
  EPIC-013's browser tab. Covered by an adversarial test and by a growth test that would catch
  quadratic behaviour a fixed-size timing test would not.
- **The corpus is TypeScript modules, not `.txt` files.** `packages/core` does no IO, so a shared
  loader would break `core-is-pure`; the invisible cases survive an editor as escapes but not as
  bytes; and a module carries its own SPDX header, where 25 text files would need 25 `.license`
  sidecars or an edit to `REUSE.toml`, which `CLAUDE.md` puts out of bounds. Each prompt is built
  line by line, because the line structure is the fixture.
- **Exactly 25 fixtures.** Four candidates that were rule probes rather than real prompts moved to
  `segment.test.ts`, which is where edge assertions belong.
- **`blocks.ts` shipped as `units.ts`, `scanTagBlocks` as `scanTagRegions`.** ADR-003 keeps "block"
  out of code identifiers, and this is the module where confusing a fenced code block with a
  *blok* would do the most damage. The markdown terms stay in prose, as `forbidden-words.mjs`
  already assumes by stripping comments first. `docs/epics/plan-EPIC-010.md` still says
  `blocks.ts`; it is a record of the plan, so it carries a one-line note rather than a rewrite.
- **Decision 7 implemented as an enumerated regex list plus a nested-quantifier detector**, so a
  new regex in the module fails the suite until someone adds it and justifies it. The detector is
  itself tested against patterns that should trip it.

**What took longer than expected / went wrong and was caught.**

- **The rule-order experiment failed the first way it was tried, and that was the most useful
  thing in the session.** Moving rule 3 above rule 1 changed nothing — not one snapshot — because
  rules 1–4 run as one top-down walk, so order only decides which rule claims a line when two of
  them *could*; containment is decided by whichever block starts first. A second experiment
  (inserting a CommonMark indented-code rule between rules 2 and 3) changed exactly one snapshot,
  `tab-indented`, by tearing every tab-nested sub-bullet away from its parent. Both are in the
  README now, the first as a warning and the second as the worked example the criterion asks for.
- **A "clever" improvement to rule 6 was wrong and the corpus said so immediately.** Extending the
  sentence terminator through closing quotes helps `He said "stop." Then left.` and cuts
  `If the author wrote "this is temporary." in a comment, ask when it comes out.` in half. It was
  visible in the `long-paragraph-sentences` snapshot the first time it was generated, and reverting
  to the prototype's exact boundary both fixed it and removed a deviation.
- **Self-review found three real defects, one of them serious.** The module had two definitions of
  whitespace: the structural rules skipped only ASCII space and tab as indentation while everything
  else used the full ECMAScript set. A byte-order mark — which lives exactly at the front of a
  prompt — stopped a fence *opener* being recognised while the closer still was, so the closer was
  read as a new unterminated opener and swallowed the rest of the prompt into one segment. 150
  passing tests did not catch it because the BOM fixture put the BOM in front of prose. Also: a tag
  pair opening and closing mid-line made its whole line atomic, cutting a wrapped sentence at the
  line break. Both fixed with regression tests, and the BOM fixture now puts the BOM directly
  against a heading, a list and a fence.
- **The first CI run failed, and it was a real finding rather than a flake.** Four of the twenty
  adversarial cases took 130–180 ms on `ubuntu-latest` against the 100 ms bar, having taken 20–37
  ms here — the runner is five to nine times slower, and the sizes had been picked on a laptop.
  Every adversarial input now sits inside one 256 KB budget, and a new test prints the three
  slowest cases with their headroom on every run so the next size change is not guesswork. The
  epic's 100 ms bar was not moved: what these tests measure is whether a hostile *shape* blows up,
  which is exponential and just as visible at a quarter of the size, while growth is the linearity
  test's job (a ratio, immune to runner speed) and throughput is the 1 MB test's, which passed.
- **The cold-start ceiling then passed CI by 1.5%** — 492.6 ms against a 500 ms limit picked off
  a laptop. Its only job is to notice a hang, and a hang is orders of magnitude, so it is 2,000 ms
  now. Chasing the warm number instead, I profiled the 1 MB path and removed the intermediate
  range layer between the paragraph rules and the emitter, then reverted it: it changed nothing
  measurable. At 1 MB the segmenter produces 11,506 segments and `Segment.text` is the verbatim
  slice, so the time is 11,506 `String.slice` calls, not an inefficiency. Shipping a refactor
  whose justifying comment I had just measured to be false was the wrong trade.
- **Two green CI runs disagreed with each other by a factor of two** on the same 1 MB input — 169
  ms warm on one runner, 85 ms on the next. That is the number that matters for every timing gate
  here: headroom thinner than the variance between runners is a coin toss. The adversarial budget
  came down again, to 128 KB, which buys 30× headroom locally and costs the suite nothing it was
  measuring.
- **The growth test now reports an exponent, not a ratio.** "Under 8×" means nothing on its own
  and changes meaning if the 4× ever becomes 3×. 1.0 is linear, 2.0 is quadratic, the forward-scan
  implementation this replaced would sit at 2.0, and it measures 1.19 here and 1.32 on CI.
- **Two timing tests were measuring the machine, not the code.** The 1 MB test read 166 ms on a
  loaded box and 17 ms warm — the first call in a process is paying for V8 compiling the hot
  loops. And one adversarial case failed once under `pnpm test`'s eight parallel suites at just
  over 100 ms having passed at a tenth of that moments earlier. Fixed by reporting cold and warm
  separately, asserting the epic's bar on the warm number with a ceiling on the cold one, and
  making every timing assertion the fastest of three runs. Skipping the per-line slice for lines
  with no `<` cut the cold number from 166 ms to about 97 ms as a side effect.
- **One REUSE false positive**, the same class EPIC-007's report describes: the snapshot renderer
  contains the literal SPDX header it writes into every snapshot file, which `reuse lint` read as
  a second, malformed licence declaration. Wrapped in `REUSE-IgnoreStart`/`REUSE-IgnoreEnd`, the
  tool's own mechanism, rather than excluded from analysis.

**Verification output (tail).**

```
 ✓ src/segment/segment.test.ts (59 tests)
 ✓ src/segment/segment.fixtures.test.ts (29 tests)
 ✓ src/segment/segment.property.test.ts (28 tests)
 ✓ src/segment/segment.perf.test.ts (28 tests)
 Test Files  6 passed (6)
      Tests  151 passed (151)

1 MB (1048576 code units): 59.8 ms cold, 16.2 ms warm
adversarial:    3.3 ms  (30.0x headroom)  1,250 deeply indented list items
adversarial:    3.0 ms  (33.9x headroom)  6,000 unmatched tag openers
adversarial:    2.9 ms  (35.0x headroom)  10,000 list markers
growth exponent 1.17 (3.9 ms -> 19.5 ms for 4x input; 1.0 linear, 2.0 quadratic)

and the same three lines from the CI runner, which is what the 1 MB criterion asks for:

1 MB (1048576 code units): 492.6 ms cold, 168.7 ms warm   (runner 1)
1 MB (1048576 code units): 335.6 ms cold,  85.0 ms warm   (runner 2, same commit range)
1 MB (1048576 code units): 292.4 ms cold,  71.1 ms warm   (runner 3)
adversarial:   11.1 ms  (9.0x headroom)  6,000 unmatched tag openers
growth exponent 1.32 / 1.11 / 1.07

✔ no dependency violations found (33 modules, 50 dependencies cruised)
Checked 140 files in 8 packages, no issues found
Forbidden-word grep clean (packages/ui/src, apps/web/app, apps/web/lib).
* Files with copyright information: 305 / 305
* Files with license information: 305 / 305
Congratulations! Your project is compliant with version 3.3 of the REUSE Specification :-)
[mirror-dry-run] OK -- the public-only tree installs and tests standalone
```

**Open questions for the advisor.** Five, all in the report: whether the corpus should be exported
from the public package entry point; whether `LIST_MIN_ITEMS` belongs in the public surface
alongside `SENTENCE_SPLIT_THRESHOLD`; whether any of the documented non-goals (setext headings,
abbreviation-aware splitting, blockquotes, tables, indented code) needs to become a rule; and
whether the 1 MB throughput bar, which clears by only 1.2× on CI for reasons that are contract
rather than inefficiency, should be relaxed or re-sized; and whether a list's lead-in line
("Rules:") should be its own blok — a product question EPIC-080 would have answered.

**Context for the next session.** `segment()` and its offsets are a public contract now. EPIC-011a
should classify and cluster the `Segment`s this produces and read its fixtures from
`SEGMENT_FIXTURES` rather than copying prompt text; `checkSegmentInvariants()` is exported so any
epic that slices, merges or re-anchors ranges can check itself against the same five promises.
`docs/epics/CURRENT.md` still mirrors EPIC-010 and the backlog has it `done`, awaiting the
advisor's next epic.

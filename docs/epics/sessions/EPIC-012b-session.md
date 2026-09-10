# EPIC-012b session log

**Date.** 2026-09-10.

**Prompt sent.** Two pieces of work in one turn, with the same autonomy as EPIC-012a.

First, a decision to record: *"EPIC-005 (customer interviews) and EPIC-080 (prototype study) are cut,
not deferred. The prototypes in `docs/design/` and `docs/roadmap.md` are the spec from here. Mark both
`cut` in `docs/backlog.md` with that reason, and note in `docs/roadmap.md` that the kill criteria per
milestone are now the only feedback mechanism before Stage 2. Also commit the two survey responses:
`docs/research/discovery/survey/` with the raw CSV and a `SUMMARY.md` marked n=2, not actionable."*

Then EPIC-012b: commit the advisor's epic file as-is, mirror it into `CURRENT.md`, mark it current,
plan into `docs/epics/plan-EPIC-012b.md`, implement, self-review, push, PR, squash-merge on green.
With one steer: *"This finding's message and suggestion are the highest-stakes copy in Stage 1; put
the alternatives you rejected in the report."* And a closing instruction: finish with the report, the
session log, the backlog status and `CURRENT.md` left pointing at EPIC-012b.

**One question asked before starting.** The survey responses were nowhere — not in the repo, not in
git history, not in `~/Downloads`, and `docs/research/discovery/` held only `README.md` and
`TEMPLATE.md`. Asked rather than invented; Soroush pasted the raw Typeform export and it was committed
verbatim. Fabricating two rows of research data would have been the single worst thing I could have
done this session, and it would have been undetectable a month later.

**Plan summary.** `docs/epics/plan-EPIC-012b.md`, written after building a throwaway prototype of the
detector and running it over all 25 corpus fixtures. It returned the fact the whole epic turns on:
**not one of the 25 prompts contains a single `expected` blok**. So "no check covers this rule" is
always true on a real prompt, and the design question is not which rules lack checks — all of them do
— but which rules are worth naming. Fire only where the check can be named; one finding per blok;
sentence-level ranges; no overlap at all with `untestable`.

**Decisions made and why.**

- **`rule-shapes.json` does three jobs**: it is the test for "verifiable", the source of the severity,
  and the text of the suggestion. That makes decision 6's requirement structural — the detector
  *cannot* fire without being able to name the check to add.
- **`contradiction` silences it too**, one kind wider than decision 3 asked. Without it a two-rule
  contradiction produced three findings, two of them advice the reader cannot act on until they have
  resolved the first. `padding`, `too_long` and `repeated` deliberately do not silence it. Flagged as
  open question 1.
- **Six check phrases where `CLAUDE.md` lists four.** A prohibition has no honest home among the four,
  so the set is ADR-003's — "character limit" and "must not contain" added. Flagged as open question 2.
- **Coverage drops `MAX_VOCABULARY_RATIO`** while reusing everything else from clustering. That guard
  stops over-merging; here the failures point the other way, and telling somebody who wrote a check
  that they did not is the false positive that matters.
- **The quiet set's invariant was restructured rather than its fixtures edited.** `QUIET_FIXTURES`
  still assert zero *defect* findings at full strength; `rule_without_check` is the first kind in this
  package that is not a defect report, and one quiet fixture legitimately carries an unchecked rule.
  Naming that fixture in a test keeps a second one a failure rather than a shrug. Rewording the fixture
  to dodge the finding would have been tuning the test to the answer.
- **Two extractions committed before the detector** — `topicOf` and `untestablePhraseIn` — so the diff
  that adds the detector is only the detector, and so mutual exclusion is one list read through one
  matcher rather than a convention two files agree to keep.
- **The cut's loose ends were written down rather than left.** Cutting a Stage 0 epic that four later
  epics named meant Stage 0's exit state could never have been met, and two `Depends` columns pointed
  at `cut` epics. Both fixed, and each cut epic's roadmap section now lists the debts it leaves and who
  carries them — including one, EPIC-080's "does a summary need an unverified cue", that now has **no
  owner** unless EPIC-013 takes it.

**What took longer than expected / went wrong and was caught.**

- **A defect no test could have found.** A blok whose *first* matching sentence was silenced fired
  anyway, from a later range, because the guard recorded the silencing by clearing `best` and on the
  first sentence there was no `best` to clear yet. Found by reading the diff. **No snapshot moved when
  it was fixed**, which is the tell: the suite was green before and after. Built the input that
  reaches it, then reverted the fix to confirm the new test actually fails on the old code. Three
  epics in a row now where the thing worth reporting was found by reading rather than by running.
- **The remainder count landed where it would make the reader count wrong.** "2 more rules here have no
  check either" printed immediately above two more rules with no check — because ranked by
  checkability, the last of the three is often the first on screen once `detect()` sorts the panel.
  The test asserted the count existed; it took reading the committed snapshot to see it was in the
  wrong place. The detector now recomputes `detect()`'s display order to find the true last one.
- **I wrote a fixture into `QUIET_FIXTURES` that could never have passed** — `quiet-untestable-rule`,
  where `untestable` fires by design and that set asserts zero findings. Caught by the fixtures-first
  discipline, before the detector existed, which is the third epic running that sequencing has earned
  its place.
- **The copy took longer than the detector.** Seven message drafts and four suggestion drafts, all in
  the report. The one that nearly shipped and should not have was "…you would find out from a user" —
  true, and one of the two survey respondents said exactly that, but it asserts something about the
  reader's organisation that we do not know. "Nothing fails" is true of every reader.
- **`git add -A` did not bite this time.** EPIC-012a's log records sweeping an untracked epic file into
  an unrelated commit. This session had the same trap set — `docs/epics/EPIC-012b-rules-without-checks.md`
  sitting untracked while a docs branch was being committed — and it was staged by name instead, then
  committed on the epic's own branch where it belonged.

**Verification tail.**

```
Test Files  19 passed (19)
     Tests  358 passed (358)

false-positive audit: 17 finding(s) across 25 fixtures
rule_without_check: 13 finding(s) across 9 of 25 fixtures

detect 100 KB (220 bloks): 179.2 ms cold, 29.9 ms warm
segment + cluster + detect, 100 KB: 43.2 ms warm
detect 1 MB (1502 bloks): 628.4 ms warm (reported, not gated)
detect growth exponent 1.39 (28.3 ms -> 194.4 ms for 4x input)

Congratulations! Your project is compliant with version 3.3 of the REUSE Specification :-)
✔ no dependency violations found (84 modules, 175 dependencies cruised)
Checked 184 files in 8 packages, no issues found
Forbidden-word grep clean (packages/ui/src, apps/web/app, apps/web/lib).
No tracked source file under packages, apps is binary (305 checked).
[mirror-dry-run] OK -- the public-only tree installs and tests standalone
```

**Open questions.** Four, at the end of `docs/epics/reports/EPIC-012b-report.md`: whether
`contradiction` should silence this finding, whether six check phrases is right where `CLAUDE.md`
lists four, whether extracting the quoted object of a "must contain" rule is worth an epic, and — the
one that matters most for the next epic — that **this finding will be present on most real pastes,
often at `high`**, so EPIC-013 has to decide whether it sits among the other findings or closes the
panel as its call to action.

**For the next session.** Stage 1's core work is finished: the segmenter, the classifier, clustering,
the summariser seam and all six detectors are done. EPIC-013 is next and is the first web epic in the
stage; it depends on 003 and 012b, both now done. It inherits two presentation requirements — showing
both kinds on a `repeated` card (EPIC-012a) and deciding where `rule_without_check` sits in the panel
(this epic) — plus one orphan from the EPIC-080 cut: whether a summary needs an "unverified" cue.

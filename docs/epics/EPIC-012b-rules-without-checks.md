# EPIC-012b: Rules without checks
Stage: 1 · Depends on: EPIC-012a · Size: S

## Goal
The sixth finding, and the one that connects the decompiler to the rest of the product: **this prompt states a
rule that nothing verifies**. It is the argument for expected bloks, for checks, and ultimately for the publish
gate ; made concretely, about the user's own prompt, before they have signed up for anything.

## Standing note on research
EPIC-005 and EPIC-080 are cut (2026-09-10, Soroush's decision). The prototypes and this roadmap are the spec.
The substitute for interview evidence is the live funnel and the kill criteria in `docs/roadmap.md`: if the
decompiler does not earn 300 unique uses in its first 30 days, the wedge is wrong and EPIC-015 gets reworked
before Stage 2. Build the phrase lists and thresholds as data files so that evidence, when it arrives, is a data
change.

## Decisions (do not re-litigate)
1. `packages/core`, pure, deterministic, zero dependencies. Same `Finding` shape as EPIC-012a; this adds one kind.
2. `FindingKind` gains exactly one member: `rule_without_check`. That makes six. EPIC-012a's "exactly five" was
   scoped to that epic; this is the planned sixth and the last one in Stage 1.
3. What fires: a blok classified `constraint` (or a range within one) that states a verifiable requirement, where
   no `expected` blok in the same prompt covers it. "Verifiable" is the key word ; a rule that `untestable`
   already flagged must **not** also fire here. The two findings are mutually exclusive by construction, and a
   test proves no input produces both for the same range.
4. Coverage is matched by **shared topic key or normalised-token overlap**, reusing EPIC-011a's machinery. No new
   similarity measure.
5. Severity: `medium` by default. `high` only when the constraint names a machine-checkable shape ; JSON, a
   field name, an allowed value, a length limit ; because those are the ones a check could catch today.
6. The `suggestion` is the product pitch, written plainly: name the check that would cover it, in the plain
   phrasing from `CLAUDE.md`'s vocabulary section ("valid JSON shape", "one of the allowed values", "word limit",
   "must contain"). Never "consider adding a check".
7. Silence over noise, harder here than anywhere: a prompt with twenty rules and no expected bloks must not
   produce twenty findings. Cap the number reported, rank by severity then by how machine-checkable the rule is,
   and say in the message how many more were not listed. The cap is an exported constant.
8. A prompt with no `expected` bloks at all is the common case, not an error. The message must read as useful
   information, not as an accusation.

## Scope
- `packages/core/src/detect/rule-without-check.ts`, its phrase and shape lists as data files, the cap constant.
- The mutual-exclusion test against `untestable`.
- Fixtures: a prompt with rules and no checks; a prompt where an expected blok does cover the rule (must not
  fire); a prompt with twenty uncovered rules (cap behaviour); a prompt with an untestable rule (must fire
  `untestable` only).
- False-positive audit extended to all 25 EPIC-010 fixtures, reported the same way as EPIC-012a.
- A `docs/epics/reports/` note on how many of the 25 fixtures produce this finding, since that number is a proxy
  for how often the pitch will land.

## Out of scope
- Creating the check. (EPIC-030 builds checks from expected bloks; EPIC-032 creates one from a failure.)
- Any UI. (EPIC-013.)
- A seventh finding kind.

## Acceptance criteria
- [ ] `rule_without_check` added to `FindingKind`; `detect()` signature unchanged; zero new dependencies.
- [ ] Fires on a constraint with no covering expected blok; does not fire when one covers it. Evidence: two
      fixtures and snapshots.
- [ ] Mutual exclusion with `untestable` proven: no input produces both for the same range, checked over all
      fixtures and 1,000 generated inputs. Evidence: test name.
- [ ] The cap works: twenty uncovered rules produce at most the cap, ranked, with the remainder counted in the
      message. Evidence: fixture and snapshot.
- [ ] `high` severity only for machine-checkable shapes; a test asserts the mapping. Evidence: test name.
- [ ] Every suggestion uses the plain check phrasing from the vocabulary section; forbidden-word grep passes.
      Evidence: the compliance job.
- [ ] Determinism: 100 runs, byte-identical findings. Evidence: test name.
- [ ] False-positive audit over the 25 fixtures, each fired finding judged in the report, plus the count of
      fixtures that produce this finding at all. Evidence: report table.
- [ ] The 100 KB performance gate still passes with six detectors. Evidence: timing.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance`, `pnpm binary-files` clean.
- [ ] Report and session log written; backlog updated.

## Notes for the implementer
- Write the "must not fire" fixtures first. Third epic running; it has caught a real defect every time.
- The message and suggestion here are the highest-stakes copy in Stage 1: this is the finding that makes someone
  want the rest of the product. Write it for a senior engineer who is busy and slightly sceptical, and put the
  alternatives you rejected in the report.
- If mutual exclusion with `untestable` cannot be guaranteed deterministically, write
  `docs/epics/BLOCKER-EPIC-012b.md` and stop.

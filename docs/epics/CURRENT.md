# CURRENT

A mirror of `docs/epics/EPIC-012a-detectors.md`, per `docs/PROCESS.md`. EPIC-012a is the current
epic. EPIC-010, EPIC-011a and EPIC-011b are done, and their open questions are ruled — including
EPIC-011b's cache key, which keeps the blok's kind. Two requirements carried forward land in later
epics, not this one: EPIC-020 finishes the compiler tripwire, EPIC-031 supplies the model transport.
EPIC-080 and EPIC-005 remain deferred.

---

# EPIC-012a: Five detectors
Stage: 1 · Depends on: EPIC-011b · Size: M

## Goal
Findings. A pasted prompt comes back with a short list of specific, defensible problems ; each one pointing at the
bloks that caused it. This is the payload of the decompiler and the reason anyone pastes a prompt into 41Prompts
instead of reading it themselves.

## Why this is the epic that sells the product
Segmentation, classification and summaries are plumbing the user never asked for. Findings are the visible value:
*"these two rules contradict each other", "this rule can never be tested", "you said this three times"*. Every
finding must be one the user reads and thinks "that's true, and I hadn't noticed". A finding they disagree with
costs more trust than a finding they never saw.

## Decisions (do not re-litigate)
1. `packages/core`, pure, deterministic, zero dependencies. No model decides whether something is a finding.
2. `detect(bloks: Blok[], source: string): Finding[]` where
   `Finding = { id: string; kind: FindingKind; severity: Severity; message: string; bloks: string[]; ranges: Range[]; suggestion?: string }`.
   `bloks` names every blok involved ; a contradiction has two, a repeat may have three. `ranges` are the exact
   spans the UI highlights.
3. `FindingKind` is exactly five: `repeated | contradiction | untestable | padding | too_long`. Not four, not six.
   Adding a sixth is an epic, not a patch.
4. `Severity` is `high | medium | low`, and it maps to nothing in the colour system except through EPIC-013's
   design decisions. Severity is about how likely the finding is to be real *and* costly, not about how confident
   the detector feels.
5. **False positives are the failure mode that matters.** A detector that fires on a prompt where nothing is wrong
   teaches the user to ignore the panel. When a rule is ambiguous, do not fire. Each detector's tests include a
   "must not fire" set drawn from the EPIC-010 corpus, and the report states the false-positive count on all 25
   fixtures.
6. Detector definitions:
   - **repeated** ; two or more bloks say substantially the same thing. Reuse EPIC-011a's normalised-token overlap
     and threshold rather than inventing a second similarity measure. Fires across bloks; never inside one.
   - **contradiction** ; two bloks give incompatible instructions. Includes the **antonym case carried from
     EPIC-011a**: "keep the summary short" and "keep the summary long" merged into one blok by token overlap must
     still be found and reported. Since clustering can hide a contradiction inside a blok, this detector inspects
     *ranges*, not only blok pairs, and one of its named tests is exactly that shape.
   - **untestable** ; a rule stated so vaguely that no check could ever verify it: "be helpful", "sound natural",
     "use good judgement". Data-driven from a committed phrase list, not a model.
   - **padding** ; text that adds tokens and no instruction: "please", "as an AI language model", pleasantries,
     restated context.
   - **too_long** ; the prompt, or one blok, exceeds a named threshold. The constant is exported and revisitable
     once EPIC-084 has real distribution data.
7. Every finding carries a `message` written for the ICP: specific, quotes or points at the text, never scolding.
   No message may use a forbidden word (ADR-003). Suggestions, where present, are concrete rewrites or "add a
   check for this", never "consider revising".
8. Finding order is deterministic: by severity, then by the `start` of the first range, then by `kind`. Ids are
   content-derived and stable, so a user can share a link to a finding.
9. Findings are advisory here. Nothing blocks, nothing is auto-fixed. Blocking belongs to publishing (rule 9).

## Scope
- `packages/core/src/detect/`: `detect.ts`, one module per detector, `Finding`/`Severity` types, the phrase lists
  and thresholds as committed data files, a `README.md` per detector explaining what it fires on, what it
  deliberately does not, and how to tune it.
- Fixtures: for each detector, a positive fixture, a near-miss fixture that must not fire, and the finding
  snapshot. Plus a whole-prompt fixture producing several findings at once with a committed ordering.
- The decompiler prototype's sample prompt run end to end: segment → cluster → summarise → detect, with the
  resulting findings committed as a snapshot and compared against the prototype's own diagnostics in the report.
- A false-positive audit over all 25 EPIC-010 fixtures, with the count and every fired finding listed in the
  report so a human can judge each one.

## Out of scope
- `rules-without-checks` detector. (EPIC-012b, deliberately separate.)
- Any UI, panel, colour or severity styling. (EPIC-013.)
- Auto-fix, rewriting, or applying a suggestion. (Not in v1.)
- Model-assisted detection of any kind.

## Acceptance criteria
- [ ] `detect()` and the `Finding` type exported from `packages/core`; zero new dependencies. Evidence:
      `package.json` diff.
- [ ] All five detector kinds implemented, each with a positive fixture, a near-miss fixture that does not fire,
      and a committed snapshot. Evidence: ten test names.
- [ ] The antonym case carried from EPIC-011a is a named test: a blok containing both "keep the summary short" and
      "keep the summary long" produces a `contradiction` finding pointing at both ranges. Evidence: test name and
      snapshot.
- [ ] False-positive audit: every finding fired across the 25 EPIC-010 fixtures is listed in the report with a
      one-line judgement of whether it is real. Evidence: the report table.
- [ ] Determinism: 100 runs over every fixture produce byte-identical findings, including ids and order.
      Evidence: test name.
- [ ] Every `ranges` entry is within bounds and points at text that actually supports the finding; an invariant
      test checks bounds over all fixtures and 1,000 generated inputs. Evidence: test name.
- [ ] Every finding's `bloks` names at least one existing blok id, and a contradiction names at least two.
      Evidence: test name.
- [ ] Forbidden-word grep passes over every message and suggestion string. Evidence: the compliance job.
- [ ] The prototype's sample prompt produces findings that are compared with the prototype's diagnostics in the
      report, with each deviation justified. Evidence: snapshot plus a paragraph.
- [ ] Performance: the 100 KB gate still passes with detection included; report the number. Evidence: timing.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance` clean.
- [ ] Report and session log written; backlog updated.

## Notes for the implementer
- Write the "must not fire" fixtures before the detectors, exactly as the false-merge fixture came before the
  merge rule in EPIC-011a. That sequencing has now caught two real defects; keep it.
- Read the prototype's diagnostics code, then **run** it rather than trusting it. EPIC-011a found three false
  merges in it by doing so.
- `untestable` and `padding` are the two most likely to annoy. Bias them hard toward silence.
- A message is product copy. Write it as if the user is a senior engineer who is busy and slightly sceptical.
- If a detector cannot be made deterministic without guessing, write `docs/epics/BLOCKER-EPIC-012a.md` and stop.

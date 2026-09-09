# CURRENT

A mirror of `docs/epics/EPIC-011a-classifier-clustering.md`, per `docs/PROCESS.md`. EPIC-011a is
the current epic. EPIC-010 is done (`docs/epics/reports/EPIC-010-report.md`), including the
advisor's rulings on its five open questions; the one carry-over is in this epic's Scope — flatten
the allocation in `tags.ts` so the growth-exponent gate has real headroom. EPIC-080 and EPIC-005
are still deferred: per the standing note below, their findings are a data change here, not a
rewrite.

---

# EPIC-011a: Classifier and clustering
Stage: 1 · Depends on: EPIC-010 · Size: M

## Goal
Every segment gets a **kind**, and fragments of the same rule scattered across a prompt become **one blok owning
several ranges**. This is the step that turns a flat list of segments into the thing the product is named after.

## Standing note on research
EPIC-080 and EPIC-005 have not run. Their findings can change the *word* "blok", the *presentation* of kinds, and
which merges feel right ; they cannot change that clustering must be deterministic, or that a blok owns a set of
ranges. Build so those findings are a data change, not a rewrite: the labelled table, the topic keys and the merge
threshold are all data files, and the kind names are one exported union edited in one place.

## Decisions (do not re-litigate)
1. `packages/core`, pure, zero dependencies, deterministic (rules 2 and 11). No model call decides a kind or a
   merge. Models label and summarise later, from the worker, and only as metadata.
2. Kinds are exactly the six in `CLAUDE.md`: `context | constraint | example | expected | image_ref |
   image_input`. `classify()` returns one kind plus a confidence in `[0,1]`; low confidence is `context`, which is
   the safe default because it changes nothing about how the text compiles.
3. `classify(segment: Segment): { kind: BlokKind; confidence: number; matched: string }` ; `matched` names the
   heuristic that fired, so a wrong classification is debuggable without a debugger.
4. Heuristics are **ordered and data-driven**: an ordered list of patterns in a committed data file, first match
   wins, each entry carrying its kind and a stable id. Adding a heuristic is a data edit plus a snapshot update.
5. A **labelled table of 60 examples** is committed as the accuracy fixture: segment text plus expected kind,
   drawn from the EPIC-010 corpus and the decompiler prototype's sample. Accuracy target ≥90%; the test prints
   every miss with its `matched` value so failures are actionable.
6. `cluster(segments): Blok[]` where `Blok = { id: string; kind: BlokKind; ranges: Range[] }` and
   `Range = { start: number; end: number }`. **A blok always carries `ranges` as an array**, even when it has one
   (rule 5). Ranges are sorted by `start`, never overlap, and are never merged into a span that covers text the
   blok does not own.
7. Merge rule: two segments join the same blok when they share a **kind** and either a **topic key** or a
   normalised-token overlap of **≥ 0.6**. The threshold is an exported named constant. Topic keys live in a
   committed `topics.json`; normalisation is lowercase, strip punctuation, split on whitespace, drop a committed
   stop-word list. No stemming ; it is locale-sensitive and not worth the non-determinism.
8. Blok order is deterministic: by the `start` of each blok's first range. Blok ids are stable for the same input
   and are derived from content, not from a counter, so re-running produces identical ids.
9. Non-adjacent merging is the point. A rule stated in the opening paragraph and repeated in a numbered list at
   the end is one blok with two ranges. Prove it with a fixture built for exactly that shape.
10. Wrong merges are worse than missed merges. When in doubt, do not merge; a user can join two bloks, but a bad
    merge hides text inside a blok they did not expect to own it.

## Scope
- `packages/core/src/classify/`: `classify.ts`, `heuristics.json`, kind union in `types.ts`.
- `packages/core/src/cluster/`: `cluster.ts`, `topics.json`, `stopwords.json`, the exported threshold constant.
- Fixtures: the 60-example labelled table; at least five whole-prompt clustering fixtures with committed snapshots,
  including one built specifically to produce a multi-range blok and one built to tempt a false merge and not fall
  for it.
- A `README.md` in each module: what fires in what order, how to add a heuristic or a topic key, and the
  false-merge test that any new topic key must not break.
- **Carry-over from EPIC-010**: flatten the allocation in `tags.ts` (parallel arrays rather than one object per
  tag, avoid per-line slicing) so the growth-exponent gate has real headroom. Keep the bar at 1.6; report the new
  exponent in this epic's report. Same module, same session, so it happens here rather than as its own epic.

## Out of scope
- Summaries of any kind. (EPIC-011b.)
- Findings, diagnostics, severity. (EPIC-012a.)
- Compiling bloks back to text. (EPIC-020.)
- Any UI, colour, or interaction. (EPIC-013.)
- Model-backed classification. Not now, and not later without an ADR.

## Acceptance criteria
- [ ] `classify()` and `cluster()` exported from `packages/core` with the documented signatures; zero new
      dependencies. Evidence: `package.json` diff.
- [ ] Accuracy on the 60-example labelled table is ≥90%, and the test output names every miss with its `matched`
      heuristic. Evidence: test output.
- [ ] Every blok carries `ranges` as an array; a type-level and a runtime test both fail if a single-range blok is
      ever represented as a bare range. Evidence: two test names.
- [ ] The multi-range fixture produces exactly the expected blok with two non-adjacent ranges at the expected
      offsets. Evidence: snapshot.
- [ ] The false-merge fixture produces two separate bloks, and the test says which threshold or topic key would
      have to change to break it. Evidence: snapshot and the test's comment.
- [ ] Determinism: 100 runs over every fixture produce byte-identical bloks, including ids and order. Evidence:
      test name.
- [ ] Ranges within a blok are sorted, non-overlapping, and within the input's bounds, checked as an invariant
      over all fixtures and 1,000 generated inputs. Evidence: test name.
- [ ] The decompiler prototype's sample prompt clusters into the same bloks the prototype produces, or the
      deviation is named and justified in the report. Evidence: snapshot plus a paragraph.
- [ ] Adding a topic key to `topics.json` changes exactly the snapshots it should; show the diff. Evidence:
      README worked example.
- [ ] `tags.ts` allocation flattened; growth exponent reported for local and CI with the new headroom, and the
      100 KB gate still passes. Evidence: timing output before and after.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance` clean.
- [ ] Report and session log written; backlog updated.

## Verification
```
pnpm --filter @41prompts/core test
pnpm compliance
```

## Notes for the implementer
- Read the decompiler prototype's clustering JavaScript first; it is the reference, and its sample prompt has a
  known blok count. Say in the report where you deviated and why.
- Build the false-merge fixture before the merge rule. It is the test that stops this epic shipping something that
  feels clever and is wrong.
- Confidence is not a probability; it is an ordering device. Do not invent calibration for it.
- If EPIC-080's or EPIC-005's findings arrive mid-epic, stop and ask; do not guess at what they imply.
- If a rule cannot be made deterministic, write `docs/epics/BLOCKER-EPIC-011a.md` and stop.

# CURRENT

A mirror of `docs/epics/EPIC-011b-summariser.md`, per `docs/PROCESS.md`. EPIC-011b is the current
epic. EPIC-010 and EPIC-011a are done, and all of EPIC-011a's open questions are ruled — three of
them recorded as requirements on EPIC-012a and EPIC-013 at the end of
`docs/epics/reports/EPIC-011a-report.md`. EPIC-080 and EPIC-005 remain deferred.

---

# EPIC-011b: Summariser interface
Stage: 1 · Depends on: EPIC-011a · Size: S

## Goal
Every blok carries a short summary, so a user scanning a canvas of forty cards knows what each one is without
reading its source. The summary is **metadata about** the text, never a replacement for it, and the user can
always tell which kind of summary they are looking at.

## Why this is small and interface-first
The model-backed summariser lives in the worker and its prompt is proprietary. `packages/core` must work without
it, offline, with zero dependencies. So this epic is mostly a contract: one interface, one honest heuristic
implementation in core, one model-backed implementation in the worker behind the same interface, and a cache.
Getting the seam right matters more than the summary quality, which will be tuned for a year.

## Decisions (do not re-litigate)
1. `Summariser` is an interface in `packages/core`:
   `summarise(blok: Blok, source: string): Summary` where
   `Summary = { text: string; source: "heuristic" | "model"; inputHash: string }`.
   The `source` field is not optional and is not inferred; a caller can always tell where a summary came from.
2. **Rule 3 is absolute**: the summary is metadata. The compiler never emits it, no epic may substitute it for the
   blok's verbatim text, and a test in core asserts that a summary never appears in compiled output once EPIC-020
   exists. Write the test now as a placeholder that fails loudly if that changes.
3. The **heuristic implementation lives in core**, is deterministic, and is honest about being dumb: leading
   clause or first sentence, truncated at a named constant, with the blok's kind prefixed where it helps. It never
   guesses intent and never paraphrases. `source: "heuristic"`.
4. The **model-backed implementation lives in `apps/worker`** (rule 2: models label and summarise, from the
   worker). Its prompt is proprietary and never leaves the worker. `source: "model"`.
5. **Caching is by content hash**: `inputHash` is a hash of the blok's verbatim text plus the summariser's own
   version identifier. Change the prompt, change the version, invalidate the cache. Hashing is a pure function in
   core; the cache store is the worker's problem, not core's.
6. `packages/core` **must never reach a model, the network, or the filesystem** ; enforced by an existing boundary
   test plus one new test that asserts the heuristic summariser touches no global.
7. Summaries are never trusted silently by the product: EPIC-013 shows the `source` and, if EPIC-080's study says
   so, an explicit "not verified" cue. This epic exposes the data that makes that possible and takes no position
   on the visual treatment.
8. A summary of a multi-range blok summarises the blok, not its first range. Where the ranges disagree, the
   heuristic says less rather than picking one.
9. Empty input, whitespace-only bloks and single-word bloks all produce a valid `Summary`; nothing throws.

## Scope
- `packages/core/src/summarise/`: the `Summariser` interface, `types.ts`, `heuristic.ts`, the hash function, the
  truncation constant, a `README.md` explaining the seam and how to add an implementation.
- `apps/worker`: a model-backed implementation behind the same interface, its prompt in the worker, pinned model
  version (rule 7), cached by `inputHash`, with a documented fallback to the heuristic when the model call fails
  ; a failed summary must never fail a decompile.
- Tests: interface contract tests that any implementation must pass, run against both implementations; the
  boundary test; determinism of the heuristic; the "summary is never compiled output" placeholder test.

## Out of scope
- Any UI, card layout, or "unverified" badge. (EPIC-013.)
- Findings and detectors. (EPIC-012a.)
- Tuning summary quality beyond "not misleading".
- Streaming, batching, or cost accounting for the model call. (EPIC-031 owns run economics.)
- Translation or multilingual summaries.

## Acceptance criteria
- [ ] `Summariser`, `Summary`, the heuristic implementation and the hash function are exported from
      `packages/core`; zero new dependencies. Evidence: `package.json` diff.
- [ ] A shared contract test suite runs against both the core heuristic and the worker's model-backed
      implementation, and both pass. Evidence: test names and the file both import.
- [ ] `source` is always present and correct; a test fails if an implementation returns a summary without it.
      Evidence: test name.
- [ ] The heuristic is deterministic: 100 runs over every EPIC-011a clustering fixture produce identical
      summaries. Evidence: test name.
- [ ] `inputHash` changes when the blok text changes and when the summariser version changes, and does not change
      otherwise. Evidence: three test names.
- [ ] A boundary test proves `packages/core`'s summariser touches no network, filesystem, timer, or model.
      Evidence: test name and the dependency-cruiser rule.
- [ ] A multi-range blok whose ranges say different things produces a summary that does not assert either one.
      Evidence: fixture and snapshot.
- [ ] Empty, whitespace-only, single-word and 10,000-character bloks all return a valid `Summary` without
      throwing. Evidence: test name.
- [ ] The worker's model summariser falls back to the heuristic when the model call fails, and the returned
      `Summary` says `source: "heuristic"`. Evidence: test name with the failure injected.
- [ ] The judge/summariser model is pinned by version, not a floating alias (rule 7). Evidence: the constant.
- [ ] The placeholder test asserting a summary never becomes compiled output exists and is referenced from
      EPIC-020's future scope. Evidence: test name.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance` clean.
- [ ] Report and session log written; backlog updated.

## Verification
```
pnpm --filter @41prompts/core test
pnpm --filter @41prompts/worker test
pnpm compliance
```

## Notes for the implementer
- The worker's summariser needs `ANTHROPIC_API_KEY`; it is already in `.env.example`. If it is not set in Coolify,
  ask once in a batched checklist rather than blocking, and make the tests run without it.
- Do not make the heuristic clever. A summary that is obviously mechanical is safer than one that sounds
  confident and is wrong; EPIC-080 exists partly to find out how much users trust these.
- If EPIC-080's or EPIC-005's findings arrive mid-epic, stop and ask.
- If the seam cannot be built without core depending on something, write `docs/epics/BLOCKER-EPIC-011b.md`
  and stop.

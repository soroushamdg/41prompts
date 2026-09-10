# Plan — EPIC-011b: Summariser interface

Branch `epic/011b-summariser`. Written after reading `docs/epics/EPIC-011b-summariser.md`,
`CLAUDE.md`, EPIC-011a's report and `apps/worker/`.

A seam epic, size S. The interface and the cache key are the deliverable; the heuristic is
deliberately mechanical. Two decisions below need stating before any code, because both are
judgement calls I would otherwise be making silently.

## Judgement call 1: the cache key has to include the kind

Decision 5 says `inputHash` is "a hash of the blok's verbatim text plus the summariser's own version
identifier". Decision 3 says the heuristic prefixes "the blok's kind where it helps".

Those two cannot both be taken literally. If the summary depends on the kind and the cache key does
not, then a blok reclassified from `context` to `constraint` keeps its old summary forever — a stale
cache, which is the one failure a content-addressed cache exists to make impossible.

**The hash will cover the kind as well as the text and the version.** A cache key must cover every
input the function reads; that is what makes it a cache key rather than a guess. I read decision 5's
"the blok's verbatim text" as naming the blok's *content* rather than excluding its kind, and the
report will flag it so the advisor can say otherwise.

What the hash deliberately does **not** cover: the blok's offsets, or the surrounding prompt. Moving
a rule to a different place in a prompt does not change what it says, so it must not invalidate its
summary. That is a property worth having on purpose, not an omission.

For a multi-range blok the hash covers every range's text, length-prefixed, so two different
fragment splits can never collide into the same key.

## Judgement call 2: the worker gets the port, not the transport

The epic's Scope asks for "a model-backed implementation behind the same interface, its prompt in the
worker, pinned model version, cached by `inputHash`, with a documented fallback to the heuristic".

It does not ask for a provider transport, and **EPIC-031 explicitly owns "Anthropic adapter"**. Nor
does any acceptance criterion need one: the contract suite needs an implementation, the fallback
criterion needs an *injected failure*, and the pinning criterion needs a constant.

So the worker gets a narrow port — `SummaryModelClient`, one method, prompt in and text out — with
the proprietary prompt, the pinned model constant and the fallback all real, and the transport left
for EPIC-031 to supply. Adding `@ai-sdk/anthropic` now would preempt the epic that owns the choice,
and hand-rolling a `fetch` call would deviate from `CLAUDE.md`'s "Vercel AI SDK for providers" for no
gain this epic can bank.

Consequence to flag: nothing consumes `ANTHROPIC_API_KEY` yet, so the epic's note about asking
whether it is set in Coolify does not arise. The report will say so rather than leaving it implied.

## The contract

```ts
// packages/core/src/summarise/types.ts
interface Summary { text: string; source: "heuristic" | "model"; inputHash: string }
interface Summariser {
  readonly version: string;              // in the hash; bump it when output changes
  summarise(blok: Blok, source: string): Summary;
}
```

`source` is required and never inferred (decision 1). `summarise` is synchronous in core because the
heuristic is; the worker's implementation is async and satisfies an `AsyncSummariser` shape sharing
the same `Summary`, since a model call cannot be synchronous and pretending otherwise would be a
worse seam than having two.

## Modules

| Path | Does |
|---|---|
| `src/summarise/types.ts` | `Summary`, `Summariser`, `AsyncSummariser` |
| `src/summarise/hash.ts` | `summaryInputHash(blok, source, version)` — pure, the cache key |
| `src/summarise/heuristic.ts` | the mechanical summariser, `source: "heuristic"` |
| `src/summarise/constants.ts` | `SUMMARY_MAX_LENGTH`, the kind prefixes |
| `src/summarise/contract.ts` | `SUMMARY_CONTRACT_CASES` + `checkSummaryContract()` — the shared suite both packages import |
| `src/summarise/README.md` | the seam, the cache key, how to add an implementation |
| `apps/worker/src/summarise/` | `model-summariser.ts`, the proprietary prompt, the pinned model constant, the fallback |

`checkSummaryContract()` follows the `checkSegmentInvariants` / `checkBlokInvariants` pattern: a pure
function returning violations, so `packages/core` never imports vitest and both packages' tests can
run the identical suite over their own implementation.

## The heuristic, deliberately dumb

Leading clause or first sentence, kind-prefixed, truncated at `SUMMARY_MAX_LENGTH` (84, the
prototype's number) with an ellipsis. It never paraphrases and never guesses intent.

Decision 8 — a multi-range blok summarises the blok, not its first range:

- Every range's first sentence identical ⇒ use it. They agree; there is nothing to choose between.
- Otherwise ⇒ `"<kind phrase> stated in N places"`, with **no content claim at all**. That is
  "says less rather than picking one", and it is the honest answer: the blok says more than one
  thing, and a card that quietly showed only the first would be lying by omission.

No longest-common-prefix, no keyword extraction, no scoring. The instruction is explicit and the
reason is in the epic: a summary that is obviously mechanical is safer than one that sounds confident
and is wrong.

## Tests

| File | Covers |
|---|---|
| `summarise/heuristic.test.ts` | the shared contract over the heuristic, determinism ×100 over every EPIC-011a fixture, kind prefixes, truncation, the multi-range disagreement fixture and snapshot |
| `summarise/hash.test.ts` | changes on text change, changes on version change, stable otherwise — the three the criterion names — plus multi-range unambiguity |
| `summarise/no-globals.test.ts` | decision 6: stub `fetch`, timers, `Date`, `Math.random` and `crypto` to throw, then summarise |
| `summarise/never-compiled.test.ts` | decision 2's placeholder — fails loudly when EPIC-020 lands so somebody finishes it |
| `apps/worker/src/summarise/model-summariser.test.ts` | the same shared contract over the worker implementation, plus the injected-failure fallback |

## Order of work

1. Epic committed; `CURRENT.md` mirrored; backlog marked. *(done)*
2. Types, hash, contract module — the seam, before any implementation.
3. Heuristic + its tests.
4. The no-globals and never-compiled tests.
5. Worker implementation behind the port, with the shared contract suite and the fallback test.
6. README; self-review; full gate; PR; squash-merge on green.
7. Report, session log, backlog; `CURRENT.md` left on EPIC-011b.

## Risks

- **Adding `@41prompts/core` to the worker** is a new workspace dependency. Needed — the worker
  implements a core interface — and it needs a one-line reason in the PR description per the DoD.
  `turbo boundaries` and dependency-cruiser both need to stay clean; core is tagged `public` and the
  worker is not, and the restriction runs the other way, but that gets verified rather than assumed.
- **The no-globals test stubbing what vitest itself needs.** Stub, call, restore synchronously, and
  keep the stub set narrow.
- If the seam cannot be built without core depending on something, `docs/epics/BLOCKER-EPIC-011b.md`
  and stop.

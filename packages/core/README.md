# @41prompts/core

Pure TypeScript core of 41Prompts: the segmenter, classifier, clustering, detectors, compiler, checks,
deterministic graders, and artifact schema. Zero dependencies, no DOM, no IO. Apache-2.0.

## Three steps

```bash
npm install @41prompts/core
```

```ts
import { segment, classify, cluster, detect } from "@41prompts/core";

const bloks = cluster(segment(myPrompt).map((s) => ({ ...s, ...classify(s) })));
```

```ts
const findings = detect(bloks, myPrompt);
// -> rules with nothing checking them, contradictions, repetition, padding —
//    each pointing at the exact span of text that causes it.
```

**No model is called and nothing leaves the process.** Segmentation and clustering are
deterministic by design: the same text always cuts the same way, so a boundary is never something
you have to re-run to reproduce.

## What is here today

- **`segment(text)`** — cuts a prompt into segments with exact source offsets, deterministically.
  Offsets are UTF-16 code units, `start` inclusive and `end` exclusive; segments plus the gaps
  between them reproduce the input byte for byte. See [`src/segment/README.md`](src/segment/README.md)
  for the rule order and how to change it.
- **`classify(segment)`** — gives a segment one of the six blok kinds, a confidence, and the id of
  the heuristic that decided it. See [`src/classify/README.md`](src/classify/README.md).
- **`cluster(segments)`** — groups segments into bloks, each owning a *set* of ranges, so a rule
  stated in three places is one thing the user edits once. See
  [`src/cluster/README.md`](src/cluster/README.md) for the merge rule and its guards.
- **`detect(bloks, source)`** — findings: specific, defensible problems, each pointing at the text
  that causes it. Advisory only. See [`src/detect/README.md`](src/detect/README.md) for what each
  detector fires on and what it deliberately does not.
- **`heuristicSummariser`** and the `Summariser` seam — a short line describing what a blok says,
  as metadata about the text and never a replacement for it. See
  [`src/summarise/README.md`](src/summarise/README.md) for the cache key and how to add an
  implementation.
- **`SEGMENT_FIXTURES`** and **`CLUSTER_FIXTURES`**, from `@41prompts/core/fixtures` — the committed
  corpora, with a snapshot per prompt. A subpath rather than the root: they are real, shared test
  data, and the root is the surface the SDK contract freezes.
- **`applyBudgetIncrement()`** — the pure decision behind the per-run cost cap.

Also here, and used by `@41prompts/sdk` and `41p` rather than called directly very often: the
per-blok compiler and its span cache, the check model and the deterministic graders, the variable
contract, the version model, and the frozen v1 build format with its content address — a SHA-256
written out in pure TypeScript, because this package may have no dependencies and no `node:crypto`.
It is proved against the published FIPS 180-4 vectors. **It has not been reviewed by a
cryptographer**, and `SECURITY.md` says so.

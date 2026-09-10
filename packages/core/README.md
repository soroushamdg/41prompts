# @41prompts/core

Pure TypeScript core of 41Prompts: the segmenter, classifier, clustering, detectors, compiler, checks,
deterministic graders, and artifact schema. Zero dependencies, no DOM, no IO. Apache-2.0.

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
- **`SEGMENT_FIXTURES`** and **`CLUSTER_FIXTURES`**, from `@41prompts/core/fixtures` — the committed
  corpora, with a snapshot per prompt. A subpath rather than the root: they are real, shared test
  data, and the root is the surface the SDK contract freezes.
- **`applyBudgetIncrement()`** — the pure decision behind the per-run cost cap.

The classifier, clustering, detectors, compiler, checks, graders and artifact schema land in the
rest of Stage 1 and Stage 2.

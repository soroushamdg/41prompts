# @41prompts/core

Pure TypeScript core of 41Prompts: the segmenter, classifier, clustering, detectors, compiler, checks,
deterministic graders, and artifact schema. Zero dependencies, no DOM, no IO. Apache-2.0.

## What is here today

- **`segment(text)`** — cuts a prompt into segments with exact source offsets, deterministically.
  Offsets are UTF-16 code units, `start` inclusive and `end` exclusive; segments plus the gaps
  between them reproduce the input byte for byte. See [`src/segment/README.md`](src/segment/README.md)
  for the rule order and how to change it.
- **`SEGMENT_FIXTURES`**, from `@41prompts/core/fixtures` — the committed 25-prompt segmentation
  corpus, with a snapshot per prompt. A subpath rather than the root: it is real, shared test data,
  and the root is the surface the SDK contract freezes.
- **`applyBudgetIncrement()`** — the pure decision behind the per-run cost cap.

The classifier, clustering, detectors, compiler, checks, graders and artifact schema land in the
rest of Stage 1 and Stage 2.

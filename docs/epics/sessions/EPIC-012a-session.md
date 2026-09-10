# EPIC-012a session log

**Date.** 2026-09-10.

**Prompt sent.** Same autonomy as before: commit `docs/epics/EPIC-012a-detectors.md` as-is, mirror
into `CURRENT.md`, mark it current, plan into `docs/epics/plan-EPIC-012a.md`, implement, self-review,
push, PR, squash-merge on green. With a steer: *"This is the epic that carries the product's visible
value, so the false-positive audit is not a formality; write the 'must not fire' fixtures before the
detectors, and run the prototype's diagnostics rather than reading them."* Plus a ruling to record
first: EPIC-011b's cache key keeps the blok's kind.

**Plan summary.** `docs/epics/plan-EPIC-012a.md`, written after running the prototype's `diagnose()`.
Nine findings on its own sample, and the contradiction rule is the weak one: it pairs any blok
holding a negation with any blok that does not, sharing any of eight hard-coded nouns. One of its two
contradiction findings is a false positive; the other is real but reported against the wrong pair,
because the genuine contradiction lives inside one segment between two adjacent sentences. Three more
of its nine count fragments of bloks EPIC-011a proved were false merges.

**Decisions made and why.**

- **`repeated` cannot mean what the prototype meant.** Any two bloks over the threshold sharing a
  kind were already merged by clustering, so a naive port never fires. What it reports is the pair
  clustering refused — the same instruction in two registers — which is a true finding the prototype
  misses entirely.
- **`contradiction` compares sentences.** The only unit that catches all three shapes: across bloks,
  inside one blok, inside one range.
- **`bloks` is a deduplicated set**, which means a within-blok contradiction names one blok where
  criterion 7 says two. Flagged rather than fudged; listing the same id twice would make `bloks` a
  bag and push the dedupe onto every consumer.
- **Extracted similarity, polarity and the sentence boundary** rather than growing second copies
  (decision 6). A second similarity measure would let a pair be "similar enough to merge" and "not
  similar enough to report" at the same time.
- **One README with a section per detector** where the Scope asks for one each. Flagged.

**What took longer than expected / went wrong and was caught.**

- **I swept the untracked EPIC-012a epic file into the EPIC-011b ruling commit** with `git add -A`,
  so a PR that was meant to be one doc edit also added a new epic. Amended it out, force-pushed with
  `--force-with-lease`, and committed the epic on its own branch where it belonged. `git add -A` on a
  branch that has an unrelated untracked file waiting is a trap I set for myself.
- **A literal NUL byte in `cluster.ts`**, written there by my own generator in EPIC-011a. Git treats
  the file as binary, so it has shown no textual diff for two epics and neither self-review could see
  its changes. The reviewer noticed the file rendering as binary and said so. This is the finding I
  would most want surfaced, because it silently removed a file from review — not a bug in behaviour,
  a hole in the process.
- **`detect()` was quadratic**: 12.6 seconds on a 1 MB prompt, on the main thread, in the tab
  EPIC-013 runs it in — and it had no throughput gate at all while `segment()` and `cluster()` have
  two each. The obvious fix, indexing by shared token, only reached 6.2 s: a repeated corpus gives
  every sentence identical twins sharing every token, so a token index prunes nothing. What works is
  indexing on what a contradiction *requires* — opposite polarity, or an antonym's partner — because
  identical twins share a polarity and can never contradict. 625 ms, exponent 1.91 → 1.39.
- **The containment guard was dropped in transit.** I reused clustering's overlap and threshold and
  left behind the ratio guard that travels with them — reintroducing the exact defect EPIC-011b's
  review found in clustering. Copying two of three things is how a fixed bug comes back.
- **My own `too_long` and `padding` produced false positives on the first audit run**, and the audit
  is the only reason I saw them: ten findings on `wall-of-text` counting the same sentence four
  times, and "Never mention that you are an AI model" flagged as padding when the phrase is the
  object of the rule.
- **Two fixtures were badly built and I only found out by measuring.** `quiet-long-but-single-purpose`
  passed by one word (54 against a threshold of 55), and `fires-too-long` repeated a short sentence
  so clustering merged it into four ranges of forty-two words and the detector correctly stayed
  quiet. Both rebuilt. A fixture that passes by one word is not evidence of anything.
- **`quiet-negation-without-conflict` passed for the wrong reason** — its two rules are about
  different subjects, so it never exercised the scoped-precondition shape at all. The reviewer
  spotted that; `quiet-scoped-precondition` covers it now.

**Verification output (tail).**

```
false-positive audit: 4 finding(s) across 25 fixtures
  support-email-router  medium repeated: ... "You are a helpful customer support assistant …" / "6. Always be professional and friendly …"
  support-email-router  medium untestable: "reasonably short"
  support-email-router  medium untestable: "use your best judgement"
  support-email-router  low    padding: "please"

detect 100 KB (220 bloks): 100.4 ms cold, 21.6 ms warm
segment + cluster + detect, 100 KB: 34.2 ms warm
detect 1 MB (1502 bloks): 624.6 ms warm (reported, not gated)
detect growth exponent 1.40 (28.3 ms -> 197.7 ms for 4x input)

      Tests  328 passed (328)
✔ no dependency violations found (81 modules, 163 dependencies cruised)
Forbidden-word grep clean (packages/ui/src, apps/web/app, apps/web/lib).
[mirror-dry-run] OK -- the public-only tree installs and tests standalone
```

**Open questions for the advisor.** Four, at the end of the report: the `bloks` set-versus-bag
tension with criterion 7; one README instead of five; whether `repeated` reporting what clustering
*refused* reads oddly on a canvas; and `too_long` being a length proxy that will fire on a genuinely
long single instruction.

**Context for the next session.** `detect()` is the last piece of the Stage 1 core pipeline: segment →
cluster → summarise → detect all run in `packages/core`, pure and deterministic, and the end-to-end
snapshot on the prototype's sample is one file that will move if any of them changes.

EPIC-012b adds `rules-without-checks` — the prototype's "5 rules, 0 assertions", the one finding of
its nine deliberately left out here. Three things it should know: the `FindingKind` union is exactly
five and a sixth is an epic (decision 3), so it will need one; `QUIET_FIXTURES` is where its
must-not-fire case goes, before its detector; and the audit test caps total findings at 20 so a new
detector that doubles the count has to say so out loud.

EPIC-013 inherits two requirements already recorded in EPIC-011a's report — multimodal and
expectation fixtures, and the 100 KB input cap — and now a third worth knowing: `detect()` is
quadratic-ish (exponent 1.4) and 1 MB takes 625 ms, so the cap is what keeps it responsive.

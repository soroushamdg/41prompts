# 41Prompts; Blok Editor design notes

Status: working design memory. Captured 2026-08-09.
Scope: ground-up rebuild of 41prompts.ai. Source material: handwritten feature notes + advisory session.

---

## 0. Naming

**Blok Editor** = the split view: prompt editor on the left, card canvas on the right.
**Blok** = one card. **Block** = the compiled prompt region a blok owns.

---

## 1. Product thesis

The defensible idea is **span-level attribution of eval failure**.

A prompt is not a blob. It is an ordered set of bloks, each owning a span of the compiled prompt.
When a run fails, the failure attributes back to the specific blok, not to the prompt as a whole.

Chain: **blok -> compiled block (span) -> assertion -> run result -> failure highlights the blok.**

This is the loop no incumbent executes well. Everything else in the product exists to make this usable.

Corollary: the hover behaviour from the original notes ("hover on prompt text, highlights the relevant
note / expected output") is not a UI flourish; it is the visible surface of the data model.

---

## 2. Competitive reality (why the obvious features are not the product)

Multi-model side-by-side runs, version history, and prompt playgrounds are table stakes.
Promptfoo, Langfuse, Braintrust, PromptLayer, LangSmith ship them, plus first-party playgrounds and
eval suites from OpenAI and Anthropic, which are free and improve quarterly.

A workbench pitched as "compare models side by side, keep versions" has no reason to survive.
Confidence: likely.

---

## 3. Blok Editor: the compiler

The canvas is not an ideation toy. It is a **compiler front-end**. Bloks compile into a prompt.

### 3.1 Compile per blok, never per prompt

If an LLM rewrites the whole prompt on every card change, adding one blok rewrites hundreds of tokens.
Consequences: diffs become noise, version history becomes useless, A/B results become uninterpretable
because more than one variable moved. This kills the eval story. Confidence: certain.

Rules:

- Each blok owns exactly one compiled block.
- Block output cached against `hash(blok content + blok type + compiler version + model + params)`.
- Adding a blok appends one block. Editing a blok recompiles one block. Everything else stays byte-identical.
- Global coherence / smoothing passes are an explicit user action, never silent.
- Debounce recompiles; dragging bloks must not fire a model call per frame. Cost leak otherwise.

### 3.2 Order is semantically load-bearing

Blok order is user-controlled and stable. The compiler never reorders. Position in a prompt changes how
most models weight an instruction. Confidence: likely.

### 3.3 Bidirectional editing; the trap

If the left editor is writable and the canvas regenerates it, there is a sync conflict on every change.
Every tool that attempted transparent round-tripping between structured source and freeform artifact has
lost: WYSIWYG-vs-source, design-to-code, ORM-vs-SQL. Confidence: certain.

Resolution:

- Compiled prompt is **read-only by default**.
- **Per-block override**: editing a block detaches only that block, marks it `manual`, compiler stops
  touching it and continues to own everything else.
- **Drift indicator** per blok when its blok content no longer matches its manual block; one-click reconcile.
- **Hard eject**: convert the whole prompt to raw text, one-way, no return. Serious users need a visible exit
  before they commit.

Risk being managed: manual blocks accumulate until the canvas is fiction. The drift indicator is the counter.

---

## 4. Blok types

Not interchangeable. Must not compile the same way.

| Type | Compiles to | Notes |
|---|---|---|
| Context / role | Prose block, near top | |
| Constraint | Imperative bullet, individually addressable | Most regression bugs live here |
| Example | Few-shot block, formatted per provider | |
| Expected behaviour | **An assertion, not prompt body** | Highest-leverage decision in the design |
| Reference image | Nothing; human-only reference | Never reaches the model |
| Input image | Multimodal few-shot input | Distinct card visually; blows up token cost if merged with reference |

### 4.1 Expected-behaviour bloks are graders

The instinct is to append "output should be under 200 words" to the prompt text. Do both, but treat the
**assertion as primary**: the blok becomes a grader, runs score against it, and a failure highlights the blok.

Effect: the same act that authors the prompt authors the test suite. The user gets evals without ever being
asked to write them. Confidence: likely. This is the answer to "users won't write expectations."

Grader order: deterministic checks first (contains, regex, JSON schema, refusal detection), LLM-judge second.

---

## 5. Data model

```
Blok      { id, type, content, order, compiled_block_hash, manual_override? }
Version   { ordered blok ids + blok content hashes + compiler version }   // truth
Block     { blok_id, span_start, span_end }        // the hover mapping, free
Assertion { blok_id, kind, params }                // from expected-behaviour bloks
Run       { prompt_hash, input_hash, model, params, raw_payload, latency, cost }
```

- **Version the blok set, not the compiled string.** Compiled string is derived output; store it, but truth is
  the blok set. Yields semantic diffs ("added constraint blok: no emojis") instead of text diffs. Better version
  history than anything shipping in the category today. Confidence: likely.
- **Store every run immutably** with prompt-hash + input-hash + model + params. Retrofitting run provenance is
  expensive; skipping it is the most common regret in this category.
- **Retain raw provider payloads.** Lets new graders be added later without re-running everything.
- **Judge models are pinned, versioned dependencies.** A silent model update invalidating historical scores
  destroys trust in the whole dataset. Confidence: certain.

---

## 6. Architecture positions to hold

- **Prompts as files, not rows.** Git-backed or git-exportable. Tools that trap prompts in a proprietary DB lose
  engineering teams at the moment those teams get serious.
- **One thin provider abstraction.** Normalize request/response; do not build a router product.
- **Deterministic compiler core**, LLM assistance only at blok scope.

---

## 7. Cut list (with reasons)

- **Phone AI / image AI / video AI testing.** Each modality is its own grader stack. Voice is a different product
  entirely: turn-taking, interruption, latency, ASR error tolerance; Coval, Hamming, Vocera occupy it. Shallow
  versions of all three make the tool look unserious in all three. Confidence: certain.
- **Standalone "prompt quality score."** A number computed from prompt text alone, without reference outputs, is
  unfalsifiable and gameable; engineers distrust it on sight. Keep scoring, but bind it to **pass rate against
  assertions on real outputs**. That number means something. Confidence: certain.
- **Team sharing / collaboration in v1.** High build cost, pays off only after single-player value is proven.
  Confidence: likely.

---

## 8. Build order

1. Prompt object with variables + versions; diffable, content-addressed.
2. Run engine: one prompt x N providers x N input rows; cached; cost and latency captured.
3. Blok Editor v1: canvas + per-blok compilation + read-only compiled pane with per-block override.
4. Assertions from expected-behaviour bloks; deterministic graders first.
5. **Failure view with blok attribution.** This is the screenshot the product gets sold on.
6. Auto-suggest bloks/annotations from failing outputs; removes the blank-canvas problem.
7. Export: API-ready prompt + a CI command running the same suite. Retention hook; once the suite runs in CI,
   leaving costs something.

Everything after that is optional.

---

## 9. Failure modes to watch

1. Rebuild takes six months, ships nine features at low quality, reads as a worse Langfuse.
2. The blok/attribution idea is built correctly but marketed as "prompt testing," gets sorted into a category
   where the free first-party option wins by default.
3. Auto-regeneration eats a user's manual edit once; that user does not come back.
4. Canvas becomes a cost leak through un-debounced recompiles.

---

## 10. Video and education content (added 2026-08-09)

### 10.1 Two different programs; do not merge

- **Product tutorials**: how to use 41Prompts. Job = activation. Format = screencast, short, per-feature.
- **Education content**: LLMs, prompting, agents. Job = top-of-funnel + AI-search citation. Format = text first.

Merging them produces long videos that neither activate nor rank.

### 10.2 HeyGen is the wrong primary tool for product tutorials

HeyGen is a talking-head and translation engine; it has no screen recording. A product tutorial for a
developer tool is 90 percent screen. An avatar reading a script over a static frame is worse than a plain
screencast. Confidence: certain on the capability gap.

Where HeyGen does earn its keep: **175+ language translation with voice cloning and lip-sync**, from one
source video. Localised tutorials are a real distribution edge in dev tools because almost nobody does it.
Use HeyGen as the localisation layer on top of English screencasts, plus optional presenter intro/outro.

Pipeline: script -> screencast capture -> English voiceover -> HeyGen translate to target languages ->
captions -> publish. One source, N locales.

### 10.3 Do not record product tutorials before UI freeze

The rebuild will invalidate every recording. Avatar and screencast content is expensive to re-cut.
Record after the Blok Editor UI is frozen, not during. Confidence: certain.

### 10.4 Video is not an activation channel

Users skip videos during first run. Activation comes from in-product guided first run: seeded example
bloks, a prefilled failing assertion, one click to see blok attribution work. Build that before any tutorial
video. Confidence: likely.

### 10.5 Do not build a general AI curriculum

Anthropic Academy launched March 2026: free, 150+ lessons, 17 certified courses, LinkedIn certificates,
beginner through multi-agent systems. OpenAI runs its own free academy. A generic "intro to LLMs / prompting /
agents" series competes directly with free, better-resourced, certificate-bearing incumbents and loses.
Confidence: certain.

The version with ROI is **product-shaped education**: eval-driven prompting, span attribution, assertion
design, prompt regression testing, agent behaviour specification. Teach the concepts the product embodies.
Every lesson ends inside the product.

### 10.6 Text first, video second

Buyers increasingly ask an LLM "best tool for testing prompts." Text pages get cited; video largely does not.
Write the article, then derive the script from it. Never script-first. Confidence: likely.

### 10.7 Source use; legal line

- Anthropic and OpenAI docs, cookbooks, and engineering posts: cite and link, do not transcribe.
- "Principles of Building AI Agents" (Mastra / Sam Bhagwat) and academic textbooks: reading them to learn is
  fine; building a video series that mirrors a book's structure, examples, and sequence is derivative work
  and a licensing exposure. Confidence: likely.
- Safe pattern: derive from **primary sources and papers** (ReAct, Reflexion, tool-use and eval literature),
  original benchmarks you run yourself in 41Prompts, and your own failure data. Own screenshots, own numbers.
- Original runs inside the product are the one source no competitor can copy and no publisher can claim.

### 10.8 Playable lessons; the chosen tutorial format

Decision: the lesson is **not** a video and **not** an article. It is a preloaded blok workspace inside the app.
Video is the 60 to 90 second trailer on top. Text is the indexed companion page the student never has to read.

**Audience correction.** Target the newcomer who is *already building something and failing*, not the newcomer
who is merely curious about AI. Same simplicity of language, different entry point. Curious beginners convert
at near zero and drag the roadmap toward beginner features while the defensible feature (span attribution) is
an intermediate concept. Confidence: likely.

**Why the product can teach where video cannot.** The product already renders the abstractions. Concepts that
are hard to explain become trivial once they have a UI.

| Concept | Taught by |
|---|---|
| LLMs are nondeterministic | Run same prompt 5x; five outputs, pass rate under 100 percent |
| Temperature | Same lesson, move the slider, watch variance collapse |
| Context and roles | Add a context blok; compiled prompt and output change |
| Few-shot | Add two example bloks; failing assertion passes |
| Instruction following | Constraint blok the model ignores; find which models obey |
| Tokens and cost | Run engine already surfaces cost and latency |
| Why evals exist | Their "improved" prompt breaks a previously passing assertion; regression felt, not explained |
| Model differences | One prompt, three providers, three outputs, no opinion required |
| Agents | Multi-step chain where step 2 fails because step 1 emitted malformed output |

**Lesson anatomy.** 6 to 10 minutes. One concept. Preloaded bloks, one failing assertion, short explanation
panel, one thing to change, visible pass/fail. Ends with the workspace unlocked as a sandbox, so exiting the
lesson means being inside the product, not on a course platform.

**Sequencing rule.** Each lesson breaks something the previous lesson taught. Regression felt once teaches more
about evals than any explanation of them.

**Cost control, mandatory before lesson 1 ships.** Every lesson run hits a provider and students will run them
thousands of times. Cache canned runs for the default lesson state so first render costs nothing; cheapest
capable model for lesson-tier live runs; per-day free-tier run cap; lesson traffic never reaches expensive
models. Confidence: certain that this is a real cost exposure.

---

## 10.9 The decompiler (reverse compilation); added 2026-08-18

Paste a long prompt; get it cut into bloks, each labelled with what it does in one line, plus diagnostics.
This is the inverse of the compiler and it is the **import path**, not a side feature.

**Why it is strategically large.** Nobody arrives at a prompt tool with an empty canvas; they arrive with a
1,500-token prompt that already half works. Decompiling turns a blank editor into a populated workspace in one
paste. It solves the cold-start problem that kills most canvas-based tools. Confidence: likely.

**Non-negotiable: bloks store the verbatim span, the summary is metadata.** If the compiler ever re-emits a
paraphrase, the user's prompt silently changes behaviour and trust is gone permanently. On import every blok is
a manual-override blok; the drift mechanism from 3.3 already covers this case exactly. Confidence: certain.

**Boundaries deterministic, labels generated.** If a model picks the cut points, the same prompt decompiles
differently on each import and version history becomes meaningless. Split on structure (blank lines, list
markers, headings, sentence ends, XML/markdown tags); use the model only to name each piece. Also makes it
cacheable and near-free. Confidence: certain.

**Summaries make it browsable; diagnostics make it fixable.** The reason to return is the contradiction on
line 40 fighting line 12. Four diagnostics carry most of the value:

1. Repeated instruction (token-overlap over ~0.7 between bloks)
2. Contradiction candidates (a negated blok and a positive blok sharing a format keyword)
3. Untestable language ("appropriate", "reasonable", "as needed", "best judgement")
4. Rules with zero assertions; the direct upsell into the eval product

Secondary: politeness padding, bloks over ~55 words carrying more than one instruction.

**It is also the free tool** (see 10.5 / lead-magnet thinking): paste a prompt, get it explained, no signup.
Shareable, linkable, LLM-citable, and it ends inside the product with every blok already on the canvas.

Working prototype: `41prompts-decompiler.html` (deterministic segmentation + heuristic labelling + diagnostics,
no model calls).

---

## 12. Prompt delivery / live update to production (added 2026-08-19)

Goal: a developer references a typed variable in code; the prompt behind it updates from the platform without a
rebuild, resubmission or redeploy.

### 12.1 Competitive reality

This is **table stakes, not a differentiator**. Confidence: certain.
Langfuse (MIT, ~30K stars) ships immutable numbered versions, movable release labels with a `production` default,
protected labels, diff views and SDK-side caching. PromptLayer, Humanloop, Vellum, Agenta and Portkey all ship a
variant. Teams without an LLMOps tool put prompts in LaunchDarkly, Statsig, ConfigCat, Firebase Remote Config or
AWS AppConfig, because a prompt is a string and remote config already solves strings.

**The differentiator is the gate, not the delivery.** 41Prompts already owns the assertion suite, so promotion can
be conditioned on it: a build cannot become `production` unless its blok assertions pass on the model production
actually calls. A remote-config vendor structurally cannot make that claim.

### 12.2 Decisions taken

| Decision | Choice |
|---|---|
| Resolution | SDK fetch + CDN + build-time baked fallback. No gateway in v1. |
| Promotion | Hard gate on assertion pass; override allowed, requires typed reason, logged forever. |
| Rollout unit | Whole prompt version + percentage cohorts. |
| First SDKs | Python and TypeScript. Mobile (Swift, Kotlin) phase two. |

Gateway mode (client sends variables only, prompt never leaves the server) deferred to a paid tier; it solves
prompt secrecy and gives traffic-level analytics, at the cost of becoming a hard uptime dependency.

### 12.3 Artifacts

- **Prompt build**: immutable, content-addressed. `/<project>/<prompt>/<sha>.json`. Cache forever.
  Contains compiled prompt, blok manifest, variable schema, model params, assertion suite id.
- **Label pointer**: mutable, tiny, TTL ~30s. `/<project>/<prompt>/labels/production.json`.
  Contains `{ sha, rollout_pct, cohorts, min_sdk, variable_schema_version }`.
- Publish = write a new build. Promote = repoint a label. Rollback = repoint again; atomic, instant, cannot half-fail.

### 12.4 SDK contract (three hard rules)

1. Never block an LLM call on the network.
2. Never throw.
3. Resolve in order: memory cache → disk cache → artifact baked into the build → network (background refresh,
   stale-while-revalidate).

Consequence: if 41Prompts is down, customer apps keep running on the last good prompt. This answers the first
objection every competent engineer raises, and it must be answerable in one sentence.

### 12.5 Developer experience; codegen, not string keys

`41p pull` generates typed bindings from the lockfile so the reference in code is a variable with autocomplete:

```python
from prompts import refund_classifier
msg = refund_classifier(email=body, locale="fr")
```
```ts
import { refundClassifier } from "./prompts";
const msg = refundClassifier({ email: body, locale: "fr" });
```

- `41p pull` → `.41p/lock.json` + generated bindings + baked fallback artifacts
- `41p check` → fails the build if code references a variable the production build does not declare
- `41p run` → the existing CI assertion command

### 12.6 Variables are a versioned contract (most underrated part)

Every build declares a variable schema with semver-style compatibility. The SDK reports the schema version it was
built against. The platform therefore knows which contracts are live in the field and **refuses to promote a build
that breaks a client still in production**.

Rationale: adding `{{tone}}` to a prompt while shipped clients do not send it degrades output silently and no test
catches it. Prompts are an API; the variable set is its signature. Confidence: likely that this is the most common
real-world break.

### 12.7 Promotion screen requirements

- Assertion suite result on the target production model; blocks on fail
- Projected token cost delta and latency delta vs current production build
- Variable-contract compatibility check against live clients
- Semantic diff of the blok set vs the current production build
- Override: typed reason, attributed, stamped on the version card and the audit log

### 12.8 Rollout and safety

- Percentage rollout by stable hash of a caller-supplied `unit_id`
- Cohort filters: environment, platform, app version, locale
- One-click kill switch to last known-good build
- Protected labels: only named roles may repoint `production`
- Full audit log: who promoted what, when, with which override reason

### 12.9 The loop back (the actual moat)

Sample production calls, grade them against the same assertions, and file failures into the eval set as new inputs.
The deployed prompt keeps writing its own test suite. Remote config cannot do this; it is the reason to choose
41Prompts over a feature-flag vendor.

### 12.10 Mobile, phase two

Same artifact format. Build-time bake mandatory, background refresh, explicit staleness policy (max age before
falling back to baked). Offline launch and cold start are where backend-first assumptions break. Note also that a
client-fetched prompt is extractable from a binary; teams treating prompts as IP need gateway mode.

---

## 11. Open decisions (unresolved, not questions to answer here)

- Whether the compiled prompt is ever writable in v1, or eject-only.
- Whether blok-to-block compilation uses a model at all in v1, or pure templating with model assist as v2.
- Whether semantic diff ("added constraint blok") is exposed in UI v1 or stored only.
- Provider set at launch, and whether provider-specific formatting lives in the compiler or the run engine.

---

## 13. September 2026 revisions (specialist review)

- ICP locked: AI engineer at a company of 10–500 people who owns a production prompt.
- "block" removed; a blok owns spans. "check" replaces "assertion" in UI. See ADR-003.
- Lessons deferred to the final stage; validated on paper first.
- Stage 1 ships the decompiler soft-public; loud launch after Stage 3.
- Delivery split into 5a (artifact, gate, API, TypeScript SDK) and 5b (CLI, Python, open-source split) with a demand gate.
- Apache-2.0 for public packages; `packages/ui` proprietary; judge and summariser prompts proprietary.
- Legal minimum (EPIC-017) before any public traffic; retention enforced where data appears; telemetry off by default.
- Full record: `docs/reviews/2026-09-specialist-review.md`.

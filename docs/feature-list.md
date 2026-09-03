# 41Prompts; full feature list

Version 1.0 · 2026-08-19
Scope marks: **[v1]** ship first · **[v1.5]** soon after · **[later]** deferred · **[cut]** decided against

---

## 1. Blok Editor

- Blok canvas: create, edit, reorder, duplicate, delete **[v1]**
- Blok types: context, constraint, example, expected-behaviour, reference image, input image **[v1]**
- Per-blok compilation; one card change touches one block **[v1]**
- Block output caching by content hash **[v1]**
- Read-only compiled prompt pane **[v1]**
- Per-block manual override **[v1]**
- Drift indicator and one-click reconcile **[v1]**
- Hard eject to raw text, one-way **[v1]**
- Blok ↔ compiled span linking, hover and keyboard, both directions **[v1]**
- Leading colour marker on highlighted spans **[v1]**
- Multi-range bloks; one blok owns discontiguous spans **[v1]**
- Canvas filter by blok type **[v1]**
- Resizable split pane, pointer and arrow keys **[v1]**
- Token count and per-run cost estimate **[v1]**
- Blok grouping and collapse **[v1.5]**
- Blok library, reusable across projects **[later]**

## 2. Decompiler (import)

- Paste a prompt, get bloks **[v1]**
- Deterministic structural segmentation **[v1]**
- Generated one-line summary per blok **[v1]**
- Verbatim source spans stored; summary is metadata only **[v1]**
- Source map view with span highlighting **[v1]**
- Fragment counter and fragment numbering **[v1]**
- Defragment on recompile **[v1]**
- Pin a highlight **[v1]**
- Dim-the-rest focus mode **[v1]**
- Import from file and from URL **[v1.5]**
- Import from a repo path **[later]**

## 3. Diagnostics

- Repeated instruction detection **[v1]**
- Contradiction detection **[v1]**
- Untestable language detection **[v1]**
- Politeness padding detection **[v1]**
- Over-long blok detection **[v1]**
- Rules with zero assertions, counted **[v1]**
- Unused variable detection **[v1.5]**
- Dead instruction detection (never triggered in any run) **[later]**

## 4. Runs and evaluation

- Multi-provider run engine: GPT, Claude, Gemini **[v1]**
- Prompt variables and input rows **[v1]**
- Input sets, importable from CSV **[v1]**
- Assertions generated from expected-behaviour bloks **[v1]**
- Deterministic graders: contains, regex, JSON schema, length, refusal **[v1]**
- LLM-judge graders **[v1]**
- Pinned judge model versions **[v1]**
- Failure attribution to the owning blok **[v1]**
- Create-constraint-blok-from-failure **[v1]**
- Results pivot: by assertion and by input **[v1]**
- Heatmap view for large grids **[v1]**
- Pass rate, regressions, latency, cost per run **[v1]**
- Raw provider payload retention **[v1]**
- Run caching **[v1]**
- Model parameter sweeps (temperature, top-p) **[v1.5]**
- Multi-step chain runs for agents **[later]**

## 5. Versioning

- Version the blok set, not the compiled string **[v1]**
- Immutable numbered versions **[v1]**
- Semantic diff **[v1]**
- Compiled byte delta **[v1]**
- Pass rate recorded per version **[v1]**
- Restore any version **[v1]**
- A/B two versions on the same suite **[v1]**
- Named branches **[later]**

## 6. Delivery (live prompt updates)

- Immutable content-addressed prompt builds on CDN **[v1]**
- Two environments only: Draft and Live **[v1]**
- Publish = move the Live marker **[v1]**
- Undo = move it back, instant **[v1]**
- Publish blocked when assertions fail on the target model **[v1]**
- Override with typed reason, attributed and audited **[v1]**
- Projected cost and latency delta shown at publish **[v1]**
- Semantic diff versus current Live version at publish **[v1]**
- Bundled fallback copy written at build time **[v1]**
- SDK resolve order: memory → disk → bundled → background refresh **[v1]**
- SDK never blocks an LLM call, never throws **[v1]**
- Automatic input-contract check; publish blocked if shipped apps would break **[v1]**
- Publish audit log **[v1]**
- Admin-only publishing switch **[v1]**
- Percentage rollout by stable unit hash **[later]**
- Cohort filters: platform, app version, locale **[later]**
- Custom environments beyond Draft and Live **[later]**
- Production output sampling graded against the same assertions **[later]**
- Production failures filed back into the eval set **[later]**
- Gateway mode; prompt never leaves the server **[later]**

## 7. SDK and CLI

- `41p link` — pick the project, writes `.41prc` **[v1]**
- `41p pull` — generate typed bindings, lockfile, bundled fallback **[v1]**
- `41p check` — fail the build on stale bindings or missing inputs **[v1]**
- `41p run` — run the assertion suite in CI **[v1]**
- Generated typed bindings, committed to the repo **[v1]**
- Prompts referenced by globally unique id at runtime **[v1]**
- `FORTYONE_API_KEY`; test key resolves Draft, live key resolves Live **[v1]**
- Python SDK **[v1]**
- TypeScript / JavaScript SDK **[v1]**
- Untyped escape hatch: `prompts.get("slug", …)` **[v1]**
- GitHub Action **[v1.5]**
- Swift SDK, with staleness policy **[v1.5]**
- Kotlin SDK, with staleness policy **[v1.5]**
- Go, Ruby, PHP, Java, C#, Dart via codegen **[later]**

## 8. Learning

- Playable lessons inside the app **[v1]**
- Preloaded lesson workspaces with a failing assertion **[v1]**
- Run 5× variance demo with temperature control **[v1]**
- Step tracker per lesson **[v1]**
- Sandbox unlock at lesson end **[v1]**
- Cached lesson runs, cheap-model tier, daily run cap **[v1]**
- Nine-lesson foundations track **[v1]**
- Companion text page per lesson, indexed and citable **[v1]**
- 60–90 second screencast per lesson **[v1.5]**
- HeyGen translation of lesson videos **[later]**
- Certificates **[later]**

## 9. Free tools (acquisition)

- Public decompiler; paste a prompt, get it explained, no signup **[v1]**
- Shareable permalink for a decompiled prompt **[v1.5]**
- Embeddable badge / report **[later]**

## 10. Accounts, team, billing

- Projects **[v1]**
- Single admin-only publishing switch **[v1]**
- API keys per project, test and live **[v1]**
- Bring your own provider keys **[v1]**
- Usage meter: runs remaining **[v1]**
- Plans: Free, Pro, Team **[v1]**
- Shared blok library **[later]**
- Roles and granular permissions **[later]**
- SSO / SAML **[later]**
- Audit log export **[later]**

## 11. Design system

- Resolution style: Swiss-flat data surfaces, neobrutalist interactive elements **[v1]**
- Light and dark themes, designed in parallel **[v1]**
- Zero decorative saturation **[v1]**
- Reserved semantic colours: pass, fail, drift **[v1]**
- Categorical blok colours, transient only **[v1]**
- SVG illustration set, `currentColor`, empty states only **[v1]**
- Animated 41 → italic AI logo **[v1]**
- Static filled-plate favicon and app icon **[v1]**
- `prefers-reduced-motion` support throughout **[v1]**
- Keyboard operation for every interaction **[v1]**

---

## Cut, with reasons

- Phone, image and video AI testing **[cut]** — each modality is its own grader stack
- Standalone prompt quality score **[cut]** — unfalsifiable without reference outputs
- General LLM / prompting / agents curriculum **[cut]** — competes with free first-party academies
- Team collaboration in v1 **[cut]** — high cost before single-player value is proven
- Flashcards as an ideation toy **[cut]** — replaced by the blok compiler
- Skeuomorphism, neumorphism, full-strength neobrutalism for the app UI **[cut]**

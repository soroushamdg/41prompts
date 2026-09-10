# Plan — EPIC-013: Public decompiler

Branch `epic/013-decompiler-web`. Written after reading the epic, `CLAUDE.md`, ADR-003,
`docs/design/README.md`, the decompiler prototype's markup, CSS and interaction JS, EPIC-003's
`packages/ui`, EPIC-011a/011b/012a/012b's reports — and after **measuring** what a browser does to
server-rendered text, which changed the design before any of it was written.

## The measurement, first

The steer says offset-to-DOM mapping is where this will actually go wrong. It is, and the failure is
not where I expected it. I server-rendered a span for each of the four required fixture shapes and
read back `textContent`:

| input | source length | DOM length | same? |
|---|---|---|---|
| `"One.\r\nTwo.\r\n"` | 12 | **10** | **no** |
| `"One.\rTwo."` (lone CR) | 9 | 9 | **no** — every `\r` became `\n` |
| `"\tindented\t\tdeep"` | 15 | 15 | yes |
| `"See 🙂 and é and 👩‍👩‍👧"` | 26 | 26 | yes |
| `"1. أجب دائماً JSON فقط."` | 23 | 23 | yes |
| BOM, lone surrogate, nbsp, leading/trailing spaces | — | — | yes |

**Carriage returns do not survive server rendering.** React writes the raw `\r` into the HTML; the
HTML parser's input-stream preprocessing replaces `\r\n` and lone `\r` with `\n` before any script
runs. It is spec behaviour, not a React bug, and nothing in our code can prevent it short of emitting
`&#13;` through `dangerouslySetInnerHTML` — which on a public page that renders arbitrary pasted text
is the one place I am least willing to hand-roll escaping.

Two consequences, and the second is the one that would have shipped:

1. A naive `textContent === source.slice(start, end)` assertion passes on three of the four required
   fixtures and fails only on CRLF.
2. **Hydration would break on every Windows-pasted prompt.** React's expected text node holds `\r\n`
   and the DOM holds `\n`, so the first thing a stranger sees would be a hydration mismatch.

### What follows

**Offsets stay in source space. The DOM carries display text. One normalisation sits between them, in
one function, tested hard.**

```ts
/** The source as the HTML parser will represent it. The only transformation between the two. */
export function toDisplayText(text: string): string   // \r\n -> \n, lone \r -> \n. Nothing else.
```

The input itself is **not** normalised — the source stays verbatim, because EPIC-014 captures it and
because "the blok stores the verbatim span" is a house rule I would rather not erode from the edge.
Only the text handed to a DOM text node is normalised, and `Range` offsets continue to index the
original string.

The acceptance criterion becomes literally checkable in DOM space: for every range,
`span.textContent === toDisplayText(source.slice(start, end))`, plus a stronger whole-document
invariant — concatenating every piece's `textContent` reconstructs `toDisplayText(source)` exactly,
with piece boundaries in 1:1 correspondence with the ranges. Property-tested over the corpus and
generated inputs, so a future change that drops a character fails loudly.

## Two other things the prototype gets wrong for us

- **The fragment badge is a DOM child in the prototype** — `<span class="frag">1/3</span>` *inside*
  the highlighted span — which puts `"1/3"` into `textContent` and breaks the exactness criterion
  outright. Here it becomes a CSS `::after` fed by `content: attr(data-fragment)`, so the span's text
  is exactly the range. Its accessible name moves to `aria-describedby` pointing at one hidden node
  per distinct "i of n", rendered once.
- **The prototype paints severity with `--fail` and `--warn`.** Decision 4 reserves red and amber for
  fail and drift, so severity travels by position, weight and a text label instead. The prototype's
  per-kind `--kc` colour scale is also not shipped: `docs/design/README.md` records EPIC-003's
  deviation 1 as accepted, with EPIC-020 owning a real per-kind mapping. The leading marker is
  therefore **ink**, not category colour. Decision 4's "blok category colours appear only during
  interaction" is satisfied vacuously — there are none yet — and the README's correction wins, as the
  epic's notes instruct.

## Architecture

```
apps/web/app/decompile/page.tsx           server component: shell, form, sample
apps/web/app/decompile/actions.ts         "use server": the whole pipeline, returns plain data
apps/web/app/decompile/decompile-view.tsx client: useActionState, owns hover/pin state only
apps/web/app/decompile/source-map.tsx     client: pieces -> spans, roving focus, pin
apps/web/app/decompile/blok-list.tsx      client: BlokCard per blok
apps/web/app/decompile/findings-panel.tsx client: five kinds, then the closing section
apps/web/lib/decompile/view-model.ts      pure: bloks+findings+source -> plain view model
apps/web/lib/decompile/view-model.test.ts
packages/ui/src/primitives/source-map.css presentational CSS only
```

`packages/core` is imported, never reimplemented (decision 10). The server action calls
`segment → cluster → detect → heuristicSummariser` and returns **plain data**: an array of pieces,
blok cards, finding rows. The client ships no algorithm — it maps that data to DOM and tracks which
blok is hovered or pinned. `useActionState` is the Next 16 idiom for a form whose result is rendered
in place; the computation is server-side, which is what decision 1 is protecting.

### The view model

```ts
type Piece =
  | { kind: "gap"; text: string }
  | { kind: "span"; text: string; blokId: string; blokKind: BlokKind;
      fragmentIndex: number; fragmentCount: number; start: number; end: number };
```

Built by sorting every (blok, range) pair by `start` and walking the source once, emitting gap text
between ranges. Ranges across bloks are disjoint because segments are, but the walk asserts it rather
than assuming it — an overlapping range would otherwise duplicate text into the DOM.

## Decisions I am taking

- **One tab stop per blok, arrow keys within it.** `docs/design/README.md` corrects the prototype's
  `tabindex="0"` on every span, which makes a forty-span prompt forty tab stops. The blok's first
  span is tabbable; `ArrowRight`/`ArrowDown` and `ArrowLeft`/`ArrowUp` move between *that blok's*
  fragments; `Enter` pins, `Escape` unpins. That is the literal reading of "one tab stop per blok,
  arrow keys within", and it is the useful one: a rule stated in three places is one tab stop and
  three arrow presses.
- **A `role="status"` live region announces every highlight change** — "Blok 4, constraint, pinned,
  3 places highlighted." Decision 8 requires the change be announced rather than only shown.
- **The closing section's count line needs the true total**, and the detector caps at three with the
  remainder in prose. Parsing prose for a number is not acceptable, so `packages/core` gains one
  small pure export, `uncheckedRuleCount(bloks, source, findings)`, sharing the detector's candidate
  collection so there is one implementation. Rule 1 says logic that must be correct lives in core;
  this is that, not scope creep.
- **The 100 KB cap is UTF-8 bytes**, measured server-side before anything else runs, with a message
  naming both the limit and what they sent.
- **Screenshots are report evidence, not visual-regression baselines.** EPIC-003's baselines were
  generated in a Linux container to match CI, and this machine is macOS; adding `toHaveScreenshot`
  calls here would commit baselines CI cannot reproduce. The epic asks for screenshots as evidence,
  and that is what they will be.

## Build order

The steer says build the four text fixtures before the highlighting, so:

1. **`toDisplayText` and the view model, with their tests** — including the four required shapes
   (CRLF, tabs, emoji with combining marks, RTL) driven from the existing corpus fixtures
   `crlf-line-endings`, `tab-indented`, `emoji-and-combining`, `right-to-left`, plus the
   reconstruction property over all corpus prompts and generated inputs.
2. **The fixture debt** — two multimodal and two expectation prompts into the EPIC-010 corpus, their
   segments into the labelled table, accuracy re-run and both numbers reported. This ripples: the
   corpus goes from 25 to 29 prompts, so the detector audit counts, the perf inputs and every "25
   fixtures" in prose move with it.
3. **`uncheckedRuleCount`** in core.
4. **The route**: server action, page, form, empty state, over-length state.
5. **Source map** with markers, pin, roving focus, live region.
6. **Blok cards** with summary source as plain text, and the range count.
7. **Findings panel** with the closing section and the cross-kind `repeated` card.
8. **The guards**: the green/red/amber grep over the route, the "no algorithm in apps/web" test, the
   dependency-cruiser rule, `CLAUDE.md`'s vocabulary correction (EPIC-012b ruling 2).
9. **e2e**: paste → result, the four highlight behaviours, hover-back, empty/whitespace/over-length,
   axe in both themes, keyboard, 44px targets, reduced motion.
10. Report, session log, backlog; then staging and the screenshot after merge.

## Out of scope, and I will not drift into it

Permalinks, capture, purge, rate limits, Turnstile, abuse checks (EPIC-014). `llms.txt`, the article,
the funnel (EPIC-015). Landing page, nav, footer, sign in (EPIC-016). Editing a blok (Stage 2). Any
use of green, red or amber. The prototype's "Dim the rest" and "Edit source" toggles are interaction
the epic does not ask for; the dim affordance is in the backlog line for this epic but not in the
epic's own Scope or criteria, so it is built only if it costs nothing — noted in the report either
way.

## Where I would stop

If the CRLF finding turned out to make the exactness criterion unmeetable in substance — if
highlights could drift by a character on real input — that is a `BLOCKER-EPIC-013.md`, not a
workaround. It does not: offsets never touch the DOM, so the normalisation is a display concern and
the criterion is met in DOM space. I am proceeding, and saying so here so the reasoning is on the
record before the code rather than after it.

<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Landing-page parity: every remaining difference, and the plan to close it

**Written 2026-09-21**, after Soroush's instruction: *"I want the same properties in the implemented
landing page as in the mockup; I want no difference."*

EPIC-016b and EPIC-016c closed the structural gap — the product shot, the run demo, failure
attribution, the provider comparison and the five-tab rotator are all built and merged. What follows
is **everything still different**, counted rather than remembered: the mockup's home page and the
built one were rendered side by side at 1440px and compared element by element.

**Twenty-three differences.** Nineteen are plain work. Four need a word from Soroush, and they are
marked **[ASK]** — not because they are hard, but because each one publishes something about the
company that is not currently true, or reverses a decision he made himself.

## The one thing that decides how big this is

**Five of the differences are links to pages that do not exist.** The mockup's nav carries `Pricing`
and `Learn`; its footer carries `Pricing`, `Lessons`, `Blog`, `About` and `Careers`; and its home
page has a lessons teaser with three lesson cards and a `Browse lessons` button.

So *"no difference on the landing page"* transitively requires:

| Needed by the landing page | Epic | Size |
|---|---|---|
| `/pricing` | **EPIC-070** Stripe and the pricing page | M |
| `/about`, `/careers` | **EPIC-072b** | S |
| `/blog` | EPIC-073 (real content from real run data) | S |
| `/learn` + nine lessons + the lesson engine | Stage 7: EPIC-064, 060, 061, 062, 063 | M + M + M + M + S |

The landing page itself is **two epics**. Everything it links to is **seven more**. That is not an
argument against doing it — it is the sequencing fact that decides whether "no difference" lands in
two days or in several weeks, and Soroush should pick the order knowing it.

`docs/design/README.md` already covers the general case: *"a nav link to a 404 is worse than no
nav"* (EPIC-016), which is why those links were left out rather than stubbed.

---

## The twenty-three differences

### A. Nav — 6 differences

| # | Mockup | Built | Blocked on |
|---|---|---|---|
| A1 | `Product` link (first item, points home) | absent | — |
| A2 | `Pricing` link | absent | **EPIC-070** |
| A3 | `Learn` link | absent | **Stage 7** |
| A4 | `Sign in` is a bordered `.btn sm` | plain text link | — |
| A5 | `Start free` primary button | absent | — |
| A6 | order is Product · Features · Delivery · Pricing · Learn · Docs | Features · Delivery · Docs · Decompiler | — |

`Decompiler` is in the built nav and **not** in the mockup. Parity means removing it — but it is the
one link that goes to the product's only public tool, and EPIC-072 added it deliberately. **Flagging
rather than deciding:** it stays unless Soroush says otherwise.

### B. Hero — 7 differences

| # | Mockup | Built |
|---|---|---|
| B1 | eyebrow *"The workbench for the prompt layer"* | absent |
| B2 **[ASK]** | *"Stop guessing which prompt works."* | *"A prompt change ships. Nothing checks it. You find out from a user."* |
| B3 | lede: *"Break any prompt into bloks…"* | *"Paste a prompt you already run…"* |
| B4 | two CTAs — `Paste a prompt, free`, `See the workbench` — plus a `No credit card` pill | one paste box |
| B5 | Ask-AI bar: `ASK AI` prefix, input, `Ask →`, rotating placeholder | replaced by the paste box |
| B6 | four Ask suggestion chips under the bar | chips exist, but lower on the page |
| B7 **[ASK]** | trust row: NORTHWIND · OAKLINE · MERIDIAN AI · CASTELL · BLUEPRINT | absent |

**B2 is a reversal of Soroush's own decision** of 2026-09-11. EPIC-016 drafted five headlines and
shipped this one; `page.test.tsx` pins it with *"if this sentence changes, it changes because
Soroush replaced it, not because somebody tidied the hero."* Changing it is one line plus the test —
but it should be him changing it, not me reading "no difference" as permission.

**B7 names five companies as customers.** They are invented. I can build the row in an afternoon;
I cannot supply the names. Either Soroush gives five real ones, or the row ships with the mockup's
fictional names as a deliberate placeholder he has approved, or it stays out. `page.test.tsx`
denylists `trusted by` and would have to be narrowed, which is a change worth making *visibly*.

**B4/B5 together are a real product question, not a style one.** The mockup has the Ask-AI bar
*and* two buttons; the built page has a paste box that is the product's actual first action.
Full parity means the hero no longer accepts a prompt. **Recommendation: keep the paste box and add
the mockup's two CTAs and the Ask bar beneath it** — that is a superset rather than a swap, and the
only thing it loses is the mockup's exact vertical order.

### C. The product shot — 2 differences

| # | Mockup | Built |
|---|---|---|
| C1 | pane bar shows `read-only` pill, `1,284 tok`, `6 bloks`, and a `Run 6 assertions` button | plainer chrome, no token count, no run button |
| C2 **[ASK]** | every blok card has a **persistent** coloured left rail and coloured kind tag | ink only; colour on interaction |

**C1 carries two vocabulary problems.** `Run 6 assertions` uses a word ADR-003 forbids in UI strings
— `pnpm forbidden-words` fails the build on it — so it becomes `Run 6 checks`. And `1,284 tok` is a
token count this repository cannot compute honestly (no tokenizer in `packages/core`; the only
estimator calls itself *"deliberately crude"* in its own comment and `apps/web` may not import it).
Inside a surface marked `Example` that is fine — it is sample data, like every other figure in the
shot. **So C1 is buildable as drawn**, with `assertions` → `checks`.

**C2 is the colour difference Soroush is seeing**, and it collides with a rule he wrote.
`CLAUDE.md` rule 10: *green, red and amber mean pass, fail and drift. Nothing else may use them.*
The mockup's palette violates it literally:

```
[data-k=expected] { --kc: #0B5C2E }   /* this is --color-pass, exactly */
[data-k=example]  { --kc: #8A5A00 }   /* this is --color-warn, exactly */
```

**There is a version of this that is pure win**, and it is the recommendation: EPIC-021a already
shipped a six-hue palette drawn from blue, violet, magenta and clay, deliberately nowhere near the
three reserved hues, measured to 3:1 against surface. Making *that* palette persistent gives the
mockup's look with none of the collision. What cannot be done without changing rule 10 is copying
`--kc`'s literal values.

Three options, and Soroush picks:

1. **Persistent, EPIC-021a's palette** — the mockup's visual effect, rule 10 intact. *Recommended.*
2. **Persistent, the mockup's literal hexes** — requires amending rule 10 and `docs/design/README.md`,
   and pass/fail/drift lose their exclusive meaning across the whole product.
3. Leave it interaction-only.

### D. Sections — 4 differences

| # | Mockup | Built |
|---|---|---|
| D1 **[ASK]** | three counters: *1,240,000 prompts decompiled* · *38% contain a contradiction* · *4s median rollback* | three true sentences under *"Nothing here is coming soon."* |
| D2 | strip reads **Decompile · Assert · Ship** | **Paste · See the bloks · Add the check** |
| D3 | lessons teaser: *"Learn by breaking things"*, three lesson cards with progress bars, `Browse lessons` | absent |
| D4 | final CTA: *"Paste a prompt. See what is wrong with it."* + `Open the decompiler` **and** `See pricing` | different heading, one button |

**D1 is three fabricated statistics.** 1,240,000 decompiles when the real number is small; a 38%
finding from a corpus study nobody ran; a 4-second median from no measurement. Marking them
`Example` empties them — a counter's whole content is *this is a real measurement*. The options are
the same shape as B7: real numbers, approved placeholders, or leave them out.

**D2 is free** — `Assert` is not a forbidden word and the three titles are structural copy, not
claims. Straight rename.

**D3 needs Stage 7.** The teaser names three lessons with progress bars; a teaser for nine lessons
that do not exist is the clearest possible case of the rule EPIC-016 was built on.

**D4's second button** needs `/pricing`.

### E. Footer — 3 differences

| # | Mockup | Built | Blocked on |
|---|---|---|---|
| E1 | Product group has `Pricing` | absent | EPIC-070 |
| E2 | Learn group has `Lessons`, `Blog` | absent | Stage 7, EPIC-073 |
| E3 | Company group has `About`, `Careers` | absent | EPIC-072b |

Also cosmetic and free: the blurb (*"The workbench for the prompt layer. Made in Montréal."* vs
*"Paste a prompt. See what nothing checks."*) and the © line (`© 2026 41Prompts` vs
`© 2026 41Prompts Inc.` — the built one is more correct now that the entity exists, and I would keep
it).

### F. Vocabulary — 1 difference

| # | Mockup | Built |
|---|---|---|
| F1 | `Run 6 assertions` | ADR-003 forbids "assertion" in UI strings |

Not negotiable without amending ADR-003: `pnpm forbidden-words` is wired into `pnpm compliance`,
`compliance.yml` and `gates.mjs`'s CI list. `Run 6 checks` is the same sentence.

---

## The plan

### EPIC-016d — the landing page, everything that needs nothing else · **M**

Closes A1, A4, A5, A6, B1, B3, B4, B5, B6, C1, C2, D2, D4-heading, E-cosmetics, F1 — **fifteen of
the twenty-three**, and every one of the four **[ASK]** items Soroush approves.

1. **Nav**: add `Product`, promote `Sign in` to a bordered button, add `Start free`, reorder.
   `Start free` goes to `/sign-up`, which exists.
2. **Hero**: the eyebrow, the mockup's lede, the two CTAs and the `No credit card` pill, the Ask-AI
   bar with its rotating placeholder and its four suggestion chips. The paste box stays (see B4/B5).
3. **Product shot**: the pane bar's `read-only` pill, token count and `Run 6 checks` button, all
   inside the existing `Example` marker.
4. **Blok kind colour**, persistent, per Soroush's answer to C2.
5. **Strip** renamed to Decompile · Assert · Ship.
6. **Final CTA** heading to the mockup's.
7. **Footer** blurb.

Gates that will bite and are already known: `forbidden-words` on F1; `page.test.tsx`'s number rule on
the token count (inside `Example`, so covered); `site-claims.test.tsx` if any new sentence is a
claim; and the two Linux visual baselines for `/`, which **will** move and need regenerating in
`mcr.microsoft.com/playwright:v1.63.0-noble`.

### EPIC-072b — About and Careers · **S**

Already written and scoped. Closes E3, and its two rulings are already on file from 2026-09-20.

### EPIC-070 — Stripe and the pricing page · **M**

Already written and scoped. Closes A2, D4's second button, E1.

### EPIC-073b — the blog, with real posts · **S**

Closes E2's `Blog`. Needs content Soroush approves; EPIC-073 owns it.

### Stage 7 — EPIC-064, 060, 061, 062, 063 · **M + M + M + M + S**

Closes A3, D3, E2's `Lessons`. This is the long pole, and nothing else in the list depends on it.

### EPIC-016e — the last three · **S**

The **[ASK]** items, once Soroush has answered: the trust row (B7), the counters (D1), the hero
headline (B2). Separate epic on purpose — each is a public claim about the business, and they should
land in a change whose commit message says exactly who decided and when, rather than buried in a
fifteen-item parity sweep.

---

## What Soroush needs to answer

Four questions, and the first three are the same question in three places: **does the site say a
thing that is not true yet, and if so under what label?**

1. **B7 — the trust row.** Five real customer names, the mockup's five fictional ones as an approved
   placeholder, or leave it out?
2. **D1 — the three counters.** Real numbers, approved placeholders, or the three true sentences
   that stand there now?
3. **B2 — the hero headline.** Back to *"Stop guessing which prompt works."*, or keep the one he
   chose on 2026-09-11?
4. **C2 — blok kind colour.** EPIC-021a's palette made persistent (recommended), the mockup's
   literal hexes plus an amendment to rule 10, or leave it interaction-only?

And one sequencing decision: **does EPIC-016d go first** — fifteen differences closed in one M — or
does the whole thing wait until Stage 7 and EPIC-070 have landed so that parity arrives complete?
Recommendation: 016d first. It is the largest visible change per unit of work, and it leaves the
remaining gaps as absent links rather than broken ones.

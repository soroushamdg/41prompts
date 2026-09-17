// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { BlokKind } from "../classify/types.js";

/**
 * A blok as a thing **in a prompt**: it owns its own text, and its place in the order.
 *
 * ## Why this is not `Blok`
 *
 * `Blok` (`cluster/types.ts`) is a blok as **found in a source**: a kind and a set of ranges into
 * text it does not own, with an id derived from its own content so that decompiling the same prompt
 * twice yields the same ids and a diff of two runs is empty.
 *
 * That id rule is exactly wrong here. A blok on a canvas must keep its identity **while its text
 * changes** — a `CompiledSpan` refers to it by id, and EPIC-021a will store it in a row somebody
 * edits. A content-derived id would make every keystroke a different blok, orphan its span, and
 * throw away its cached output. So `PromptBlok.id` is **supplied by the caller and opaque to this
 * package**: it is whatever EPIC-021a's row id is. Unique within one blok set, and nothing else is
 * assumed about it.
 *
 * The two types stay separate rather than one type with optional halves, because a single type
 * would let a blok exist with neither ranges nor text, and every consumer would then have to handle
 * a blok that is neither thing.
 */
export interface PromptBlok {
  /** Stable across edits to `text`. Not derived from content — see above. */
  readonly id: string;
  readonly kind: BlokKind;
  /** Verbatim. The compiler emits it unchanged and never paraphrases it (`CLAUDE.md` rule 3). */
  readonly text: string;
  /**
   * Explicit position in the prompt (decision 10), **not** the array index.
   *
   * Array position is the caller's incidental ordering — a database row order, the order a UI
   * happened to fetch in — and compiling by it would make the output depend on something nobody
   * chose. `compile()` sorts by this, breaking ties by `id` so that two bloks sharing an order
   * still compile deterministically rather than in whatever order the array arrived in.
   */
  readonly order: number;
}

/** Whether the compiler still owns this span, or a person has taken it (ADR-003's two words). */
export type SpanState = "compiled" | "edited by hand";

/**
 * One blok's contribution to the compiled prompt: its text, and the separator that follows it.
 *
 * ## Offsets
 *
 * `start`, `textEnd` and `end` are **UTF-16 code unit indices** into `Compiled.text`, the same
 * convention `Segment` and `Range` use, so `text.slice(start, end)` is this span's whole
 * contribution and `text.slice(start, textEnd)` is the blok's own text. Half-open at both levels.
 *
 * ## Why a span owns its separator
 *
 * The spans tile `text` exactly — no gaps, no overlaps (`invariants.ts` explains what a gap costs).
 * The compiler joins bloks with `BLOK_SEPARATOR`, so those characters belong to some span or the
 * tiling is false on the first two-blok prompt. They belong to the span **before** them, and
 * `textEnd` is the boundary, so the blok's verbatim text stays nameable and `editSpan` can replace
 * it without the caller ever handling the separator.
 *
 * Every span carries a separator, the last one included, so `text` ends with `BLOK_SEPARATOR`. A
 * final span with no separator would make a span's shape depend on where it sits, and reordering
 * would then change span *widths* rather than only their offsets.
 */
export interface CompiledSpan {
  readonly blokId: string;
  /** Inclusive start of this span's whole contribution. */
  readonly start: number;
  /** End of the blok's own text; `[textEnd, end)` is the separator. */
  readonly textEnd: number;
  /** Exclusive end of this span's whole contribution. */
  readonly end: number;
  /**
   * The blok's content hash **as of the moment this span was compiled** — and, for a span edited by
   * hand, as of the moment of the edit.
   *
   * This is the whole mechanism behind the second of the two facts `drift()` reports. Keeping the
   * hash the person was looking at is what lets the product say "the blok has changed since you
   * edited this", which is a different sentence from "what is here is not what the blok says".
   */
  readonly hash: string;
  readonly state: SpanState;
}

/**
 * The eight check kinds, as internal identifiers.
 *
 * ADR-003 fixes the **phrases**; these are the identifiers behind them, and ADR-003 is explicit that
 * internal identifiers never render. `CHECK_KIND_PHRASES` is the only bridge between the two.
 */
export type CheckKind =
  | "json_shape"
  | "allowed_values"
  | "word_limit"
  | "character_limit"
  | "must_contain"
  | "must_not_contain"
  | "matches_pattern"
  | "refuses_to_answer";

/**
 * All eight, at runtime.
 *
 * **This list is defended, and `CLAUDE.md` says why.** The same set was once written down as a
 * sample of four, read as the whole set, and EPIC-012b went looking for a phrase for a prohibition
 * and concluded none existed — when "must not contain" had been in ADR-003 the whole time. A list
 * that can quietly disagree with its decision record gets an exhaustiveness guard and a test.
 */
export const CHECK_KINDS = [
  "json_shape",
  "allowed_values",
  "word_limit",
  "character_limit",
  "must_contain",
  "must_not_contain",
  "matches_pattern",
  "refuses_to_answer"
] as const satisfies readonly CheckKind[];

/**
 * Compile-time exhaustiveness, the same construction `FINDING_KINDS` uses: if `CheckKind` gains a
 * member `CHECK_KINDS` does not list, this resolves to `never` and the assignment stops compiling.
 */
type EveryCheckKindListed = Exclude<CheckKind, (typeof CHECK_KINDS)[number]> extends never ? true : never;
const _everyCheckKindListed: EveryCheckKindListed = true;
void _everyCheckKindListed;

/** ADR-003's plain phrases, verbatim. The identifiers above never reach a screen. */
export const CHECK_KIND_PHRASES: Readonly<Record<CheckKind, string>> = {
  json_shape: "valid JSON shape",
  allowed_values: "one of the allowed values",
  word_limit: "word limit",
  character_limit: "character limit",
  must_contain: "must contain",
  must_not_contain: "must not contain",
  matches_pattern: "matches a pattern",
  refuses_to_answer: "refuses to answer"
};

/**
 * What an `expected` blok compiles to instead of text.
 *
 * **Modelled here, executed in EPIC-030.** This epic's job is that an expected blok emits a check
 * and no text; grading one is a different epic and a different type.
 */
export interface Check {
  /** Content-derived and stable, so a check can be linked to and referred to across a recompile. */
  readonly id: string;
  /** The expected blok this came from. */
  readonly blokId: string;
  /** The blok's verbatim text — what the check is about, never a paraphrase of it. */
  readonly text: string;
  /**
   * Which of the eight, **when one of them can honestly be named**.
   *
   * Absent rather than defaulted. Deriving the kind uses `detect/rule-shapes.json`, which is already
   * the committed map from rule text to the check that would cover it; when no shape matches there
   * is no honest answer. Inventing a ninth kind would contradict ADR-003 and `CLAUDE.md`, and
   * defaulting to `must_contain` would assert a substring nobody wrote.
   *
   * **Provisional.** EPIC-030 owns the real check model and may narrow or replace this; the
   * kindless ones are the obvious work for EPIC-033's judge.
   */
  readonly kind?: CheckKind;
}

/**
 * A compiled prompt: the text, the spans that tile it, and the checks its expected bloks became.
 *
 * **Derived, never a source of truth.** The blok set is the truth (decision 2); this is what it
 * compiles to. A span edited by hand is an exception the model *records* — it is not a second truth
 * to be merged back, and there is no merge anywhere in this package.
 */
export interface Compiled {
  readonly text: string;
  readonly spans: readonly CompiledSpan[];
  readonly checks: readonly Check[];
}

/** Content-hash cache of rendered span text, owned by the caller so `compile()` stays pure. */
export type SpanCache = Map<string, string>;

/**
 * One span a person took by hand, as the two things a hand edit actually *is*.
 *
 * `text` is what they typed. `hash` is the blok's hash **at the moment they typed it** — the value
 * `editSpan` retains, and the whole mechanism behind `drift()`'s second fact. Carrying both forward
 * is what lets "the blok has changed since you edited this" still be answerable after a recompile;
 * carrying only the text would make every recompile look like a fresh edit.
 */
export interface KeptSpan {
  readonly text: string;
  readonly hash: string;
}

/**
 * Hand-edited spans to carry through a recompile, keyed by blok id.
 *
 * **A map rather than a previous `Compiled` (EPIC-021a decision 5, candidate A refined).** The note
 * in `docs/epics/notes-EPIC-021b.md` proposed passing the previous compiled prompt; a map is the same
 * idea narrowed to what it needs, and narrower matters for two reasons. It is **serialisable**, so
 * the same value survives a page load and can be rebuilt from database rows — which is where
 * EPIC-021a keeps it, one hand edit per blok row. And it carries nothing that can go stale on its
 * own: a whole `Compiled` holds offsets and a text that are meaningless against a different blok set.
 */
export type KeptSpans = ReadonlyMap<string, KeptSpan>;

export interface CompileOptions {
  /**
   * Optional `hash → rendered text` cache (`CLAUDE.md` rule 4).
   *
   * Passed in rather than held in module state: a cache inside this package would be shared by every
   * prompt in a process, would survive between tests, and would make `compile()` impure in the one
   * way that matters — two identical calls could take different paths. The caller owns it, so a test
   * can look inside it and prove the other spans were served rather than recompiled.
   */
  readonly cache?: SpanCache;
  /**
   * Hand-edited spans to carry through this compile (EPIC-021a decision 5).
   *
   * **This is the option that stops a recompile losing somebody's typing.** Without it `compile()`
   * is a fresh compile and always returns fully `compiled` spans, so adding one blok to a prompt
   * that has hand-edited spans silently discards every one of them: the prompt recompiles, the text
   * looks plausible, and the sentence a person wrote is gone. Nothing throws.
   *
   * Omitting it keeps the old behaviour exactly — `compile(bloks)` is still a fresh compile, and
   * still a pure function of the blok set alone.
   *
   * **Corrected by EPIC-050, 2026-09-16.** This paragraph used to say that EPIC-050's artifact
   * builder wants the fresh compile, because it "publishes what the bloks say and should not
   * accidentally publish an exception somebody made in an editor". That reading did not survive
   * EPIC-040: a run sends `suite_runs.promptText`, which is the version's `compiledText`, which
   * `snapshot()` compiles **with** the hand edits. An artifact that dropped them would publish text
   * nobody ever ran, which is the opposite of what a publish gate is for. So `artifactOf` takes a
   * `Compiled` from its caller and the caller passes the one the version holds — and `ArtifactSpan`
   * carries `state` precisely so a reader can see which spans a person wrote.
   *
   * An entry is **ignored, not resurrected**, when its blok is no longer in the set or has become
   * `expected` — a kept edit is an exception to a blok's compiled output, so with no blok there is
   * nothing for it to be an exception to.
   */
  readonly keep?: KeptSpans;
}

/**
 * The two facts about one span, plus the state needed to tell two of the four cells apart.
 *
 * `drift.ts` carries the table and the worked case for each cell. The short version: these two
 * booleans are **independent**, a single "out of date" flag cannot hold both, and the case that
 * proves it is a blok whose kind changed — its hash moves and its rendered text does not.
 */
export interface SpanDrift {
  readonly blokId: string;
  readonly state: SpanState;
  /** What is in the output is not what this blok compiles to **now**. */
  readonly textDiffersFromBlok: boolean;
  /** The blok has changed since this span was compiled, or since a person edited it. */
  readonly blokChangedSinceSpan: boolean;
}

/** What `drift()` answers. Derived on demand from hashes; never stored, never subscribed to. */
export interface DriftReport {
  readonly spans: readonly SpanDrift[];
  /** Bloks that emit text but own no span: added since this was compiled. `expected` bloks are not listed. */
  readonly addedBlokIds: readonly string[];
  /** Spans whose blok is no longer in the blok set: deleted since this was compiled. */
  readonly removedBlokIds: readonly string[];
}

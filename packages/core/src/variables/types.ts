// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * One `{{name}}` written somewhere in a prompt.
 *
 * ## Offsets are into the blok, not into the compiled prompt
 *
 * `start` and `end` are UTF-16 code unit indices into the text this occurrence was found in — the
 * same convention `Segment`, `Range` and `CompiledSpan` use — and they cover the **whole** brace
 * form, `{{` to `}}` inclusive at the start and half-open at the end, so `text.slice(start, end)` is
 * what a rename replaces.
 *
 * Compiled-text offsets would have been the wrong choice even though the compiled text is what
 * ships: they move whenever any earlier blok changes by a character, and the surface that has to
 * point at a variable is the canvas, where a person edits the blok. A blok offset is stable until
 * that blok itself is edited.
 */
export interface VariableOccurrence {
  readonly blokId: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  /**
   * The name alone, without the braces or the whitespace around it.
   *
   * Carried so that a rename replaces **only the name**, leaving `{{ customer_name }}`'s inner
   * spacing exactly as the author typed it. Reconstructing the brace form from the new name would
   * work and would quietly reformat somebody's prompt, which a rename has no business doing.
   */
  readonly nameStart: number;
  readonly nameEnd: number;
  /**
   * Which text this was found in.
   *
   * A hand-edited span replaces its blok's compiled output, so a `{{customer}}` typed into a hand
   * edit **ships** and one edited out of a blok **does not** — whatever the blok's own text still
   * says. Both are uses or non-uses accordingly, and the surface needs to know which text to open
   * when somebody clicks the occurrence.
   */
  readonly source: "blok" | "edited by hand";
}

/**
 * A variable somebody declared: a name, a default, and a description. That is the whole of v1.
 *
 * **No value type, on purpose (EPIC-022 ruling Q1).** A type is a compatibility surface — the thing
 * EPIC-050's contract check would compare a caller's arguments against — and EPIC-050 freezes the
 * artifact format. Shipping a type we had not thought hard about would freeze it too. The artifact
 * carries a reserved `type` field so that adding one later is a field starting to be populated
 * rather than a breaking change; see `artifact/schema.ts`.
 *
 * **`optional` is not a field**, it is a question about `defaultValue`. Two fields could contradict
 * each other — optional with no default, required with one — and then something has to decide which
 * of them is the truth. `isOptional()` below is that question, asked once.
 */
export interface VariableDeclaration {
  readonly name: string;
  /** `null` means the caller must supply it. Any string, including `""`, means they need not. */
  readonly defaultValue: string | null;
  readonly description: string | null;
}

/** A variable need not be supplied exactly when it has a default to fall back on. */
export function isOptional(declaration: VariableDeclaration): boolean {
  return declaration.defaultValue !== null;
}

/**
 * The two ways a variable set and a prompt can disagree.
 *
 * **These are not `Finding`s and must never become one** (ADR-003, 2026-09-13). A finding is a claim
 * about prose we did not write — heuristic, about someone else's writing, six of them, promised in
 * public copy. This is a decidable fact about a structure this product owns: a name is in one set
 * and not the other, in one pass, with no judgement involved.
 */
export type VariableIssueKind = "used_but_not_declared" | "declared_but_not_used";

export interface VariableIssue {
  readonly kind: VariableIssueKind;
  readonly name: string;
  /**
   * Every place the name is written. **Empty for `declared_but_not_used`** — that is the whole of
   * what that issue means, and an empty array says it better than an optional field would.
   */
  readonly occurrences: readonly VariableOccurrence[];
}

/** What a prompt declares, in name order so two equal sets serialise identically. */
export type VariableSchema = readonly VariableDeclaration[];

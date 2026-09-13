import { BLOK_KINDS } from "@41prompts/core";
import type { Blok, BlokKind, Finding, FindingKind, Range, Severity } from "@41prompts/core";

/**
 * The decompiler's view model: everything `/decompile` renders, as plain data.
 *
 * `packages/core` does the thinking (`CLAUDE.md` rule 1, epic decision 10); this turns its output
 * into something a React tree can render without knowing anything about segmentation, clustering or
 * detection. It is pure and synchronous so it can be unit-tested without a browser, and so the
 * server action stays a thin call sequence.
 */

// One home for the source-to-DOM transformation; imported for use here and re-exported so this
// module's existing importers are unchanged. See `lib/site/display-text.ts` for why it exists.
import { toDisplayText } from "../site/display-text";

export { toDisplayText };

/** One run of the source map: either unclaimed text, or a range some blok owns. */
export type Piece =
  | { readonly kind: "gap"; readonly text: string }
  | {
      readonly kind: "span";
      readonly text: string;
      readonly blokId: string;
      readonly blokKind: BlokKind;
      /** 1-based, for the `2/3` badge. */
      readonly fragmentIndex: number;
      readonly fragmentCount: number;
      readonly start: number;
      readonly end: number;
    };

/** A blok as its card renders it. */
export interface BlokView {
  readonly id: string;
  readonly kind: BlokKind;
  readonly summary: string;
  /** Plain words, never a badge or an icon (epic decision 6). */
  readonly summarySource: "rule" | "model";
  readonly rangeCount: number;
  readonly words: number;
}

/** A finding as its row renders it. */
export interface FindingView {
  readonly id: string;
  readonly kind: FindingKind;
  readonly severity: Severity;
  readonly message: string;
  readonly suggestion?: string;
  /**
   * The kinds of every blok this finding names, deduplicated and in blok order.
   *
   * Carried because of EPIC-012a's presentation debt: a `repeated` finding reports the pair
   * clustering *refused*, which by construction is a pair whose kinds differ — so a card reading
   * "these two bloks say the same thing" is unreadable unless it shows that one is context and the
   * other a constraint.
   */
  readonly blokKinds: readonly BlokKind[];
  readonly blokIds: readonly string[];
  readonly firstRange?: Range;
}

export interface DecompileView {
  readonly pieces: readonly Piece[];
  readonly bloks: readonly BlokView[];
  /** The five defect kinds, in `detect()` order. */
  readonly findings: readonly FindingView[];
  /** `rule_without_check`, which closes the panel rather than crowding it (epic decision 5). */
  readonly uncheckedRules: readonly FindingView[];
  /** Every rule nothing checks, including the ones the detector capped away. */
  readonly uncheckedRuleTotal: number;
  readonly stats: {
    readonly words: number;
    readonly bloks: number;
    readonly spans: number;
    readonly findings: number;
  };
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Walk the source once, emitting the text between ranges and the ranges themselves.
 *
 * Ranges across bloks are disjoint because the segments they came from are, but this asserts it
 * rather than trusting it: a range starting before the cursor would otherwise emit the same
 * characters twice and every offset after it would be wrong by that much. Dropping it keeps the
 * reconstruction invariant true, which is the property the highlight-exactness test rests on.
 */
export function buildPieces(bloks: readonly Blok[], source: string): Piece[] {
  const owned = bloks
    .flatMap((blok) =>
      blok.ranges.map((range, index) => ({
        blokId: blok.id,
        blokKind: blok.kind,
        fragmentIndex: index + 1,
        fragmentCount: blok.ranges.length,
        start: range.start,
        end: range.end
      }))
    )
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const pieces: Piece[] = [];
  let cursor = 0;

  for (const range of owned) {
    if (range.start < cursor || range.end > source.length || range.end <= range.start) continue;
    if (range.start > cursor) {
      pieces.push({ kind: "gap", text: toDisplayText(source.slice(cursor, range.start)) });
    }
    pieces.push({
      kind: "span",
      text: toDisplayText(source.slice(range.start, range.end)),
      blokId: range.blokId,
      blokKind: range.blokKind,
      fragmentIndex: range.fragmentIndex,
      fragmentCount: range.fragmentCount,
      start: range.start,
      end: range.end
    });
    cursor = range.end;
  }

  if (cursor < source.length) pieces.push({ kind: "gap", text: toDisplayText(source.slice(cursor)) });
  return pieces;
}

export interface BuildViewInput {
  readonly source: string;
  readonly bloks: readonly Blok[];
  readonly findings: readonly Finding[];
  readonly summaries: ReadonlyMap<string, { readonly text: string; readonly source: "heuristic" | "model" }>;
  readonly uncheckedRuleTotal: number;
}

/** The five kinds that report a defect. `rule_without_check` is the sixth and is not one of them. */
const DEFECT_KINDS: readonly FindingKind[] = ["repeated", "contradiction", "untestable", "padding", "too_long"];

export function buildView(input: BuildViewInput): DecompileView {
  const { source, bloks, findings, summaries, uncheckedRuleTotal } = input;
  const kindOf = new Map(bloks.map((blok) => [blok.id, blok.kind] as const));

  const toFindingView = (finding: Finding): FindingView => ({
    id: finding.id,
    kind: finding.kind,
    severity: finding.severity,
    message: finding.message,
    ...(finding.suggestion === undefined ? {} : { suggestion: finding.suggestion }),
    blokKinds: [...new Set(finding.bloks.map((id) => kindOf.get(id)).filter((kind): kind is BlokKind => kind !== undefined))],
    blokIds: [...finding.bloks],
    ...(finding.ranges[0] === undefined ? {} : { firstRange: finding.ranges[0] })
  });

  const pieces = buildPieces(bloks, source);

  return {
    pieces,
    bloks: bloks.map((blok) => {
      const summary = summaries.get(blok.id);
      return {
        id: blok.id,
        kind: blok.kind,
        summary: summary?.text ?? "",
        summarySource: summary?.source === "model" ? "model" : "rule",
        rangeCount: blok.ranges.length,
        words: blok.ranges.reduce((total, range) => total + wordCount(source.slice(range.start, range.end)), 0)
      };
    }),
    findings: findings.filter((finding) => DEFECT_KINDS.includes(finding.kind)).map(toFindingView),
    uncheckedRules: findings.filter((finding) => finding.kind === "rule_without_check").map(toFindingView),
    uncheckedRuleTotal,
    stats: {
      words: wordCount(source),
      bloks: bloks.length,
      spans: pieces.filter((piece) => piece.kind === "span").length,
      findings: findings.length
    }
  };
}

/** A run of bloks sharing a kind, for the grouped view. */
export interface BlokGroup {
  readonly kind: BlokKind;
  readonly bloks: readonly BlokView[];
}

/**
 * Group bloks by kind for the canvas, in `BLOK_KINDS` order.
 *
 * The order comes from `packages/core`, not from a list retyped here: `BLOK_KINDS` is already
 * context → constraint → example → expected → image_ref → image_input, which is the order
 * `CLAUDE.md` names and the order asked for. A second copy would be one rename away from disagreeing
 * with the type it is supposed to mirror.
 *
 * **A kind with no bloks is omitted, not rendered empty.** A heading reading "expected 0" on a prompt
 * that has no checks would be the decompiler's most important finding demoted to a grey zero — that
 * argument belongs to the findings panel's closing section, which makes it properly.
 *
 * Source order is preserved inside each group, so a group is a filter over the canvas rather than a
 * re-sort of it: the reader can still find a blok by where it was in their prompt.
 */
export function groupBloksByKind(bloks: readonly BlokView[]): BlokGroup[] {
  const groups: BlokGroup[] = [];
  for (const kind of BLOK_KINDS) {
    const members = bloks.filter((blok) => blok.kind === kind);
    if (members.length > 0) groups.push({ kind, bloks: members });
  }
  return groups;
}

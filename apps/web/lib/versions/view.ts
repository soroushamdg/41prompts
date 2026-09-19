import type { BlokKind, VersionDiff } from "@41prompts/core";
import type { VersionPassRate, VersionRow, SuiteRunRow } from "@41prompts/db";

/**
 * **Where a version's facts become English.**
 *
 * The same split `lib/runs/view.ts` makes: `packages/core` and `packages/db` state what is true —
 * an ordinal, a set of added and removed and changed and moved bloks, a count of results by outcome
 * — and none of them writes prose. Turning those into sentences happens here, pure, so every
 * sentence has a test rather than a screenshot.
 *
 * Two rules from `CLAUDE.md` bind this file harder than most:
 *
 * **Rule 10, colour.** Green, red and amber mean pass, fail and drift and nothing else. A pass rate
 * is a *measurement*, not a verdict — the mockup paints 81.7% red and 88.0% amber, and both are
 * wrong here: amber would claim drift, and red would claim a failure against a bar nobody has set.
 * So nothing in this file returns a colour, and the page renders a pass rate in ordinary ink.
 *
 * **ADR-003, vocabulary.** Every version is `Draft vN`, because `Live vN` means published and
 * nothing in this product has ever been published. Never "current", never "latest", never "unsaved".
 */

/** How a version's identity reads. One vocabulary across the editor, Versions and Deploy. */
export function versionName(version: Pick<VersionRow, "n">): string {
  return `Draft v${version.n}`;
}

export interface VersionRowView {
  readonly id: string;
  readonly n: number;
  /** `Draft vN`. */
  readonly name: string;
  readonly note: string | null;
  /** ISO minute, the same shape the run history uses, so two lists of times agree. */
  readonly when: string;
  /** What has been scored against this version, in words. Never a colour, never a bare percentage. */
  readonly passRate: string;
  /** True while this is the version further edits land in. */
  readonly open: boolean;
  /** A sentence about what `open` means, rather than a second state name (ADR-003). */
  readonly openNote: string;
}

export function versionRows(
  versions: readonly VersionRow[],
  rates: ReadonlyMap<string, VersionPassRate>,
  running: ReadonlySet<string>,
): VersionRowView[] {
  return versions.map((version) => {
    const open = version.pinnedAt === null;
    return {
      id: version.id,
      n: version.n,
      name: versionName(version),
      note: version.note,
      when: whenWords(version.updatedAt),
      passRate: passRateWords(rates.get(version.id), running.has(version.id)),
      open,
      openNote: open
        ? "Your edits land here until a run pins it."
        : "Frozen — something points at this one, so it can never change.",
    };
  });
}

/**
 * What was scored, in words.
 *
 * **Four different situations, and collapsing any two of them would be a lie.** A version nothing
 * has ever run is not a version scoring zero. A run in flight is not a run that produced nothing. A
 * version whose every check was ungradable did not fail — EPIC-030 made `not_graded` a third outcome
 * precisely so it is never folded into a fail, and `passRateForVersions` returns `rate: null` rather
 * than `0` for the same reason.
 *
 * The percentage is given **with its counts**, never alone: "94%" of what is the question a bare
 * percentage always raises, and "16 of 17 checks passed" answers it in the same breath.
 */
export function passRateWords(rate: VersionPassRate | undefined, running = false): string {
  if (running) return "A run is in flight.";
  if (rate === undefined) return "No run yet.";
  if (rate.graded === 0) {
    return rate.total === 0
      ? "Nothing was checked."
      : `Nothing could be graded — ${rate.total} ${rate.total === 1 ? "result" : "results"}, none of them a pass or a fail.`;
  }
  const percent = Math.round((rate.passed / rate.graded) * 100);
  const ungraded =
    rate.total > rate.graded ? `, and ${rate.total - rate.graded} could not be graded` : "";
  return `${rate.passed} of ${rate.graded} checks passed — ${percent}%${ungraded}.`;
}

/** The minute, in the shape the run history already uses. Times agree across the app or they confuse. */
function whenWords(at: Date): string {
  return at.toISOString().slice(0, 16).replace("T", " ");
}

/** One line of a diff, as the page renders it. */
export interface DiffLineView {
  /** `added` · `removed` · `changed` · `moved`. The word shown in the gutter. */
  readonly verb: "added" | "removed" | "changed" | "moved";
  readonly blokId: string;
  /** "Constraint blok", capitalised, the way a card names itself. */
  readonly what: string;
  /** The sentence after the kind. Never a paraphrase of somebody's text — an excerpt of it. */
  readonly detail: string;
}

/** "a constraint blok", "an expected blok". The article is chosen so the sentence reads. */
function aKind(kind: BlokKind): string {
  const words = KIND_WORDS[kind].toLowerCase();
  return `${/^[aeiou]/.test(words) ? "an" : "a"} ${words}`;
}

const KIND_WORDS: Readonly<Record<BlokKind, string>> = {
  context: "Context blok",
  constraint: "Constraint blok",
  example: "Example blok",
  expected: "Expected blok",
  image_ref: "Image blok",
  image_input: "Image input blok",
};

/**
 * The diff, as lines.
 *
 * ## The order is the order somebody reads in
 *
 * Added, removed, changed, moved. It is the order the mockup lists them and the order of how much a
 * line is likely to matter: a blok that appeared or vanished changes the prompt more than one that
 * shifted a place.
 *
 * ## A moved blok says "moved", and the roadmap named this test
 *
 * `diff()` already guarantees it by matching on id rather than on text (`version/diff.ts` has the
 * argument). This function is the other half of the promise — the place where that guarantee becomes
 * a word on a screen — so the same case is asserted again here, against the rendered line, because a
 * correct diff rendered as "removed, added" would be exactly as misleading as a wrong one.
 *
 * ## Positions are 1-based here and 0-based everywhere else
 *
 * A snapshot counts from 0 because it is an array. A person counts from 1 because they are looking
 * at a list of cards. The conversion happens once, here, rather than in a component.
 */
export function diffLines(diff: VersionDiff): DiffLineView[] {
  const lines: DiffLineView[] = [];

  for (const blok of diff.added) {
    lines.push({
      verb: "added",
      blokId: blok.blokId,
      what: KIND_WORDS[blok.kind],
      detail: `${excerpt(blok.text)} · at position ${blok.position + 1}`,
    });
  }

  for (const blok of diff.removed) {
    lines.push({
      verb: "removed",
      blokId: blok.blokId,
      what: KIND_WORDS[blok.kind],
      detail: excerpt(blok.text),
    });
  }

  for (const blok of diff.changed) {
    // A reclassified blok can keep every character and still change the compiled prompt, because an
    // expected blok compiles to a check and emits no text. A reader looking at identical before and
    // after needs telling what actually moved, or the line reads as a bug in the diff.
    const reclassified = blok.kind !== blok.previousKind;
    lines.push({
      verb: "changed",
      blokId: blok.blokId,
      what: KIND_WORDS[blok.kind],
      detail: reclassified
        ? blok.before === blok.after
          ? `was ${aKind(blok.previousKind)}, now ${aKind(blok.kind)} · ${excerpt(blok.after)}`
          : `was ${aKind(blok.previousKind)} · ${excerpt(blok.before)} → ${excerpt(blok.after)}`
        : `${excerpt(blok.before)} → ${excerpt(blok.after)}`,
    });
  }

  for (const blok of diff.moved) {
    lines.push({
      verb: "moved",
      blokId: blok.blokId,
      what: KIND_WORDS[blok.kind],
      detail: `position ${blok.from + 1} → ${blok.to + 1}`,
    });
  }

  return lines;
}

/**
 * The compiled size, before and after.
 *
 * Bytes, because that is what `diff()` measures and what a provider is sent — UTF-16 code units and
 * UTF-8 bytes disagree on every emoji and on most of the world's writing systems, which is exactly
 * where a prompt author would be misled about how big their prompt is.
 */
export function byteDeltaWords(diff: VersionDiff, beforeBytes: number): string {
  const after = beforeBytes + diff.compiledByteDelta;
  const sign = diff.compiledByteDelta > 0 ? "+" : "";
  const delta =
    diff.compiledByteDelta === 0 ? "no change" : `${sign}${diff.compiledByteDelta.toLocaleString("en-GB")}`;
  return `${beforeBytes.toLocaleString("en-GB")} → ${after.toLocaleString("en-GB")} bytes · ${delta}`;
}

/** How many UTF-8 bytes a compiled prompt occupies. The same unit `diff()`'s delta is in. */
export function compiledBytes(text: string): number {
  let bytes = 0;
  for (const codePoint of text) {
    const value = codePoint.codePointAt(0) ?? 0;
    if (value < 0x80) bytes += 1;
    else if (value < 0x800) bytes += 2;
    else if (value < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * Which version a run ran, said honestly when there is none.
 *
 * **Inherited from EPIC-040 §11.2.** `suite_runs.version` is nullable and stays nullable: every run
 * made before versions existed has none, and backfilling one would be inventing a historical fact.
 * So the surface has to have a sentence for it, and "Draft v—" is not one.
 */
export function runVersionWords(
  run: Pick<SuiteRunRow, "version">,
  versionsByN: ReadonlyMap<string, number>,
): string {
  if (run.version === null) return "This run predates version history.";
  const n = versionsByN.get(run.version);
  // A version that no longer resolves: the row was deleted and the reference set null, or the
  // history is longer than a page. Naming the id is more use than saying nothing.
  return n === undefined ? "Ran a version that is no longer in this history." : `Ran Draft v${n}`;
}

/** An excerpt of somebody's text, quoted. Never a paraphrase (`CLAUDE.md` rule 3). */
export function excerpt(text: string, limit = 72): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return "(empty)";
  const points = [...flat];
  return points.length <= limit ? `“${flat}”` : `“${points.slice(0, limit).join("")}…”`;
}

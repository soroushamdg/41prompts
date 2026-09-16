// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { BlokKind } from "../classify/types.js";

/**
 * One blok as it stood when a version was taken.
 *
 * ## Why this is not `PromptBlok`
 *
 * `PromptBlok` (`compile/types.ts`) is what the compiler needs: id, kind, text, order. A snapshot
 * needs two more facts, and both of them are someone's writing rather than the compiler's.
 *
 * `editedText` and `editedFromHash` are EPIC-021a decision 5's hand edit. A version that dropped
 * them would restore a prompt into a state the person **never had** — the compiled text would come
 * back as the compiler renders it, and the sentence they wrote themselves would be gone. That is
 * the same class of loss decision 5 paid a column to prevent, arriving through history instead of
 * through an insert.
 *
 * `position` is an ordinal, not a rank. See `VersionSnapshot`.
 */
export interface SnapshotBlok {
  readonly id: string;
  readonly kind: BlokKind;
  /** Verbatim (`CLAUDE.md` rule 3). Never a paraphrase, never trimmed, never normalised. */
  readonly text: string;
  /**
   * Zero-based position among the bloks of this snapshot, in the order the prompt compiles in.
   *
   * **An ordinal rather than the database's `rank`**, and the difference is the whole of why `diff`
   * can tell a move from a rewrite. `rank` is a fractional index (`packages/db/src/rank.ts`): a
   * base-62 key whose *only* meaning is its lexicographic order against its siblings. Two snapshots'
   * ranks are not comparable — a rebalance rewrites every key without moving a single blok, and a
   * blok can acquire a wildly different key by being dragged one place. Comparing ranks would report
   * a rebalance as "everything moved", which is both false and the least useful thing a history can
   * say.
   */
  readonly position: number;
  /** The text a person wrote for this blok's span themselves, or null if the compiler owns it. */
  readonly editedText: string | null;
  /** The blok's content hash at the moment of that edit. Null exactly when `editedText` is. */
  readonly editedFromHash: string | null;
}

/**
 * A prompt's blok set, frozen.
 *
 * `compiledText` is stored rather than recomputed for the same reason `suite_runs.promptText` is
 * (EPIC-031): the row **is** the historical fact. Recompiling it later would render it with
 * whatever `COMPILER_VERSION` is current then, and a version would silently change what it says
 * happened. A compiler change is allowed to alter future compiled output; it is not allowed to
 * alter the past.
 */
export interface VersionSnapshot {
  /** The bloks, ordered by `position`, ascending and contiguous from 0. */
  readonly bloks: readonly SnapshotBlok[];
  readonly compiledText: string;
}

/** A blok that exists in one snapshot and not the other. */
export interface BlokAppearance {
  readonly blokId: string;
  readonly kind: BlokKind;
  readonly text: string;
  readonly position: number;
}

/** A blok present in both, whose text or kind is not what it was. */
export interface BlokChange {
  readonly blokId: string;
  readonly kind: BlokKind;
  /** The kind it had in `a`, which is `kind` unless the blok was reclassified. */
  readonly previousKind: BlokKind;
  readonly before: string;
  readonly after: string;
  readonly position: number;
}

/** A blok present in both, at a different ordinal position. */
export interface BlokMove {
  readonly blokId: string;
  readonly kind: BlokKind;
  readonly from: number;
  readonly to: number;
}

/**
 * What changed between two versions, said the way a person would say it.
 *
 * ## `changed` and `moved` are separate lists, and a blok may be in both
 *
 * "You rewrote it" and "you moved it" are two facts. Collapsing them into one entry loses whichever
 * the reader did not ask about, and a history's whole job is to answer the question the reader
 * brought. A blok that was rewritten *and* dragged appears once in each list, with the same id.
 *
 * ## There is no `unchanged` list
 *
 * A diff of a fifty-blok prompt where one word moved would otherwise be forty-nine entries of
 * nothing followed by the answer. Bloks in neither list and no move are absent, and `isEmpty` says
 * so in one read.
 */
export interface VersionDiff {
  readonly added: readonly BlokAppearance[];
  readonly removed: readonly BlokAppearance[];
  readonly changed: readonly BlokChange[];
  readonly moved: readonly BlokMove[];
  /**
   * `b`'s compiled length minus `a`'s, **in UTF-8 bytes**.
   *
   * Bytes rather than UTF-16 code units, because this number answers "how much bigger is the thing
   * we send a provider", and a provider is sent bytes. The two disagree on every emoji and on most
   * of the world's writing systems, which is precisely where a prompt author would be misled.
   */
  readonly compiledByteDelta: number;
  /** True when all four lists are empty. The byte delta is then necessarily 0. */
  readonly isEmpty: boolean;
}

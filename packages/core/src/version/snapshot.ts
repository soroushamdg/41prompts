// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { BLOK_KINDS, type BlokKind } from "../classify/types.js";
import { compile } from "../compile/compile.js";
import type { KeptSpan, PromptBlok } from "../compile/types.js";
import type { SnapshotBlok, VersionSnapshot } from "./types.js";

/** What a caller knows about a blok's hand edit, keyed by blok id. Absent means the compiler owns it. */
export interface HandEdit {
  readonly editedText: string;
  readonly editedFromHash: string;
}

/**
 * Freeze a blok set into a snapshot.
 *
 * ## `position` is assigned here, and that is the point
 *
 * The caller hands over bloks carrying `order` — a database `rank`, or whatever incidental ordering
 * a query returned. This sorts them the way `compile()` sorts them, **breaking ties by id for the
 * same reason it does**, and replaces that ordering with a contiguous ordinal from 0.
 *
 * Doing it in one place means `diff()` never sees a rank, and therefore cannot be tempted to compare
 * two of them. `types.ts` has the full argument; the short version is that a rebalance rewrites
 * every rank without moving anything, and a diff that read ranks would call that "everything moved".
 *
 * ## It compiles, rather than being handed compiled text
 *
 * So that the snapshot's `compiledText` and its `bloks` cannot disagree. A caller passing both would
 * eventually pass a stale one, and the failure would be silent and permanent — a version is a
 * historical claim, and nothing later re-checks it.
 *
 * ## The hand edits are compiled through, not merely recorded
 *
 * `handEdits` becomes `compile`'s `keep`, so `compiledText` is the text a **run would actually
 * send** — EPIC-021a decision 5's spans included. Storing the edits in `bloks` while compiling
 * without them would produce a version whose two halves describe different prompts, and the half a
 * reader trusted would decide whether they were misled. It would also make a version's
 * `compiledHash` disagree with the `promptHash` of the run pinned to it, which is the one
 * cross-check this design has.
 */
export function snapshot(
  bloks: readonly PromptBlok[],
  handEdits: ReadonlyMap<string, HandEdit> = new Map(),
): VersionSnapshot {
  const ordered = [...bloks].sort((left, right) =>
    left.order === right.order ? left.id.localeCompare(right.id) : left.order - right.order,
  );

  const frozen: SnapshotBlok[] = ordered.map((blok, position) => {
    const edit = handEdits.get(blok.id);
    return {
      id: blok.id,
      kind: blok.kind,
      text: blok.text,
      position,
      editedText: edit?.editedText ?? null,
      editedFromHash: edit?.editedFromHash ?? null,
    };
  });

  const keep = new Map<string, KeptSpan>();
  for (const [blokId, edit] of handEdits) {
    keep.set(blokId, { text: edit.editedText, hash: edit.editedFromHash });
  }

  return { bloks: frozen, compiledText: compile(bloks, { keep }).text };
}

/**
 * Read a snapshot's bloks back out of storage, or `undefined` if what came back is not one.
 *
 * ## Why a reader exists at all
 *
 * `prompt_versions.snapshot` is `jsonb` and `packages/db` takes it as `unknown` on the way in
 * (EPIC-040's logged decision: the database package does not import this one). So on the way out
 * somebody has to turn `unknown` into `SnapshotBlok[]`, and the only honest place for that is here
 * — it is the same type this file writes, and a second definition of "what a snapshot looks like"
 * living next to the reader is how two halves of one format drift apart.
 *
 * ## Total, and narrow on purpose
 *
 * It never throws and it never repairs. A row written by a future version of this product, a row
 * half-written by a migration, a row somebody edited by hand in a console: all of them come back
 * `undefined`, and the surface renders "this version cannot be read" rather than a page that
 * crashes or, worse, a diff computed from a shape that was guessed at. **A history that quietly
 * invents a missing field is worse than one that admits a gap**, because the invention is
 * indistinguishable from the record.
 *
 * `kind` is checked against `BLOK_KINDS` for that reason and not for tidiness: `diff` and `compile`
 * both type it as `BlokKind`, and letting an unknown seventh kind through would put a value into
 * those functions that their own types say cannot exist.
 *
 * Positions are **not** renumbered or sorted here. `snapshot()` writes them contiguous from 0 and
 * `diff()` compares them as ordinals; silently re-deriving them on read would turn a corrupt row
 * into a plausible one, which is the repair this function refuses to make. They are checked for
 * being non-negative integers and nothing else.
 */
export function readSnapshotBloks(value: unknown): readonly SnapshotBlok[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const out: SnapshotBlok[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") return undefined;
    const blok = entry as Record<string, unknown>;

    const { id, kind, text, position, editedText, editedFromHash } = blok;
    if (typeof id !== "string" || id === "") return undefined;
    if (typeof kind !== "string" || !(BLOK_KINDS as readonly string[]).includes(kind)) return undefined;
    if (typeof text !== "string") return undefined;
    if (typeof position !== "number" || !Number.isInteger(position) || position < 0) return undefined;

    // Both or neither, always. `editedFromHash` without `editedText` is a hash of nothing, and
    // `editedText` without it is a hand edit whose drift can never be answered — `types.ts` says
    // the pair is one fact, so half of it is not a lenient read, it is a different fact.
    const hasText = typeof editedText === "string";
    const hasHash = typeof editedFromHash === "string";
    if (hasText !== hasHash) return undefined;
    if (!hasText && (editedText ?? null) !== null) return undefined;
    if (!hasHash && (editedFromHash ?? null) !== null) return undefined;

    out.push({
      id,
      kind: kind as BlokKind,
      text,
      position,
      editedText: hasText ? (editedText as string) : null,
      editedFromHash: hasHash ? (editedFromHash as string) : null,
    });
  }
  return out;
}

/**
 * The pair `diff()` takes, assembled from a stored row.
 *
 * Two fields, and still worth a function: three call sites would otherwise each build the object by
 * hand, and the day a third field joins `VersionSnapshot` two of them would be found not carrying
 * it. `undefined` propagates from `readSnapshotBloks` unchanged.
 */
export function readSnapshot(value: unknown, compiledText: string): VersionSnapshot | undefined {
  const bloks = readSnapshotBloks(value);
  return bloks === undefined ? undefined : { bloks, compiledText };
}

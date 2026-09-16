// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

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

// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type {
  BlokAppearance,
  BlokChange,
  BlokMove,
  SnapshotBlok,
  VersionDiff,
  VersionSnapshot,
} from "./types.js";

/**
 * How many UTF-8 bytes a string occupies.
 *
 * Hand-counted rather than `Buffer.byteLength` or `TextEncoder`: `packages/core` is zero-dependency
 * with **no DOM and no IO** (`CLAUDE.md`), and `TextEncoder` is neither universally present in every
 * runtime this package is published into nor free — it allocates the whole encoded array to tell us
 * its length. This walks the string once and allocates nothing.
 *
 * Surrogate pairs are counted as the 4 bytes their code point encodes to, not as two unpaired
 * surrogates, which is what makes the emoji case right rather than plausible.
 */
function utf8Length(text: string): number {
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

const byId = (snapshot: VersionSnapshot): Map<string, SnapshotBlok> =>
  new Map(snapshot.bloks.map((blok) => [blok.id, blok]));

const appearance = (blok: SnapshotBlok): BlokAppearance => ({
  blokId: blok.id,
  kind: blok.kind,
  text: blok.text,
  position: blok.position,
});

/**
 * What changed between two versions of one prompt.
 *
 * ## Bloks are matched by id. Never by text.
 *
 * A blok's id is stable across every edit to its text (`compile/types.ts` says why, and it is the
 * property EPIC-021a's row id was chosen for), so identity here is a fact rather than an inference.
 * That is the whole reason this function can answer `docs/roadmap.md`'s named test — **a moved blok
 * is reported as moved, never as removed plus added.**
 *
 * A text-matching diff cannot do it. Faced with a blok whose position changed it sees text at
 * position 3 that is no longer there and text at position 1 that was not there before, and the only
 * honest thing it can say is "one removed, one added". Every history built that way tells its reader
 * they deleted and rewrote a paragraph they actually dragged upwards. The fix is not a smarter
 * similarity heuristic; it is having an identity in the first place.
 *
 * ## Reclassification is a change, not a move
 *
 * A blok that goes `context` → `constraint` keeps its text and its position and is still different:
 * the kind decides whether it emits text at all (`expected` compiles to a check and nothing else),
 * so the compiled prompt can change while every character of every blok stays put. It lands in
 * `changed` with `previousKind` carrying what it was, because a reader looking at identical `before`
 * and `after` text needs to be told what actually moved.
 *
 * ## Pure, and deliberately ignorant of where snapshots come from
 *
 * Two plain objects in, one plain object out. Nothing here reads a database, a clock or a file, so
 * the same two versions always diff to the same answer — which is what lets EPIC-041 render it,
 * EPIC-050 freeze it and the CLI print it without three implementations that drift apart.
 */
export function diff(a: VersionSnapshot, b: VersionSnapshot): VersionDiff {
  const before = byId(a);
  const after = byId(b);

  const added: BlokAppearance[] = [];
  const removed: BlokAppearance[] = [];
  const changed: BlokChange[] = [];
  const moved: BlokMove[] = [];

  for (const blok of a.bloks) {
    if (!after.has(blok.id)) removed.push(appearance(blok));
  }

  for (const blok of b.bloks) {
    const was = before.get(blok.id);
    if (was === undefined) {
      added.push(appearance(blok));
      continue;
    }

    if (was.text !== blok.text || was.kind !== blok.kind) {
      changed.push({
        blokId: blok.id,
        kind: blok.kind,
        previousKind: was.kind,
        before: was.text,
        after: blok.text,
        position: blok.position,
      });
    }

    // Separate from the test above, never an `else`: rewritten *and* dragged is two facts.
    if (was.position !== blok.position) {
      moved.push({ blokId: blok.id, kind: blok.kind, from: was.position, to: blok.position });
    }
  }

  return {
    added,
    removed,
    changed,
    moved,
    compiledByteDelta: utf8Length(b.compiledText) - utf8Length(a.compiledText),
    isEmpty:
      added.length === 0 && removed.length === 0 && changed.length === 0 && moved.length === 0,
  };
}

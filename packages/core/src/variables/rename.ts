// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { isVariableName, occurrencesInText, type VariableScanOptions } from "./extract.js";
import type { PromptBlok } from "../compile/types.js";
import type { VariableDeclaration } from "./types.js";

/** A text this rename changed. Only the ones that changed are returned, so a caller writes only those rows. */
export interface RenamedText {
  readonly id: string;
  readonly text: string;
}

export type RenameRefusal = "invalid-name" | "target-exists" | "unknown-name";

export type RenameResult =
  | {
      readonly ok: true;
      /** Bloks whose own stored text changed. */
      readonly blokTexts: readonly RenamedText[];
      /** Hand-edited span texts that changed, keyed by the same blok id. */
      readonly editedTexts: readonly RenamedText[];
      /** The declaration under its new name, default and description carried across. `null` if the name was used but never declared. */
      readonly declaration: VariableDeclaration | null;
    }
  | { readonly ok: false; readonly reason: RenameRefusal };

/**
 * Rename one variable everywhere it is written.
 *
 * **This is the only operation in EPIC-022 that can destroy somebody's writing**, which is why it is
 * pure, why its test was written before it, and why it returns new texts instead of applying them:
 * the caller writes them in one transaction or writes none of them, and this function cannot leave a
 * prompt half-renamed.
 *
 * ## Three refusals, and why each is a refusal rather than a best effort
 *
 * - **`invalid-name`** — the new name is not a name this module would extract. Accepting it would
 *   write `{{two words}}` into somebody's prompt and then be unable to find it again.
 * - **`target-exists`** — the new name is already used or declared. The obvious alternative is to
 *   merge the two, and merging is destructive in a way that cannot be undone by renaming back: two
 *   distinct variables become one and nothing records which occurrences were which. Renaming to the
 *   *same* name lands here too, deliberately. A no-op that reports success invites a caller to write
 *   a transaction that changes nothing and tell somebody it worked.
 * - **`unknown-name`** — nothing uses or declares the old name, so there is nothing to rename and
 *   the caller is working from a stale view.
 *
 * ## What it reaches
 *
 * Every blok's own text, **including `expected`**, and every hand-edited span. `expected` bloks emit
 * no text and their variables are not *uses* (ruling Q2), but a rename is about the author's
 * vocabulary rather than about what ships, and leaving an expectation pointing at a name nobody kept
 * would be a stale reference they did not ask for. The spacing inside each brace form is preserved:
 * only the name is replaced.
 */
export function renameVariable(
  bloks: readonly PromptBlok[],
  declared: readonly VariableDeclaration[],
  from: string,
  to: string,
  options: VariableScanOptions = {}
): RenameResult {
  if (!isVariableName(to)) return { ok: false, reason: "invalid-name" };

  const declaration = declared.find((d) => d.name === from) ?? null;
  const usedSomewhere = bloks.some((blok) => {
    const kept = options.keep?.get(blok.id);
    return (
      occurrencesInText(blok.text, blok.id).some((o) => o.name === from) ||
      (kept !== undefined && occurrencesInText(kept.text, blok.id).some((o) => o.name === from))
    );
  });
  if (declaration === null && !usedSomewhere) return { ok: false, reason: "unknown-name" };

  const taken =
    declared.some((d) => d.name === to) ||
    bloks.some((blok) => {
      const kept = options.keep?.get(blok.id);
      return (
        occurrencesInText(blok.text, blok.id).some((o) => o.name === to) ||
        (kept !== undefined && occurrencesInText(kept.text, blok.id).some((o) => o.name === to))
      );
    });
  if (taken) return { ok: false, reason: "target-exists" };

  const blokTexts: RenamedText[] = [];
  const editedTexts: RenamedText[] = [];

  for (const blok of bloks) {
    const rewritten = replaceName(blok.text, blok.id, from, to);
    if (rewritten !== null) blokTexts.push({ id: blok.id, text: rewritten });

    const kept = options.keep?.get(blok.id);
    if (kept !== undefined) {
      const rewrittenEdit = replaceName(kept.text, blok.id, from, to);
      if (rewrittenEdit !== null) editedTexts.push({ id: blok.id, text: rewrittenEdit });
    }
  }

  return {
    ok: true,
    blokTexts,
    editedTexts,
    declaration: declaration === null ? null : { ...declaration, name: to }
  };
}

/**
 * Replace only the name inside each matching brace form. `null` when nothing matched, so the caller
 * can tell "unchanged" from "changed to the same string" and write no row for the first.
 *
 * Applied right to left so that every offset stays valid while earlier ones are still being used —
 * replacing left to right would shift each subsequent occurrence by the length difference, and a
 * rename that is correct only when the names happen to be the same length is a bug waiting for a
 * longer word.
 */
function replaceName(text: string, blokId: string, from: string, to: string): string | null {
  const hits = occurrencesInText(text, blokId).filter((o) => o.name === from);
  if (hits.length === 0) return null;
  let next = text;
  for (const hit of [...hits].reverse()) {
    next = next.slice(0, hit.nameStart) + to + next.slice(hit.nameEnd);
  }
  return next;
}

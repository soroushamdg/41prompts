// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { usedVariableNames } from "./extract.js";
import type { VariableDeclaration, VariableIssue, VariableOccurrence } from "./types.js";

/**
 * Where the used set and the declared set disagree.
 *
 * Pure, total, and decidable in one pass over each set — which is precisely why these are
 * `VariableIssue`s and not `Finding`s (ADR-003). Nothing here weighs evidence or guesses intent; a
 * name is in one set and not the other, and there is no severity to assign because there is no
 * judgement being made.
 *
 * Order is deliberate and stable: uses first in the prompt's own reading order, then unused
 * declarations alphabetically. Uses come first because one of them means the prompt ships a literal
 * `{{name}}` to somebody, and an unused declaration means a row nobody reads.
 */
export function variableIssues(
  occurrences: readonly VariableOccurrence[],
  declared: readonly VariableDeclaration[]
): readonly VariableIssue[] {
  const declaredNames = new Set(declared.map((d) => d.name));
  const used = usedVariableNames(occurrences);
  const usedNames = new Set(used);

  const issues: VariableIssue[] = [];

  for (const name of used) {
    if (declaredNames.has(name)) continue;
    issues.push({
      kind: "used_but_not_declared",
      name,
      occurrences: occurrences.filter((o) => o.name === name)
    });
  }

  for (const declaration of [...declared].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (usedNames.has(declaration.name)) continue;
    // Empty by definition: the issue *is* that there are no occurrences.
    issues.push({ kind: "declared_but_not_used", name: declaration.name, occurrences: [] });
  }

  return issues;
}

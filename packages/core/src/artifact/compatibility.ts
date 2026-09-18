// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Whether publishing a new build breaks the callers the current Live build already has in the field.
 *
 * ## The question, stated precisely, because there are two and only one of them is this
 *
 * **This one:** an app was written against Live. It sends some set of arguments. If we publish this
 * new build, does that app stop working — without anybody redeploying it, without a version bump it
 * can see, and without an error at the moment of the change? That is the Deploy page's gate row
 * *"Inputs compatible with shipped apps"*.
 *
 * **Not this one:** given these arguments and this artifact, is the call valid? That is the SDK's
 * own variable validation, it happens per call, and it belongs to EPIC-052. Folding the two together
 * would make a publish gate depend on what somebody happened to send last Tuesday.
 *
 * ## Why the answer is not a boolean
 *
 * The gate has to say *which* variable broke. "Incompatible" is a sentence a person cannot act on,
 * and the epic before this one already paid for that lesson in a different place — EPIC-030's
 * `not_graded` carries a reason for the same reason. The function keeps the roadmap's name and
 * returns the list.
 *
 * ## Silence is the whole hazard
 *
 * None of these four throws anywhere. A caller that stops sending a variable that was removed simply
 * has its value ignored; a caller that never sent one that became required gets a prompt with an
 * unfilled placeholder in it. Both produce a plausible answer from a model and a wrong one, at a
 * rate nobody notices for a week. That is why this is a publish gate rather than a runtime check.
 */

import type { Artifact, ArtifactVariable } from "./schema.js";
import { isOptional } from "../variables/types.js";

/**
 * The four ways a variable contract breaks.
 *
 * `docs/roadmap.md` names three — "added required, removed, type change". **`became_required` is the
 * fourth and it is not in that list.** A variable that loses its default fails for exactly the
 * callers `added_required` fails for: every one that omits it. Shipping the roadmap's three
 * literally would have been shipping a gate that passes the change it exists to stop, so the fourth
 * is here and is called out in the epic file rather than slipped in.
 */
export type ContractBreakKind = "added_required" | "removed" | "became_required" | "type_changed";

/** One variable, and how the new build breaks the callers of the old one. */
export interface ContractBreak {
  readonly kind: ContractBreakKind;
  readonly name: string;
}

/**
 * The answer, and the evidence for it.
 *
 * `compatible` is exactly `breaks.length === 0` and is present anyway: the call site that only wants
 * a yes or no should not have to know that, and a derived field cannot disagree with its own source.
 */
export interface CompatibilityReport {
  readonly compatible: boolean;
  /** Every break, in variable-name order, so two runs of the same comparison read identically. */
  readonly breaks: readonly ContractBreak[];
}

/**
 * What is **not** a break, listed so nobody adds one of them later thinking it was an oversight:
 *
 * - **Adding an optional variable.** Every existing caller keeps working; the default fills in.
 * - **Becoming optional** — gaining a default. Callers that sent it still send it; callers that did
 *   not now have a value.
 * - **Changing a default.** It changes what an omitting caller receives, which is a change to the
 *   prompt's *content*, exactly like editing a blok. The gate for that is the check suite, not this.
 * - **Changing a description.** Documentation.
 *
 * A **rename** is not a fifth kind: it is a removal and an addition, and it reports as both, which
 * is the truth of what it does to a caller.
 */
function breaksFor(before: readonly ArtifactVariable[], after: readonly ArtifactVariable[]): ContractBreak[] {
  const live = new Map(before.map((variable) => [variable.name, variable]));
  const next = new Map(after.map((variable) => [variable.name, variable]));

  const names = [...new Set([...live.keys(), ...next.keys()])].sort();
  const breaks: ContractBreak[] = [];

  for (const name of names) {
    const was = live.get(name);
    const now = next.get(name);

    if (was === undefined && now !== undefined) {
      if (!isOptional(now)) breaks.push({ kind: "added_required", name });
      continue;
    }
    if (was !== undefined && now === undefined) {
      breaks.push({ kind: "removed", name });
      continue;
    }
    if (was === undefined || now === undefined) continue;

    // Both present. Two independent facts, so a variable can break twice — a field that both lost
    // its default and changed type is two problems for a caller, not one.
    if (isOptional(was) && !isOptional(now)) breaks.push({ kind: "became_required", name });
    // `type` is reserved and absent throughout v1 (EPIC-022 ruling Q1), so this branch has no v1
    // instance and is exercised by hand-built pairs. It is here because the rule names it and
    // because the day the field starts carrying values is not the day to start writing the check.
    if ((was.type ?? null) !== (now.type ?? null)) breaks.push({ kind: "type_changed", name });
  }

  return breaks;
}

/**
 * Does publishing `next` break the callers `live` has in the field?
 *
 * Reads `variables` and nothing else. Two artifacts whose prompts are entirely different but whose
 * declarations agree are compatible, and that is correct: this answers a question about the calling
 * contract, not about whether the new prompt is any good. Whether it is any good is the check suite,
 * and `CLAUDE.md` rule 9 is the gate for that.
 */
export function isCompatible(live: Artifact, next: Artifact): CompatibilityReport {
  const breaks = breaksFor(live.variables, next.variables);
  return { compatible: breaks.length === 0, breaks };
}

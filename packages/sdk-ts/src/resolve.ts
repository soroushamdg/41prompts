// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Turning an artifact and a caller's values into the text a model is sent (EPIC-052).
 *
 * ## This is the SDK's variable validation, and `packages/core` says so
 *
 * `artifact/compatibility.ts` separates two questions that look like one: *"does publishing this
 * break the apps already in the field"*, which is the publish gate, and *"given these arguments and
 * this artifact, is the call valid"*, which it hands here in as many words — *"that is the SDK's own
 * variable validation, it happens per call, and it belongs to EPIC-052"*.
 *
 * ## `bindVariables` is core's, and there is no second substituter
 *
 * `packages/core/src/inputs/bind.ts` already handles the three traps, each of which was a defect
 * somewhere before it was a rule: substitution runs right to left so a long value cannot shift the
 * offsets of the ones after it; an inserted value is never rescanned, so a support transcript
 * containing `{{name}}` stays a transcript; and `""` is a real default, distinct from no default at
 * all. Writing a `String.replace` loop here would reintroduce all three.
 *
 * ## A missing required variable is `unavailable`, not a prompt with a hole in it
 *
 * The alternative is shipping `{{customer_name}}` to a model, which produces a plausible answer
 * about a customer called "customer_name" and is the failure `bind.ts` calls *"a wrong one, at a
 * rate nobody notices for a week"*. The names are in `missing` and the caller is warned.
 */

import { bindVariables } from "@41prompts/core";
import type { Entry } from "./entry.js";
import type { ResolveResult, ResolveSource, Warning } from "./types.js";

/** The answer when nothing could be resolved at all. Every field present; `status` says the rest. */
export function unresolved(promptId: string, missing: readonly string[] = []): ResolveResult {
  return {
    status: "unavailable",
    text: "",
    source: "none",
    promptId,
    version: null,
    buildHash: null,
    model: null,
    missing,
    usedDefaults: [],
  };
}

/**
 * The caller's values as a map of strings.
 *
 * Reading them is wrapped because a caller is not always a TypeScript caller: `vars` can be a proxy,
 * an object with a throwing getter, or something that is not an object at all. A value that is not a
 * primitive is dropped with a warning rather than stringified — `[object Object]` inside somebody's
 * prompt is worse than an honest refusal.
 */
function toValues(vars: unknown, warn: (warning: Warning) => void): Map<string, string> {
  const values = new Map<string, string>();
  if (typeof vars !== "object" || vars === null) return values;

  let keys: string[];
  try {
    keys = Object.keys(vars);
  } catch {
    return values;
  }

  for (const key of keys) {
    let value: unknown;
    try {
      value = (vars as Record<string, unknown>)[key];
    } catch {
      warn({ code: "missing_variables", message: `reading the value for ${key} threw; it was skipped` });
      continue;
    }
    if (typeof value === "string") {
      values.set(key, value);
    } else if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      values.set(key, String(value));
    } else if (value !== undefined && value !== null) {
      warn({ code: "missing_variables", message: `the value for ${key} is not a string; it was skipped` });
    }
  }
  return values;
}

/** Bind one entry's artifact and report what happened. */
export function resolveEntry(
  entry: Entry,
  source: ResolveSource,
  promptId: string,
  vars: unknown,
  warn: (warning: Warning) => void,
): ResolveResult {
  const values = toValues(vars, warn);
  const bound = bindVariables(entry.artifact.text, values, entry.artifact.variables);

  if (!bound.ok) {
    warn({
      code: "missing_variables",
      message: `no value was supplied for ${bound.missing.join(", ")}, and neither has a default`,
      promptId,
    });
    return {
      ...unresolved(promptId, bound.missing),
      source,
      version: entry.version,
      buildHash: entry.artifact.buildHash,
      model: entry.artifact.model,
    };
  }

  return {
    status: "ok",
    text: bound.text,
    source,
    promptId,
    version: entry.version,
    buildHash: entry.artifact.buildHash,
    model: entry.artifact.model,
    missing: [],
    usedDefaults: bound.usedDefaults,
  };
}

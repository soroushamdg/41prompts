// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { findNestedQuantifiers } from "../pattern-shape.js";

/**
 * Whether a pattern a **person wrote** is safe enough to execute.
 *
 * ## This is a filter, not a proof
 *
 * Said in the name, said here, and said in the report, because the difference matters and the next
 * reader will otherwise assume the stronger thing. It rejects the *shapes* that are known to
 * backtrack exponentially. It does not prove termination, it cannot, and it never claims to.
 *
 * ## Why a filter at all
 *
 * `matches_pattern` executes text a user typed. A catastrophic pattern does not return a wrong
 * answer — it does not return. `(a+)+$` against forty `a`s and a `b` outlasts the process, which
 * breaks `grade()`'s determinism in the worst available way and is a denial of service the moment
 * EPIC-031 runs checks server-side.
 *
 * Two alternatives were considered and both are worse:
 *
 * - **A timeout.** Impossible in-process: JavaScript cannot interrupt a running regex. There is no
 *   timeout parameter and no preemption. A real timeout needs a worker or a subprocess, which is IO,
 *   which `packages/core` does not do.
 * - **A linear-time engine** (RE2 or similar). A native dependency in a zero-dependency public
 *   package, which `CLAUDE.md` rule 11 forbids and which is most of the point of the package.
 *
 * So: reject at derivation time, and let the failure mode be `not_graded` rather than "hangs". The
 * author wrote a rule we cannot execute; that is our limitation, not their error, and it must not
 * fail their prompt.
 *
 * ## What it rejects that is perfectly safe — the false rejections, listed
 *
 * Deliberately over-strict. Each of these is fine in practice and is refused anyway, because
 * distinguishing the safe instance from the dangerous one needs the analysis this is avoiding:
 *
 * 1. **Any quantified group whose body contains a quantifier** — `(\\d+)+`, and equally the harmless
 *    `(?:ab+)*` over short inputs. This is the big one and it is where nearly every false rejection
 *    will come from.
 * 2. **Backreferences** (`\\1`). Cheap in most uses; they also make matching NP-hard in general, and
 *    the cases cannot be told apart syntactically.
 * 3. **Lookbehind** (`(?<=…)`, `(?<!…)`). Well-behaved in V8; refused because support and cost vary
 *    across engines and `grade()` must not depend on which engine ran it.
 * 4. **Patterns longer than {@link MAX_PATTERN_LENGTH}.** A blunt bound. A long pattern is not
 *    dangerous *because* it is long.
 *
 * A rejected pattern is not a broken pattern. It is one this product declines to run.
 */

/**
 * The longest pattern this will execute.
 *
 * Arbitrary, and chosen to be far above anything a person types into an expected blok rather than
 * tuned to a threat. Its job is to stop a pathological megabyte of regex reaching the engine at all.
 */
export const MAX_PATTERN_LENGTH = 400;

/** Why a pattern was refused, in a form a caller can show without a debugger. */
export interface PatternRejection {
  readonly rule: "nested_quantifier" | "backreference" | "lookbehind" | "too_long" | "will_not_compile";
  readonly detail: string;
}

/**
 * Backreference detection that does not mistake an escape for one.
 *
 * `\\1` is a backreference; `\\\\1` is a literal backslash followed by a one. Scanning rather than
 * matching, for the same reason `findNestedQuantifiers` scans: a regular expression cannot count
 * preceding backslashes.
 */
function hasBackreference(pattern: string): boolean {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== "\\") continue;
    const next = pattern[i + 1];
    // `\0` is the NUL escape, not a backreference; `\1`–`\9` are.
    if (next !== undefined && next >= "1" && next <= "9") return true;
    // Consume the escaped character so `\\1` is not read as `\1`.
    i++;
  }
  return false;
}

/**
 * Check a pattern before it is ever executed.
 *
 * Returns every reason it was refused, not just the first, so an author fixing one does not
 * discover the next on the following run.
 */
export function rejectUnsafePattern(pattern: string, flags = ""): readonly PatternRejection[] {
  const rejections: PatternRejection[] = [];

  if (pattern.length > MAX_PATTERN_LENGTH) {
    rejections.push({
      rule: "too_long",
      detail: `${pattern.length} characters, over the ${MAX_PATTERN_LENGTH} this will run`
    });
  }

  // The shape behind every catastrophic-backtracking incident. Reused rather than reimplemented:
  // `pattern-shape.ts` already scans for it, already handles groups inside groups and `)` inside a
  // character class, and already has the tests for both — and a second copy of this analysis is
  // exactly how the last duplicated thing in this repository drifted.
  for (const occurrence of findNestedQuantifiers(pattern)) {
    rejections.push({
      rule: "nested_quantifier",
      detail: `a quantified group whose body is already quantified: ${occurrence}`
    });
  }

  if (hasBackreference(pattern)) {
    rejections.push({ rule: "backreference", detail: "backreferences are not run" });
  }

  if (pattern.includes("(?<=") || pattern.includes("(?<!")) {
    rejections.push({ rule: "lookbehind", detail: "lookbehind is not run" });
  }

  // Last, because a pattern that will not compile is a different complaint from one that would run
  // badly, and there is no point reporting both about the same string if the earlier checks already
  // explain it.
  if (rejections.length === 0) {
    try {
      new RegExp(pattern, flags);
    } catch (error) {
      rejections.push({
        rule: "will_not_compile",
        detail: error instanceof Error ? error.message : "not a valid regular expression"
      });
    }
  }

  return rejections;
}

/** Convenience for the common question. */
export function isPatternSafe(pattern: string, flags = ""): boolean {
  return rejectUnsafePattern(pattern, flags).length === 0;
}

// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The generated `prompts.py` (EPIC-053).
 *
 * Written by `41p pull --lang python`. The Connect page does not offer it — EPIC-055's Goal line is
 * "TypeScript path only" and `fortyone.resolve()` is still EPIC-000's stub, which is why the command
 * says so when it writes this file (ruling 3).
 *
 * ## It takes keyword arguments where TypeScript takes an object, and that is a real divergence
 *
 * TypeScript can quote an object key, so `{{customer name}}` becomes `v: { "customer name": string }`
 * and the prompt's own name survives into the signature. **Python cannot.** A keyword argument must
 * be an identifier, and `TypedDict` — which can express the awkward names, through its functional
 * form — does not survive `mypy --strict` at the call site: a heterogeneous `TypedDict` reads as
 * `Mapping[str, object]`, so `resolve(id, dict(v))` fails against a `dict[str, str]` parameter.
 * Measured, not assumed; the probe is in EPIC-053's report.
 *
 * So the Python binding takes keyword arguments, converts each prompt variable name to a legal
 * parameter name, and **puts the real name back in the dict literal** one line later:
 *
 * ```python
 * def awkward(*, customer_name: str) -> ResolveResult:
 *     v: dict[str, str] = {"customer name": customer_name}
 *     return resolve("pr_bbbbbbbb", v)
 * ```
 *
 * The mapping is visible at the point it happens rather than hidden in a converter, which matters
 * because it is the one place the two languages' output is not a transliteration of each other.
 * EPIC-054's Review line asks for a divergence table; this is its first row.
 */

import { headerFor } from "./header.js";
import { identifierFor, identifiersFor } from "./identifiers.js";
import { CODEGEN_FILENAME, type CodegenPrompt, type CodegenVariable } from "./types.js";

/**
 * Words Python will not accept as an identifier.
 *
 * The hard keywords of 3.12, plus `_`. The soft keywords — `match`, `case`, `type` — are deliberately
 * **not** here: they are legal identifiers and suffixing them would rename a perfectly good parameter
 * for no reason. A prompt variable called `match` is common and works.
 */
const PYTHON_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
  "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in",
  "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with",
  "yield", "_",
]);

/**
 * `refundClassifier` -> `refund_classifier`, and a keyword gets PEP 8's trailing underscore.
 *
 * Takes the TypeScript identifier rather than the raw name so that the two languages agree about
 * collisions, leading digits and empty names — those rules live in `identifiers.ts` and are not
 * worth having twice.
 */
export function snakeCase(identifier: string): string {
  const snake = identifier
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1_$2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1_$2")
    .toLowerCase();
  return PYTHON_KEYWORDS.has(snake) ? `${snake}_` : snake;
}

/**
 * A prompt variable name as a Python parameter name.
 *
 * Anything that is not a letter, a digit or an underscore becomes an underscore; a leading digit
 * gets one in front, because `2fa` is not an identifier; an empty result becomes `v`; and a keyword
 * gets PEP 8's trailing underscore. The real name is not lost — it goes in the dict literal.
 */
export function parameterFor(variableName: string): string {
  const cleaned = variableName.replace(/[^\p{L}\p{N}_]/gu, "_").toLowerCase();
  const safe = cleaned.length === 0 ? "v" : /^\p{N}/u.test(cleaned) ? `_${cleaned}` : cleaned;
  return PYTHON_KEYWORDS.has(safe) ? `${safe}_` : safe;
}

/**
 * Parameter names for one prompt, with collisions resolved.
 *
 * `customer name` and `customer-name` both clean to `customer_name`, and a `def` with two parameters
 * of one name is a syntax error. The second gets a numeric suffix, in the order the variables are
 * listed, so the file is stable between pulls.
 */
function parametersFor(variables: readonly CodegenVariable[]): string[] {
  const taken = new Set<string>();
  return variables.map((variable) => {
    const base = parameterFor(variable.name);
    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) {
      candidate = `${base}${n}`;
      n += 1;
    }
    taken.add(candidate);
    return candidate;
  });
}

/** An undeclared variable is never optional. Same rule as TypeScript, same reason. */
const optional = (variable: CodegenVariable): boolean => variable.optional && variable.declared;

export function pythonPromptsFile(prompts: readonly CodegenPrompt[]): string {
  const header = headerFor(CODEGEN_FILENAME.python, "#");

  if (prompts.length === 0) {
    return [
      ...header,
      "",
      "# This project has no prompts yet. Create one and this file will have a function in it.",
      "",
    ].join("\n");
  }

  const identifiers = identifiersFor(prompts);
  const anyOptional = prompts.some((prompt) => prompt.variables.some(optional));

  const body = prompts.map((prompt) => {
    const name = snakeCase(identifiers.get(prompt.id) ?? identifierFor(prompt));
    if (prompt.variables.length === 0) {
      return [`def ${name}() -> ResolveResult:`, `    return resolve(${pyString(prompt.id)})`].join("\n");
    }

    const parameters = parametersFor(prompt.variables);
    const signature = prompt.variables
      .map((variable, i) =>
        optional(variable) ? `${parameters[i]}: Optional[str] = None` : `${parameters[i]}: str`,
      )
      .join(", ");

    // Required names go in the literal; optional ones are added only when supplied, so a variable
    // that falls back to its default is absent from the mapping rather than present and empty.
    const required = prompt.variables
      .map((variable, i) => ({ variable, parameter: parameters[i]! }))
      .filter(({ variable }) => !optional(variable));
    const literal = required.map(({ variable, parameter }) => `${pyString(variable.name)}: ${parameter}`).join(", ");

    const lines = [
      `def ${name}(*, ${signature}) -> ResolveResult:`,
      `    v: dict[str, str] = {${literal}}`,
    ];
    for (const [i, variable] of prompt.variables.entries()) {
      if (!optional(variable)) continue;
      lines.push(
        `    if ${parameters[i]} is not None:`,
        `        v[${pyString(variable.name)}] = ${parameters[i]}`,
      );
    }
    lines.push(`    return resolve(${pyString(prompt.id)}, v)`);
    return lines.join("\n");
  });

  return [
    ...header,
    "",
    // Imported only when something is optional: an unused import is a lint failure in the customer's
    // project, and the file we write should not be the thing that fails their build.
    ...(anyOptional ? ["from typing import Optional", ""] : []),
    "from fortyone import ResolveResult, resolve",
    "",
    "",
    ...interleave(body),
    "",
  ].join("\n");
}

/**
 * A Python string literal.
 *
 * `JSON.stringify` and Python's own repr agree on double quotes, backslash escapes and `\uXXXX`
 * for everything a prompt variable name can contain, and Python 3 source is UTF-8 by default — so
 * this is the same function TypeScript uses, named separately because the *reason* it is correct is
 * different in each language and a shared helper would hide that.
 */
const pyString = (value: string): string => JSON.stringify(value);

/** Two blank lines between top-level definitions, which is PEP 8 and what a formatter would do. */
const interleave = (parts: readonly string[]): string[] =>
  parts.flatMap((part, i) => (i === 0 ? [part] : ["", "", part]));

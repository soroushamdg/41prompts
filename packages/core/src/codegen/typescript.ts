// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The generated `prompts.ts` (EPIC-055, moved here by EPIC-053).
 *
 * Written by the Connect page so a person can copy it, and by `41p pull` so a person does not have
 * to. One function, two callers — `types.ts` has the argument.
 */

import { headerFor } from "./header.js";
import { identifierFor, identifiersFor } from "./identifiers.js";
import { CODEGEN_FILENAME, type CodegenPrompt } from "./types.js";

/**
 * A prompt with no variables takes no argument rather than an empty object: a signature a caller has
 * to satisfy with `{}` is a signature that teaches them the wrong thing about the API.
 */
export function typescriptPromptsFile(prompts: readonly CodegenPrompt[]): string {
  const header = headerFor(CODEGEN_FILENAME.typescript, "//");

  if (prompts.length === 0) {
    return [
      ...header,
      "",
      "// This project has no prompts yet. Create one and this file will have a function in it.",
      "",
    ].join("\n");
  }

  const identifiers = identifiersFor(prompts);
  const body = prompts.map((prompt) => {
    const identifier = identifiers.get(prompt.id) ?? identifierFor(prompt);
    if (prompt.variables.length === 0) {
      return [
        `export function ${identifier}() {`,
        `  return prompts.resolve(${JSON.stringify(prompt.id)});`,
        "}",
      ].join("\n");
    }
    const fields = prompt.variables
      .map((variable) => `${propertyKey(variable.name)}${optional(variable) ? "?" : ""}: string`)
      .join("; ");
    return [
      `export function ${identifier}(v: { ${fields} }) {`,
      `  return prompts.resolve(${JSON.stringify(prompt.id)}, v);`,
      "}",
    ].join("\n");
  });

  return [
    ...header,
    "",
    'import { createClient } from "@41prompts/sdk";',
    "",
    "const prompts = createClient({ apiKey: process.env.FORTYONE_API_KEY });",
    "",
    ...interleave(body),
    "",
  ].join("\n");
}

/**
 * An undeclared variable is never optional, whatever the row says.
 *
 * Optionality comes from a default, and a name nothing declares has no default to fall back on — so
 * a caller who omitted it would ship a prompt with a hole in it.
 */
const optional = (variable: { optional: boolean; declared: boolean }): boolean =>
  variable.optional && variable.declared;

/**
 * A variable name as an object key, quoted only when it has to be.
 *
 * Variable names come from `{{…}}` in somebody's prompt text and are not constrained to identifiers,
 * so `customer name` and `x-locale` are both possible and both need quoting. An unquoted one would
 * emit a file that does not compile, which is the one thing this function exists to prevent.
 */
function propertyKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

/** One blank line between each function. ADR-003 forbids the noun the obvious name here would use. */
const interleave = (parts: readonly string[]): string[] => parts.flatMap((part, i) => (i === 0 ? [part] : ["", part]));

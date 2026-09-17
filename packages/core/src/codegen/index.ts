// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/** Generated bindings, one function per prompt (EPIC-053). See `types.ts` for why this is here. */

export { LICENCE_LINE, headerFor } from "./header.js";
export { identifierFor, identifiersFor } from "./identifiers.js";
export { typescriptPromptsFile } from "./typescript.js";
export { parameterFor, pythonPromptsFile, snakeCase } from "./python.js";
export { CODEGEN_FILENAME } from "./types.js";
export type { CodegenLanguage, CodegenPrompt, CodegenVariable } from "./types.js";

import { typescriptPromptsFile } from "./typescript.js";
import { pythonPromptsFile } from "./python.js";
import type { CodegenLanguage, CodegenPrompt } from "./types.js";

/**
 * The bindings file for one language.
 *
 * A single entry point so a caller that has a `CodegenLanguage` in hand — `41p pull --lang` — does
 * not need its own switch, and so adding a third language is one case here rather than one case in
 * every caller.
 */
export function promptsFile(language: CodegenLanguage, prompts: readonly CodegenPrompt[]): string {
  return language === "python" ? pythonPromptsFile(prompts) : typescriptPromptsFile(prompts);
}

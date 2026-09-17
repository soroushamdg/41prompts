/**
 * The file the Connect page generates, and the snippets it shows (EPIC-055).
 *
 * ## Why the page generates it rather than previewing what `41p pull` writes
 *
 * `docs/roadmap.md` asks the Connect page for a "generated-file preview" and the mockup shows one
 * under a header crediting `41p pull`. That command is EPIC-053 and does not exist, and showing
 * somebody a preview of a file they cannot obtain is showing them a thing they cannot have.
 *
 * But the file is not the CLI's to own. Every fact in it — the prompt id, the declared variable
 * names, which of them have defaults — is already in this project's rows, so the page can write the
 * real thing and a person can paste it into their editor now. When EPIC-053 ships `41p pull`, this
 * is the file it writes; the page gains a clause and nothing else changes. Ruling 3.
 *
 * ## Everything here is pure
 *
 * No query, no DOM, no `fetch`. The page hands it rows and renders the string, which is what makes
 * the edge cases below testable at all — a prompt called "2024 Refunds!" has to become a legal
 * TypeScript identifier and the interesting part is which one.
 */

export interface ConnectPrompt {
  id: string;
  name: string;
  /** Declared variables, in the order the page shows them. `optional` means it has a default. */
  variables: readonly { name: string; optional: boolean }[];
}

/** The file's first lines. Kept here so the test and the page cannot disagree about them. */
export const GENERATED_FILE_HEADER = [
  "// prompts.ts — copy this into your project.",
  "// One function per prompt in this project. Regenerate it when you add one.",
] as const;

/**
 * A TypeScript identifier for a prompt name, or a fallback derived from its id.
 *
 * The rules, in order, and each one exists because a real prompt name breaks without it:
 *
 * - Split on anything that is not a letter or a digit, so `refund-classifier` and `Refund Classifier`
 *   both arrive at `refundClassifier`.
 * - Lower-case the first word and capitalise the rest. A name that is already camelCase survives.
 * - **A leading digit is not a legal identifier**, so `2024 refunds` would produce `2024Refunds`,
 *   which does not parse. It gets a `p` in front.
 * - A name with no letters or digits at all — `***` — yields nothing to work with, so the id is the
 *   name: `prompt_1a2b3c4d`. Losing the readable name is better than emitting a file that does not
 *   compile, and the id is beside it in the table anyway.
 */
export function identifierFor(prompt: { id: string; name: string }): string {
  const words = prompt.name.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
  if (words.length === 0) return `prompt_${prompt.id.replace(/[^\p{L}\p{N}]/gu, "")}`;

  const camel = words
    .map((word, index) => (index === 0 ? lowerFirst(word) : upperFirst(word)))
    .join("");
  return /^\p{N}/u.test(camel) ? `p${upperFirst(camel)}` : camel;
}

const lowerFirst = (word: string): string => word.charAt(0).toLowerCase() + word.slice(1);
const upperFirst = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The identifiers for a whole project, with collisions resolved.
 *
 * Two prompts called "Refund classifier" and "refund-classifier" normalise to the same name, and a
 * file with two `export function refundClassifier` does not compile. The second and subsequent ones
 * get a numeric suffix, in the order the page lists them, so the file is stable across reloads.
 */
export function identifiersFor(prompts: readonly ConnectPrompt[]): Map<string, string> {
  const taken = new Set<string>();
  const byPromptId = new Map<string, string>();

  for (const prompt of prompts) {
    const base = identifierFor(prompt);
    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) {
      candidate = `${base}${n}`;
      n += 1;
    }
    taken.add(candidate);
    byPromptId.set(prompt.id, candidate);
  }
  return byPromptId;
}

/**
 * The generated `prompts.ts`.
 *
 * A prompt with no declared variables takes no argument rather than an empty object: a signature a
 * caller has to satisfy with `{}` is a signature that teaches them the wrong thing about the API.
 */
export function generatedPromptsFile(prompts: readonly ConnectPrompt[]): string {
  if (prompts.length === 0) {
    return [
      ...GENERATED_FILE_HEADER,
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
      .map((variable) => `${propertyKey(variable.name)}${variable.optional ? "?" : ""}: string`)
      .join("; ");
    return [
      `export function ${identifier}(v: { ${fields} }) {`,
      `  return prompts.resolve(${JSON.stringify(prompt.id)}, v);`,
      "}",
    ].join("\n");
  });

  return [
    ...GENERATED_FILE_HEADER,
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

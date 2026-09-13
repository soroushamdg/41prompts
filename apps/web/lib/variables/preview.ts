import { occurrencesInText, type VariableDeclaration } from "@41prompts/core";

/**
 * The compiled prompt with each variable's default written in its place, **for reading only**.
 *
 * ## This never touches what ships
 *
 * It runs on `Compiled.text` after the compiler has produced it, in the view layer, and its result
 * goes to a screen and nowhere else. `blokHash`, `COMPILER_VERSION` and the artifact are all
 * untouched. A prompt whose compiled bytes depended on an example value would publish the example,
 * which is the failure this separation exists to make impossible rather than to remember.
 *
 * It is the same relationship `toDisplayText` has with the decompiler's source: one function
 * standing between the text a model reads and the text a person reads.
 *
 * ## A variable with no default keeps its braces
 *
 * A required variable has no value to show — under EPIC-022's ruling Q1 a variable is optional
 * *because* it has a default, so "required" and "has nothing to preview" are the same state. Leaving
 * `{{customer}}` visible is the honest rendering: it is what the prompt will contain if nobody
 * supplies one, which is exactly what the reader needs to see.
 *
 * Replacement runs right to left so that each offset is still valid when it is used — left to right,
 * a default longer than its placeholder would shift every occurrence after it.
 */
export function previewText(compiledText: string, declarations: readonly VariableDeclaration[]): string {
  const defaults = new Map(
    declarations.filter((d) => d.defaultValue !== null).map((d) => [d.name, d.defaultValue as string])
  );
  if (defaults.size === 0) return compiledText;

  const hits = occurrencesInText(compiledText, "preview").filter((o) => defaults.has(o.name));
  let out = compiledText;
  for (const hit of [...hits].reverse()) {
    out = out.slice(0, hit.start) + (defaults.get(hit.name) as string) + out.slice(hit.end);
  }
  return out;
}

/** Whether anything would change, so the surface can say "nothing to preview" rather than show a copy. */
export function hasPreviewableDefaults(
  compiledText: string,
  declarations: readonly VariableDeclaration[]
): boolean {
  return previewText(compiledText, declarations) !== compiledText;
}

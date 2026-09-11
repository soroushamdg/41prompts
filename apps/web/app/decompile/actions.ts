"use server";

import { type DecompileState } from "@/lib/decompile/limits";
import { runDecompile } from "@/lib/decompile/run";
import { SAMPLE_PROMPT } from "@/lib/decompile/sample";

/**
 * The form's entry into the pipeline.
 *
 * The pipeline itself is `lib/decompile/run.ts`, because EPIC-016's ask bar gave it a second caller:
 * `/decompile` can now arrive with a prompt already handed to it and must render a result on first
 * paint, without a form submission. This file is the FormData half of that, and nothing else.
 *
 * **Nothing but async functions may be exported from this file.** Next 16 rejects a `"use server"`
 * module that exports a constant or a type, and it does so at request time with a 500 rather than at
 * typecheck — which is why the cap, the state type and the copy all live in `lib/decompile/limits`.
 */
export async function decompile(_previous: DecompileState, formData: FormData): Promise<DecompileState> {
  const raw = formData.get("prompt");
  // The sample arrives as a flag, not as text: the form already has a `<textarea name="prompt">`,
  // so a second submit button carrying `name="prompt"` loses to it in `FormData.get`. One server
  // path either way — the sample is not a second code path to keep honest.
  const source = formData.get("sample") === "1" ? SAMPLE_PROMPT : typeof raw === "string" ? raw : "";
  return runDecompile(source);
}

import { createAnthropic } from "@ai-sdk/anthropic";
import { sdkProvider } from "./ai-sdk";
import type { Provider } from "./execute";
import type { FetchLike } from "./fetch-impl";

/**
 * The first real `Provider`. EPIC-031 declared the interface; EPIC-031a made the first real call
 * through it; EPIC-042 moved the body of it into `ai-sdk.ts` so that three adapters share one
 * carefully-reasoned payload decision instead of three copies of it.
 *
 * ## The key is never anywhere but here
 *
 * It is read from the key store or the environment by the caller, handed to the SDK factory, and
 * **never** written to a log, a stored payload, an error, or `runs.params`. `runs` already carries a
 * test asserting no stored payload contains a key-shaped string; this file is one of the three that
 * could break it.
 *
 * ## The model id reaching this function is already pinned
 *
 * `executeRun` refuses a model with no row in the price table before anything is constructed, and
 * every row there is a pinned id rather than a floating alias (`CLAUDE.md` rule 7's reasoning
 * applied to cost). So this never resolves an alias and never has to.
 */
export function anthropicProvider(apiKey: string, fetchImpl?: FetchLike): Provider {
  const anthropic = createAnthropic({ apiKey, ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }) });
  return sdkProvider("anthropic", (id) => anthropic(id));
}

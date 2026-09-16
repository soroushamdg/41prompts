import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import type { Provider, ProviderResponse } from "./execute";

/**
 * The first real `Provider`. EPIC-031 declared the interface; this implements it.
 *
 * ## The key is never anywhere but here
 *
 * It is read from the environment at construction, handed to the SDK, and **never** written to a
 * log, a stored payload, an error, or `runs.params`. `runs` already carries a test asserting no
 * stored payload contains a key-shaped string; this file is the one that could break it. The
 * response we store is the SDK's own response body, which the key does not appear in — requests
 * carry it, responses do not.
 *
 * ## The model id reaching this function is already pinned
 *
 * `executeRun` refuses a model with no row in the price table before anything is constructed, and
 * every row there is a pinned id rather than a floating alias (`CLAUDE.md` rule 7's reasoning
 * applied to cost). So this never resolves an alias and never has to.
 *
 * ## `usage` is read defensively, and zero is not invented
 *
 * `costCentsFor` multiplies token counts by a price. A missing count read as zero would charge
 * nothing for a call that happened, which is the "assume zero" failure the price table exists to
 * prevent, arriving one layer down. So an absent count becomes an estimate from the text rather
 * than a zero, and the number stays honest in the direction that protects the budget.
 */
export function anthropicProvider(apiKey: string): Provider {
  const anthropic = createAnthropic({ apiKey });

  return {
    async complete({ model, prompt, params }): Promise<ProviderResponse> {
      const result = await generateText({
        model: anthropic(model),
        prompt,
        temperature: typeof params.temperature === "number" ? params.temperature : undefined,
        maxOutputTokens: typeof params.maxOutputTokens === "number" ? params.maxOutputTokens : undefined
      });

      const inputTokens = result.usage?.inputTokens ?? estimateTokensFrom(prompt);
      const outputTokens = result.usage?.outputTokens ?? estimateTokensFrom(result.text);

      /**
       * **`response.body` came back undefined on the first real call** (EPIC-031a, 2026-09-16), so
       * this took its fallback branch and rule 6's "raw provider payload" was the SDK's normalised
       * view rather than Anthropic's JSON. The proof was in the stored row: token counts arrived as
       * `inputTokens`/`outputTokens`, which is the SDK's camelCase shape, where Anthropic's own body
       * uses `input_tokens`. Nothing about that is visible against a fake, which is the entire
       * argument for having made the call.
       *
       * Two things change here, and neither pretends the body was obtained:
       *
       * 1. **`modelId` is captured.** It is what the provider says it actually used, and it is the
       *    fact `CLAUDE.md` rule 7 is about — `claude-sonnet-5` is an alias, and until this is
       *    stored nobody can say what a given verdict was produced by.
       * 2. **The fallback labels itself.** A payload that is not the provider's body says so, so
       *    that a reader six months from now does not mistake a normalised view for the wire
       *    format, and so rule 6's gap is legible rather than silent.
       *
       * `result.response` is deprecated in `ai@7` in favour of `finalStep.response`; both are read,
       * preferring whichever carries data, because the deprecated one is what populated here.
       */
      const response = result.response ?? result.finalStep?.response;
      const body = response?.body;

      return {
        text: result.text,
        inputTokens,
        outputTokens,
        raw:
          body !== undefined && body !== null
            ? body
            : {
                provider: "anthropic",
                // Deliberately not shaped like a provider body: this is our view, and it says so.
                normalised: true,
                note: "the SDK surfaced no raw response body; this is its normalised view plus response metadata",
                text: result.text,
                usage: result.usage,
                model: response?.modelId,
                responseId: response?.id,
                timestamp: response?.timestamp
              }
      };
    }
  };
}

/** The same four-characters-per-token approximation `estimateTokens` uses, and as generous. */
function estimateTokensFrom(text: string): number {
  return Math.ceil(text.length / 4) + 1;
}

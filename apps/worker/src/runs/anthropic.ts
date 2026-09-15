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

      return {
        text: result.text,
        inputTokens,
        outputTokens,
        // Rule 6: the raw provider payload, unedited. `response.body` is the provider's own JSON.
        raw: result.response?.body ?? { text: result.text, usage: result.usage }
      };
    }
  };
}

/** The same four-characters-per-token approximation `estimateTokens` uses, and as generous. */
function estimateTokensFrom(text: string): number {
  return Math.ceil(text.length / 4) + 1;
}

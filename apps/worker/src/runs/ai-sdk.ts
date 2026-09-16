import { generateText, type LanguageModel } from "ai";
import type { Provider, ProviderResponse } from "./execute";

/**
 * The one place this project calls a model through the Vercel AI SDK.
 *
 * ## Why one place and not three
 *
 * EPIC-031a made the first real call and found `result.response?.body` undefined, so rule 6's "raw
 * provider payload" was the SDK's normalised view and the resolved model id was not being captured.
 * That was fixed in `anthropic.ts`. **EPIC-042 adds two more adapters, and three copies of a
 * carefully-reasoned fallback is three places for it to drift.** So the reasoning moved here and
 * the three adapters became three factories over it.
 *
 * Nothing about the behaviour changed in the move. `anthropic.ts` still exists, still carries its
 * own notes, and is now four lines.
 *
 * ## `generate` is injectable, and that is what the unit tests use
 *
 * A test that fakes the *HTTP* response has to encode a provider's wire format, which pins this
 * repository to a shape none of us controls and which changes without notice. A test that fakes
 * `generate` exercises exactly the logic this file owns — the usage fallback, the payload choice,
 * the latency window — and the separate wiring tests assert the URL each provider is actually
 * called at. Two cheap tests, each about one thing.
 */

/** What this file reads from a `generateText` result, and nothing else. */
export interface GenerateResult {
  readonly text: string;
  readonly usage?: { readonly inputTokens?: number | undefined; readonly outputTokens?: number | undefined } | undefined;
  readonly response?: ResponseMeta | undefined;
  readonly finalStep?: { readonly response?: ResponseMeta | undefined } | undefined;
}

interface ResponseMeta {
  readonly body?: unknown;
  readonly modelId?: string | undefined;
  readonly id?: string | undefined;
  readonly timestamp?: Date | undefined;
}

export interface GenerateArgs {
  readonly model: LanguageModel;
  readonly prompt: string;
  readonly temperature?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
}

export type Generate = (args: GenerateArgs) => Promise<GenerateResult>;

const generateWithSdk: Generate = (args) => generateText(args);

/**
 * A `Provider` over an AI SDK model factory.
 *
 * `name` is the provider's own name and reaches two places, neither of which is a secret: the
 * startup log, and `payload.raw.provider` on the fallback below. **The key never reaches either** —
 * it was handed to the factory before this function ever saw it.
 *
 * ## `usage` is read defensively, and zero is not invented
 *
 * `costCentsFor` multiplies token counts by a price. A missing count read as zero would charge
 * nothing for a call that happened, which is the "assume zero" failure the price table exists to
 * prevent, arriving one layer down. So an absent count becomes an estimate from the text rather
 * than a zero, and the number stays honest in the direction that protects the budget.
 */
export function sdkProvider(name: string, model: (id: string) => LanguageModel, generate: Generate = generateWithSdk): Provider {
  return {
    async complete({ model: modelId, prompt, params }): Promise<ProviderResponse> {
      const result = await generate({
        model: model(modelId),
        prompt,
        temperature: typeof params.temperature === "number" ? params.temperature : undefined,
        maxOutputTokens: typeof params.maxOutputTokens === "number" ? params.maxOutputTokens : undefined,
      });

      const inputTokens = result.usage?.inputTokens ?? estimateTokensFrom(prompt);
      const outputTokens = result.usage?.outputTokens ?? estimateTokensFrom(result.text);

      /**
       * **`response.body` came back undefined on the first real call** (EPIC-031a, 2026-09-16), so
       * this takes its fallback branch and rule 6's "raw provider payload" is the SDK's normalised
       * view rather than the provider's JSON. The proof was in the stored row: token counts arrived
       * as `inputTokens`/`outputTokens`, which is the SDK's camelCase shape, where Anthropic's own
       * body uses `input_tokens`. Nothing about that is visible against a fake, which is the entire
       * argument for having made the call.
       *
       * Two things neither pretend the body was obtained:
       *
       * 1. **`modelId` is captured.** It is what the provider says it actually used, and it is the
       *    fact `CLAUDE.md` rule 7 is about — until it is stored, nobody can say what a given
       *    verdict was produced by.
       * 2. **The fallback labels itself.** A payload that is not the provider's body says so, so a
       *    reader six months from now does not mistake a normalised view for the wire format, and
       *    so rule 6's gap is legible rather than silent.
       *
       * **Whether a normalised view satisfies rule 6 is still Soroush's question** (EPIC-031a's
       * report). It is unchanged by this epic except that it now applies to three adapters rather
       * than one, which is why the handling is here rather than copied.
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
                provider: name,
                // Deliberately not shaped like a provider body: this is our view, and it says so.
                normalised: true,
                note: "the SDK surfaced no raw response body; this is its normalised view plus response metadata",
                text: result.text,
                usage: result.usage,
                model: response?.modelId,
                responseId: response?.id,
                timestamp: response?.timestamp,
              },
      };
    },
  };
}

/** The same four-characters-per-token approximation `estimateTokens` uses, and as generous. */
function estimateTokensFrom(text: string): number {
  return Math.ceil(text.length / 4) + 1;
}

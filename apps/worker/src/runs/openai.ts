import { createOpenAI } from "@ai-sdk/openai";
import { sdkProvider } from "./ai-sdk";
import type { Provider } from "./execute";
import type { FetchLike } from "./fetch-impl";

/**
 * OpenAI, through the same `Provider` interface as the other two (EPIC-042).
 *
 * ## `.chat(...)`, not `openai(...)`
 *
 * `@ai-sdk/openai@4`'s default factory returns a **Responses API** model. That is a good default and
 * it is the wrong one here for one reason: the Responses API stores state server-side by default,
 * so a run would leave a conversation object behind at the provider under the *person's own key*,
 * outliving the run, on an account whose retention we neither control nor can promise anything
 * about. `/v1/chat/completions` is stateless, and the privacy page's retention table is a promise
 * this product has to be able to keep.
 *
 * The cost of the choice is that any Responses-only feature is unavailable. Nothing here uses one.
 */
export function openaiProvider(apiKey: string, fetchImpl?: FetchLike): Provider {
  const openai = createOpenAI({ apiKey, ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }) });
  return sdkProvider("openai", (id) => openai.chat(id));
}

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { sdkProvider } from "./ai-sdk";
import type { Provider } from "./execute";
import type { FetchLike } from "./fetch-impl";

/**
 * Google, through the same `Provider` interface as the other two (EPIC-042).
 *
 * ## The one thing about Google that is not like the other two
 *
 * A Gemini API key works on both the **unpaid** and the **paid** quota, and the two have different
 * data terms: on the unpaid quota Google uses the prompts and responses to improve its products and
 * human reviewers may read them, and on the paid quota it does not.
 * `docs/providers/usage-policies.md` has the citation. Nothing in this file can tell which quota a
 * key is on — the API does not say — so the product cannot warn a person about it from the key
 * alone, and the settings page states it for every Google key instead.
 */
export function googleProvider(apiKey: string, fetchImpl?: FetchLike): Provider {
  const google = createGoogleGenerativeAI({ apiKey, ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }) });
  return sdkProvider("google", (id) => google(id));
}

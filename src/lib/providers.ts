import type { Provider } from "@/db/schema";

export const PROVIDER_LABEL: Record<Provider, string> = { openai: "OpenAI", anthropic: "Anthropic", google: "Google Gemini" };
export const PROVIDER_MODEL_FAMILY: Record<Provider, string> = { openai: "GPT", anthropic: "Claude", google: "Gemini" };
export const PROVIDER_ORDER: Provider[] = ["openai", "anthropic", "google"];

/** "2 of 3 model keys connected. Add a Google key to run prompts on Gemini." */
export function keysNotice(connected: Provider[]): string | null {
  const missing = PROVIDER_ORDER.filter((p) => !connected.includes(p));
  if (!missing.length) return null;
  if (!connected.length) return "No model keys yet. Add one to run prompts on your own account.";
  const names = (ps: Provider[], f: Record<Provider, string>) => ps.map((p) => f[p]).join(" and ");
  return `${connected.length} of 3 model keys connected. Add ${missing.length === 1 ? "a" : ""} ${names(missing, { openai: "OpenAI", anthropic: "Anthropic", google: "Google" })} key${missing.length > 1 ? "s" : ""} to run prompts on ${names(missing, PROVIDER_MODEL_FAMILY)}.`.replace("  ", " ");
}

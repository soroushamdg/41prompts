import type { Provider } from "@/db/schema";

/* The models a Free run can use, with list prices in USD per million tokens.
   Prices were checked on the vendors' own pricing pages on PRICES_CHECKED;
   edit this file when they change. Cost shown in the app is an estimate:
   the provider bills the user's own key. */

export const PRICES_CHECKED = "2026-10-09";

export type ModelInfo = { id: string; label: string; input: number; output: number; note?: string };

export const MODELS: Record<Provider, ModelInfo[]> = {
  openai: [
    { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", input: 2, output: 10 },
    { id: "gpt-6-astra", label: "GPT-6 Astra", input: 10, output: 50 },
    { id: "gpt-6-luna", label: "GPT-6 Luna", input: 0.1, output: 0.5 },
  ],
  anthropic: [
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", input: 2, output: 10 },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", input: 4, output: 20 },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", input: 0.1, output: 0.5, note: "Up to 100K prompt tokens" },
  ],
  google: [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", input: 0.75, output: 3.75, note: "Introductory price until Dec 31, 2026" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", input: 2, output: 12 },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", input: 0.3, output: 2.5 },
  ],
};

export function findModel(provider: Provider, id: string): ModelInfo | undefined {
  return MODELS[provider].find((m) => m.id === id);
}

/** Estimated USD cost of one call. Unknown models cost null ("—"). */
export function costUsd(provider: Provider, model: string, inputTokens: number, outputTokens: number): number | null {
  const m = findModel(provider, model);
  if (!m) return null;
  return (inputTokens * m.input + outputTokens * m.output) / 1_000_000;
}

export function formatCost(usd: number | null): string {
  if (usd === null) return "—";
  return `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(3)}`;
}

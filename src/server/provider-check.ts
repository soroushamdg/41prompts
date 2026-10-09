import "server-only";
import type { Provider } from "@/db/schema";
import { isE2E } from "@/lib/env";
import { PROVIDER_LABEL } from "@/lib/providers";

/* "Test connection" (M07): a timed list-models call, which spends no tokens.
   Keys travel in headers only (never in a URL that could be logged). */

export type CheckResult = { ok: true; ms: number } | { ok: false; reason: "refused" | "rate" | "unreachable"; message: string };

const ENDPOINT: Record<Provider, (key: string) => [string, RequestInit]> = {
  openai: (key) => ["https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } }],
  anthropic: (key) => ["https://api.anthropic.com/v1/models", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } }],
  google: (key) => ["https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": key } }],
};

export async function checkKey(provider: Provider, key: string): Promise<CheckResult> {
  const name = PROVIDER_LABEL[provider];
  if (isE2E()) {
    if (key.includes("bad")) return { ok: false, reason: "refused", message: `${name} refused that key. Check it and try again.` };
    return { ok: true, ms: 212 };
  }
  const [url, init] = ENDPOINT[provider](key);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    const ms = Math.round(performance.now() - t0);
    if (res.ok) return { ok: true, ms };
    if (res.status === 429) return { ok: false, reason: "rate", message: `${name} is rate limiting this key right now. The key itself looks fine.` };
    if (res.status === 401 || res.status === 403 || res.status === 400) return { ok: false, reason: "refused", message: `${name} refused that key. Check it and try again.` };
    return { ok: false, reason: "unreachable", message: `${name} answered with an error (${res.status}). Try again in a moment.` };
  } catch {
    return { ok: false, reason: "unreachable", message: `${name} did not answer. Try again in a moment.` };
  }
}

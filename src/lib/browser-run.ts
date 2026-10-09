import { createParser } from "eventsource-parser";
import { type BrowserId, browserReach, costUsd, isLocalAddress, type Prices } from "./catalog";
import { type ModelEntry, parseModelList, sortModels } from "./model-list";
import type { RunEvent } from "./run-events";

/* Models on the user's own computer or network run from the browser (M06,
   M07): the request goes straight from this tab to their server, so nothing
   passes through ours, and any key for it stays in this browser. Speaks the
   OpenAI chat-completions protocol that Ollama, LM Studio, vLLM, llama.cpp
   and most local servers share. */

export type BrowserTarget = { provider: string; baseURL: string; apiKey?: string; modelId: string; includeUsage: boolean };

/** Thrown when the browser could not reach the server at all. */
export class UnreachableError extends Error {
  kind = "unreachable" as const;
}

const base = (url: string) => url.replace(/\/+$/, "");

const isLoopbackHost = (host: string) => host === "localhost" || host.endsWith(".localhost") || /^127\./.test(host) || host === "::1";

/** Which of Chrome's Local Network Access permissions an address needs, if any. */
export function addressSpace(url: string): "loopback" | "local" | undefined {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    if (isLoopbackHost(host)) return "loopback";
    return isLocalAddress(url) ? "local" : undefined;
  } catch {
    return undefined;
  }
}

/** Chrome lets an https page fetch a plain http:// local address only when the
    request says up front that it is local. Https needs no hint, and a wrong
    hint fails the request, so it is only sent for http://. */
function spaceHint(url: string): "loopback" | "local" | undefined {
  return url.startsWith("http:") ? addressSpace(url) : undefined;
}

/** Whether the user blocked this site from local addresses (Chrome, Firefox). */
export async function localPermissionDenied(url: string): Promise<boolean> {
  const space = addressSpace(url);
  if (!space || typeof navigator === "undefined" || !navigator.permissions) return false;
  try {
    const st = await navigator.permissions.query({ name: space === "loopback" ? "loopback-network" : "local-network" } as unknown as PermissionDescriptor);
    return st.state === "denied";
  } catch {
    return false;
  }
}

async function call(url: string, init: RequestInit & { targetAddressSpace?: string }): Promise<Response> {
  const space = spaceHint(url);
  try {
    // targetAddressSpace is Chrome's Local Network Access hint; other browsers ignore it.
    return await fetch(url, { ...init, mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", ...(space ? { targetAddressSpace: space } : {}) });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new UnreachableError("Your browser could not reach the server.");
  }
}

const authHeader = (apiKey?: string): Record<string, string> => (apiKey ? { authorization: `Bearer ${apiKey}` } : {});

async function errorText(res: Response, name: string): Promise<string> {
  const body = await res.text().catch(() => "");
  let detail = "";
  try {
    const j = JSON.parse(body) as { error?: string | { message?: string }; message?: string };
    detail = typeof j.error === "string" ? j.error : (j.error?.message ?? j.message ?? "");
  } catch {
    detail = "";
  }
  detail = detail.replace(/\s+/g, " ").trim().slice(0, 200);
  if (res.status === 401 || res.status === 403) return `${name} refused the key. Check it in Settings.`;
  if (res.status === 404) return detail ? `${name}: ${detail}` : `${name} does not have this model. Check the model ID, or that the address ends in /v1.`;
  return detail ? `${name} answered with an error (${res.status}): ${detail}` : `${name} answered with an error (${res.status}).`;
}

/** Lists the models a local server offers. */
export async function listModelsInBrowser(provider: string, name: string, baseURL: string, apiKey?: string): Promise<{ ms: number; models: ModelEntry[] }> {
  const t0 = performance.now();
  const res = await call(`${base(baseURL)}/models`, { headers: { accept: "application/json", ...authHeader(apiKey) }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(await errorText(res, name));
  const json = await res.json().catch(() => {
    throw new Error(`${name} did not answer with a model list. Check the address; it usually ends in /v1.`);
  });
  return { ms: Math.round(performance.now() - t0), models: sortModels(parseModelList(provider, json)) };
}

type Chunk = { choices?: Array<{ delta?: { content?: string | null } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } | null; error?: { message?: string } };

/** Runs once from this tab, yielding the same events as /api/run. */
export async function* runInBrowser(t: BrowserTarget, name: string, system: string, message: string, prices: Prices, signal: AbortSignal): AsyncGenerator<RunEvent> {
  const t0 = performance.now();
  yield { t: "start", model: t.modelId };
  const body = (withUsage: boolean) =>
    JSON.stringify({
      model: t.modelId,
      messages: [...(system.trim() ? [{ role: "system", content: system }] : []), { role: "user", content: message }],
      stream: true,
      max_tokens: 2048,
      ...(withUsage ? { stream_options: { include_usage: true } } : {}),
    });
  const send = (withUsage: boolean) =>
    call(`${base(t.baseURL)}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", ...authHeader(t.apiKey) }, body: body(withUsage), signal });
  let res = await send(t.includeUsage);
  // Some servers reject stream_options; try once more without it.
  if (t.includeUsage && (res.status === 400 || res.status === 422)) res = await send(false);
  if (!res.ok || !res.body) {
    yield { t: "error", message: await errorText(res, name) };
    return;
  }

  const queue: RunEvent[] = [];
  let usage: { input: number | null; output: number | null } = { input: null, output: null };
  const parser = createParser({
    onEvent(e) {
      if (e.data === "[DONE]") return;
      let chunk: Chunk;
      try {
        chunk = JSON.parse(e.data) as Chunk;
      } catch {
        return;
      }
      if (chunk.error) queue.push({ t: "error", message: `${name}: ${(chunk.error.message ?? "the run failed").slice(0, 200)}` });
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) queue.push({ t: "delta", text });
      if (chunk.usage) usage = { input: chunk.usage.prompt_tokens ?? null, output: chunk.usage.completion_tokens ?? null };
    },
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let failed = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.feed(value);
    while (queue.length) {
      const ev = queue.shift()!;
      if (ev.t === "error") failed = true;
      yield ev;
    }
  }
  if (!failed) yield { t: "done", inputTokens: usage.input, outputTokens: usage.output, ms: Math.round(performance.now() - t0), cost: costUsd(prices, usage.input, usage.output) };
}

/* ---- Keys for browser models live only in this browser ------------------------ */

const secretKey = (userId: string, id: string) => `41p:local-secret:${userId}:${id}`;

export function getLocalSecret(userId: string, id: string): string | undefined {
  try {
    return (JSON.parse(localStorage.getItem(secretKey(userId, id)) ?? "{}") as { apiKey?: string }).apiKey || undefined;
  } catch {
    return undefined;
  }
}

export function setLocalSecret(userId: string, id: string, apiKey: string | undefined): void {
  try {
    if (apiKey) localStorage.setItem(secretKey(userId, id), JSON.stringify({ apiKey }));
    else localStorage.removeItem(secretKey(userId, id));
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    /* storage unavailable */
  }
}

const CHANGED = "41p:local-secret";

/** For useSyncExternalStore: fires when a browser model's key changes here or in another tab. */
export function subscribeLocalSecrets(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
}

/* ---- Which browser is this ------------------------------------------------- */

export function detectBrowser(): BrowserId | null {
  if (typeof navigator === "undefined") return null;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData?.brands;
  if (brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand))) return "chrome";
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return null;
}

/** Why this browser cannot reach an address, or null if it can. */
export function blockedHere(baseURL: string): string | null {
  const me = detectBrowser();
  const r = me && browserReach(baseURL).find((x) => x.browser === me);
  if (!r || r.ok) return null;
  if (me === "safari" && addressSpace(baseURL) === "loopback") return "Safari can't reach http:// addresses, even on this computer. Use Chrome, Edge or Firefox, or serve the model over HTTPS.";
  const who = me === "firefox" ? "Firefox" : "Safari";
  return `${who} can't reach http:// addresses on your network. Use Chrome or Edge, or serve the model over HTTPS.`;
}

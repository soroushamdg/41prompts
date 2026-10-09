import "server-only";
import { generateText } from "ai";
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { rateLimit } from "@/db/schema";
import { type ProviderDef, type Secret, type Settings } from "@/lib/catalog";
import { isE2E } from "@/lib/env";
import { type ModelEntry, nextPageQuery, parseModelList, sortModels } from "@/lib/model-list";
import { guardedFetch } from "./net/guarded-fetch";
import { baseUrlFor, languageModelFor, providerErrorMessage } from "./providers";

/* "Connect & load models" and "Test" (M07) for models run by our server: one
   call that checks the key and lists the models it can use, spending no
   tokens. Providers without a model list get a one-token test message. */

export type ProbeResult =
  | { ok: true; ms: number; models: ModelEntry[] | null; keyChecked: boolean }
  | { ok: false; refused: boolean; message: string };

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

export function authHeaders(def: ProviderDef, secret: Secret | null): Record<string, string> {
  const key = secret?.apiKey;
  if (def.protocol === "anthropic") return key ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : {};
  if (def.protocol === "google") return key ? { "x-goog-api-key": key } : {};
  if (def.protocol === "azure") return key ? { "api-key": key } : {};
  return { ...def.headers, ...secret?.headers, ...(key ? { authorization: `Bearer ${key}` } : {}) };
}

function orgHeaders(def: ProviderDef, settings: Settings): Record<string, string> {
  if (def.protocol !== "openai") return {};
  return { ...(settings.organization ? { "OpenAI-Organization": settings.organization } : {}), ...(settings.project ? { "OpenAI-Project": settings.project } : {}) };
}

/** Reads a JSON body, refusing anything over 2 MB. */
async function readJson(res: Response): Promise<unknown> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("The model list is larger than 2 MB.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const resolve = (base: string, path: string) => (/^https?:\/\//.test(path) ? path : `${base}${path}`);

function statusResult(name: string, status: number): ProbeResult {
  if (status === 401 || status === 403) return { ok: false, refused: true, message: `${name} refused that key. Check it and try again.` };
  if (status === 429) return { ok: false, refused: false, message: `${name} is rate limiting this key right now. Try again in a minute.` };
  if (status === 404) return { ok: false, refused: false, message: `Nothing answered at that address (404). Check the URL; it usually ends in /v1.` };
  return { ok: false, refused: false, message: `${name} answered with an error (${status}). Try again in a moment.` };
}

export async function probe(def: ProviderDef, settings: Settings, secret: Secret | null): Promise<ProbeResult> {
  if (isE2E()) return fakeProbe(def, secret);
  if (!def.models) return { ok: true, ms: 0, models: null, keyChecked: false };
  const base = baseUrlFor(def, settings);
  const headers = { ...authHeaders(def, secret), ...orgHeaders(def, settings), accept: "application/json" };
  const t0 = performance.now();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    if (def.keyCheck) {
      const res = await guardedFetch(resolve(base, def.keyCheck), { headers, signal });
      await res.body?.cancel();
      if (!res.ok) return statusResult(def.name, res.status);
    }
    const listHeaders = def.models.auth ? headers : { ...def.headers, accept: "application/json" };
    let url = resolve(base, def.models.url);
    const models: ModelEntry[] = [];
    for (let page = 0; page < 5; page++) {
      const res = await guardedFetch(url, { headers: listHeaders, signal });
      if (!res.ok) {
        await res.body?.cancel();
        return statusResult(def.name, res.status);
      }
      const json = await readJson(res);
      models.push(...parseModelList(def.id, json));
      const next = nextPageQuery(def.id, json);
      if (!next) break;
      url = `${resolve(base, def.models.url)}${def.models.url.includes("?") ? "&" : "?"}${next}`;
    }
    const ms = Math.round(performance.now() - t0);
    return { ok: true, ms, models: sortModels(withCatalogPrices(def, models)), keyChecked: def.models.auth || Boolean(def.keyCheck) };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, refused: false, message: `${def.name} did not answer with a model list. Check the URL; it usually ends in /v1.` };
    return { ok: false, refused: false, message: providerErrorMessage(def.name, error, "test") };
  }
}

function withCatalogPrices(def: ProviderDef, models: ModelEntry[]): ModelEntry[] {
  if (!def.prices) return models;
  return models.map((m) => {
    if (m.input !== undefined) return m;
    const p = def.prices![m.id];
    return p ? { ...m, input: p[0], output: p[1], source: "catalog" as const } : m;
  });
}

/** One short call that spends a few tokens, for providers with no model list. */
export async function testMessage(def: ProviderDef, settings: Settings, modelId: string, secret: Secret | null): Promise<{ ok: true; ms: number } | { ok: false; message: string }> {
  if (isE2E() && secret?.apiKey?.includes("bad")) return { ok: false, message: `${def.name} refused the key.` };
  const t0 = performance.now();
  try {
    await generateText({
      model: await languageModelFor({ provider: def.id, modelId, settings }, secret),
      prompt: "Reply with OK.",
      maxOutputTokens: 16,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30_000),
    });
    return { ok: true, ms: Math.round(performance.now() - t0) };
  } catch (error) {
    return { ok: false, message: providerErrorMessage(def.name, error, "test") };
  }
}

function fakeProbe(def: ProviderDef, secret: Secret | null): ProbeResult {
  if (secret?.apiKey?.includes("bad")) return { ok: false, refused: true, message: `${def.name} refused that key. Check it and try again.` };
  if (!def.models) return { ok: true, ms: 0, models: null, keyChecked: false };
  const known = Object.entries(def.prices ?? {}).map(([id, [input, output]]) => ({ id, input, output, source: "catalog" as const }));
  const models = known.length ? known : [{ id: def.modelPlaceholder.replace(/\s+/g, "-") }, { id: `${def.id}-mini` }];
  return { ok: true, ms: 212, models: sortModels(models), keyChecked: true };
}

/* ---- Prices ---------------------------------------------------------------- */

type PriceMap = Map<string, [number, number]>;
let openRouterCache: { at: number; map: PriceMap } | null = null;

const normal = (id: string) => id.toLowerCase().replace(/\./g, "-").replace(/-\d{8}$/, "").replace(/-latest$/, "");

/** OpenRouter's public price list, cached for a day. Used as an estimate. */
async function openRouterPrices(): Promise<PriceMap> {
  if (openRouterCache && Date.now() - openRouterCache.at < 86_400_000) return openRouterCache.map;
  const map: PriceMap = new Map();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(8_000) });
    if (res.ok) for (const m of parseModelList("openrouter", await res.json())) if (m.input !== undefined && m.output !== undefined) map.set(normal(m.id), [m.input, m.output]);
  } catch {
    /* no estimate then */
  }
  openRouterCache = { at: Date.now(), map };
  return map;
}

export type SuggestedPrice = { input: number; output: number; source: "catalog" | "openrouter" | "local" } | null;

/** The best price we know for a model the provider did not price itself. */
export async function suggestPrice(def: ProviderDef, runsIn: "server" | "browser", modelId: string): Promise<SuggestedPrice> {
  const listed = def.prices?.[modelId];
  if (listed) return { input: listed[0], output: listed[1], source: "catalog" };
  if (def.group === "local" || (def.id === "custom" && runsIn === "browser")) return { input: 0, output: 0, source: "local" };
  if (!def.openRouterVendor || isE2E()) return null;
  const map = await openRouterPrices();
  const hit = map.get(normal(`${def.openRouterVendor}/${modelId.replace(/^.*\//, "")}`));
  return hit ? { input: hit[0], output: hit[1], source: "openrouter" } : null;
}

/* ---- Rate limit -------------------------------------------------------------- */

/** True while `key` is within `limit` calls per window. Shares Better Auth's table. */
export async function withinLimit(db: Db, key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const [row] = await db
    .insert(rateLimit)
    .values({ id: `41p:${key}`, key: `41p:${key}`, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${rateLimit.lastRequest} < ${now - windowMs} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${rateLimit.lastRequest} < ${now - windowMs} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count });
  return (row?.count ?? 0) <= limit;
}

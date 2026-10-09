/* Turns each provider's list-models answer into one shape (M07). Shared by
   the server (hosted providers) and the browser (models on the user's own
   machine). Prices are USD per 1M tokens; a provider that lists no price
   leaves them out. */

export type ModelEntry = { id: string; name?: string; input?: number; output?: number; source?: "provider" | "catalog" };

const NOT_CHAT = /(^|[-_/:.])(embed|embedding|embeddings|whisper|tts|dall-e|moderation|rerank|transcribe|speech|image-gen|imagen|veo|sora|text-search|similarity|audio-preview)([-_/:.]|$)|^(babbage|davinci)(-|$)/i;

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const perToken = (v: unknown) => {
  const n = num(v);
  return n === undefined ? undefined : Math.round(n * 1e6 * 1e6) / 1e6;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

/** Pricing from the providers that include it in their model list. */
function priceOf(provider: string, m: Obj): Pick<ModelEntry, "input" | "output"> {
  const p = obj(m.pricing);
  switch (provider) {
    case "openrouter":
      return { input: perToken(p.prompt), output: perToken(p.completion) };
    case "vercel":
      return { input: perToken(p.input), output: perToken(p.output) };
    case "together":
      return { input: num(p.input), output: num(p.output) };
    case "deepinfra": {
      const d = obj(obj(m.metadata).pricing);
      return { input: num(d.input_tokens), output: num(d.output_tokens) };
    }
    case "huggingface": {
      const live = (Array.isArray(m.providers) ? (m.providers as Obj[]) : []).map((x) => obj(x.pricing)).filter((x) => num(x.input) !== undefined && num(x.output) !== undefined);
      if (!live.length) return {};
      const cheapest = live.reduce((a, b) => (num(b.input)! + num(b.output)! < num(a.input)! + num(a.output)! ? b : a));
      return { input: num(cheapest.input), output: num(cheapest.output) };
    }
    default:
      return {};
  }
}

/** One page of a list-models response, in our shape. */
export function parseModelList(provider: string, json: unknown): ModelEntry[] {
  const root = obj(json);
  let items: ModelEntry[] = [];
  if (provider === "google") {
    items = (Array.isArray(root.models) ? (root.models as Obj[]) : [])
      .filter((m) => !Array.isArray(m.supportedGenerationMethods) || (m.supportedGenerationMethods as string[]).includes("generateContent"))
      .map((m) => ({ id: String(m.name ?? "").replace(/^models\//, ""), name: str(m.displayName) }));
  } else if (provider === "cohere") {
    items = (Array.isArray(root.models) ? (root.models as Obj[]) : []).map((m) => ({ id: String(m.name ?? ""), name: undefined }));
  } else {
    const list = Array.isArray(root.data) ? root.data : Array.isArray(json) ? (json as unknown[]) : Array.isArray(root.models) ? root.models : [];
    items = (list as unknown[]).map((raw) => {
      const m = obj(raw);
      const entry: ModelEntry = { id: String(m.id ?? m.name ?? m.model ?? ""), name: str(m.display_name) ?? str(m.name) };
      const price = priceOf(provider, m);
      if (price.input !== undefined && price.output !== undefined) Object.assign(entry, price, { source: "provider" });
      return entry;
    });
  }
  const seen = new Set<string>();
  return items.filter((m) => {
    if (!m.id || m.id.length > 200 || /\s/.test(m.id) || seen.has(m.id) || NOT_CHAT.test(m.id)) return false;
    seen.add(m.id);
    if (m.name === m.id) delete m.name;
    return true;
  });
}

/** Where the next page is, for providers that page their list. */
export function nextPageQuery(provider: string, json: unknown): string | null {
  const root = obj(json);
  if (provider === "anthropic" && root.has_more === true && typeof root.last_id === "string") return `after_id=${encodeURIComponent(root.last_id)}`;
  if (provider === "google" && typeof root.nextPageToken === "string" && root.nextPageToken) return `pageToken=${encodeURIComponent(root.nextPageToken)}`;
  return null;
}

/** Sorted for a picker: ids grouped by vendor prefix, then by name. */
export function sortModels(models: ModelEntry[]): ModelEntry[] {
  return [...models].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

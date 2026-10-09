import { z } from "zod";

/* Model providers a user can bring (M07). Pure data plus validation, shared by
   the browser and the server. Hosted providers run from our server with the
   user's encrypted key; models on the user's own computer or network run
   straight from their browser. Base URLs and endpoints checked 2026-10-10;
   edit this file when a provider changes. */

export type Protocol = "openai" | "anthropic" | "google" | "azure" | "bedrock" | "openai-compatible";
export type RunsIn = "server" | "browser";
export type Group = "popular" | "more" | "local" | "custom";

export type SettingKey = "baseURL" | "organization" | "project" | "resourceName" | "apiVersion" | "region";
export type SecretKey = "apiKey" | "accessKeyId" | "secretAccessKey" | "sessionToken";

export type Field = {
  key: SettingKey | SecretKey | "headers";
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
  help?: string;
  /** Shown under "More options". */
  advanced?: boolean;
};

export type ProviderDef = {
  id: string;
  name: string;
  group: Group;
  protocol: Protocol;
  /** Where it runs; "either" lets the user choose (Custom). */
  runsIn: RunsIn | "either";
  baseURL?: string;
  fields: Field[];
  /** Where to get a key. */
  keyUrl?: string;
  /** Model list, relative to baseURL unless absolute. `auth` says whether it needs the key. */
  models?: { url: string; auth: boolean } | null;
  /** Checks the key when the model list is public. */
  keyCheck?: string;
  /** Ask OpenAI-compatible servers to report usage while streaming. */
  includeUsage: boolean;
  modelPlaceholder: string;
  /** Typed suggestions when the provider has no model list. */
  suggested?: string[];
  /** Fixed request headers (attribution). */
  headers?: Record<string, string>;
  /** Prefix for looking the model up in OpenRouter's public price list. */
  openRouterVendor?: string;
  /** Known list prices, USD per 1M tokens [input, output]. */
  prices?: Record<string, [number, number]>;
  note?: string;
};

export const PRICES_CHECKED = "2026-10-09";

const KEY: Field = { key: "apiKey", label: "API key", secret: true, required: true, placeholder: "Paste your API key" };
const optionalKey = (help: string): Field => ({ key: "apiKey", label: "API key (optional)", secret: true, required: false, placeholder: "Only if the server asks for one", help });

const hosted = (p: Omit<ProviderDef, "group" | "runsIn" | "protocol" | "fields" | "includeUsage"> & Partial<ProviderDef>): ProviderDef => ({
  group: "more",
  runsIn: "server",
  protocol: "openai-compatible",
  fields: [KEY],
  includeUsage: true,
  models: { url: "/models", auth: true },
  ...p,
});

export const PROVIDERS: ProviderDef[] = [
  // ---- Popular --------------------------------------------------------------
  {
    id: "openai",
    name: "OpenAI",
    group: "popular",
    protocol: "openai",
    runsIn: "server",
    baseURL: "https://api.openai.com/v1",
    fields: [
      KEY,
      { key: "organization", label: "Organization ID", secret: false, required: false, placeholder: "org-…", advanced: true },
      { key: "project", label: "Project ID", secret: false, required: false, placeholder: "proj_…", advanced: true },
    ],
    keyUrl: "https://platform.openai.com/api-keys",
    models: { url: "/models", auth: true },
    includeUsage: true,
    modelPlaceholder: "gpt-6.1-sol",
    openRouterVendor: "openai",
    prices: { "gpt-6.1-sol": [2, 10], "gpt-6-astra": [10, 50], "gpt-6-luna": [0.1, 0.5] },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    group: "popular",
    protocol: "anthropic",
    runsIn: "server",
    baseURL: "https://api.anthropic.com/v1",
    fields: [KEY],
    keyUrl: "https://platform.claude.com/settings/keys",
    models: { url: "/models?limit=1000", auth: true },
    includeUsage: true,
    modelPlaceholder: "claude-sonnet-5-5",
    openRouterVendor: "anthropic",
    prices: { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5], "claude-fable-5-1": [10, 50] },
  },
  {
    id: "google",
    name: "Google Gemini",
    group: "popular",
    protocol: "google",
    runsIn: "server",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    fields: [KEY],
    keyUrl: "https://aistudio.google.com/apikey",
    models: { url: "/models?pageSize=1000", auth: true },
    includeUsage: true,
    modelPlaceholder: "gemini-3.8-flash",
    openRouterVendor: "google",
    prices: { "gemini-3.8-flash": [0.75, 3.75], "gemini-3.1-pro-preview": [2, 12], "gemini-3.5-flash-lite": [0.3, 2.5] },
  },
  hosted({
    id: "openrouter",
    name: "OpenRouter",
    group: "popular",
    baseURL: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/settings/keys",
    models: { url: "/models", auth: false },
    keyCheck: "/key",
    // OpenRouter always reports usage; stream_options is ignored there.
    includeUsage: false,
    modelPlaceholder: "anthropic/claude-sonnet-5-5",
    headers: { "HTTP-Referer": "https://41prompts.ai", "X-Title": "41prompts" },
    note: "One key for hundreds of models from many labs.",
  }),

  // ---- More providers (A–Z) ---------------------------------------------------
  {
    id: "bedrock",
    name: "Amazon Bedrock",
    group: "more",
    protocol: "bedrock",
    runsIn: "server",
    fields: [
      { key: "region", label: "AWS region", secret: false, required: true, placeholder: "us-east-1" },
      { key: "apiKey", label: "Bedrock API key", secret: true, required: false, placeholder: "Or use access keys below", help: "A Bedrock API key, or an access key pair under More options." },
      { key: "accessKeyId", label: "Access key ID", secret: true, required: false, placeholder: "AKIA…", advanced: true },
      { key: "secretAccessKey", label: "Secret access key", secret: true, required: false, advanced: true },
      { key: "sessionToken", label: "Session token", secret: true, required: false, advanced: true, help: "Only for temporary credentials." },
    ],
    keyUrl: "https://console.aws.amazon.com/bedrock/home#/api-keys",
    models: null,
    includeUsage: true,
    modelPlaceholder: "us.anthropic.claude-sonnet-5-5-v1:0",
    note: "Newer models need an inference profile ID (us., eu. or apac.).",
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    group: "more",
    protocol: "azure",
    runsIn: "server",
    fields: [
      { key: "resourceName", label: "Resource name", secret: false, required: true, placeholder: "my-resource", help: "From https://<resource>.openai.azure.com" },
      KEY,
      { key: "apiVersion", label: "API version", secret: false, required: false, placeholder: "v1", advanced: true },
    ],
    keyUrl: "https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI",
    models: null,
    includeUsage: true,
    modelPlaceholder: "your deployment name",
    note: "The model is your deployment's name.",
  },
  hosted({ id: "cerebras", name: "Cerebras", baseURL: "https://api.cerebras.ai/v1", keyUrl: "https://cloud.cerebras.ai", modelPlaceholder: "llama-4-scout-17b-16e-instruct" }),
  hosted({
    id: "cohere",
    name: "Cohere",
    baseURL: "https://api.cohere.ai/compatibility/v1",
    keyUrl: "https://dashboard.cohere.com/api-keys",
    models: { url: "https://api.cohere.com/v1/models?endpoint=chat", auth: true },
    includeUsage: false,
    modelPlaceholder: "command-a-03-2025",
    openRouterVendor: "cohere",
  }),
  hosted({ id: "deepinfra", name: "DeepInfra", baseURL: "https://api.deepinfra.com/v1/openai", keyUrl: "https://deepinfra.com/dash/api_keys", models: { url: "/models", auth: false }, modelPlaceholder: "meta-llama/Llama-4-Maverick-17B-128E-Instruct" }),
  hosted({ id: "deepseek", name: "DeepSeek", baseURL: "https://api.deepseek.com", keyUrl: "https://platform.deepseek.com/api_keys", modelPlaceholder: "deepseek-chat", openRouterVendor: "deepseek" }),
  hosted({ id: "fireworks", name: "Fireworks AI", baseURL: "https://api.fireworks.ai/inference/v1", keyUrl: "https://app.fireworks.ai/settings/users/api-keys", modelPlaceholder: "accounts/fireworks/models/llama4-maverick-instruct-basic" }),
  hosted({ id: "groq", name: "Groq", baseURL: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys", modelPlaceholder: "llama-3.3-70b-versatile" }),
  hosted({
    id: "huggingface",
    name: "Hugging Face",
    baseURL: "https://router.huggingface.co/v1",
    fields: [{ ...KEY, label: "Access token", placeholder: "hf_…", help: "A token with the Inference Providers permission." }],
    keyUrl: "https://huggingface.co/settings/tokens",
    models: { url: "/models", auth: false },
    keyCheck: "https://huggingface.co/api/whoami-v2",
    modelPlaceholder: "meta-llama/Llama-3.3-70B-Instruct",
    note: "Add :fastest or :cheapest to a model to pick the host.",
  }),
  hosted({ id: "mistral", name: "Mistral", baseURL: "https://api.mistral.ai/v1", keyUrl: "https://console.mistral.ai/api-keys", includeUsage: false, modelPlaceholder: "mistral-large-latest", openRouterVendor: "mistralai" }),
  hosted({ id: "moonshot", name: "Moonshot (Kimi)", baseURL: "https://api.moonshot.ai/v1", keyUrl: "https://platform.moonshot.ai/console/api-keys", modelPlaceholder: "kimi-k2-0905-preview", openRouterVendor: "moonshotai" }),
  hosted({
    id: "perplexity",
    name: "Perplexity",
    baseURL: "https://api.perplexity.ai",
    keyUrl: "https://www.perplexity.ai/account/api/keys",
    models: null,
    includeUsage: false,
    modelPlaceholder: "sonar-pro",
    suggested: ["sonar", "sonar-pro", "sonar-reasoning-pro", "sonar-deep-research"],
    openRouterVendor: "perplexity",
    note: "Cost here leaves out Perplexity's per-search fees.",
  }),
  hosted({ id: "qwen", name: "Alibaba Qwen", baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", keyUrl: "https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key", modelPlaceholder: "qwen-plus", openRouterVendor: "qwen" }),
  hosted({ id: "together", name: "Together AI", baseURL: "https://api.together.xyz/v1", keyUrl: "https://api.together.ai/settings/api-keys", modelPlaceholder: "meta-llama/Llama-3.3-70B-Instruct-Turbo" }),
  hosted({
    id: "vercel",
    name: "Vercel AI Gateway",
    baseURL: "https://ai-gateway.vercel.sh/v1",
    keyUrl: "https://vercel.com/dashboard/ai-gateway/api-keys",
    models: { url: "/models", auth: false },
    keyCheck: "/credits",
    modelPlaceholder: "anthropic/claude-sonnet-5-5",
  }),
  hosted({ id: "xai", name: "xAI (Grok)", baseURL: "https://api.x.ai/v1", keyUrl: "https://console.x.ai", modelPlaceholder: "grok-4", openRouterVendor: "x-ai" }),
  hosted({ id: "zai", name: "Z.ai (GLM)", baseURL: "https://api.z.ai/api/paas/v4", keyUrl: "https://z.ai/manage-apikey/apikey-list", models: null, modelPlaceholder: "glm-4.6", openRouterVendor: "z-ai" }),

  // ---- On your computer or network (runs in the browser) -----------------------
  {
    id: "ollama",
    name: "Ollama",
    group: "local",
    protocol: "openai-compatible",
    runsIn: "browser",
    baseURL: "http://localhost:11434/v1",
    fields: [{ key: "baseURL", label: "Server address", secret: false, required: true, placeholder: "http://localhost:11434/v1" }, optionalKey("Only if Ollama sits behind a proxy that needs one.")],
    models: { url: "/models", auth: false },
    includeUsage: true,
    modelPlaceholder: "llama3.2",
    prices: {},
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    group: "local",
    protocol: "openai-compatible",
    runsIn: "browser",
    baseURL: "http://localhost:1234/v1",
    fields: [{ key: "baseURL", label: "Server address", secret: false, required: true, placeholder: "http://localhost:1234/v1" }, optionalKey("Needed when Require Authentication is on in LM Studio.")],
    models: { url: "/models", auth: true },
    includeUsage: true,
    modelPlaceholder: "qwen3-8b",
    prices: {},
  },

  // ---- Custom --------------------------------------------------------------
  {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    group: "custom",
    protocol: "openai-compatible",
    runsIn: "either",
    fields: [
      { key: "baseURL", label: "Base URL", secret: false, required: true, placeholder: "https://llm.example.com/v1", help: "The address that ends before /chat/completions." },
      optionalKey("Sent as Authorization: Bearer."),
      { key: "headers", label: "Extra headers", secret: true, required: false, advanced: true, help: "One per line, Name: value. Stored encrypted." },
    ],
    models: { url: "/models", auth: true },
    includeUsage: true,
    modelPlaceholder: "the model's ID on that server",
    note: "vLLM, llama.cpp, TGI, LiteLLM and most gateways speak this protocol.",
  },
];

export const GROUP_LABEL: Record<Group, string> = {
  popular: "Popular",
  more: "More providers",
  local: "On your computer or network",
  custom: "Anything else",
};

export function providerById(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providerName(id: string): string {
  return providerById(id)?.name ?? id;
}

/* ---- Where a model runs ---------------------------------------------------- */

const LOCAL_SUFFIX = /(^|\.)(localhost|local|lan|internal|intranet|home\.arpa|ts\.net)$/i;

function isPrivateIpLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  const c = h.match(/^100\.(\d+)\./);
  if (c && Number(c[1]) >= 64 && Number(c[1]) <= 127) return true;
  return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:");
}

/** Whether an address is on the user's own computer or network. */
export function isLocalAddress(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return isPrivateIpLiteral(host) || LOCAL_SUFFIX.test(host) || !host.includes(".");
  } catch {
    return false;
  }
}

/** Custom endpoints: local addresses run in the browser, public ones on the server. */
export function suggestRunsIn(p: ProviderDef, baseURL?: string): RunsIn {
  if (p.runsIn !== "either") return p.runsIn;
  return baseURL && isLocalAddress(baseURL) ? "browser" : "server";
}

/* ---- Which browsers can reach a browser-run model ---------------------------- */

export type BrowserId = "chrome" | "firefox" | "safari";
export type Reach = { browser: BrowserId; ok: boolean; note?: string };

/** What each browser allows from https://app.41prompts.ai (checked 2026-10-10). */
export function browserReach(baseURL: string): Reach[] {
  let u: URL;
  try {
    u = new URL(baseURL);
  } catch {
    return [];
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const loopback = host === "localhost" || host.endsWith(".localhost") || /^127\./.test(host) || host === "::1";
  if (u.protocol === "https:") {
    return [
      { browser: "chrome", ok: true, note: loopback ? "asks once to allow apps on this device" : "asks once to allow your local network" },
      { browser: "firefox", ok: true },
      { browser: "safari", ok: true },
    ];
  }
  if (loopback) {
    return [
      { browser: "chrome", ok: true, note: "asks once to allow apps on this device" },
      { browser: "firefox", ok: true },
      { browser: "safari", ok: true },
    ];
  }
  return [
    { browser: "chrome", ok: true, note: "asks once to allow your local network" },
    { browser: "firefox", ok: false, note: "blocks http:// addresses on your network" },
    { browser: "safari", ok: false, note: "blocks http:// addresses on your network" },
  ];
}

export const BROWSER_NAME: Record<BrowserId, string> = { chrome: "Chrome and Edge", firefox: "Firefox", safari: "Safari" };

/* ---- Validation (client and server) ----------------------------------------- */

const DENIED_HEADERS = /^(host|content-length|connection|transfer-encoding|cookie|proxy-.*|forwarded|x-forwarded-.*|te|upgrade|keep-alive)$/i;

/** "Name: value" lines into a header map, rejecting anything unsafe. */
export function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 1) throw new Error(`"${line.slice(0, 40)}" is not a "Name: value" header.`);
    const name = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name) || DENIED_HEADERS.test(name)) throw new Error(`The header ${name} is not allowed.`);
    if (value.length > 500 || /[\r\n]/.test(value)) throw new Error(`The value for ${name} is too long.`);
    out[name] = value;
  }
  if (Object.keys(out).length > 10) throw new Error("Use at most 10 extra headers.");
  return out;
}

const token = (max: number) => z.string().trim().min(1).max(max).regex(/^\S+$/, "No spaces.");

export const SettingsSchema = z
  .object({
    baseURL: z.string().trim().url("Enter a full URL, like https://llm.example.com/v1.").max(300).optional(),
    organization: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
    project: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
    resourceName: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "Use the resource name only, like my-resource.").optional(),
    apiVersion: z.string().trim().regex(/^[0-9a-z.-]{1,32}$/).optional(),
    region: z.string().trim().regex(/^[a-z]{2}(-gov)?-[a-z]+-\d$/, "Use a region like us-east-1.").optional(),
    authMode: z.enum(["apiKey", "accessKeys"]).optional(),
    includeUsage: z.boolean().optional(),
    localKey: z.boolean().optional(),
  })
  .strict();

export const SecretSchema = z
  .object({
    apiKey: token(2000).optional(),
    accessKeyId: token(200).optional(),
    secretAccessKey: token(500).optional(),
    sessionToken: token(4000).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type Secret = z.infer<typeof SecretSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export const LabelSchema = z.string().trim().min(1, "Give it a label.").max(60, "Keep the label under 60 characters.");
export const ModelIdSchema = z
  .string()
  .trim()
  .min(1, "Choose or type a model.")
  .max(200)
  .regex(/^[^\s\u0000-\u001f]+$/, "A model ID has no spaces.");

/** Checks a draft against its provider's rules. Returns the first problem, or null. */
export function draftProblem(p: ProviderDef, runsIn: RunsIn, settings: Settings, secret: Secret | null, hasStoredSecret: boolean): string | null {
  if (p.runsIn !== "either" && runsIn !== p.runsIn) return p.runsIn === "server" ? `${p.name} runs on our server.` : `${p.name} runs in your browser.`;
  for (const f of p.fields) {
    if (!f.required) continue;
    if (f.secret && (hasStoredSecret || runsIn === "browser")) continue;
    const v = f.secret ? (secret as Record<string, unknown> | null)?.[f.key] : (settings as Record<string, unknown>)[f.key];
    if (!v) return `${f.label} is required.`;
  }
  if (p.protocol === "bedrock" && !hasStoredSecret) {
    const keyPair = secret?.accessKeyId && secret?.secretAccessKey;
    if (!secret?.apiKey && !keyPair) return "Add a Bedrock API key, or an access key ID and secret access key.";
  }
  if (p.runsIn === "either" || p.group === "local") {
    if (!settings.baseURL) return "Base URL is required.";
    const u = new URL(settings.baseURL);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "The address must start with http:// or https://.";
    if (u.username || u.password) return "Put credentials in the key field, not in the address.";
    if (runsIn === "server" && u.protocol !== "https:") return 'Models run by our server need an https:// address. For a model on your computer or network, choose "In my browser".';
    if (runsIn === "server" && isLocalAddress(settings.baseURL)) return 'Our server cannot reach your computer or network. Choose "In my browser" for this address.';
  }
  return null;
}

/** Where a stored secret may be sent. Changing it needs the secret again. */
export function destinationOf(provider: string, settings: Settings): string {
  if (provider === "custom" || provider === "ollama" || provider === "lmstudio") {
    try {
      return `${provider}|${new URL(settings.baseURL ?? "").origin}`;
    } catch {
      return `${provider}|`;
    }
  }
  if (provider === "azure") return `azure|${settings.resourceName ?? ""}`;
  return provider;
}

/** Only the settings this provider uses; hosted providers keep their fixed base URL. */
export function cleanSettings(p: ProviderDef, settings: Settings): Settings {
  const keys = new Set<string>(p.fields.filter((f) => !f.secret).map((f) => f.key));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (v === undefined || v === "") continue;
    if (keys.has(k) || (k === "includeUsage" && p.id === "custom") || (k === "authMode" && p.protocol === "bedrock") || (k === "localKey" && v === true)) out[k] = typeof v === "string" ? v.trim() : v;
  }
  if (typeof out.baseURL === "string") out.baseURL = out.baseURL.replace(/\/+$/, "");
  return out as Settings;
}

/** A label that is not taken yet: "OpenAI", "OpenAI 2", … */
export function freeLabel(base: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!lower.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

/** The last four characters of the main secret, for "key ending 3f9a". */
export function secretHintOf(secret: Secret | null): string | null {
  const s = secret?.apiKey ?? secret?.accessKeyId;
  return s ? s.slice(-4) : null;
}

/* ---- Cost ------------------------------------------------------------------- */

export type Prices = { input: number | null; output: number | null };

/** Estimated USD cost of one call, or null when the price or usage is unknown. */
export function costUsd(prices: Prices, inputTokens: number | null, outputTokens: number | null): number | null {
  if (prices.input === null || prices.output === null || inputTokens === null || outputTokens === null) return null;
  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000;
}

export function formatCost(usd: number | null): string {
  if (usd === null) return "—";
  return `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(3)}`;
}

export function formatPrice(p: Prices): string {
  if (p.input === null || p.output === null) return "No price set";
  if (p.input === 0 && p.output === 0) return "Free to run";
  const f = (n: number) => `$${n < 1 ? n.toFixed(n < 0.1 ? 3 : 2).replace(/0+$/, "").replace(/\.$/, "") : n % 1 ? n.toFixed(2) : n}`;
  return `${f(p.input)} in · ${f(p.output)} out per 1M`;
}

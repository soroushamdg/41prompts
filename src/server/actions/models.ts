"use server";
import { z } from "zod";
import { db } from "@/db";
import {
  cleanSettings,
  destinationOf,
  draftProblem,
  LabelSchema,
  ModelIdSchema,
  parseHeaders,
  providerById,
  type ProviderDef,
  type Secret,
  SecretSchema,
  type Settings,
  SettingsSchema,
} from "@/lib/catalog";
import type { ModelEntry } from "@/lib/model-list";
import { ConnectionError, type ConnectionView, createConnection, getConnection, readSecret, recordTest, removeConnection, updateConnection } from "@/server/connections";
import { probe, type SuggestedPrice, suggestPrice, testMessage, withinLimit } from "@/server/probe";
import { currentUserId } from "@/server/session";

/* Your models (M07). Keys never come back to the browser after saving. These
   actions never log their arguments, and Sentry scrubs anything key-shaped. */

type Fail = { ok: false; error: string };
const SESSION_ENDED: Fail = { ok: false, error: "Your session ended. Sign in again." };
const SLOW_DOWN: Fail = { ok: false, error: "That was a lot of checks in a short time. Wait a minute and try again." };

const Draft = z.object({
  provider: z.string().max(40),
  runsIn: z.enum(["server", "browser"]),
  settings: SettingsSchema,
  secret: SecretSchema.nullable(),
  /** Use the saved credentials of this model instead of new ones. */
  from: z.string().uuid().nullable(),
});
export type DraftInput = z.input<typeof Draft>;

type Resolved = { def: ProviderDef; runsIn: "server" | "browser"; settings: Settings; secret: Secret | null };

function headersOk(secret: Secret | null): string | null {
  if (!secret?.headers) return null;
  try {
    parseHeaders(Object.entries(secret.headers).map(([k, v]) => `${k}: ${v}`).join("\n"));
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Validates a draft and finds the credentials it means. */
async function resolveDraft(userId: string, raw: unknown): Promise<Resolved | Fail> {
  const parsed = Draft.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields and try again." };
  const def = providerById(parsed.data.provider);
  if (!def) return { ok: false, error: "Pick a provider from the list." };
  const { runsIn, from } = parsed.data;
  const settings = cleanSettings(def, parsed.data.settings);
  let secret = parsed.data.secret && Object.keys(parsed.data.secret).length ? parsed.data.secret : null;
  if (!secret && from) {
    const src = await getConnection(db, userId, from);
    if (!src) return { ok: false, error: "The model to copy from no longer exists." };
    if (src.provider !== def.id || destinationOf(src.provider, src.settings) !== destinationOf(def.id, settings))
      return { ok: false, error: "The address changed, so the saved key cannot go with it. Paste the key again." };
    secret = readSecret(userId, src);
  }
  const problem = draftProblem(def, runsIn, settings, secret, false) ?? headersOk(secret);
  if (problem) return { ok: false, error: problem };
  if (runsIn === "browser") return { ok: false, error: "Models on your computer or network are checked by your browser, not our server." };
  return { def, runsIn, settings, secret };
}

export async function probeModelsAction(draft: DraftInput): Promise<{ ok: true; ms: number; models: ModelEntry[] | null; keyChecked: boolean } | (Fail & { refused?: boolean })> {
  const userId = await currentUserId();
  if (!userId) return SESSION_ENDED;
  if (!(await withinLimit(db, `probe:${userId}`, 30, 60_000))) return SLOW_DOWN;
  const r = await resolveDraft(userId, draft);
  if ("ok" in r) return r;
  const result = await probe(r.def, r.settings, r.secret);
  return result.ok ? result : { ok: false, error: result.message, refused: result.refused };
}

export async function testMessageAction(draft: DraftInput, modelId: string): Promise<{ ok: true; ms: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return SESSION_ENDED;
  if (!(await withinLimit(db, `probe:${userId}`, 30, 60_000))) return SLOW_DOWN;
  const m = ModelIdSchema.safeParse(modelId);
  if (!m.success) return { ok: false, error: m.error.issues[0]!.message };
  const r = await resolveDraft(userId, draft);
  if ("ok" in r) return r;
  const result = await testMessage(r.def, r.settings, m.data, r.secret);
  return result.ok ? result : { ok: false, error: result.message };
}

export async function suggestPriceAction(provider: string, runsIn: "server" | "browser", modelId: string): Promise<SuggestedPrice> {
  const userId = await currentUserId();
  const def = providerById(provider);
  if (!userId || !def || !ModelIdSchema.safeParse(modelId).success) return null;
  return suggestPrice(def, runsIn === "browser" ? "browser" : "server", modelId.trim());
}

const Price = z.number().min(0).max(10_000).nullable();
const Save = z.object({
  id: z.string().uuid().nullable(),
  label: LabelSchema,
  modelId: ModelIdSchema,
  draft: Draft,
  /** Editing: keep the saved key as it is. */
  keep: z.boolean(),
  price: z.object({ input: Price, output: Price, source: z.enum(["provider", "catalog", "openrouter", "user", "local"]).nullable() }),
  /** The check the dialog just ran, shown on the row as the last test. */
  check: z.object({ ok: z.boolean(), ms: z.number().int().min(0).max(600_000).nullable(), message: z.string().max(300).nullable() }).nullable(),
});
export type SaveInput = z.input<typeof Save>;

export async function saveModelAction(input: SaveInput): Promise<{ ok: true; model: ConnectionView } | (Fail & { field?: "label" | "secret" })> {
  const userId = await currentUserId();
  if (!userId) return SESSION_ENDED;
  const parsed = Save.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields and try again." };
  const { id, label, modelId, draft, keep, price, check } = parsed.data;
  const def = providerById(draft.provider);
  if (!def) return { ok: false, error: "Pick a provider from the list." };
  const settings = cleanSettings(def, draft.settings);
  const runsIn = def.runsIn === "either" ? draft.runsIn : def.runsIn;
  const secret = runsIn === "server" && draft.secret && Object.keys(draft.secret).length ? draft.secret : null;
  const hasStored = keep || Boolean(draft.from);
  const problem = draftProblem(def, runsIn, settings, secret, hasStored) ?? headersOk(secret);
  if (problem) return { ok: false, error: problem };
  const p = { input: price.input, output: price.output, source: price.input === null || price.output === null ? null : price.source };
  try {
    const model = id
      ? await updateConnection(db, userId, id, { provider: def.id, label, modelId, runsIn, settings, secret: keep ? "keep" : secret, price: p })
      : await createConnection(db, userId, { label, provider: def.id, runsIn, modelId, settings, secret: !secret && draft.from ? { from: draft.from } : secret, price: p });
    if (!check) return { ok: true, model };
    await recordTest(db, userId, model.id, check);
    return { ok: true, model: { ...model, lastTest: { at: new Date().toISOString(), ...check } } };
  } catch (e) {
    if (e instanceof ConnectionError) return { ok: false, error: e.message, field: e.reason === "label" ? "label" : e.reason === "rekey" ? "secret" : undefined };
    throw e;
  }
}

export async function testModelAction(id: string): Promise<{ ok: true; ms: number; at: string } | (Fail & { at?: string })> {
  const userId = await currentUserId();
  if (!userId || !z.string().uuid().safeParse(id).success) return { ok: false, error: "Not found." };
  if (!(await withinLimit(db, `probe:${userId}`, 30, 60_000))) return SLOW_DOWN;
  const row = await getConnection(db, userId, id);
  const def = row && providerById(row.provider);
  if (!row || !def || row.runsIn !== "server") return { ok: false, error: "Not found." };
  const secret = readSecret(userId, row);
  let result: { ok: true; ms: number } | { ok: false; message: string };
  if (def.models) {
    const p = await probe(def, row.settings, secret);
    result = !p.ok ? p : p.models && !p.models.some((m) => m.id === row.modelId) && def.id !== "huggingface" ? { ok: false, message: `The key works, but ${row.modelId} is not in ${def.name}'s list for it.` } : { ok: true, ms: p.ms };
  } else {
    result = await testMessage(def, row.settings, row.modelId, secret);
  }
  await recordTest(db, userId, id, { ok: result.ok, ms: result.ok ? result.ms : null, message: result.ok ? null : result.message });
  const at = new Date().toISOString();
  return result.ok ? { ...result, at } : { ok: false, error: result.message, at };
}

/** Browser models are tested by the browser; this only keeps the result. */
export async function recordBrowserTestAction(id: string, result: { ok: boolean; ms: number | null; message: string | null }): Promise<void> {
  const userId = await currentUserId();
  if (!userId || !z.string().uuid().safeParse(id).success) return;
  const row = await getConnection(db, userId, id);
  if (!row || row.runsIn !== "browser") return;
  await recordTest(db, userId, id, { ok: Boolean(result.ok), ms: typeof result.ms === "number" ? Math.round(result.ms) : null, message: typeof result.message === "string" ? result.message.slice(0, 300) : null });
}

export async function removeModelAction(id: string): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId || !z.string().uuid().safeParse(id).success) return { ok: false };
  return { ok: await removeConnection(db, userId, id) };
}

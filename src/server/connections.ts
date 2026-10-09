import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { type ConnectionSettings, modelConnections } from "@/db/schema";
import { destinationOf, type RunsIn, type Secret, secretHintOf } from "@/lib/catalog";
import { connectionAad, open, seal } from "./crypto";

/* The user's models (M07): one row per label + provider + credentials +
   model. Credentials for server-run models are one sealed JSON blob; browser
   models keep theirs in the browser, so their rows hold none. Plaintext only
   exists inside the request that runs or tests a model. */

export const MAX_CONNECTIONS = 50;

export type PriceSource = "provider" | "catalog" | "openrouter" | "user" | "local";
export type PriceInput = { input: number | null; output: number | null; source: PriceSource | null };

export type ConnectionView = {
  id: string;
  label: string;
  provider: string;
  runsIn: RunsIn;
  modelId: string;
  settings: ConnectionSettings;
  hasSecret: boolean;
  secretHint: string | null;
  price: PriceInput;
  lastTest: { at: string; ok: boolean; ms: number | null; message: string | null } | null;
  createdAt: string;
};

type Row = typeof modelConnections.$inferSelect;

export class ConnectionError extends Error {
  constructor(
    public reason: "limit" | "label" | "rekey" | "not_found" | "secret",
    message: string,
  ) {
    super(message);
  }
}

function view(r: Row): ConnectionView {
  return {
    id: r.id,
    label: r.label,
    provider: r.provider,
    runsIn: r.runsIn,
    modelId: r.modelId,
    settings: r.settings,
    hasSecret: r.ciphertext !== null,
    secretHint: r.secretHint,
    price: { input: r.inputPerMtok, output: r.outputPerMtok, source: r.priceSource },
    lastTest: r.lastTestAt ? { at: r.lastTestAt.toISOString(), ok: Boolean(r.lastTestOk), ms: r.lastTestMs, message: r.lastTestMessage } : null,
    createdAt: r.createdAt.toISOString(),
  };
}

const priceCols = (p: PriceInput) => ({ inputPerMtok: p.input, outputPerMtok: p.output, priceSource: p.source, priceAt: p.source ? new Date() : null });

function sealSecret(userId: string, id: string, provider: string, settings: ConnectionSettings, secret: Secret) {
  const sealed = seal(JSON.stringify(secret), connectionAad(userId, id, destinationOf(provider, settings)));
  return { ...sealed, secretHint: secretHintOf(secret) };
}

const NO_SECRET = { ciphertext: null, iv: null, authTag: null, keyVersion: null, secretHint: null };

function isLabelConflict(e: unknown): boolean {
  for (let x: unknown = e; x; x = (x as { cause?: unknown }).cause) {
    if ((x as { code?: string }).code === "23505") return true;
  }
  return false;
}

const LABEL_TAKEN = new ConnectionError("label", "You already have a model with this label. Pick another one.");

export async function listConnections(db: Db, userId: string): Promise<ConnectionView[]> {
  const rows = await db.select().from(modelConnections).where(eq(modelConnections.userId, userId)).orderBy(asc(modelConnections.createdAt));
  return rows.map(view);
}

export async function countConnections(db: Db, userId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(modelConnections).where(eq(modelConnections.userId, userId));
  return r?.n ?? 0;
}

export async function getConnection(db: Db, userId: string, id: string): Promise<Row | null> {
  const [row] = await db.select().from(modelConnections).where(and(eq(modelConnections.userId, userId), eq(modelConnections.id, id)));
  return row ?? null;
}

/** Opens a row's credentials. Fails if the row was moved or its destination changed. */
export function readSecret(userId: string, row: Row): Secret | null {
  if (!row.ciphertext || !row.iv || !row.authTag || row.keyVersion === null) return null;
  const json = open({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag, keyVersion: row.keyVersion }, connectionAad(userId, row.id, destinationOf(row.provider, row.settings)));
  return JSON.parse(json) as Secret;
}

export type CreateInput = {
  label: string;
  provider: string;
  runsIn: RunsIn;
  modelId: string;
  settings: ConnectionSettings;
  /** New credentials, or the id of one of the user's models to copy them from. */
  secret: Secret | { from: string } | null;
  price: PriceInput;
};

/** Credentials to copy from another of the user's models, if it points at the same place. */
async function copiedSecret(db: Db, userId: string, from: string, provider: string, settings: ConnectionSettings): Promise<Secret> {
  const src = await getConnection(db, userId, from);
  if (!src) throw new ConnectionError("not_found", "The model to copy from no longer exists.");
  if (src.provider !== provider || destinationOf(src.provider, src.settings) !== destinationOf(provider, settings))
    throw new ConnectionError("rekey", "The address changed, so the saved key cannot go with it. Paste the key again.");
  const secret = readSecret(userId, src);
  if (!secret) throw new ConnectionError("secret", "The model to copy from has no saved key.");
  return secret;
}

export async function createConnection(db: Db, userId: string, input: CreateInput): Promise<ConnectionView> {
  if ((await countConnections(db, userId)) >= MAX_CONNECTIONS) throw new ConnectionError("limit", `You can keep up to ${MAX_CONNECTIONS} models. Remove one to add another.`);
  const id = randomUUID();
  const secret = input.secret && "from" in input.secret ? await copiedSecret(db, userId, input.secret.from, input.provider, input.settings) : input.secret;
  const sealed = input.runsIn === "server" && secret && Object.keys(secret).length ? sealSecret(userId, id, input.provider, input.settings, secret) : NO_SECRET;
  try {
    const [row] = await db
      .insert(modelConnections)
      .values({ id, userId, label: input.label, provider: input.provider, runsIn: input.runsIn, modelId: input.modelId, settings: input.settings, ...sealed, ...priceCols(input.price) })
      .returning();
    return view(row!);
  } catch (e) {
    if (isLabelConflict(e)) throw LABEL_TAKEN;
    throw e;
  }
}

export type UpdateInput = {
  provider: string;
  label: string;
  modelId: string;
  runsIn: RunsIn;
  settings: ConnectionSettings;
  /** "keep" leaves the saved credentials as they are. */
  secret: Secret | "keep" | null;
  price: PriceInput;
};

/** The provider is fixed. Pointing saved credentials at a new address needs them typed again. */
export async function updateConnection(db: Db, userId: string, id: string, input: UpdateInput): Promise<ConnectionView> {
  const row = await getConnection(db, userId, id);
  if (!row || row.provider !== input.provider) throw new ConnectionError("not_found", "That model no longer exists.");
  let sealed: Partial<Row> = {};
  if (input.secret === "keep") {
    if (row.ciphertext && (input.runsIn !== "server" || destinationOf(row.provider, row.settings) !== destinationOf(row.provider, input.settings)))
      throw new ConnectionError("rekey", "The address changed, so the saved key cannot go with it. Paste the key again.");
  } else if (input.runsIn === "server" && input.secret && Object.keys(input.secret).length) {
    sealed = sealSecret(userId, id, row.provider, input.settings, input.secret);
  } else {
    sealed = NO_SECRET;
  }
  const last = input.modelId !== row.modelId || Object.keys(sealed).length || input.runsIn !== row.runsIn ? { lastTestAt: null, lastTestOk: null, lastTestMs: null, lastTestMessage: null } : {};
  try {
    const [updated] = await db
      .update(modelConnections)
      .set({ label: input.label, modelId: input.modelId, runsIn: input.runsIn, settings: input.settings, ...sealed, ...last, ...priceCols(input.price), updatedAt: new Date() })
      .where(and(eq(modelConnections.userId, userId), eq(modelConnections.id, id)))
      .returning();
    return view(updated!);
  } catch (e) {
    if (isLabelConflict(e)) throw LABEL_TAKEN;
    throw e;
  }
}

export async function removeConnection(db: Db, userId: string, id: string): Promise<boolean> {
  const gone = await db.delete(modelConnections).where(and(eq(modelConnections.userId, userId), eq(modelConnections.id, id))).returning({ id: modelConnections.id });
  return gone.length > 0;
}

export async function recordTest(db: Db, userId: string, id: string, result: { ok: boolean; ms: number | null; message: string | null }): Promise<void> {
  await db
    .update(modelConnections)
    .set({ lastTestAt: new Date(), lastTestOk: result.ok, lastTestMs: result.ms, lastTestMessage: result.message?.slice(0, 300) ?? null })
    .where(and(eq(modelConnections.userId, userId), eq(modelConnections.id, id)));
}

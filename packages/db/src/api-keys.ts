import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "./client";
import { apiKeys } from "./schema";

// SHA-256, not a slow password hash: an api key is a high-entropy random token, not a
// low-entropy human password, so there is no offline-guessing risk to slow down for — and this
// hash runs on every request that presents a key. "no key material in plaintext, ever"
// (decision 4) is met by never storing `plaintext` itself, only this digest plus the last four
// characters kept for UI display.
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function lastFourOf(plaintext: string): string {
  return plaintext.slice(-4);
}

// Constant-time comparison so a timing side channel can't leak how many hash bytes matched.
export function verifyApiKey(plaintext: string, hashedKey: string): boolean {
  const candidate = Buffer.from(hashApiKey(plaintext), "hex");
  const stored = Buffer.from(hashedKey, "hex");
  if (candidate.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(candidate, stored);
}

// ── EPIC-051: minting, the environment, and the lookup a request makes ───────────────────────────

/**
 * `test` or `live`. Both resolve the same Live marker; see `api_keys.environment` for the one thing
 * they differ in and why the distinction has to exist before the CDN logs that will use it.
 */
export const KEY_ENVIRONMENTS = ["test", "live"] as const;
export type KeyEnvironment = (typeof KEY_ENVIRONMENTS)[number];

const KEY_PREFIX = "41p";

/**
 * Mint a key's plaintext: `41p_live_` plus 32 hex characters of `randomBytes`.
 *
 * **The environment is in the plaintext, not only in the row.** A key pasted into the wrong
 * environment's configuration is the ordinary mistake this product will see, and a person reading
 * their own configuration file can see `41p_test_` and know. A key that is only distinguishable by
 * looking it up in our database is a key nobody can check.
 *
 * Sixteen bytes, like `newDecompileId`'s reasoning taken further: this one is a bearer credential
 * presented by a program, so the only thing stopping a guess is its width.
 */
export function newApiKeyPlaintext(environment: KeyEnvironment): string {
  return `${KEY_PREFIX}_${environment}_${randomBytes(16).toString("hex")}`;
}

/**
 * The environment a plaintext key claims, or undefined if it claims nothing recognisable.
 *
 * **A claim, not an authority.** The row is what decides; this exists so a malformed key can be
 * refused before it reaches a query, and so a person can read their own configuration. Nothing may
 * grant on the strength of this alone.
 */
export function environmentOfPlaintext(plaintext: string): KeyEnvironment | undefined {
  const parts = plaintext.split("_");
  if (parts.length !== 3 || parts[0] !== KEY_PREFIX) return undefined;
  return (KEY_ENVIRONMENTS as readonly string[]).includes(parts[1] ?? "")
    ? (parts[1] as KeyEnvironment)
    : undefined;
}

export interface ApiKeyRow {
  id: string;
  project: string;
  name: string;
  lastFour: string;
  environment: KeyEnvironment;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

/**
 * Create a key and return its plaintext **once**.
 *
 * The plaintext is returned and never stored — `hashed_key` and `last_four` are the whole of what
 * the row keeps, which is EPIC-002 decision 4's "no key material in plaintext, ever". A caller that
 * loses the returned string cannot get it back, and that is the design rather than a limitation:
 * EPIC-055's Settings tab shows it once and then shows `last_four` for ever.
 */
export async function createApiKey(
  db: DbOrTx,
  input: { project: string; name: string; environment: KeyEnvironment },
): Promise<{ key: ApiKeyRow; plaintext: string }> {
  const plaintext = newApiKeyPlaintext(input.environment);
  const [row] = await db
    .insert(apiKeys)
    .values({
      project: input.project,
      name: input.name,
      environment: input.environment,
      hashedKey: hashApiKey(plaintext),
      lastFour: lastFourOf(plaintext),
    })
    .returning(API_KEY_COLUMNS);
  if (row === undefined) throw new Error("createApiKey: insert returned no row");
  return { key: row, plaintext };
}

const API_KEY_COLUMNS = {
  id: apiKeys.id,
  project: apiKeys.project,
  name: apiKeys.name,
  lastFour: apiKeys.lastFour,
  environment: sql<KeyEnvironment>`${apiKeys.environment}`,
  createdAt: apiKeys.createdAt,
  lastUsedAt: apiKeys.lastUsedAt,
  revokedAt: apiKeys.revokedAt,
};

/**
 * The key a request presented, or undefined.
 *
 * **Looked up by the digest, not scanned and compared.** `hashApiKey` is deterministic SHA-256 over
 * a high-entropy token, so the digest is an exact index lookup — there is no row-by-row comparison
 * for a timing side channel to live in, which is why `verifyApiKey` above is not the shape used
 * here. A revoked key resolves to nothing: revocation must take effect on the next request, not on
 * the next deploy.
 *
 * It does not touch `last_used_at`; `markApiKeyUsed` does, so that a read is a read.
 */
export async function apiKeyForPlaintext(db: Db, plaintext: string): Promise<ApiKeyRow | undefined> {
  if (environmentOfPlaintext(plaintext) === undefined) return undefined;
  const [row] = await db
    .select(API_KEY_COLUMNS)
    .from(apiKeys)
    .where(and(eq(apiKeys.hashedKey, hashApiKey(plaintext)), isNull(apiKeys.revokedAt)))
    .limit(1);
  return row;
}

/** Record that a key was used. Best-effort: a failure here must not fail the request it describes. */
export async function markApiKeyUsed(db: Db, keyId: string, at = new Date()): Promise<void> {
  await db.update(apiKeys).set({ lastUsedAt: at }).where(eq(apiKeys.id, keyId));
}

export async function apiKeysForProject(db: Db, projectId: string): Promise<ApiKeyRow[]> {
  return db.select(API_KEY_COLUMNS).from(apiKeys).where(eq(apiKeys.project, projectId)).orderBy(apiKeys.createdAt);
}

// ── EPIC-055: revoking, and rotation as two rows ─────────────────────────────────────────────────

/**
 * Revoke a key. Returns whether a row moved.
 *
 * **Scoped by project**, the rule `canvas.ts` and `variables.ts` both state: a key is reachable only
 * through a project the caller already resolved, so no function here takes a bare key id.
 *
 * Returning a boolean rather than throwing is deliberate. "That key was already revoked" and "that
 * key is not in this project" are both answers a surface shows; neither is an error it handles, and
 * a revoke that is idempotent is one a person can press twice without consequence.
 */
export async function revokeApiKey(
  db: DbOrTx,
  input: { project: string; keyId: string },
  at = new Date(),
): Promise<boolean> {
  const moved = await db
    .update(apiKeys)
    .set({ revokedAt: at })
    .where(and(eq(apiKeys.id, input.keyId), eq(apiKeys.project, input.project), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return moved.length > 0;
}

export interface RotatedKey {
  /** The new key, and the only time its plaintext exists. */
  key: ApiKeyRow;
  plaintext: string;
  /** The key that was revoked, with its dates intact. */
  revoked: ApiKeyRow;
}

/**
 * Rotate a key: revoke the old row and mint a new one carrying the same name and environment.
 *
 * **Two rows, never an update in place** (EPIC-055 ruling 6). Updating `hashed_key` would be one row
 * and less code, and it cannot answer the question a key table is actually asked after an incident:
 * *which key was in the field on Tuesday, and when did it stop being*. After an in-place update
 * `created_at` describes a credential that no longer exists and `last_used_at` mixes the traffic of
 * two. The old row stays, revoked, with its dates unchanged.
 *
 * The same argument `publish_events` makes for deriving Live rather than storing it: a record that
 * is rewritten is a record that cannot be relied on to explain the past.
 *
 * One transaction, so a crash between the two statements cannot leave a project with a revoked key
 * and no replacement — which would be an outage for whatever was holding it.
 *
 * Returns `undefined` when the key is not this project's, or is already revoked. Rotating a revoked
 * key is refused rather than treated as minting: a person pressing Rotate on a dead row has almost
 * certainly pressed the wrong row, and quietly issuing a credential is the wrong way to say so.
 */
export async function rotateApiKey(
  db: Db,
  input: { project: string; keyId: string },
  at = new Date(),
): Promise<RotatedKey | undefined> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select(API_KEY_COLUMNS)
      .from(apiKeys)
      .where(and(eq(apiKeys.id, input.keyId), eq(apiKeys.project, input.project), isNull(apiKeys.revokedAt)))
      .limit(1);
    if (existing === undefined) return undefined;

    await revokeApiKey(tx, input, at);

    const minted = await createApiKey(tx, {
      project: existing.project,
      name: existing.name,
      environment: existing.environment,
    });

    return { key: minted.key, plaintext: minted.plaintext, revoked: { ...existing, revokedAt: at } };
  });
}

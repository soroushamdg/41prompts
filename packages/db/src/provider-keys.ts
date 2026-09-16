import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "./client";
import { providerKeys } from "./schema";
import {
  SealedBoxError,
  keyIdOfEnvelope,
  masterKeysFrom,
  openProviderKey,
  sealProviderKey,
  type KeyEnv,
  type MasterKey,
} from "./sealed-box";

/**
 * The provider key store.
 *
 * ## The one rule this file exists to hold
 *
 * **A plaintext provider key never crosses this boundary except as an argument to `putProviderKey`
 * and a return value from `openProviderKey`.** Everything else — the list, the metadata, the delete
 * — works without a master key at all, and the type signatures say so: `providerKeyMetadata` does
 * not take one and cannot produce a key.
 *
 * That is not stylistic. `docs/security/byo-key-threat-model.md` finding 3 is exfiltration, and the
 * mitigation that actually works is that the number of call sites which can produce a plaintext key
 * is small enough to read. Today it is two, and both are here.
 */

/** The providers a key may be held for. Text in the database; a closed set here. */
export const PROVIDERS = ["anthropic", "openai", "google"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export function isProviderName(value: string): value is ProviderName {
  return (PROVIDERS as readonly string[]).includes(value);
}

/** Everything about a stored key except the key. This is what a page renders. */
export interface ProviderKeyMetadata {
  readonly id: string;
  readonly provider: ProviderName;
  readonly lastFour: string;
  readonly keyId: string;
  readonly createdAt: Date;
  readonly rotatedAt: Date | null;
  readonly lastUsedAt: Date | null;
}

/**
 * The master keys, or a refusal in words.
 *
 * `masterKeysFrom` returning an empty list is the normal state of every environment today — nothing
 * sets `KEY_ENCRYPTION_SECRET`. A caller that needs one gets a sentence naming the variable, because
 * "cannot read property of undefined" three frames deeper is the failure mode this project has
 * already paid for once, in `docs/PROCESS.md`'s "Nothing loads the root `.env`".
 */
function requireMasterKeys(env: KeyEnv | undefined, doing: string): readonly MasterKey[] {
  const keys = masterKeysFrom(env ?? process.env);
  if (keys.length === 0) {
    throw new SealedBoxError(
      `cannot ${doing}: no master key is configured. Set KEY_ENCRYPTION_SECRET — infra/RUNBOOK.md, "Generating or rotating the provider-key master key", has the command.`,
    );
  }
  return keys;
}

export interface PutProviderKeyInput {
  readonly owner: string;
  readonly provider: ProviderName;
  /** The key the person pasted. It is sealed here and is not retained anywhere else. */
  readonly plaintext: string;
  readonly env?: KeyEnv | undefined;
}

/**
 * Store a person's provider key, sealed.
 *
 * Replaces rather than accumulates: `(owner, provider)` is unique, and a superseded credential is a
 * liability rather than a record. `rotatedAt` is what remains of the one that was there.
 *
 * **The first key in the list seals.** During a rotation the list is [new, old], so every write from
 * the moment the new key is added lands under the new key id and the re-seal job's remaining work
 * only ever shrinks.
 */
export async function putProviderKey(db: DbOrTx, input: PutProviderKeyInput): Promise<ProviderKeyMetadata> {
  const plaintext = input.plaintext.trim();
  if (plaintext.length < 8) {
    throw new SealedBoxError("that does not look like a provider key: it is shorter than eight characters.");
  }
  const [sealingKey] = requireMasterKeys(input.env, "store a provider key");
  const sealed = sealProviderKey(sealingKey as MasterKey, plaintext, { owner: input.owner, provider: input.provider });

  const [row] = await db
    .insert(providerKeys)
    .values({
      owner: input.owner,
      provider: input.provider,
      sealed,
      keyId: (sealingKey as MasterKey).keyId,
      lastFour: plaintext.slice(-4),
    })
    .onConflictDoUpdate({
      target: [providerKeys.owner, providerKeys.provider],
      set: {
        sealed,
        keyId: (sealingKey as MasterKey).keyId,
        lastFour: plaintext.slice(-4),
        rotatedAt: new Date(),
        lastUsedAt: null,
      },
    })
    .returning();

  return toMetadata(row);
}

/** Every key this person has stored, as metadata. **No master key is needed or read.** */
export async function providerKeyMetadata(db: DbOrTx, owner: string): Promise<readonly ProviderKeyMetadata[]> {
  const rows = await db.select().from(providerKeys).where(eq(providerKeys.owner, owner));
  return rows.map(toMetadata).sort((a, b) => a.provider.localeCompare(b.provider));
}

/**
 * Open one person's key at one provider, or `undefined` if they have not stored one.
 *
 * `undefined` rather than a throw for the missing case, and a throw for every other: "this person
 * has no OpenAI key" is an ordinary answer a page renders, while "the master key that sealed this
 * row is not configured" is an incident. `providerFor` in the worker will make the same distinction
 * (EPIC-042), which is why it is drawn here rather than at the call site.
 */
export async function openStoredProviderKey(
  db: DbOrTx,
  owner: string,
  provider: ProviderName,
  env?: KeyEnv,
): Promise<string | undefined> {
  const [row] = await db
    .select()
    .from(providerKeys)
    .where(and(eq(providerKeys.owner, owner), eq(providerKeys.provider, provider)));
  if (!row) return undefined;

  const keys = requireMasterKeys(env, "read a provider key");
  return openProviderKey(keys, row.sealed, { owner, provider });
}

/** Forget a person's key at one provider. Returns whether there was one. */
export async function deleteProviderKey(db: DbOrTx, owner: string, provider: ProviderName): Promise<boolean> {
  const removed = await db
    .delete(providerKeys)
    .where(and(eq(providerKeys.owner, owner), eq(providerKeys.provider, provider)))
    .returning({ id: providerKeys.id });
  return removed.length > 0;
}

interface ProviderKeyRow {
  id: string;
  provider: string;
  sealed: string;
  keyId: string;
  lastFour: string;
  createdAt: Date;
  rotatedAt: Date | null;
  lastUsedAt: Date | null;
}

/**
 * A row as a page sees it.
 *
 * `sealed` is dropped here rather than selected away at each call site, so a new caller cannot
 * accidentally carry an envelope into a template, a log line or a JSON response. The envelope is
 * useless without the master key, and a value that is useless is still a value that ends up in a
 * Sentry event — `packages/logger/src/scrub.ts` is the other half of that argument.
 *
 * `keyId` **is** kept: it is not secret, it is already printed inside the envelope, and an operator
 * running a rotation needs to see which rows are still on the old key.
 */
function toMetadata(row: ProviderKeyRow | undefined): ProviderKeyMetadata {
  if (!row) {
    throw new SealedBoxError("the provider key store returned no row for a write that should have produced one.");
  }
  return {
    id: row.id,
    provider: isProviderName(row.provider) ? row.provider : ("anthropic" as ProviderName),
    lastFour: row.lastFour,
    keyId: row.keyId,
    createdAt: row.createdAt,
    rotatedAt: row.rotatedAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/** Which master key sealed a stored row, without opening it — a rotation's own query. */
export function masterKeyIdOfStoredRow(sealed: string): string {
  return keyIdOfEnvelope(sealed);
}

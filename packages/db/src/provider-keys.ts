import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "./client";
import { isProviderName, type ProviderName } from "./constants";
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

// The closed set of provider names lives in `constants.ts` (EPIC-042) and is imported here. It
// moved because both apps need it and this file imports drizzle: `apps/web` should not pull a query
// builder in to render a settings row. Nothing about the column changed — it is still text in the
// database with the union enforced in TypeScript, so a fourth provider is a constant, not a
// migration.

/** Everything about a stored key except the key. This is what a page renders. */
export interface ProviderKeyMetadata {
  readonly id: string;
  readonly provider: ProviderName;
  readonly lastFour: string;
  readonly keyId: string;
  readonly createdAt: Date;
  readonly rotatedAt: Date | null;
  readonly lastUsedAt: Date | null;
  /** EPIC-042. A key switched off is still stored; it is simply not reached for. */
  readonly enabled: boolean;
  /** When a test of the **stored** key was asked for, and when one last answered. */
  readonly testRequestedAt: Date | null;
  readonly lastTestedAt: Date | null;
  readonly lastTestOk: boolean | null;
  /** The provider's own words about the failure, scrubbed. Never the key, never a whole body. */
  readonly lastTestDetail: string | null;
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
        // **The verdict does not survive the value it was about** (EPIC-042). A row that said
        // "checked, works" about the key somebody has just replaced is a statement about a
        // credential that is no longer there, and it is the kind of stale reassurance a person
        // acts on. Re-enabled too: replacing a key is the act of somebody who means to use it.
        enabled: true,
        testRequestedAt: null,
        lastTestedAt: null,
        lastTestOk: null,
        lastTestDetail: null,
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

/**
 * Open one person's key **only if they have not switched it off**, and stamp that it was used.
 *
 * ## Three answers, and the caller must not collapse them
 *
 * `undefined` here means "do not use a stored key for this provider", and it covers two different
 * facts — there is no row, and there is a row that is switched off. Both lead the caller to the
 * same next step (fall back to the deployment's own key, or refuse), which is why they are one
 * return value. What they may **not** become is a throw: a person switching their key off is
 * exercising a control, not causing an error.
 *
 * A master key that cannot open the row is still a throw, because that is an incident.
 *
 * ## `last_used_at` is stamped here and nowhere else
 *
 * It is the one honest place: the moment the plaintext is produced is the moment it is used. A
 * stamp written at the call site would be a second thing to remember, and the column would
 * eventually mean "when we last thought about this key".
 *
 * **It is not an audit log.** Threat model finding 4 asks for a row per open, naming who and when,
 * and that is `043c`. This column says only that an open happened at some point, which is enough
 * for a settings page and not enough for an investigation — the report says so rather than letting
 * a timestamp read as an audit trail.
 */
export async function openEnabledProviderKey(
  db: DbOrTx,
  owner: string,
  provider: ProviderName,
  env?: KeyEnv,
): Promise<string | undefined> {
  const [row] = await db
    .select()
    .from(providerKeys)
    .where(and(eq(providerKeys.owner, owner), eq(providerKeys.provider, provider)));
  if (!row || !row.enabled) return undefined;

  const keys = requireMasterKeys(env, "read a provider key");
  const plaintext = openProviderKey(keys, row.sealed, { owner, provider });
  await db.update(providerKeys).set({ lastUsedAt: new Date() }).where(eq(providerKeys.id, row.id));
  return plaintext;
}

/**
 * Switch a stored key on or off without removing it.
 *
 * Returns the row as a page sees it, or `undefined` when there is none — the same shape every other
 * read here has, so a caller never has to tell a missing row from a failed write.
 */
export async function setProviderKeyEnabled(
  db: DbOrTx,
  owner: string,
  provider: ProviderName,
  enabled: boolean,
): Promise<ProviderKeyMetadata | undefined> {
  const [row] = await db
    .update(providerKeys)
    .set({ enabled })
    .where(and(eq(providerKeys.owner, owner), eq(providerKeys.provider, provider)))
    .returning();
  return row === undefined ? undefined : toMetadata(row);
}

/**
 * Record that somebody asked for the stored key to be tested.
 *
 * The verdict itself arrives later, from the worker. This is what lets the page say **"checking"**
 * rather than showing the previous verdict while a new one is in flight — a page that shows a stale
 * "works" during a re-check is answering a question nobody asked.
 */
export async function requestProviderKeyTest(
  db: DbOrTx,
  owner: string,
  provider: ProviderName,
): Promise<ProviderKeyMetadata | undefined> {
  const [row] = await db
    .update(providerKeys)
    .set({ testRequestedAt: new Date() })
    .where(and(eq(providerKeys.owner, owner), eq(providerKeys.provider, provider)))
    .returning();
  return row === undefined ? undefined : toMetadata(row);
}

/**
 * Write the verdict of a test back onto the row.
 *
 * `detail` is capped and is expected to be already scrubbed by its producer. Capped because a
 * provider that answers a failure with an HTML error page would otherwise put a kilobyte of markup
 * in a column a settings page renders.
 */
export const MAX_TEST_DETAIL = 300;

export async function recordProviderKeyTest(
  db: DbOrTx,
  owner: string,
  provider: ProviderName,
  verdict: { ok: boolean; detail?: string | undefined },
): Promise<void> {
  await db
    .update(providerKeys)
    .set({
      lastTestedAt: new Date(),
      lastTestOk: verdict.ok,
      lastTestDetail: verdict.detail === undefined ? null : verdict.detail.slice(0, MAX_TEST_DETAIL),
      // The request is answered, so the page stops saying "checking".
      testRequestedAt: null,
    })
    .where(and(eq(providerKeys.owner, owner), eq(providerKeys.provider, provider)));
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
  enabled: boolean;
  testRequestedAt: Date | null;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestDetail: string | null;
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
    enabled: row.enabled,
    testRequestedAt: row.testRequestedAt,
    lastTestedAt: row.lastTestedAt,
    lastTestOk: row.lastTestOk,
    lastTestDetail: row.lastTestDetail,
  };
}

/** Which master key sealed a stored row, without opening it — a rotation's own query. */
export function masterKeyIdOfStoredRow(sealed: string): string {
  return keyIdOfEnvelope(sealed);
}

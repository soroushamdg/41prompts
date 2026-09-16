import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, type KeyObject } from "node:crypto";

/**
 * A sealed box for somebody else's provider key.
 *
 * ## What this is, and what it is not
 *
 * `docs/roadmap.md`'s EPIC-043 line says "libsodium sealed box". This is the **sealed-box
 * construction** — anonymous public-key encryption, where anyone holding the public half can seal
 * and only the holder of the secret half can open — built from `node:crypto` and nothing else. It
 * is not libsodium's `crypto_box_seal` and the two are not interchangeable byte for byte.
 *
 * The reasoning is in `docs/epics/reports/EPIC-043-report.md` and in `docs/decisions/AUTONOMOUS.md`.
 * The short version: this is the most security-sensitive path in the product, and the epic that
 * writes its threat model should not be the epic that widens its supply chain. Every primitive here
 * is OpenSSL's, already in the runtime, already audited, and the composition — ephemeral X25519,
 * a KDF over the shared secret and both public keys, then an AEAD — is the standard one that
 * RFC 9180 calls DHKEM + HKDF + AEAD.
 *
 * ## Why asymmetric at all, on one box where both containers have the same environment
 *
 * Today it buys nothing: Coolify hands `web` and `worker` the same env block, so both hold the whole
 * key. It costs one environment variable to collect, later, with **no code change** — give `web` only
 * `KEY_ENCRYPTION_PUBLIC_KEY` and `worker` the secret, and a compromised web container can accept a
 * person's key and can never read one back. `sealProviderKey` never needs the secret; that is the
 * whole of what makes that split free, and it is the reason the seam is drawn here rather than at
 * the symmetric design that would also have satisfied the immediate threat.
 *
 * ## What the additional data is for
 *
 * A plain sealed box protects confidentiality and nothing about **where** the ciphertext sits. Bind
 * each envelope to the row it belongs to — the owner and the provider — and an envelope lifted out
 * of one row and pasted into another stops opening. That is an insider and a database-write threat,
 * both of which are in the threat model, and neither of which encryption alone addresses.
 */

/** The envelope's version tag. A v2 is additive: `openSealedBox` dispatches on this prefix. */
const VERSION = "41pk1";

/** The additional-data prefix. Changing it invalidates every existing envelope, deliberately. */
const AAD_PREFIX = "41p.pk.v1";

/** X25519 PKCS8 DER prefix: 16 bytes, then the 32-byte private scalar. */
const PKCS8_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");

/** X25519 SPKI DER prefix: 12 bytes, then the 32-byte public key. */
const SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

const RAW_KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** Thrown for every failure in this module, so a caller can tell "refused" from "crashed". */
export class SealedBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealedBoxError";
  }
}

/**
 * One master key, as this module uses it.
 *
 * `secret` is absent on the sealing side once the deployment splits — that is the point of the
 * split, and the type says so rather than leaving it to a comment.
 */
export interface MasterKey {
  /** First 8 hex of the public key's hash. Not secret; it is printed in the envelope. */
  readonly keyId: string;
  readonly publicKey: KeyObject;
  readonly secretKey?: KeyObject | undefined;
}

function b64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function rawPublicOf(key: KeyObject): Buffer {
  return Buffer.from(key.export({ type: "spki", format: "der" })).subarray(SPKI_PREFIX.length);
}

/** The key id is a hash of the public key, so both halves of one key always agree on it. */
function keyIdOf(publicKey: KeyObject): string {
  return createHash("sha256").update(rawPublicOf(publicKey)).digest("hex").slice(0, 8);
}

/**
 * Generate a master key, for the runbook.
 *
 * Returns both halves base64url-encoded: `secret` goes in `KEY_ENCRYPTION_SECRET`, `publicKey` in
 * `KEY_ENCRYPTION_PUBLIC_KEY` for a deployment that has split the two. `keyId` is what a rotation
 * names its work by.
 */
export function generateMasterKey(): { keyId: string; secret: string; publicKey: string } {
  const pair = generateKeyPairSync("x25519");
  const rawSecret = Buffer.from(pair.privateKey.export({ type: "pkcs8", format: "der" })).subarray(PKCS8_PREFIX.length);
  return {
    keyId: keyIdOf(pair.publicKey),
    secret: b64url(rawSecret),
    publicKey: b64url(rawPublicOf(pair.publicKey)),
  };
}

function decodeRaw(encoded: string, what: string): Buffer {
  let raw: Buffer;
  try {
    raw = Buffer.from(encoded, "base64url");
  } catch {
    throw new SealedBoxError(`${what} is not base64url.`);
  }
  if (raw.length !== RAW_KEY_BYTES) {
    throw new SealedBoxError(`${what} is ${raw.length} bytes; an X25519 key is ${RAW_KEY_BYTES}.`);
  }
  return raw;
}

/** A master key from its secret half. The public half is derived, so one value is enough. */
export function masterKeyFromSecret(encodedSecret: string): MasterKey {
  const raw = decodeRaw(encodedSecret, "the master key secret");
  let secretKey: KeyObject;
  try {
    secretKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: "der", type: "pkcs8" });
  } catch {
    throw new SealedBoxError("the master key secret is not a usable X25519 private key.");
  }
  const publicKey = createPublicKey(secretKey);
  return { keyId: keyIdOf(publicKey), publicKey, secretKey };
}

/** A master key from its public half only — the sealing side of a split deployment. */
export function masterKeyFromPublic(encodedPublic: string): MasterKey {
  const raw = decodeRaw(encodedPublic, "the master key public half");
  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });
  } catch {
    throw new SealedBoxError("the master key public half is not a usable X25519 public key.");
  }
  return { keyId: keyIdOf(publicKey), publicKey };
}

/**
 * The master keys this process holds, newest first.
 *
 * ## Why a list and not a value
 *
 * Rotation is one of the five threat classes in `docs/security/byo-key-threat-model.md`, and the
 * reason keys do not get rotated in practice is that rotation is an outage unless two keys can be
 * held at once. `KEY_ENCRYPTION_SECRET` may carry **several** comma-separated secrets: the first
 * seals, any of them opens. A rotation is then: prepend the new one, re-seal every row whose
 * `key_id` is old, remove the old one. Nothing is unreadable at any point in that sequence.
 *
 * `KEY_ENCRYPTION_PUBLIC_KEY` is read only when there is no secret, which is the split deployment.
 * A process with both configured uses the secret, because a process that can open should not be
 * seeded with a public key that might disagree with it.
 */
export interface KeyEnv {
  readonly KEY_ENCRYPTION_SECRET?: string | undefined;
  readonly KEY_ENCRYPTION_PUBLIC_KEY?: string | undefined;
  /** Read only to refuse the published placeholder below. Never to choose a key. */
  readonly DEPLOY_ENV?: string | undefined;
  readonly [name: string]: string | undefined;
}

/**
 * The **published, worthless** master key a local suite and a local drive use (EPIC-042).
 *
 * ## Why it is committed at all
 *
 * The e2e suite has to prove that `apps/web` can seal with only the public half while
 * `apps/worker` opens with the secret — that is threat-model row `043a`, and a split cannot be
 * demonstrated with two processes that generated their own keys. So both halves are here, one
 * value, and `apps/web/e2e/env.mjs` hands the public half to the web and the secret to the worker.
 *
 * It sits beside `BETTER_AUTH_SECRET: "ci-secret-not-for-prod-…"` in that file, and carries the same
 * promise: it protects nothing, because the only thing it has ever sealed is a key a test invented.
 *
 * ## And why that is not enough on its own
 *
 * A published key is safe exactly until somebody pastes it into a deployment. `masterKeysFrom`
 * therefore **refuses it outright in production**, so the failure is a process that will not start
 * rather than a database of provider keys anyone on the internet can open. Loud, immediate, and
 * impossible to miss — the alternative is silent and permanent.
 */
export const PLACEHOLDER_MASTER_SECRET = "0NKZT1nc-uRye9d-XTkKNCOi4wZM1GRl8MT-63Dme3I";
export const PLACEHOLDER_MASTER_PUBLIC = "41vjBsKfqrgm9bHOtiIRzRhghpgINayaq3tKn74Zh0w";

function refusePlaceholderInProduction(value: string, env: KeyEnv, name: string): void {
  if (env.DEPLOY_ENV !== "production") return;
  if (value !== PLACEHOLDER_MASTER_SECRET && value !== PLACEHOLDER_MASTER_PUBLIC) return;
  throw new SealedBoxError(
    `${name} is the published placeholder from packages/db/src/sealed-box.ts, which is in a public repository and protects nothing. Generate a real one — infra/RUNBOOK.md, "Generating or rotating the provider-key master key".`,
  );
}

export function masterKeysFrom(env: KeyEnv = process.env): readonly MasterKey[] {
  const secrets = (env.KEY_ENCRYPTION_SECRET ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (secrets.length > 0) {
    for (const secret of secrets) refusePlaceholderInProduction(secret, env, "KEY_ENCRYPTION_SECRET");
    return secrets.map(masterKeyFromSecret);
  }
  const publicHalf = (env.KEY_ENCRYPTION_PUBLIC_KEY ?? "").trim();
  if (publicHalf.length === 0) return [];
  refusePlaceholderInProduction(publicHalf, env, "KEY_ENCRYPTION_PUBLIC_KEY");
  return [masterKeyFromPublic(publicHalf)];
}

/**
 * What an envelope is bound to. Both fields are in the additional data, so an envelope cannot be
 * moved to another person's row or to another provider's row and still open.
 */
export interface KeyBinding {
  readonly owner: string;
  readonly provider: string;
}

function aadFor(keyId: string, binding: KeyBinding): Buffer {
  return Buffer.from(`${AAD_PREFIX}|${keyId}|${binding.owner}|${binding.provider}`, "utf8");
}

/**
 * The key-derivation context.
 *
 * Both public keys go in — the recipient's and the ephemeral one — which is what RFC 9180's DHKEM
 * calls `kem_context`. Without them, a shared secret would be all that binds the derived key to the
 * parties, and the standard construction includes them for reasons that are older than this file.
 */
function derive(shared: Buffer, keyId: string, recipientPublic: Buffer, ephemeralPublic: Buffer): Buffer {
  const info = Buffer.concat([Buffer.from(`${VERSION}|`, "utf8"), recipientPublic, ephemeralPublic]);
  return Buffer.from(hkdfSync("sha256", shared, Buffer.from(keyId, "utf8"), info, 32));
}

/**
 * Seal a provider key.
 *
 * Needs only the public half. The ephemeral keypair is generated per call and discarded, so the
 * derived AES key is used exactly once and nonce reuse — the way AES-GCM actually gets broken — is
 * not reachable by any sequence of calls.
 */
export function sealProviderKey(masterKey: MasterKey, plaintext: string, binding: KeyBinding): string {
  if (plaintext.length === 0) {
    throw new SealedBoxError("nothing to seal: the key is empty.");
  }
  const ephemeral = generateKeyPairSync("x25519");
  const shared = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: masterKey.publicKey });
  const recipientPublic = rawPublicOf(masterKey.publicKey);
  const ephemeralPublic = rawPublicOf(ephemeral.publicKey);
  const derived = derive(shared, masterKey.keyId, recipientPublic, ephemeralPublic);

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", derived, nonce);
  cipher.setAAD(aadFor(masterKey.keyId, binding));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);

  return [VERSION, masterKey.keyId, b64url(ephemeralPublic), b64url(nonce), b64url(body)].join(".");
}

/** The master key id an envelope names, without opening it — how a rotation finds its own work. */
export function keyIdOfEnvelope(envelope: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new SealedBoxError("this is not a sealed provider key.");
  }
  return parts[1] as string;
}

/**
 * Open a provider key.
 *
 * Every failure is a `SealedBoxError` with a sentence in it. That is not politeness: "the master key
 * that sealed this row is not configured" and "this ciphertext has been altered" are different
 * incidents with different runbook entries, and an OpenSSL `Unsupported state or unable to
 * authenticate data` tells an operator neither.
 */
export function openProviderKey(masterKeys: readonly MasterKey[], envelope: string, binding: KeyBinding): string {
  const parts = envelope.split(".");
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new SealedBoxError("this is not a sealed provider key.");
  }
  const [, keyId, encodedEphemeral, encodedNonce, encodedBody] = parts as [string, string, string, string, string];

  const masterKey = masterKeys.find((candidate) => candidate.keyId === keyId);
  if (!masterKey) {
    throw new SealedBoxError(`no master key with id ${keyId} is configured; this row was sealed by a key this process does not hold.`);
  }
  if (!masterKey.secretKey) {
    throw new SealedBoxError(`master key ${keyId} is configured with its public half only; this process can seal but not open.`);
  }

  const ephemeralPublic = decodeRaw(encodedEphemeral, "the envelope's ephemeral public key");
  const nonce = Buffer.from(encodedNonce, "base64url");
  const body = Buffer.from(encodedBody, "base64url");
  if (nonce.length !== NONCE_BYTES || body.length < TAG_BYTES + 1) {
    throw new SealedBoxError("this sealed provider key is truncated.");
  }

  let ephemeralKey: KeyObject;
  try {
    ephemeralKey = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, ephemeralPublic]), format: "der", type: "spki" });
  } catch {
    throw new SealedBoxError("this sealed provider key carries an ephemeral public key that is not an X25519 key.");
  }

  const shared = diffieHellman({ privateKey: masterKey.secretKey, publicKey: ephemeralKey });
  const derived = derive(shared, keyId, rawPublicOf(masterKey.publicKey), ephemeralPublic);

  const decipher = createDecipheriv("aes-256-gcm", derived, nonce);
  decipher.setAAD(aadFor(keyId, binding));
  decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
  try {
    return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    throw new SealedBoxError("this sealed provider key will not open: it has been altered, or it belongs to a different person or provider.");
  }
}

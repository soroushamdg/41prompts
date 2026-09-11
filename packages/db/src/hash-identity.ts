import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Hashing for the two identifying things this codebase stores about an anonymous visitor: their
 * address and their user agent.
 *
 * **Never store the address.** Abuse accounting needs to answer one question — "is this the same
 * caller as before?" — and a keyed hash answers it exactly as well as the address does. Storing the
 * address instead would make `decompiles` a log of who read what, kept on behalf of people who never
 * signed up for anything and cannot ask us to delete it because we do not know who they are.
 *
 * **HMAC with a per-deployment salt, not a bare digest.** The IPv4 space is 2^32; a plain SHA-256 of
 * every address can be enumerated on a laptop in minutes, so an unsalted hash of an IP is not an
 * anonymisation, it is an inconvenience. A secret key makes the table useless to anyone who takes it
 * without also taking the key, and different deployments produce different hashes for the same
 * visitor.
 */

const SALT_ENV = "IP_HASH_SALT";

/**
 * The fallback salt when none is configured: random, per process, and never written down.
 *
 * The failure it prevents is the one that matters. Without a fallback the honest options are to throw
 * — turning a missing env variable into an outage on a public page — or to hash unsalted, which
 * quietly downgrades to "enumerable". This degrades to something harmless instead: hashes stop being
 * comparable across restarts, so rate-limit accounting resets and nothing leaks. Loud in development,
 * silent nowhere.
 */
let processSalt: string | undefined;

function fallbackSalt(): string {
  if (processSalt === undefined) {
    processSalt = randomBytes(32).toString("hex");
    if (process.env.NODE_ENV !== "test") {
      // Deliberately `warn` and deliberately every process start: a deployment running without the
      // salt is working correctly but has lost cross-restart abuse accounting, and that should be
      // visible in the logs rather than discovered from a bill.
      console.warn(
        `[hash-identity] ${SALT_ENV} is not set; using a per-process salt. Hashes will not survive a restart.`
      );
    }
  }
  return processSalt;
}

/** Reset the memoised fallback. Tests only. */
export function resetProcessSaltForTest(): void {
  processSalt = undefined;
}

function salt(): string {
  const configured = process.env[SALT_ENV];
  return configured !== undefined && configured.length > 0 ? configured : fallbackSalt();
}

/**
 * A stable, non-reversible handle for one caller.
 *
 * Returns `null` for a missing or empty value rather than hashing the empty string, so "we did not
 * know" and "we knew and it was empty" cannot collide into the same bucket and share a rate limit.
 */
export function hashIdentity(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return createHmac("sha256", salt()).update(trimmed).digest("hex");
}

/** Whether a stored hash belongs to this value. Constant-time, because it compares a secret-derived digest. */
export function identityMatches(hash: string | null, value: string | null | undefined): boolean {
  const candidate = hashIdentity(value);
  if (hash === null || candidate === null) return false;
  const left = Buffer.from(hash, "hex");
  const right = Buffer.from(candidate, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/**
 * The caller's address, from the proxy headers, or `null`.
 *
 * `x-forwarded-for` is a client-controllable header. Behind our proxy the **leftmost** entry is the
 * real client and the rest are hops, but anyone can send their own `x-forwarded-for` and prepend
 * whatever they like — so this value is a hint for rate-limit bucketing and must never be treated as
 * an identity or an authorisation. The consequence is bounded and worth stating: a determined caller
 * can rotate their apparent address and get more than their share of a per-IP limit. The per-session
 * limit and the global budget are what actually bound the damage.
 */
export function clientAddress(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  const real = headers.get("x-real-ip");
  return real !== null && real.length > 0 ? real.trim() : null;
}

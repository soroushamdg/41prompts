import { clientAddress, hashIdentity } from "@41prompts/db";
import { checkLimit, peekLimit, type LimitVerdict } from "@/lib/rate-limit";

/**
 * Rate limits for `/v1` (EPIC-057).
 *
 * `docs/roadmap.md`'s Tests line asks for a *"rate-limited pointer endpoint"*. It is the **marker**
 * endpoint — `CLAUDE.md`'s Vocabulary forbids the other word in identifiers and EPIC-051 resolved
 * the identical conflict when it named the route — and the limit is on all four `/v1` routes rather
 * than on the one the roadmap names. EPIC-057 ruling 3.
 *
 * ## Two buckets, because a key and a stranger are different callers
 *
 * **Per key, for an authenticated request.** A customer's fleet sits behind one egress address; an
 * address bucket would give a company of forty processes the budget of one, and the first thing
 * they would meet is a `429` caused by their own success. The key is the identity the route already
 * authenticates and the one whose traffic we actually mean to bound.
 *
 * **Per address, for a request with no usable key.** A `401` is answered before any key exists, so
 * the key bucket cannot see a stranger at all — and every attempt costs `apiKeyForPlaintext` a
 * SHA-256 and an indexed database query, at whatever rate the caller chooses. Limiting only one of
 * the two would be the gate pointed at one tree again (`HANDOVER.md` lesson 19).
 *
 * ## All four routes
 *
 * The marker is the one called on a timer, which is why the roadmap names it. But
 * `/v1/build/:buildHash` and `/v1/prompts` cost a database round trip each, and `/v1/blob` is
 * **unauthenticated by design** — ADR-005 §1, an artifact is public — while reading an object out of
 * Postgres and hashing its whole body on every request. Limiting the cheapest of the four and
 * leaving the one with no key on it would be a mitigation written for the sentence rather than for
 * the system.
 *
 * ## What the numbers are, and how they were chosen
 *
 * An SDK refreshes one prompt every 30 seconds, so one process holding one prompt is 120 marker
 * requests an hour. Ten processes holding five prompts each is 6,000. The key limit has to sit well
 * above a plausible fleet or the first thing a growing customer meets is us; the anonymous one has
 * to sit low, because nobody legitimate is here without a key and 60 is ample for a person debugging
 * a mis-pasted one.
 *
 * The window store is in-memory and per process — `lib/rate-limit.ts` has the consequence, and
 * `docs/security/sdk-threat-model.md` states it rather than assuming it.
 */

/**
 * An authenticated caller, keyed by API key id.
 *
 * 20,000 an hour is about 5.5 a second sustained, which is roughly a 160-process fleet each holding
 * five prompts — far past any customer this product has, and still a bound.
 */
export const V1_KEY_LIMIT = { max: 20_000, windowMs: 60 * 60 * 1000, name: "20,000 API requests an hour" } as const;

/**
 * A caller with no usable key, by address.
 *
 * Tight on purpose. Reaching `/v1` without a key is either a misconfiguration — in which case a
 * person is looking at the error and 60 attempts is generous — or somebody trying keys, in which
 * case this is the ceiling on how fast they may.
 */
export const V1_ANON_LIMIT = { max: 60, windowMs: 60 * 60 * 1000, name: "60 unauthenticated requests an hour" } as const;

/**
 * `/v1/blob`, by address, and there is no key bucket available for it.
 *
 * **The name says "build" and not the other word**: it is interpolated into `checkLimit`'s message,
 * which a caller reads, and ADR-003 forbids that word in a UI string. `pnpm forbidden-words` caught
 * this one rather than a review catching it.
 *
 * The route exists only where there is no CDN (`app/v1/blob/[...key]/route.ts` says so), and every
 * request reads a row and SHA-256s its body. A CDN would absorb this; until there is one, this
 * number is what stands in for it. Middle of the two above: high enough that a real fleet resolving
 * through the database store is not refused, low enough to bound a stranger who was told one URL.
 */
export const V1_BLOB_LIMIT = { max: 3_000, windowMs: 60 * 60 * 1000, name: "3,000 build requests an hour" } as const;

/**
 * The bucket an authenticated caller is counted against.
 *
 * The **key id**, not the key: a bucket is a `Map` key held in memory and a credential does not
 * belong in one. The id is already the thing the audit log names.
 */
export function keyBucket(keyId: string): string {
  return `key:${keyId}`;
}

/**
 * The bucket a caller with no key is counted against.
 *
 * `hashIdentity` rather than the address itself, the same rule `lib/decompile/run.ts` follows: the
 * bucket is a hash, never an address. A caller behind no proxy header at all is `null`, which
 * `checkLimit` shares with every other unidentified caller rather than exempting.
 */
export function addressBucket(request: Request): string | null {
  const address = clientAddress(request.headers);
  const hashed = hashIdentity(address);
  return hashed === null ? null : `ip:${hashed}`;
}

/**
 * The refusal, in `refusalResponse`'s shape so an SDK reading `error` sees one vocabulary.
 *
 * `Retry-After` in seconds, which is the form `fortyone` parses to back its refresh off. A client
 * that ignores it makes the endpoint pay for the refusal at the same rate it paid for the answer.
 *
 * **`@41prompts/sdk` does not honour it yet**, and the header is sent anyway: it is correct HTTP, it
 * costs nothing, and the day that SDK can afford the code it will already be there. Why it cannot
 * afford it today is EPIC-057 ruling 11 — the 15 KB budget in ADR-006 had 239 bytes of headroom and
 * the back-off needs more. Until then a Node client keeps asking every interval and is refused by a
 * `Map` read, which is the cheapest thing this module does.
 */
export function rateLimitedResponse(verdict: LimitVerdict): Response {
  return Response.json(
    { error: "rate_limited", message: verdict.message ?? "That is the limit for now." },
    {
      status: 429,
      headers: {
        "retry-after": String(verdict.retryAfterSeconds),
        "cache-control": "no-store",
      },
    },
  );
}

/**
 * Refuse an address that has already exhausted the unauthenticated budget, **before** the database
 * is asked anything.
 *
 * This is the first line of every authenticated `/v1` route, and it is not a micro-optimisation.
 * A limiter that only consumes after `keyFromRequest` bounds the *responses* and not the *work* —
 * every attempt still costs a SHA-256 and an indexed lookup, which is exactly what a brute force is
 * spending. Peeking first means the 61st bad key from one address costs a `Map` read.
 *
 * **A caller who never fails authentication never consumes this bucket**, so a real fleet is never
 * peeked into it. The case this does catch unfairly is a legitimate caller sharing an egress address
 * with somebody making 60 failed attempts an hour; `docs/security/sdk-threat-model.md` states that
 * rather than leaving it to be discovered.
 */
export function refuseExhaustedAddress(request: Request, now?: number): LimitVerdict {
  return peekLimit(addressBucket(request), V1_ANON_LIMIT, now);
}

/**
 * Count one `/v1` request and say whether it is allowed.
 *
 * `keyId` is the authenticated key's id, or `null` for a request that presented no usable key —
 * which is what selects the bucket. Called **after** `keyFromRequest` on the three authenticated
 * routes, so a valid key is never charged to the shared anonymous bucket.
 */
export function limitV1(request: Request, keyId: string | null, now?: number): LimitVerdict {
  return keyId === null
    ? checkLimit(addressBucket(request), V1_ANON_LIMIT, now)
    : checkLimit(keyBucket(keyId), V1_KEY_LIMIT, now);
}

/** `/v1/blob`, which has no key to bucket by. Its own limit, so it cannot borrow the anonymous one. */
export function limitV1Blob(request: Request, now?: number): LimitVerdict {
  return checkLimit(addressBucket(request), V1_BLOB_LIMIT, now);
}

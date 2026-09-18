import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { peekLimit, resetLimitsForTest } from "@/lib/rate-limit";
import {
  addressBucket,
  keyBucket,
  limitV1,
  limitV1Blob,
  rateLimitedResponse,
  V1_ANON_LIMIT,
  V1_BLOB_LIMIT,
  V1_KEY_LIMIT,
} from "./v1-limits";

/**
 * `/v1` is rate limited (EPIC-057, C3–C5 — `docs/roadmap.md`'s *"rate-limited pointer endpoint"*).
 *
 * **Every test here clears the window store first**, and one of them proves the clearing works.
 * A fixed-window limiter is module state, so without that the suite's *order* becomes an input and
 * a test passes because the one before it did not run — which is the shape of `HANDOVER.md`
 * lesson 10.
 */
beforeEach(() => resetLimitsForTest());

const NOW = 1_700_000_000_000;

/** A request with a forwarded address, which is how `clientAddress` sees a caller behind Traefik. */
function requestFrom(address: string): Request {
  return new Request("https://app.41prompts.ai/v1/marker/pr_1a2b3c4d", {
    headers: { "x-forwarded-for": address },
  });
}

describe("the reset itself", () => {
  it("clears the store, so no test in this file depends on the order of the others", () => {
    for (let i = 0; i < V1_ANON_LIMIT.max + 1; i += 1) limitV1(requestFrom("198.51.100.1"), null, NOW);
    expect(limitV1(requestFrom("198.51.100.1"), null, NOW).allowed).toBe(false);

    resetLimitsForTest();

    // The control for every `beforeEach` above: if this were false, a refusal in one test would be
    // a refusal in the next and the whole file would be measuring the wrong thing.
    expect(limitV1(requestFrom("198.51.100.1"), null, NOW).allowed).toBe(true);
  });
});

describe("an authenticated caller, on the key bucket", () => {
  it("is allowed up to the limit and refused after it", () => {
    const request = requestFrom("203.0.113.10");
    for (let i = 0; i < V1_KEY_LIMIT.max; i += 1) {
      expect(limitV1(request, "ak_one", NOW).allowed, `attempt ${i + 1}`).toBe(true);
    }
    expect(limitV1(request, "ak_one", NOW).allowed).toBe(false);
  });

  it("does not share a bucket with another key, even from the same address", () => {
    const request = requestFrom("203.0.113.11");
    for (let i = 0; i < V1_KEY_LIMIT.max + 1; i += 1) limitV1(request, "ak_busy", NOW);
    expect(limitV1(request, "ak_busy", NOW).allowed).toBe(false);

    // The reason the bucket is the key and not the address: a customer's fleet sits behind one
    // egress address, and one busy process must not spend a second process's budget.
    expect(limitV1(request, "ak_quiet", NOW).allowed).toBe(true);
  });

  it("is counted on the key bucket and not on the address bucket", () => {
    // The positive control for the claim above. Spend a key's whole budget, then check that the
    // anonymous bucket for that same address was never touched — which is what makes "per key, not
    // per address" a measurement rather than a comment.
    const request = requestFrom("203.0.113.12");
    for (let i = 0; i < V1_KEY_LIMIT.max + 1; i += 1) limitV1(request, "ak_spender", NOW);

    expect(limitV1(request, "ak_spender", NOW).allowed).toBe(false);
    expect(peekLimit(addressBucket(request), V1_ANON_LIMIT, NOW).allowed).toBe(true);
  });

  it("buckets by key id, and the bucket never contains the key itself", () => {
    // A bucket is a Map key held in memory for an hour. A credential does not belong in one.
    expect(keyBucket("ak_abcdef")).toBe("key:ak_abcdef");
    expect(keyBucket("ak_abcdef")).not.toContain("41p_live_");
  });
});

describe("a caller with no usable key, on the address bucket", () => {
  it("is refused after a much tighter limit than a key gets", () => {
    expect(V1_ANON_LIMIT.max).toBeLessThan(V1_KEY_LIMIT.max);

    const request = requestFrom("192.0.2.5");
    for (let i = 0; i < V1_ANON_LIMIT.max; i += 1) {
      expect(limitV1(request, null, NOW).allowed, `attempt ${i + 1}`).toBe(true);
    }
    expect(limitV1(request, null, NOW).allowed).toBe(false);
  });

  it("shares one bucket when there is no address at all, rather than exempting", () => {
    // `checkLimit`'s rule: a null bucket is not a free pass. Anyone who strips the header would
    // otherwise be unlimited, which is the opposite of what a limit is for.
    const anonymous = new Request("https://app.41prompts.ai/v1/prompts");
    expect(addressBucket(anonymous)).toBeNull();

    for (let i = 0; i < V1_ANON_LIMIT.max; i += 1) limitV1(anonymous, null, NOW);
    expect(limitV1(anonymous, null, NOW).allowed).toBe(false);
  });

  it("buckets by a hash, never by the address", () => {
    const bucket = addressBucket(requestFrom("203.0.113.99"));
    expect(bucket).not.toBeNull();
    expect(bucket).not.toContain("203.0.113.99");
    expect(bucket?.startsWith("ip:")).toBe(true);
  });
});

/**
 * **A stranger cannot lock out a customer** (EPIC-057 ruling 12).
 *
 * This is the regression test for a defect that was written, committed and then removed. The first
 * version of `v1-limits.ts` peeked at the address bucket *before* `keyFromRequest`, so that a caller
 * trying keys did not buy an indexed lookup per attempt. A pre-auth gate sees only an address, and a
 * customer's fleet shares its egress address with everything else behind that NAT — so anybody could
 * have spent a target's sixty unauthenticated requests on purpose and had that customer's whole
 * fleet refused before it was authenticated.
 *
 * It bounded almost nothing: `keyFromRequest` answers `missing_key` with no query when there is no
 * header, and `apiKeyForPlaintext` refuses a malformed key before it reaches one. These tests exist
 * so the ordering cannot quietly go back.
 */
describe("a stranger filling the address bucket", () => {
  it("does not refuse an authenticated caller from that same address", () => {
    const address = "203.0.113.200";

    // The stranger, from that address, spends the whole unauthenticated budget and then some.
    for (let i = 0; i < V1_ANON_LIMIT.max + 50; i += 1) limitV1(requestFrom(address), null, NOW);
    expect(limitV1(requestFrom(address), null, NOW).allowed).toBe(false);

    // The customer, from the same address, with a real key. Must be entirely unaffected.
    for (let i = 0; i < 500; i += 1) {
      expect(limitV1(requestFrom(address), "ak_customer", NOW).allowed, `request ${i + 1}`).toBe(true);
    }
  });

  it("and the address bucket is still the one that refused the stranger — the control", () => {
    // Without this, the test above would pass equally on a limiter that had stopped counting
    // unauthenticated requests at all, which would be the opposite mistake.
    const address = "203.0.113.201";
    for (let i = 0; i < V1_ANON_LIMIT.max + 1; i += 1) limitV1(requestFrom(address), null, NOW);

    expect(peekLimit(addressBucket(requestFrom(address)), V1_ANON_LIMIT, NOW).allowed).toBe(false);
    expect(peekLimit(keyBucket("ak_customer"), V1_KEY_LIMIT, NOW).allowed).toBe(true);
  });
});

describe("/v1/blob, which has no key to bucket by", () => {
  it("has its own limit, so it cannot borrow the anonymous one", () => {
    const request = requestFrom("198.51.100.20");

    for (let i = 0; i < V1_ANON_LIMIT.max + 1; i += 1) limitV1(request, null, NOW);
    expect(limitV1(request, null, NOW).allowed).toBe(false);

    // Exhausting the unauthenticated budget must not close the route that legitimately has no key.
    expect(limitV1Blob(request, NOW).allowed).toBe(true);
  });

  it("is refused after its own limit", () => {
    const request = requestFrom("198.51.100.21");
    for (let i = 0; i < V1_BLOB_LIMIT.max; i += 1) {
      expect(limitV1Blob(request, NOW).allowed, `attempt ${i + 1}`).toBe(true);
    }
    expect(limitV1Blob(request, NOW).allowed).toBe(false);
  });

  it("sits between the two other limits, because it is unauthenticated but legitimate", () => {
    expect(V1_BLOB_LIMIT.max).toBeGreaterThan(V1_ANON_LIMIT.max);
    expect(V1_BLOB_LIMIT.max).toBeLessThan(V1_KEY_LIMIT.max);
  });
});

describe("the refusal a caller receives", () => {
  it("is a 429 with Retry-After in seconds and no-store", async () => {
    const request = requestFrom("192.0.2.30");
    for (let i = 0; i < V1_ANON_LIMIT.max + 1; i += 1) limitV1(request, null, NOW);
    const response = rateLimitedResponse(limitV1(request, null, NOW));

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const retryAfter = response.headers.get("retry-after");
    expect(retryAfter).not.toBeNull();
    // Delta-seconds, because that is the form both SDKs parse. An HTTP-date here would be read as
    // "no header" and silently become the one-minute default.
    expect(retryAfter).toMatch(/^\d+$/);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("uses the same `error` vocabulary the other /v1 refusals use", async () => {
    const request = requestFrom("192.0.2.31");
    for (let i = 0; i < V1_ANON_LIMIT.max + 1; i += 1) limitV1(request, null, NOW);
    const body = (await rateLimitedResponse(limitV1(request, null, NOW)).json()) as Record<string, unknown>;

    // `refusalResponse` answers `{ error: code }`. An SDK that learned to read `error` for a 401
    // should not have to learn a second shape for a 429.
    expect(body["error"]).toBe("rate_limited");
    expect(body["message"]).toContain(V1_ANON_LIMIT.name);
    expect(String(body["message"])).not.toMatch(/abuse|violation|blocked|forbidden|suspicious/i);
  });
});

/**
 * C5 — **every** `/v1` route is limited, and a fifth one added later fails this rather than being
 * the quiet exception.
 *
 * `HANDOVER.md` lesson 19 and lesson 22: a gate only guards what it is pointed at, and both the
 * area and the depth of a gate are assumptions worth reading before trusting a green. So this reads
 * the directory rather than a list — a list is a copy of the routes that goes stale silently.
 */
const V1_DIR = fileURLToPath(new URL("../../app/v1", import.meta.url));

function routeFilesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...routeFilesUnder(path));
    else if (entry === "route.ts") found.push(path);
  }
  return found;
}

/** The limiter call a route must contain. Any of the three entry points counts. */
const CALLS = /\b(limitV1|limitV1Blob)\s*\(/;

describe("every /v1 route calls the limiter", () => {
  const routes = routeFilesUnder(V1_DIR);

  it("finds the four routes, so the walk itself is not the thing that is broken", () => {
    // The control. A walk that found nothing would make the loop below vacuously green, which is
    // exactly `HANDOVER.md` lesson 8 — an absence assertion that cannot fire.
    expect(routes.length).toBe(4);
    expect(routes.some((file) => file.includes("marker"))).toBe(true);
    expect(routes.some((file) => file.includes("blob"))).toBe(true);
  });

  for (const file of routes) {
    const name = file.slice(file.indexOf("app/v1"));
    it(`${name} calls it`, () => {
      expect(CALLS.test(readFileSync(file, "utf8"))).toBe(true);
    });
  }

  it("the pattern would fail on a route that does not call it", () => {
    // The second control: proves `CALLS` can be false, so a green above is about the routes and not
    // about a regex that matches everything.
    expect(CALLS.test("export async function GET(): Promise<Response> { return Response.json({}); }")).toBe(false);
  });

  it("the three authenticated routes count the limit after authenticating, never before", () => {
    // Ordering is the mitigation, so it is asserted rather than described — and this asserts the
    // ordering ruling 12 arrived at, which is the opposite of the one the first draft had. A gate
    // in front of `keyFromRequest` cannot tell a customer from a stranger.
    for (const file of routes.filter((one) => !one.includes("blob"))) {
      const source = readFileSync(file, "utf8");
      const auth = source.indexOf("keyFromRequest(db, request)");
      const limit = source.indexOf("limitV1(request,");
      expect(auth, file).toBeGreaterThan(-1);
      expect(limit, file).toBeGreaterThan(-1);
      expect(auth, file).toBeLessThan(limit);
    }
  });

  it("no route gates on the address before authenticating", () => {
    // The removed function by name, so a later edit cannot reintroduce the shape by copying an old
    // diff. If a genuine pre-auth gate is ever wanted, this test is where the argument has to be had.
    for (const file of routes) {
      expect(readFileSync(file, "utf8"), file).not.toContain("refuseExhaustedAddress");
    }
  });
});

// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * `fetch` drops `Authorization` when a redirect crosses an origin — measured, not assumed
 * (EPIC-057 C10).
 *
 * `network.ts` has said this in a comment since EPIC-052:
 *
 * > The redirect is followed by `fetch`; `Authorization` is dropped by the runtime when it crosses
 * > an origin, which is correct — an artifact is public (ADR-005 §1) and the CDN has no key to check.
 *
 * **Nothing had checked it.** And it matters more than a comment's accuracy usually does, because
 * EPIC-054 found the equivalent statement was *false* for Python: `urllib`'s redirect handler copies
 * the request's headers through unchanged, so the obvious port would have sent every customer's API
 * key to whichever CDN the store redirects to, where it lands in somebody else's access log. That
 * was measured against two loopback servers and fixed in `_DropAuthOnCrossOrigin`.
 *
 * So this is the same measurement for the same claim in the other language — the one where the
 * behaviour is relied on rather than implemented. `/v1/marker/:promptId` and `/v1/build/:buildHash`
 * both answer 302, so a runtime that forwarded the header would leak the key on every refresh.
 *
 * **Two loopback servers and a real `globalThis.fetch`**, deliberately: a stub cannot have this
 * behaviour, and asserting against a stub would be asserting against the thing being questioned.
 * This is the one file in this package's suite that starts a server; nothing leaves the loopback
 * interface and no name is resolved.
 */

import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchLive } from "./network.js";
import type { NetworkConfig } from "./network.js";

const KEY = "41p_test_REDIRECT_PROBE";

/** Every request either server saw, so a test asserts about what arrived rather than what was sent. */
interface Seen {
  readonly host: "first" | "second";
  readonly url: string;
  readonly authorization: string | null;
}

let first: Server;
let second: Server;
let firstPort = 0;
let secondPort = 0;
const seen: Seen[] = [];

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : 0);
    });
  });
}

beforeAll(async () => {
  second = createServer((request, response) => {
    seen.push({ host: "second", url: request.url ?? "", authorization: request.headers.authorization ?? null });
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  secondPort = await listen(second);

  first = createServer((request, response) => {
    seen.push({ host: "first", url: request.url ?? "", authorization: request.headers.authorization ?? null });
    const url = request.url ?? "";
    // A different **port** on the same host is a different origin, which is all this needs: an
    // origin is scheme, host and port, and using a port avoids resolving a second name.
    if (url.startsWith("/cross")) {
      response.writeHead(302, { location: `http://127.0.0.1:${secondPort}/landed` });
      return response.end();
    }
    if (url.startsWith("/same")) {
      response.writeHead(302, { location: "/landed" });
      return response.end();
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  firstPort = await listen(first);
});

afterAll(async () => {
  await Promise.all([
    new Promise<void>((resolve) => first.close(() => resolve())),
    new Promise<void>((resolve) => second.close(() => resolve())),
  ]);
});

async function get(path: string): Promise<void> {
  seen.length = 0;
  await fetch(`http://127.0.0.1:${firstPort}${path}`, {
    headers: { authorization: `Bearer ${KEY}`, accept: "application/json" },
  });
}

describe("fetch and a redirect that crosses an origin", () => {
  it("does not forward Authorization to the second origin", async () => {
    await get("/cross");

    const arrived = seen.map((one) => `${one.host}${one.url} ${one.authorization ?? "(absent)"}`);
    expect(arrived.length, arrived.join(" · ")).toBe(2);
    expect(seen[0]?.host).toBe("first");
    expect(seen[0]?.authorization).toBe(`Bearer ${KEY}`);

    // The claim `network.ts` makes, and the one `urllib` got wrong.
    expect(seen[1]?.host).toBe("second");
    expect(seen[1]?.authorization).toBeNull();
  });

  it("still forwards it within one origin — the control", async () => {
    // Without this the test above would pass equally on a runtime that never sent the header at
    // all, which would mean `/v1` could not authenticate anybody. An absence assertion needs a
    // positive control (`HANDOVER.md` lesson 8).
    await get("/same");

    expect(seen.length).toBe(2);
    expect(seen[0]?.authorization).toBe(`Bearer ${KEY}`);
    expect(seen[1]?.url).toBe("/landed");
    expect(seen[1]?.authorization).toBe(`Bearer ${KEY}`);
  });

  it("sends the key on the first request, which is the one that has to be authenticated", async () => {
    await get("/plain");

    expect(seen.length).toBe(1);
    expect(seen[0]?.authorization).toBe(`Bearer ${KEY}`);
  });
});

describe("the same, through fetchLive rather than through a bare fetch", () => {
  it("carries the key to /v1/marker and not past its redirect", async () => {
    // The claim is about this package's own call path, so it is worth making once through the
    // function that actually runs in a customer's process rather than only through `fetch`.
    seen.length = 0;
    const config: NetworkConfig = {
      baseUrl: `http://127.0.0.1:${firstPort}/cross`,
      apiKey: KEY,
      fetch: globalThis.fetch as unknown as NetworkConfig["fetch"],
      timeoutMs: 5_000,
    };
    // The marker route under this base answers the cross-origin redirect, so the body is `{}` and
    // `fetchLive` warns `malformed`. That is the expected outcome and not the assertion: what is
    // being measured is which headers the two servers saw.
    const outcome = await fetchLive(config, "pr_1a2b3c4d", null, null);
    expect(outcome.kind).toBe("warning");

    const authorizations = seen.map((one) => one.authorization);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(authorizations[0]).toBe(`Bearer ${KEY}`);
    expect(seen.filter((one) => one.host === "second").every((one) => one.authorization === null)).toBe(true);
  });
});

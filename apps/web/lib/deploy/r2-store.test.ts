import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { r2Store } from "./r2-store";
import { ARTIFACT_CACHE_CONTROL, MARKER_CACHE_CONTROL, type R2Config } from "./store";

/**
 * The R2 driver, against a fake S3 endpoint on a **real socket** (EPIC-051, criterion C12).
 *
 * ## What this proves and what it does not
 *
 * **There is no artifact bucket.** Creating one and putting Cloudflare in front of it is a step only
 * Soroush can take, so this driver has never spoken to Cloudflare. What a real HTTP round trip
 * through the real client can still prove is everything on our side of the wire: the method, the
 * bucket and key in the path, the exact bytes, the cache header, the conditional write, and that a
 * `412` on a repeat is treated as a repeat rather than as a failure.
 *
 * What it cannot prove is R2's own behaviour — whether Cloudflare honours `If-None-Match: *`, whether
 * the cache header survives to the CDN, whether path-style addressing is accepted on that account.
 * The report says so rather than implying a bucket was written to.
 *
 * A fake rather than a mocked client, deliberately: mocking `send()` would assert that we called a
 * function we wrote the arguments for. Serving the request proves the signing, the serialisation and
 * the header mapping actually happened.
 */

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  body: string;
}

describe("the R2 store", () => {
  let server: Server;
  let base: string;
  const seen: Seen[] = [];
  /** What the next request is answered with. A test sets it before acting. */
  let answer: { status: number; headers?: Record<string, string>; body?: string } = { status: 200 };

  beforeAll(async () => {
    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        seen.push({
          method: request.method ?? "",
          url: request.url ?? "",
          headers: request.headers as Record<string, string | undefined>,
          body: Buffer.concat(chunks).toString("utf-8"),
        });
        response.writeHead(answer.status, { "content-type": "application/xml", ...answer.headers });
        response.end(answer.body ?? "");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const config = (): R2Config => ({
    accountId: "acct",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "secret-not-real",
    bucket: "artifacts",
    publicBase: "https://cdn.example.test/",
    endpointOverride: base,
  });

  const store = () => r2Store(config());

  it("PUTs an artifact at its own key, with the immutable header and the exact bytes", async () => {
    seen.length = 0;
    answer = { status: 200 };

    const body = '{"schemaVersion":1,"text":"hello"}';
    await store().put(
      {
        key: "production/artifacts/abc123.json",
        body,
        contentType: "application/json",
        cacheControl: ARTIFACT_CACHE_CONTROL,
      },
      { immutable: true },
    );

    expect(seen).toHaveLength(1);
    const request = seen[0]!;
    expect(request.method).toBe("PUT");
    // Path style: `/<bucket>/<key>`. Virtual-host style would need a DNS name per bucket.
    // The pathname alone: the SDK appends its own `?x-id=PutObject` for tracing, which is its
    // business and not a fact this test should pin.
    expect(new URL(request.url, base).pathname).toBe("/artifacts/production/artifacts/abc123.json");
    expect(request.body).toBe(body);
    expect(request.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(request.headers["content-type"]).toBe("application/json");
    // Write-once, expressed in the protocol rather than in a `select`.
    expect(request.headers["if-none-match"]).toBe("*");
    // It is signed. The value is the SDK's; what matters here is that it was produced at all.
    expect(request.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\//);
  });

  it("PUTs a marker with the thirty-second header and no conditional write", async () => {
    seen.length = 0;
    answer = { status: 200 };

    await store().put(
      {
        key: "production/markers/pr_9f2c4a71.json",
        body: '{"schemaVersion":1}',
        contentType: "application/json",
        cacheControl: MARKER_CACHE_CONTROL,
      },
      { immutable: false },
    );

    const request = seen[0]!;
    expect(request.headers["cache-control"]).toBe("public, max-age=30");
    // A marker is *supposed* to change, so it must not carry the header that stops it.
    expect(request.headers["if-none-match"]).toBeUndefined();
  });

  it("treats a 412 on an immutable key as the repeat it is", async () => {
    seen.length = 0;
    answer = { status: 412, body: "<Error><Code>PreconditionFailed</Code></Error>" };

    await expect(
      store().put(
        { key: "production/artifacts/abc123.json", body: "{}", contentType: "application/json", cacheControl: "" },
        { immutable: true },
      ),
    ).resolves.toBeUndefined();
  });

  it("does not swallow a 412 on a mutable key, where it means something is wrong", async () => {
    seen.length = 0;
    answer = { status: 412, body: "<Error><Code>PreconditionFailed</Code></Error>" };

    await expect(
      store().put(
        { key: "production/markers/pr_1.json", body: "{}", contentType: "application/json", cacheControl: "" },
        { immutable: false },
      ),
    ).rejects.toBeTruthy();
  });

  it("reads an object back", async () => {
    seen.length = 0;
    answer = {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": ARTIFACT_CACHE_CONTROL },
      body: '{"schemaVersion":1}',
    };

    const object = await store().get("production/artifacts/abc123.json");
    expect(seen[0]?.method).toBe("GET");
    expect(object).toEqual({
      key: "production/artifacts/abc123.json",
      body: '{"schemaVersion":1}',
      contentType: "application/json",
      cacheControl: ARTIFACT_CACHE_CONTROL,
    });
  });

  it("reads a missing object as undefined rather than throwing", async () => {
    seen.length = 0;
    answer = { status: 404, body: "<Error><Code>NoSuchKey</Code></Error>" };
    await expect(store().get("production/artifacts/never.json")).resolves.toBeUndefined();
  });

  it("does not swallow a 500 — an outage is not an absence", async () => {
    seen.length = 0;
    answer = { status: 500, body: "<Error><Code>InternalError</Code></Error>" };
    await expect(store().get("production/artifacts/abc123.json")).rejects.toBeTruthy();
  });

  it("names the CDN, not the bucket, as where a reader fetches", () => {
    // Trailing slashes are trimmed here as well as in `r2ConfigFromEnv`, so a base that arrives
    // with one — from a hand-written environment value, which is how it will arrive — cannot
    // produce `//` in a URL an SDK is told to fetch.
    expect(store().publicUrl("production/artifacts/abc123.json")).toBe(
      "https://cdn.example.test/production/artifacts/abc123.json",
    );
  });
});

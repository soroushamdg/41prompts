// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The background refresh (EPIC-052, C3 and C4).
 *
 * The clock is injected and **nothing here waits on wall time**. `docs/PROCESS.md`, "A helper that
 * normalises state": a test that sleeps asserts that the sleep was long enough on every machine for
 * ever, and passes when the thing never happens at all. Every assertion below waits on a condition —
 * a released promise, a counted call — or on nothing.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createClient } from "./client.js";
import type { Client, FetchLike } from "./types.js";
import { build, PROMPT_ID } from "./__fixtures__/artifacts.js";

const clients: Client[] = [];
function client(options: Parameters<typeof createClient>[0]): Client {
  const made = createClient(options);
  clients.push(made);
  return made;
}
afterEach(() => {
  while (clients.length > 0) clients.pop()?.close();
});

function respond(status: number, body: string, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: () => Promise.resolve(body),
  };
}

/** A server that can be told to serve a different Live build, and counts what it was asked for. */
function server() {
  let live = build({ body: "Version one for {{customer_name}}, {{tone}}.", version: 1 });
  const calls: string[] = [];
  let hold: Promise<void> | undefined;

  const fetchImpl: FetchLike = async (url, init) => {
    calls.push(url);
    if (hold !== undefined) await hold;
    if (url.includes("/v1/marker/")) {
      // The ETag is derived from the marker's **content**, which is what `/v1/blob` does and what R2
      // does. Deriving it from the key was the defect EPIC-052 found in that route: a marker's key
      // is its prompt id and never changes, so a conditional request would 304 for ever and no
      // version would ever be picked up.
      const etag = `"${live.markerText.length}-${live.artifact.buildHash.slice(0, 8)}-${live.marker.version}"`;
      if (init?.headers?.["if-none-match"] === etag) return respond(304, "");
      return respond(200, live.markerText, { etag });
    }
    if (url.includes(`/v1/build/${live.artifact.buildHash}`)) return respond(200, live.artifactText);
    return respond(404, "{}");
  };

  return {
    fetch: fetchImpl,
    calls,
    get live() {
      return live;
    },
    publish(body: string, version: number) {
      live = build({ body, version });
    },
    /** Freeze every in-flight response until `release()` is called. */
    freeze() {
      let release = (): void => undefined;
      hold = new Promise<void>((resolve) => {
        release = () => resolve();
      });
      return () => {
        hold = undefined;
        release();
      };
    },
    markerCalls: () => calls.filter((url) => url.includes("/v1/marker/")).length,
    buildCalls: () => calls.filter((url) => url.includes("/v1/build/")).length,
  };
}

describe("stale serves the old version, then refreshes", () => {
  it("answers from what it holds while the new version is still in flight", async () => {
    const backend = server();
    let clock = 1_000_000;
    const sdk = client({
      apiKey: "41p_test_x",
      cacheDir: null,
      fetch: backend.fetch,
      refreshMs: 1000,
      now: () => clock,
      onWarning: () => undefined,
    });

    await sdk.refresh(PROMPT_ID);
    expect(sdk.resolve(PROMPT_ID, { customer_name: "Ada" }).text).toContain("Version one for Ada");
    expect(sdk.resolve(PROMPT_ID, { customer_name: "Ada" }).version).toBe(1);

    backend.publish("Version two for {{customer_name}}, {{tone}}.", 2);
    clock += 5000;

    // Hold every response open, then resolve. If the call awaited the network it could not return.
    const release = backend.freeze();
    const during = sdk.resolve(PROMPT_ID, { customer_name: "Ada" });
    expect(during.text).toContain("Version one for Ada");
    expect(during.version).toBe(1);

    release();
    await sdk.refresh(PROMPT_ID);

    const after = sdk.resolve(PROMPT_ID, { customer_name: "Ada" });
    expect(after.text).toContain("Version two for Ada");
    expect(after.version).toBe(2);
  });

  it("does not ask again while what it holds is fresh", async () => {
    const backend = server();
    let clock = 1_000_000;
    const sdk = client({
      apiKey: "41p_test_x",
      cacheDir: null,
      fetch: backend.fetch,
      refreshMs: 1000,
      now: () => clock,
      onWarning: () => undefined,
    });

    await sdk.refresh(PROMPT_ID);
    const afterFirst = backend.markerCalls();

    for (let i = 0; i < 50; i += 1) sdk.resolve(PROMPT_ID, { customer_name: "Ada" });
    expect(backend.markerCalls()).toBe(afterFirst);

    // The control: move past the refresh interval and the next resolve does ask.
    clock += 2000;
    sdk.resolve(PROMPT_ID, { customer_name: "Ada" });
    await sdk.refresh(PROMPT_ID);
    expect(backend.markerCalls()).toBeGreaterThan(afterFirst);
  });

  it("sends If-None-Match and takes a 304 as nothing to do", async () => {
    const backend = server();
    let clock = 1_000_000;
    const sdk = client({
      apiKey: "41p_test_x",
      cacheDir: null,
      fetch: backend.fetch,
      refreshMs: 1000,
      now: () => clock,
      onWarning: () => undefined,
    });

    await sdk.refresh(PROMPT_ID);
    expect(backend.buildCalls()).toBe(1);

    clock += 5000;
    await sdk.refresh(PROMPT_ID);

    // The marker was asked for again and answered 304, so the artifact was not transferred a second
    // time. That is the steady state this SDK is in for the whole life of a process.
    expect(backend.markerCalls()).toBe(2);
    expect(backend.buildCalls()).toBe(1);
    expect(sdk.resolve(PROMPT_ID, { customer_name: "Ada" }).version).toBe(1);
  });

  it("does not re-download a build it already holds when the marker moves back to it", async () => {
    const backend = server();
    let clock = 1_000_000;
    const sdk = client({
      apiKey: "41p_test_x",
      cacheDir: null,
      fetch: backend.fetch,
      refreshMs: 1000,
      now: () => clock,
      onWarning: () => undefined,
    });

    await sdk.refresh(PROMPT_ID);
    // An Undo: the same artifact bytes under a new version number. The marker's content changed, so
    // the ETag changed, so this is a 200 — and the artifact still must not be fetched again.
    backend.publish("Version one for {{customer_name}}, {{tone}}.", 3);
    clock += 5000;
    await sdk.refresh(PROMPT_ID);

    expect(backend.buildCalls()).toBe(1);
    expect(sdk.resolve(PROMPT_ID, { customer_name: "Ada" }).version).toBe(3);
  });
});

describe("one in-flight request per prompt", () => {
  it("1,000 concurrent resolves produce one marker request and one artifact request", async () => {
    const backend = server();
    const sdk = client({
      apiKey: "41p_test_x",
      cacheDir: null,
      fetch: backend.fetch,
      refreshMs: 1000,
      onWarning: () => undefined,
    });

    const release = backend.freeze();
    for (let i = 0; i < 1000; i += 1) {
      const result = sdk.resolve(PROMPT_ID, { customer_name: "Ada" });
      // Every one of them answered without waiting, because there was nothing to wait for.
      expect(result.status).toBe("unavailable");
    }
    release();
    await sdk.refresh(PROMPT_ID);

    expect(backend.markerCalls()).toBe(1);
    expect(backend.buildCalls()).toBe(1);
  });

  it("1,000 concurrent refreshes join the same request rather than starting 1,000", async () => {
    const backend = server();
    const sdk = client({
      apiKey: "41p_test_x",
      cacheDir: null,
      fetch: backend.fetch,
      refreshMs: 1000,
      onWarning: () => undefined,
    });

    const release = backend.freeze();
    const all = Promise.all(Array.from({ length: 1000 }, () => sdk.refresh(PROMPT_ID)));
    release();
    await all;

    expect(backend.markerCalls()).toBe(1);
    expect(backend.buildCalls()).toBe(1);
    expect(sdk.resolve(PROMPT_ID, { customer_name: "Ada" }).status).toBe("ok");
  });
});

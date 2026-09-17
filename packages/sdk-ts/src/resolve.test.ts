// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The resolve order, offline behaviour and variable binding (EPIC-052, C1, C2, C8).
 *
 * Nothing in this file reaches the network. `fetch` is injected in every case, and the offline tests
 * inject one that rejects the way a socket does — which is what "offline returns bundled" has to
 * mean for an SDK whose customer is on a train.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { FetchLike, Warning } from "./types.js";
import { createClient } from "./client.js";
import { build, PROMPT_ID } from "./__fixtures__/artifacts.js";

const offline: FetchLike = () => Promise.reject(new Error("getaddrinfo ENOTFOUND app.41prompts.ai"));

const clients: { close(): void }[] = [];
function client(options: Parameters<typeof createClient>[0]) {
  const made = createClient(options);
  clients.push(made);
  return made;
}
afterEach(() => {
  while (clients.length > 0) clients.pop()?.close();
});

describe("the resolve order", () => {
  it("returns nothing when there is no cache, nothing bundled and no network", async () => {
    const warnings: Warning[] = [];
    const sdk = client({ apiKey: "41p_test_x", fetch: offline, cacheDir: null, onWarning: (w) => warnings.push(w) });

    const result = sdk.resolve(PROMPT_ID, { customer_name: "Ada" });

    expect(result.status).toBe("unavailable");
    expect(result.text).toBe("");
    expect(result.source).toBe("none");
    expect(warnings.some((w) => w.code === "not_found")).toBe(true);

    // The background fetch was started and failed; the call above did not wait for it.
    await sdk.refresh(PROMPT_ID);
    expect(warnings.some((w) => w.code === "network")).toBe(true);
  });

  it("offline returns the bundled artifact", () => {
    const { artifact } = build();
    const sdk = client({
      apiKey: "41p_test_x",
      fetch: offline,
      cacheDir: null,
      bundled: [artifact],
      onWarning: () => undefined,
    });

    const result = sdk.resolve(PROMPT_ID, { customer_name: "Ada" });

    expect(result.status).toBe("ok");
    expect(result.source).toBe("bundled");
    expect(result.text).toContain("Reply to Ada in a warm register.");
    // A bundled artifact has no marker, so it has no version. `entry.ts` says why that is honest.
    expect(result.version).toBeNull();
    expect(result.buildHash).toBe(artifact.buildHash);
  });

  it("prefers memory to bundled once something has been fetched", async () => {
    const bundledBuild = build({ body: "Bundled, for {{customer_name}}, {{tone}}." });
    const liveBuild = build({ body: "Live, for {{customer_name}}, {{tone}}.", version: 7 });

    const sdk = client({
      apiKey: "41p_test_x",
      cacheDir: null,
      bundled: [bundledBuild.artifact],
      fetch: stubFetch(liveBuild),
      onWarning: () => undefined,
    });

    expect(sdk.resolve(PROMPT_ID, { customer_name: "Ada" }).source).toBe("bundled");
    await sdk.refresh(PROMPT_ID);

    const after = sdk.resolve(PROMPT_ID, { customer_name: "Ada" });
    expect(after.source).toBe("memory");
    expect(after.text).toContain("Live, for Ada");
    expect(after.version).toBe(7);
  });

  it("drops one malformed bundled entry and keeps the ones beside it", () => {
    const good = build();
    const warnings: Warning[] = [];
    const sdk = client({
      apiKey: "41p_test_x",
      fetch: offline,
      cacheDir: null,
      bundled: [{ schemaVersion: 1, nonsense: true }, good.artifact],
      onWarning: (w) => warnings.push(w),
    });

    expect(sdk.resolve(PROMPT_ID, { customer_name: "Ada" }).status).toBe("ok");
    expect(warnings.some((w) => w.message.includes("bundled build 1 was dropped"))).toBe(true);
  });
});

describe("variable validation", () => {
  it("refuses rather than shipping a prompt with an unfilled placeholder in it", () => {
    const { artifact } = build();
    const warnings: Warning[] = [];
    const sdk = client({ apiKey: "41p_test_x", fetch: offline, cacheDir: null, bundled: [artifact], onWarning: (w) => warnings.push(w) });

    const result = sdk.resolve(PROMPT_ID, {});

    expect(result.status).toBe("unavailable");
    expect(result.text).toBe("");
    expect(result.missing).toEqual(["customer_name"]);
    expect(warnings.some((w) => w.code === "missing_variables")).toBe(true);
  });

  it("applies a declared default and names it", () => {
    const { artifact } = build();
    const sdk = client({ apiKey: "41p_test_x", fetch: offline, cacheDir: null, bundled: [artifact], onWarning: () => undefined });

    const result = sdk.resolve(PROMPT_ID, { customer_name: "Ada" });

    expect(result.usedDefaults).toEqual(["tone"]);
    expect(result.text).toContain("in a warm register");
  });

  it("inserts a value verbatim and never rescans it", () => {
    // core's `bindVariables` owns this rule; the assertion is here because it is the SDK's promise to
    // a customer whose support transcripts contain braces.
    const { artifact } = build();
    const sdk = client({ apiKey: "41p_test_x", fetch: offline, cacheDir: null, bundled: [artifact], onWarning: () => undefined });

    const result = sdk.resolve(PROMPT_ID, { customer_name: "{{tone}}", tone: "brisk" });

    expect(result.text).toContain("Reply to {{tone}} in a brisk register.");
  });

  it("skips a value that is not a primitive rather than writing [object Object] into a prompt", () => {
    const { artifact } = build();
    const warnings: Warning[] = [];
    const sdk = client({ apiKey: "41p_test_x", fetch: offline, cacheDir: null, bundled: [artifact], onWarning: (w) => warnings.push(w) });

    const result = sdk.resolve(PROMPT_ID, { customer_name: { first: "Ada" } } as unknown as Record<string, string>);

    expect(result.status).toBe("unavailable");
    expect(result.missing).toEqual(["customer_name"]);
    expect(warnings.some((w) => w.message.includes("is not a string"))).toBe(true);
  });

  it("accepts a number or a boolean, because a caller will pass one", () => {
    const { artifact } = build({ body: "Count: {{count}}. Flag: {{flag}}." , variables: [
      { name: "count", defaultValue: null, description: null },
      { name: "flag", defaultValue: null, description: null },
    ] });
    const sdk = client({ apiKey: "41p_test_x", fetch: offline, cacheDir: null, bundled: [artifact], onWarning: () => undefined });

    const result = sdk.resolve(PROMPT_ID, { count: 3, flag: false } as unknown as Record<string, string>);

    expect(result.text).toContain("Count: 3. Flag: false.");
  });
});

describe("the warning handler", () => {
  it("survives a handler that throws", () => {
    const sdk = client({
      apiKey: "41p_test_x",
      fetch: offline,
      cacheDir: null,
      onWarning: () => {
        throw new Error("the application's logger is broken");
      },
    });
    expect(() => sdk.resolve(PROMPT_ID)).not.toThrow();
  });

  it("does not warn through console when a handler was given", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sdk = client({ apiKey: "41p_test_x", fetch: offline, cacheDir: null, onWarning: () => undefined });
    sdk.resolve(PROMPT_ID);
    expect(spy).not.toHaveBeenCalled();

    // The control: with no handler, the default one does reach console, so the assertion above is
    // about the handler rather than about a spy that was never going to fire.
    const bare = client({ apiKey: "41p_test_x", fetch: offline, cacheDir: null });
    bare.resolve(PROMPT_ID);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

/** A `fetch` that answers the marker and the build for one fixture, and 404s everything else. */
function stubFetch(built: ReturnType<typeof build>): FetchLike {
  return (url) => {
    if (url.includes("/v1/marker/")) {
      return Promise.resolve(makeResponse(200, built.markerText, { etag: `"${built.artifact.buildHash}"` }));
    }
    if (url.includes(`/v1/build/${built.artifact.buildHash}`)) {
      return Promise.resolve(makeResponse(200, built.artifactText));
    }
    return Promise.resolve(makeResponse(404, "{}"));
  };
}

function makeResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: () => Promise.resolve(body),
  };
}

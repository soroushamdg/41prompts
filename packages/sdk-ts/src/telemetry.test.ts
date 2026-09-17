// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * Telemetry (EPIC-052, C10).
 *
 * Two claims are under test and the second is the one that matters:
 *
 * 1. **Off by default** — `CLAUDE.md` rule 8.
 * 2. **On, it adds a header to a request that was happening anyway and sends nothing else.**
 *    `docs/roadmap.md` says "apps resolving" is *"derived from CDN access logs, **no client ping**"*,
 *    so a telemetry design that posted an event would be building the answer the roadmap names as
 *    wrong. The request count is therefore asserted, not only the header.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "./client.js";
import type { Client, FetchLike } from "./types.js";
import { build, PROMPT_ID } from "./__fixtures__/artifacts.js";
import { SDK_VERSION } from "./version.js";

const clients: Client[] = [];
const directories: string[] = [];
afterEach(() => {
  while (clients.length > 0) clients.pop()?.close();
  while (directories.length > 0) rmSync(directories.pop() as string, { recursive: true, force: true });
});

function scratch(): string {
  const made = mkdtempSync(join(tmpdir(), "41p-sdk-telemetry-"));
  directories.push(made);
  return made;
}

function recorder(): { fetch: FetchLike; requests: { url: string; headers: Record<string, string> }[] } {
  const live = build();
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    requests.push({ url, headers: init?.headers ?? {} });
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () => Promise.resolve(url.includes("/v1/marker/") ? live.markerText : live.artifactText),
    });
  };
  return { fetch: fetchImpl, requests };
}

describe("telemetry", () => {
  it("is off unless it is turned on", async () => {
    const { fetch, requests } = recorder();
    const sdk = createClient({ apiKey: "41p_test_x", cacheDir: scratch(), fetch, onWarning: () => undefined });
    clients.push(sdk);

    await sdk.refresh(PROMPT_ID);

    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) expect(request.headers["41p-client"]).toBeUndefined();
  });

  it("adds exactly one header, in the documented grammar, and makes no extra request", async () => {
    const withOut = recorder();
    const withIn = recorder();
    const directory = scratch();

    const quiet = createClient({ apiKey: "41p_test_x", cacheDir: directory, fetch: withOut.fetch, onWarning: () => undefined });
    clients.push(quiet);
    await quiet.refresh(PROMPT_ID);

    const loud = createClient({
      apiKey: "41p_test_x",
      cacheDir: directory,
      fetch: withIn.fetch,
      telemetry: true,
      onWarning: () => undefined,
    });
    clients.push(loud);
    await loud.refresh(PROMPT_ID);

    // No ping. Turning telemetry on changes what a request says, never how many there are.
    expect(withIn.requests.length).toBe(withOut.requests.length);

    const header = withIn.requests[0]?.headers["41p-client"];
    expect(header).toBeDefined();
    // `ts` · this package's version · the Node major · the install id. Four parts, nothing else.
    expect(header).toMatch(
      new RegExp(`^ts/${SDK_VERSION.replace(/\./g, "\\.")}/node\\d+/[0-9a-f-]{36}$`),
    );

    // Nothing but the one extra header is different between the two.
    const difference = Object.keys(withIn.requests[0]?.headers ?? {}).filter(
      (name) => !(name in (withOut.requests[0]?.headers ?? {})),
    );
    expect(difference).toEqual(["41p-client"]);
  });

  it("reuses one install id across clients, and writes it beside the cache", () => {
    const directory = scratch();
    const { fetch } = recorder();

    const first = createClient({ apiKey: "41p_test_x", cacheDir: directory, fetch, telemetry: true, onWarning: () => undefined });
    const second = createClient({ apiKey: "41p_test_x", cacheDir: directory, fetch, telemetry: true, onWarning: () => undefined });
    clients.push(first, second);

    expect(readdirSync(directory)).toContain("install-id");
  });

  it("goes without an install id rather than failing when the cache is off", async () => {
    const { fetch, requests } = recorder();
    const sdk = createClient({
      apiKey: "41p_test_x",
      cacheDir: null,
      fetch,
      telemetry: true,
      onWarning: () => undefined,
    });
    clients.push(sdk);

    await sdk.refresh(PROMPT_ID);

    expect(requests[0]?.headers["41p-client"]).toBe(`ts/${SDK_VERSION}/node${process.versions.node.split(".")[0]}/anonymous`);
  });
});

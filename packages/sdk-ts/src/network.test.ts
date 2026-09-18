// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Everything a server can answer, and what each one becomes (EPIC-052, C7).
 *
 * The rule under test is `CLAUDE.md` rule 8's second half: **none of these throws**, and every one
 * of them is a `Warning` a caller can route on. A 500 and a truncated body are the same class of
 * event as being offline, and an SDK that distinguishes them by whether it crashes is not one.
 */

import { describe, expect, it } from "vitest";
import { fetchLive, type NetworkConfig } from "./network.js";
import type { FetchLike, Warning } from "./types.js";
import { build, PROMPT_ID, response } from "./__fixtures__/artifacts.js";

function config(fetchImpl: FetchLike, extra: Partial<NetworkConfig> = {}): NetworkConfig {
  return { baseUrl: "https://app.example/", apiKey: "41p_live_x", fetch: fetchImpl, timeoutMs: 100, ...extra };
}

async function warningFrom(fetchImpl: FetchLike): Promise<Warning> {
  const outcome = await fetchLive(config(fetchImpl), PROMPT_ID, null, null);
  if (outcome.kind !== "warning") throw new Error(`expected a warning, got ${outcome.kind}`);
  return outcome.warning;
}

describe("fetchLive", () => {
  /** The positive control. Every other case here is a refusal. */
  it("returns an entry for a well-formed marker and artifact", async () => {
    const live = build({ version: 4 });
    const outcome = await fetchLive(
      config((url) =>
        Promise.resolve(
          url.includes("/v1/marker/")
            ? response(200, live.markerText, { etag: '"abc"' })
            : response(200, live.artifactText),
        ),
      ),
      PROMPT_ID,
      null,
      null,
    );

    expect(outcome.kind).toBe("entry");
    if (outcome.kind === "entry") {
      expect(outcome.entry.version).toBe(4);
      expect(outcome.entry.etag).toBe('"abc"');
      expect(outcome.entry.artifact.buildHash).toBe(live.artifact.buildHash);
      // The bytes handed on for the disk cache are the bytes that arrived, not a re-serialisation.
      expect(outcome.artifactText).toBe(live.artifactText);
    }
  });

  it("sends the key as a bearer token and asks for the marker by prompt id", async () => {
    const live = build();
    const seen: { url: string; headers: Record<string, string> }[] = [];
    await fetchLive(
      config((url, init) => {
        seen.push({ url, headers: init?.headers ?? {} });
        return Promise.resolve(
          url.includes("/v1/marker/") ? response(200, live.markerText) : response(200, live.artifactText),
        );
      }),
      PROMPT_ID,
      '"previous"',
      null,
    );

    expect(seen[0]?.url).toBe(`https://app.example/v1/marker/${PROMPT_ID}`);
    expect(seen[0]?.headers["authorization"]).toBe("Bearer 41p_live_x");
    expect(seen[0]?.headers["if-none-match"]).toBe('"previous"');
    expect(seen[1]?.url).toBe(`https://app.example/v1/build/${live.artifact.buildHash}`);
    // A conditional request for an immutable object would be a round trip for an answer that cannot
    // change: the key *is* the hash.
    expect(seen[1]?.headers["if-none-match"]).toBeUndefined();
  });

  it("turns each status into the warning a caller can act on", async () => {
    const cases: [number, Warning["code"]][] = [
      [401, "unauthorised"],
      [403, "unauthorised"],
      [404, "not_found"],
      [500, "network"],
      [502, "network"],
    ];
    for (const [status, code] of cases) {
      expect((await warningFrom(() => Promise.resolve(response(status, "")))).code).toBe(code);
    }
  });

  it("does not throw when the socket does", async () => {
    const warning = await warningFrom(() => Promise.reject(new Error("ECONNREFUSED 127.0.0.1:443")));
    expect(warning.code).toBe("network");
    expect(warning.message).toContain("ECONNREFUSED");
  });

  it("does not throw when the body is not JSON", async () => {
    expect((await warningFrom(() => Promise.resolve(response(200, "<html>504</html>")))).code).toBe("malformed");
  });

  it("does not throw when reading the body fails halfway", async () => {
    const warning = await warningFrom(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: () => Promise.reject(new Error("terminated")),
      }),
    );
    expect(warning.code).toBe("network");
  });

  it("refuses a marker that names a different prompt", async () => {
    const other = build({ promptId: "pr_99999999" });
    const warning = await warningFrom(() => Promise.resolve(response(200, other.markerText)));
    expect(warning.code).toBe("malformed");
    expect(warning.message).toContain("different prompt");
  });

  it("refuses an artifact whose hash is not the one the marker named", async () => {
    const live = build({ body: "Live text for {{customer_name}}, {{tone}}." });
    const stale = build({ body: "Last week for {{customer_name}}, {{tone}}." });

    const outcome = await fetchLive(
      config((url) =>
        Promise.resolve(
          url.includes("/v1/marker/")
            ? response(200, live.markerText)
            : // A perfectly valid artifact. The wrong one. This is the stale-edge case.
              response(200, stale.artifactText),
        ),
      ),
      PROMPT_ID,
      null,
      null,
    );

    expect(outcome.kind).toBe("warning");
    if (outcome.kind === "warning") expect(outcome.warning.code).toBe("hash_mismatch");
  });

  it("treats a 304 as nothing to do and asks for no artifact", async () => {
    let calls = 0;
    const outcome = await fetchLive(
      config(() => {
        calls += 1;
        return Promise.resolve(response(304, ""));
      }),
      PROMPT_ID,
      '"held"',
      "abc",
    );
    expect(outcome.kind).toBe("unchanged");
    expect(calls).toBe(1);
  });

  it("does not add the telemetry header unless it was asked to", async () => {
    const live = build();
    const headersFor = async (extra: Partial<NetworkConfig>): Promise<Record<string, string>> => {
      let captured: Record<string, string> = {};
      await fetchLive(
        config((url, init) => {
          if (url.includes("/v1/marker/")) captured = init?.headers ?? {};
          return Promise.resolve(
            url.includes("/v1/marker/") ? response(200, live.markerText) : response(200, live.artifactText),
          );
        }, extra),
        PROMPT_ID,
        null,
        null,
      );
      return captured;
    };

    expect((await headersFor({}))["41p-client"]).toBeUndefined();
    // The control: the header does appear when it is configured, so the absence above is a fact
    // about the default rather than about a header this code cannot send.
    expect((await headersFor({ clientHeader: "ts/0.1.0/node22/abc" }))["41p-client"]).toBe("ts/0.1.0/node22/abc");
  });
});

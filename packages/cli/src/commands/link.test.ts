// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/** `41p link` (EPIC-053, C9 and C10). */

import { describe, expect, it } from "vitest";
import { CONFIG_FILENAME } from "../config.js";
import { EXIT } from "../exit.js";
import { artifactFixture, promptsRoute } from "../fixtures.js";
import { testEnv } from "../testing.js";
import { link } from "./link.js";

const KEY = "41p_test_0123456789abcdef0123456789abcdef";
const routes = promptsRoute([{ id: "pr_1a2b3c4d", name: "Refund classifier", artifact: artifactFixture() }], "test");

describe("41p link", () => {
  it("writes .41prc and reports what the key can see", async () => {
    const env = testEnv({ vars: { FORTYONE_API_KEY: KEY }, routes });
    const result = await link(env, { baseUrl: "https://example.invalid" });

    expect(result.code).toBe(EXIT.OK);
    const written = env.files.get(CONFIG_FILENAME);
    expect(written).toBeDefined();
    expect(JSON.parse(written!)).toEqual({ baseUrl: "https://example.invalid", out: ".", language: "typescript" });
    expect((result.out ?? []).join("\n")).toContain("1 prompt, 1 Live");
  });

  describe("the key is never written to the file", () => {
    it("does not appear in .41prc", async () => {
      const env = testEnv({ vars: { FORTYONE_API_KEY: KEY }, routes });
      await link(env, { baseUrl: "https://example.invalid" });
      const written = env.files.get(CONFIG_FILENAME) ?? "";

      expect(written).not.toContain(KEY);
      // The secret half on its own, in case a future version wrote a prefix plus the rest.
      expect(written).not.toContain("0123456789abcdef");
    });

    it("— and the search above can find a key when one is there", () => {
      // The positive control. Without it, `not.toContain` would pass against an empty string, a
      // misspelled constant, or a file that was never written at all (lesson 8).
      const planted = JSON.stringify({ baseUrl: "https://example.invalid", key: KEY });
      expect(planted).toContain(KEY);
      expect(planted).toContain("0123456789abcdef");
    });
  });

  it("refuses rather than asking when there is no terminal, and does not read stdin", async () => {
    const env = testEnv({ interactive: false, routes });
    const result = await link(env, { baseUrl: "https://example.invalid" });

    expect(result.code).toBe(EXIT.CANNOT_ANSWER);
    expect(env.asked).toEqual([]);
    const said = (result.err ?? []).join("\n");
    expect(said).toContain("FORTYONE_API_KEY");
    expect(said).toContain("--key");
    expect(env.files.has(CONFIG_FILENAME)).toBe(false);
  });

  it("asks when there is a terminal", async () => {
    const env = testEnv({ interactive: true, answers: [KEY], routes });
    const result = await link(env, { baseUrl: "https://example.invalid" });

    expect(env.asked).toHaveLength(1);
    expect(result.code).toBe(EXIT.OK);
  });

  it("prefers --key to the environment", async () => {
    const env = testEnv({ vars: { FORTYONE_API_KEY: "41p_live_ffffffffffffffffffffffffffffffff" }, routes });
    const result = await link(env, { key: KEY, baseUrl: "https://example.invalid" });
    expect((result.out ?? []).join("\n")).toContain("test key");
  });

  it("refuses something that is not a key, before making a request", async () => {
    const env = testEnv({ routes });
    const result = await link(env, { key: "hunter2", baseUrl: "https://example.invalid" });

    expect(result.code).toBe(EXIT.CANNOT_ANSWER);
    expect(env.requested).toEqual([]);
    expect((result.err ?? []).join("\n")).toContain("41p_live_");
  });

  it("writes nothing when the key is refused", async () => {
    const env = testEnv({
      vars: { FORTYONE_API_KEY: KEY },
      routes: { "/v1/prompts": { status: 401, body: "" } },
    });
    const result = await link(env, { baseUrl: "https://example.invalid" });

    expect(result.code).toBe(EXIT.CANNOT_ANSWER);
    expect(env.files.has(CONFIG_FILENAME)).toBe(false);
    expect((result.err ?? []).join("\n")).toContain("refused");
  });

  it("keeps the existing out and language when relinking", async () => {
    const env = testEnv({
      vars: { FORTYONE_API_KEY: KEY },
      files: { [CONFIG_FILENAME]: JSON.stringify({ baseUrl: "https://old.invalid", out: "src/generated", language: "python" }) },
      routes,
    });
    await link(env, { baseUrl: "https://example.invalid" });
    expect(JSON.parse(env.files.get(CONFIG_FILENAME)!)).toEqual({
      baseUrl: "https://example.invalid",
      out: "src/generated",
      language: "python",
    });
  });
});

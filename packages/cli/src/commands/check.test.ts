// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * `41p check` (EPIC-053, C7 and C8).
 *
 * The suite is organised around the distinction ruling 7 exists for: **`1` is a real answer and `2`
 * is not being able to give one.** Every "cannot answer" case below asserts `2` *and* asserts it is
 * not `1`, because a command that collapsed the two would still pass a test that only checked for
 * "non-zero".
 */

import { describe, expect, it } from "vitest";
import { CONFIG_FILENAME } from "../config.js";
import { EXIT } from "../exit.js";
import { artifactFixture, buildRoutes, promptsRoute } from "../fixtures.js";
import { LOCKFILE_FILENAME } from "../lockfile.js";
import { testEnv } from "../testing.js";
import { pull } from "./pull.js";
import { check } from "./check.js";

const KEY = "41p_live_0123456789abcdef0123456789abcdef";
const v7 = artifactFixture({ promptId: "pr_1a2b3c4d", text: "Classify {{email}}" });
const v8 = artifactFixture({ promptId: "pr_1a2b3c4d", text: "Classify {{email}} carefully" });

const config = JSON.stringify({ baseUrl: "https://example.invalid", out: ".", language: "typescript" });

const at = (artifact: typeof v7, version: number) => ({
  vars: { FORTYONE_API_KEY: KEY },
  files: { [CONFIG_FILENAME]: config },
  routes: {
    ...promptsRoute([{ id: "pr_1a2b3c4d", name: "Refund classifier", artifact, version }]),
    ...buildRoutes(artifact),
  },
});

/** Pull once, then hand the files it wrote to a world where Live may have moved. */
const pulledThen = async (now: ReturnType<typeof at>) => {
  const first = testEnv(at(v7, 7));
  await pull(first, {});
  return testEnv({ ...now, files: { ...now.files, ...Object.fromEntries(first.files) } });
};

describe("41p check", () => {
  it("exits 0 when nothing has moved", async () => {
    const env = await pulledThen(at(v7, 7));
    const result = await check(env, {});

    expect(result.code).toBe(EXIT.OK);
    expect((result.out ?? []).join("\n")).toContain("Current");
  });

  describe("a stale lockfile is a real answer", () => {
    it("exits 1 and names the prompt that moved", async () => {
      const env = await pulledThen(at(v8, 8));
      const result = await check(env, {});

      expect(result.code).toBe(EXIT.ANSWERED_NO);
      const said = (result.err ?? []).join("\n");
      expect(said).toContain("Stale");
      expect(said).toContain("Refund classifier (pr_1a2b3c4d)");
      expect(said).toContain("your lockfile has v7, Live is v8");
      expect(said).toContain("Run 41p pull");
    });

    it("exits 1 when a prompt was published and then undone", async () => {
      const env = await pulledThen({
        vars: { FORTYONE_API_KEY: KEY },
        files: { [CONFIG_FILENAME]: config },
        routes: promptsRoute([{ id: "pr_1a2b3c4d", name: "Refund classifier" }]),
      });
      const result = await check(env, {});

      expect(result.code).toBe(EXIT.ANSWERED_NO);
      expect((result.err ?? []).join("\n")).toContain("nothing is Live now");
    });

    it("exits 1 when a new prompt is Live that the generated file has no function for", async () => {
      const other = artifactFixture({ promptId: "pr_bbbbbbbb", text: "Summarise" });
      const env = await pulledThen({
        vars: { FORTYONE_API_KEY: KEY },
        files: { [CONFIG_FILENAME]: config },
        routes: {
          ...promptsRoute([
            { id: "pr_1a2b3c4d", name: "Refund classifier", artifact: v7, version: 7 },
            { id: "pr_bbbbbbbb", name: "Daily summary", artifact: other, version: 1 },
          ]),
          ...buildRoutes(v7, other),
        },
      });
      const result = await check(env, {});

      expect(result.code).toBe(EXIT.ANSWERED_NO);
      expect((result.err ?? []).join("\n")).toContain("your generated file has no function for it");
    });

    it("exits 1 when the key can no longer see a prompt the lockfile names", async () => {
      const env = await pulledThen({
        vars: { FORTYONE_API_KEY: KEY },
        files: { [CONFIG_FILENAME]: config },
        routes: promptsRoute([]),
      });
      const result = await check(env, {});

      expect(result.code).toBe(EXIT.ANSWERED_NO);
      expect((result.err ?? []).join("\n")).toContain("can no longer see it");
    });
  });

  describe("a hand-edited file is reported separately, because the fix is different", () => {
    it("exits 1 and says the next pull will overwrite it", async () => {
      const env = await pulledThen(at(v7, 7));
      env.files.set("prompts.ts", `${env.files.get("prompts.ts")}\n// somebody fixed a name here\n`);
      const result = await check(env, {});

      expect(result.code).toBe(EXIT.ANSWERED_NO);
      const said = (result.err ?? []).join("\n");
      expect(said).toContain("edited by hand");
      expect(said).not.toContain("Stale");
    });

    it("— and an untouched file is not reported as edited", async () => {
      // The control for the hash comparison: if it always fired, the test above would be vacuous.
      const env = await pulledThen(at(v7, 7));
      expect((await check(env, {})).code).toBe(EXIT.OK);
    });

    it("exits 1 when the generated file is gone entirely", async () => {
      const env = await pulledThen(at(v7, 7));
      env.files.delete("prompts.ts");
      const result = await check(env, {});

      expect(result.code).toBe(EXIT.ANSWERED_NO);
      expect((result.err ?? []).join("\n")).toContain("is missing");
    });
  });

  describe("not being able to answer is exit 2, never exit 1", () => {
    it("no lockfile", async () => {
      const env = testEnv({ ...at(v7, 7) });
      const result = await check(env, {});

      expect(result.code).toBe(EXIT.CANNOT_ANSWER);
      expect(result.code).not.toBe(EXIT.ANSWERED_NO);
      expect((result.err ?? []).join("\n")).toContain("Run 41p pull first");
    });

    it("no key", async () => {
      const pulled = await pulledThen(at(v7, 7));
      const env = testEnv({ files: Object.fromEntries(pulled.files), routes: at(v7, 7).routes });
      const result = await check(env, {});

      expect(result.code).toBe(EXIT.CANNOT_ANSWER);
      expect(result.code).not.toBe(EXIT.ANSWERED_NO);
      expect((result.err ?? []).join("\n")).toContain("not a stale lockfile");
      expect(env.requested).toEqual([]);
    });

    it("the key is refused", async () => {
      const env = await pulledThen({
        vars: { FORTYONE_API_KEY: KEY },
        files: { [CONFIG_FILENAME]: config },
        routes: { "/v1/prompts": { status: 403, body: "" } },
      });
      const result = await check(env, {});

      expect(result.code).toBe(EXIT.CANNOT_ANSWER);
      expect(result.code).not.toBe(EXIT.ANSWERED_NO);
      expect((result.err ?? []).join("\n")).toContain("refused");
    });

    it("the network did not complete", async () => {
      const pulled = await pulledThen(at(v7, 7));
      const env = testEnv({
        vars: { FORTYONE_API_KEY: KEY },
        files: Object.fromEntries(pulled.files),
        fetch: () => Promise.reject(new Error("getaddrinfo ENOTFOUND example.invalid")),
      });
      const result = await check(env, {});

      expect(result.code).toBe(EXIT.CANNOT_ANSWER);
      expect(result.code).not.toBe(EXIT.ANSWERED_NO);
      const said = (result.err ?? []).join("\n");
      expect(said).toContain("ENOTFOUND");
      expect(said).toContain("Nothing is known about whether your prompts moved");
    });

    it("a lockfile from a newer 41p", async () => {
      const env = testEnv({
        ...at(v7, 7),
        files: {
          [CONFIG_FILENAME]: config,
          [LOCKFILE_FILENAME]: JSON.stringify({ lockfileVersion: 99, prompts: [] }),
        },
      });
      const result = await check(env, {});

      expect(result.code).toBe(EXIT.CANNOT_ANSWER);
      expect((result.err ?? []).join("\n")).toContain("Upgrade 41p");
    });
  });
});

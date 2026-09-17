// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/** `41p run` (EPIC-053, C12). */

import { describe, expect, it } from "vitest";
import { CONFIG_FILENAME } from "../config.js";
import { EXIT } from "../exit.js";
import { artifactFixture, buildRoutes, promptsRoute } from "../fixtures.js";
import { testEnv } from "../testing.js";
import { NO_MODEL_NOTE, run } from "./run.js";

const KEY = "41p_live_0123456789abcdef0123456789abcdef";
const artifact = artifactFixture({
  promptId: "pr_1a2b3c4d",
  text: "Dear {{customer_name}}, about {{email}}. Locale {{locale}}.",
  variables: [
    { name: "email", defaultValue: null, description: null },
    { name: "locale", defaultValue: "en-GB", description: null },
  ],
});

const world = {
  vars: { FORTYONE_API_KEY: KEY },
  files: { [CONFIG_FILENAME]: JSON.stringify({ baseUrl: "https://example.invalid", out: ".", language: "typescript" }) },
  routes: {
    ...promptsRoute([{ id: "pr_1a2b3c4d", name: "Refund classifier", artifact, version: 7 }]),
    ...buildRoutes(artifact),
  },
};

const vars = (pairs: Record<string, string>): ReadonlyMap<string, string> => new Map(Object.entries(pairs));

describe("41p run", () => {
  it("prints the bound prompt on stdout and nothing else", async () => {
    const env = testEnv(world);
    const result = await run(env, {
      promptId: "pr_1a2b3c4d",
      vars: vars({ customer_name: "Ada", email: "a@example.com" }),
    });

    expect(result.code).toBe(EXIT.OK);
    // Exactly the artifact's own bytes with the values substituted — including the trailing
    // `BLOK_SEPARATOR` the compiler emits after every blok. Nothing added, and nothing trimmed:
    // `41p run x > prompt.txt` must write the prompt, and a tool you reached for because you did not
    // trust what was being sent must not quietly edit it. See `exit.ts`'s `raw`.
    expect(result.raw).toBe("Dear Ada, about a@example.com. Locale en-GB.\n\n");
    expect(result.out ?? []).toEqual([]);
  });

  it("says a model was not called, on stderr", async () => {
    const env = testEnv(world);
    const result = await run(env, {
      promptId: "pr_1a2b3c4d",
      vars: vars({ customer_name: "Ada", email: "a@example.com" }),
    });

    expect((result.err ?? []).join("\n")).toContain(NO_MODEL_NOTE);
    expect(result.raw ?? "").not.toContain(NO_MODEL_NOTE);
  });

  it("names the version and the model the checks were proved against", async () => {
    const env = testEnv(world);
    const result = await run(env, {
      promptId: "pr_1a2b3c4d",
      vars: vars({ customer_name: "Ada", email: "a@example.com" }),
    });
    expect((result.err ?? []).join("\n")).toContain("Live v7 · proved against claude-sonnet-5");
  });

  it("says which values fell back to a declared default", async () => {
    const env = testEnv(world);
    const result = await run(env, {
      promptId: "pr_1a2b3c4d",
      vars: vars({ customer_name: "Ada", email: "a@example.com" }),
    });
    expect((result.err ?? []).join("\n")).toContain("Used the declared default for: locale");
  });

  it("exits 1 and names a missing variable", async () => {
    const env = testEnv(world);
    const result = await run(env, { promptId: "pr_1a2b3c4d", vars: vars({ email: "a@example.com" }) });

    expect(result.code).toBe(EXIT.ANSWERED_NO);
    const said = (result.err ?? []).join("\n");
    expect(said).toContain("customer_name");
    expect(said).toContain("--var customer_name=");
    expect(result.raw).toBeUndefined();
  });

  it("--json gives the whole resolution, and says no model was called", async () => {
    const env = testEnv(world);
    const result = await run(env, {
      promptId: "pr_1a2b3c4d",
      vars: vars({ customer_name: "Ada", email: "a@example.com" }),
      json: true,
    });
    const document = JSON.parse((result.out ?? []).join("\n")) as Record<string, unknown>;

    expect(document.promptId).toBe("pr_1a2b3c4d");
    expect(document.version).toBe(7);
    expect(document.model).toBe("claude-sonnet-5");
    expect(document.usedDefaults).toEqual(["locale"]);
    expect(document.calledModel).toBe(false);
    expect(document.text).toContain("Ada");
  });

  it("exits 1 for a prompt with nothing Live — it exists, it is simply not published", async () => {
    const env = testEnv({ ...world, routes: promptsRoute([{ id: "pr_1a2b3c4d", name: "Refund classifier" }]) });
    const result = await run(env, { promptId: "pr_1a2b3c4d" });

    expect(result.code).toBe(EXIT.ANSWERED_NO);
    expect((result.err ?? []).join("\n")).toContain("has nothing Live");
  });

  it("cannot answer about a prompt this key cannot see", async () => {
    const env = testEnv(world);
    const result = await run(env, { promptId: "pr_ffffffff" });

    expect(result.code).toBe(EXIT.CANNOT_ANSWER);
    expect((result.err ?? []).join("\n")).toContain("A key is scoped to one project");
  });

  it("cannot answer with no prompt id and no key", async () => {
    expect((await run(testEnv(world), {})).code).toBe(EXIT.CANNOT_ANSWER);
    expect((await run(testEnv({ files: world.files, routes: world.routes }), { promptId: "pr_1a2b3c4d" })).code).toBe(
      EXIT.CANNOT_ANSWER,
    );
  });

  it("changes only the placeholders — the surrounding bytes are the artifact's", async () => {
    // Stated as a property rather than as a second copy of the literal above: whatever the compiler
    // put at the end of the prompt is what a caller receives, and binding does not touch it.
    const env = testEnv(world);
    const result = await run(env, {
      promptId: "pr_1a2b3c4d",
      vars: vars({ customer_name: "Ada", email: "a@example.com" }),
    });
    const tail = artifact.text.slice(artifact.text.lastIndexOf("."));
    expect(result.raw?.endsWith(tail)).toBe(true);
    expect(result.raw?.startsWith("Dear ")).toBe(true);
  });

  it("never substitutes into a value it just inserted", async () => {
    // core's `bindVariables` guarantees this and the guarantee is worth an assertion here, because
    // this command is the one that puts arbitrary customer text next to a placeholder.
    const env = testEnv(world);
    const result = await run(env, {
      promptId: "pr_1a2b3c4d",
      vars: vars({ customer_name: "{{email}}", email: "a@example.com" }),
    });
    expect(result.raw).toBe("Dear {{email}}, about a@example.com. Locale en-GB.\n\n");
  });
});

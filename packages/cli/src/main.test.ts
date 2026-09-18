// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/** argv, help, and the exit-code table (EPIC-053, C13 and C14). */

import { describe, expect, it } from "vitest";
import { parseArgs, varsOf } from "./args.js";
import { COMMANDS } from "./help.js";
import { EXIT } from "./exit.js";
import { artifactFixture, buildRoutes, promptsRoute } from "./fixtures.js";
import { runCommand } from "./main.js";
import { CONFIG_FILENAME } from "./config.js";
import { forbiddenFetch, testEnv } from "./testing.js";
import { CLUSTER_FIXTURES } from "@41prompts/core/fixtures";

const KEY = "41p_live_0123456789abcdef0123456789abcdef";
const artifact = artifactFixture();
const world = {
  vars: { FORTYONE_API_KEY: KEY },
  files: { [CONFIG_FILENAME]: JSON.stringify({ baseUrl: "https://example.invalid", out: ".", language: "typescript" }) },
  routes: {
    ...promptsRoute([{ id: "pr_1a2b3c4d", name: "Refund classifier", artifact, version: 1 }]),
    ...buildRoutes(artifact),
  },
};

describe("parseArgs", () => {
  it("separates the command, the positionals and the flags", () => {
    const parsed = parseArgs(["run", "pr_1a2b3c4d", "--json", "--key", "k"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.command).toBe("run");
    expect(parsed.args.positional).toEqual(["pr_1a2b3c4d"]);
    expect(parsed.args.flags).toMatchObject({ json: true, key: "k" });
  });

  it("takes --flag=value as well as --flag value", () => {
    const a = parseArgs(["pull", "--lang=python"]);
    const b = parseArgs(["pull", "--lang", "python"]);
    expect(a.ok && b.ok && a.args.flags.lang).toBe("python");
    expect(b.ok && b.args.flags.lang).toBe("python");
  });

  it("collects repeated --var, and a value may contain an equals sign", () => {
    const parsed = parseArgs(["run", "p", "--var", "a=1", "--var", "b=x=y"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([...varsOf(parsed.args.flags)]).toEqual([
      ["a", "1"],
      ["b", "x=y"],
    ]);
  });

  it("refuses an unknown flag rather than ignoring it", () => {
    // `41p pull --langauge python` typed at midnight must not silently pull TypeScript.
    const parsed = parseArgs(["pull", "--langauge", "python"]);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.detail).toContain("--langauge");
  });

  it("refuses a valued flag with nothing after it", () => {
    expect(parseArgs(["pull", "--key"]).ok).toBe(false);
  });
});

describe("41p, at the top level", () => {
  it("--help lists every command", async () => {
    const result = await runCommand(testEnv({ fetch: forbiddenFetch }), ["--help"]);
    const text = (result.out ?? []).join("\n");
    expect(result.code).toBe(EXIT.OK);
    for (const command of COMMANDS) expect(text).toContain(`41p ${command}`);
  });

  it("with no arguments, prints the help rather than doing something", async () => {
    const result = await runCommand(testEnv({ fetch: forbiddenFetch }), []);
    expect(result.code).toBe(EXIT.OK);
    expect((result.out ?? []).join("\n")).toContain("your prompts, in your repository");
  });

  it("--version prints the version and nothing else", async () => {
    const result = await runCommand(testEnv({ fetch: forbiddenFetch }), ["--version"]);
    expect(result.out).toEqual(["0.1.0"]);
  });

  it("an unknown command exits 2 with the list, not a stack trace", async () => {
    const result = await runCommand(testEnv({ fetch: forbiddenFetch }), ["publish"]);
    const said = (result.err ?? []).join("\n");
    expect(result.code).toBe(EXIT.CANNOT_ANSWER);
    expect(said).toContain('41p has no command "publish"');
    expect(said).not.toContain("at Object.");
    expect(said).toContain("41p pull");
  });

  it("refuses a --lang nobody implements", async () => {
    const result = await runCommand(testEnv({ fetch: forbiddenFetch }), ["pull", "--lang", "rust"]);
    expect(result.code).toBe(EXIT.CANNOT_ANSWER);
    expect((result.err ?? []).join("\n")).toContain("typescript or python");
  });

  it("turns an unexpected throw into a sentence and a 2", async () => {
    // Nothing is supposed to throw. If something does, a person gets a sentence rather than a stack
    // trace in a CI log, and the code still says "the question could not be put".
    const env = testEnv({
      vars: { FORTYONE_API_KEY: KEY },
      files: world.files,
      fetch: () => {
        throw new Error("something nobody anticipated");
      },
    });
    const result = await runCommand(env, ["run", "pr_1a2b3c4d"]);
    expect(result.code).toBe(EXIT.CANNOT_ANSWER);
    expect((result.err ?? []).join("\n")).toContain("something nobody anticipated");
  });
});

describe("the exit-code table, walked command by command", () => {
  const northwind = CLUSTER_FIXTURES.find((f) => f.name === "prototype-sample")!.text;
  const quiet = CLUSTER_FIXTURES.find((f) => f.name === "all-context")!.text;

  it("every command can exit 2 when it cannot answer", async () => {
    // No key, no config, no lockfile — the "cannot answer" case for each in turn.
    const bare = () => testEnv({ fetch: forbiddenFetch });
    expect((await runCommand(bare(), ["link"])).code).toBe(EXIT.CANNOT_ANSWER);
    expect((await runCommand(bare(), ["pull"])).code).toBe(EXIT.CANNOT_ANSWER);
    expect((await runCommand(bare(), ["check"])).code).toBe(EXIT.CANNOT_ANSWER);
    expect((await runCommand(bare(), ["run"])).code).toBe(EXIT.CANNOT_ANSWER);
    expect((await runCommand(bare(), ["decompile"])).code).toBe(EXIT.CANNOT_ANSWER);
  });

  it("only 0, 1 and 2 are ever returned", async () => {
    const env = testEnv({ ...world, files: { ...world.files, "p.txt": northwind, "clean.txt": quiet } });
    const codes = new Set<number>();
    for (const argv of [
      ["link"],
      ["pull"],
      ["check"],
      ["run", "pr_1a2b3c4d", "--var", "email=a@b.c"],
      ["decompile", "p.txt"],
      ["decompile", "clean.txt"],
      ["--help"],
      ["nonsense"],
    ]) {
      codes.add((await runCommand(env, argv)).code);
    }
    expect([...codes].sort()).toEqual([0, 1, 2]);
  });

  it("a command that answers yes exits 0 and one that answers no exits 1", async () => {
    const env = testEnv({ files: { "p.txt": northwind, "clean.txt": quiet }, fetch: forbiddenFetch });
    expect((await runCommand(env, ["decompile", "clean.txt"])).code).toBe(EXIT.OK);
    expect((await runCommand(env, ["decompile", "p.txt"])).code).toBe(EXIT.ANSWERED_NO);
  });
});

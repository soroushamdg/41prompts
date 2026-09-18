// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The disk cache (EPIC-052, C9).
 *
 * Each test gets its own directory under the OS temp directory and removes it afterwards. Nothing
 * here writes into the working tree — `docs/PROCESS.md`, "A test suite never writes into the working
 * tree": a suite that leaves `git status` dirty makes `git status` useless as a signal, which is how
 * a NUL byte survived two self-reviews.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "./client.js";
import { installId, readFromDisk, writeToDisk } from "./disk.js";
import type { Client, FetchLike, Warning } from "./types.js";
import { build, PROMPT_ID } from "./__fixtures__/artifacts.js";

const directories: string[] = [];
function scratch(): string {
  const made = mkdtempSync(join(tmpdir(), "41p-sdk-test-"));
  directories.push(made);
  return made;
}

const clients: Client[] = [];
afterEach(() => {
  while (clients.length > 0) clients.pop()?.close();
  while (directories.length > 0) rmSync(directories.pop() as string, { recursive: true, force: true });
});

const offline: FetchLike = () => Promise.reject(new Error("offline"));

function serving(live: ReturnType<typeof build>): FetchLike {
  return (url) =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === "etag" ? '"e1"' : null) },
      text: () => Promise.resolve(url.includes("/v1/marker/") ? live.markerText : live.artifactText),
    });
}

describe("the disk cache", () => {
  it("round-trips: one process writes it, a second with no network reads it", async () => {
    const directory = scratch();
    const live = build({ version: 5 });

    const first = createClient({ apiKey: "41p_test_x", cacheDir: directory, fetch: serving(live), onWarning: () => undefined });
    clients.push(first);
    await first.refresh(PROMPT_ID);

    const second = createClient({ apiKey: "41p_test_x", cacheDir: directory, fetch: offline, onWarning: () => undefined });
    clients.push(second);

    const result = second.resolve(PROMPT_ID, { customer_name: "Ada" });
    expect(result.status).toBe("ok");
    expect(result.source).toBe("disk");
    expect(result.version).toBe(5);
    expect(result.text).toContain("Reply to Ada");
  });

  it("re-verifies what it read, so a file somebody edited is refused", () => {
    const directory = scratch();
    const live = build();
    const warnings: Warning[] = [];

    writeToDisk(directory, PROMPT_ID, { artifact: live.artifact, version: 1, publishedAt: null, etag: null }, live.artifactText, () => undefined);
    expect(readFromDisk(directory, PROMPT_ID, () => undefined)).toBeDefined();

    // The same record with one character of the artifact changed. The `buildHash` inside it is
    // untouched, which is what an edited or half-written file looks like.
    writeToDisk(
      directory,
      PROMPT_ID,
      { artifact: live.artifact, version: 1, publishedAt: null, etag: null },
      live.artifactText.replace("support agent", "support agenT"),
      () => undefined,
    );
    expect(readFromDisk(directory, PROMPT_ID, (w) => warnings.push(w))).toBeUndefined();
    expect(warnings.some((w) => w.code === "hash_mismatch")).toBe(true);
  });

  it("ignores a file that is not JSON and a file this SDK did not write", () => {
    const directory = scratch();
    const warnings: Warning[] = [];

    writeFileSync(join(directory, `${PROMPT_ID}.json`), "not json at all", "utf8");
    expect(readFromDisk(directory, PROMPT_ID, (w) => warnings.push(w))).toBeUndefined();

    writeFileSync(join(directory, `${PROMPT_ID}.json`), JSON.stringify({ cacheVersion: 99 }), "utf8");
    expect(readFromDisk(directory, PROMPT_ID, (w) => warnings.push(w))).toBeUndefined();

    expect(warnings.filter((w) => w.code === "disk").length).toBe(2);
  });

  it("refuses to build a path out of a prompt id that is not a file name", () => {
    const directory = scratch();
    const live = build();
    for (const hostile of ["../escape", "a/b", "", "x".repeat(200), "with space"]) {
      writeToDisk(directory, hostile, { artifact: live.artifact, version: 1, publishedAt: null, etag: null }, live.artifactText, () => undefined);
      expect(readFromDisk(directory, hostile, () => undefined)).toBeUndefined();
    }
    // The control: nothing was written anywhere, including a legitimate-looking name.
    expect(readdirSync(directory)).toEqual([]);
  });

  it("degrades to a warning when the directory cannot be written", () => {
    const warnings: Warning[] = [];
    const live = build();
    // A path whose parent is a file, not a directory: `mkdir -p` cannot create it on any platform.
    const directory = scratch();
    const blocker = join(directory, "a-file");
    writeFileSync(blocker, "", "utf8");
    const impossible = join(blocker, "under-it");

    writeToDisk(impossible, PROMPT_ID, { artifact: live.artifact, version: 1, publishedAt: null, etag: null }, live.artifactText, (w) =>
      warnings.push(w),
    );
    expect(warnings.some((w) => w.code === "disk")).toBe(true);
  });

  it("leaves no temporary files behind", async () => {
    const directory = scratch();
    const live = build();
    const sdk = createClient({ apiKey: "41p_test_x", cacheDir: directory, fetch: serving(live), onWarning: () => undefined });
    clients.push(sdk);

    await sdk.refresh(PROMPT_ID);

    expect(readdirSync(directory)).toEqual([`${PROMPT_ID}.json`]);
  });

  it("can be turned off entirely, and then writes nothing", async () => {
    const directory = scratch();
    const live = build();
    const sdk = createClient({ apiKey: "41p_test_x", cacheDir: null, fetch: serving(live), onWarning: () => undefined });
    clients.push(sdk);

    await sdk.refresh(PROMPT_ID);
    expect(sdk.resolve(PROMPT_ID, { customer_name: "Ada" }).status).toBe("ok");
    expect(readdirSync(directory)).toEqual([]);

    // The control: the same client with a directory does write, so the empty listing above is about
    // `cacheDir: null` and not about a directory nothing was ever going to touch.
    const writing = createClient({ apiKey: "41p_test_x", cacheDir: directory, fetch: serving(live), onWarning: () => undefined });
    clients.push(writing);
    await writing.refresh(PROMPT_ID);
    expect(readdirSync(directory)).toEqual([`${PROMPT_ID}.json`]);
  });
});

describe("the install id", () => {
  it("is created once and reused", () => {
    const directory = scratch();
    const first = installId(directory);
    expect(first).toBeDefined();
    expect(installId(directory)).toBe(first);
  });

  it("is absent rather than fatal when there is nowhere to write it", () => {
    const impossible = join(scratch(), "not-a-directory");
    writeFileSync(impossible, "", "utf8");
    expect(installId(join(impossible, "under"))).toBeUndefined();
  });
});

/**
 * The cross-language check (EPIC-054 ruling 5, C9).
 *
 * `fortyone-prompts` writes the same record into the same directory, so a container running a Node
 * service and a Python worker shares one warm cache. That is worth having on its own, and the
 * reason it is a *test* is better: two writers and no shared assertion is two formats that drift,
 * and the drift is silent — each SDK would simply stop finding the other's files and keep working a
 * little colder for ever.
 *
 * Both fixtures come from `pnpm exec tsx scripts/write-cross-language-cache.mts`, each written by
 * its own language's writer. This file reads Python's and re-derives its own, so neither the
 * fixture nor the code can move without the other.
 */
describe("the cache is shared with fortyone-prompts", () => {
  const cross = join(import.meta.dirname, "..", "..", "..", "sdks", "python", "tests", "cross-language");

  it("reads a record Python wrote", () => {
    const entry = readFromDisk(cross, "written-by-python", (warning: Warning) => {
      throw new Error(`the Python record was rejected: ${warning.message}`);
    });

    expect(entry).toBeDefined();
    expect(entry?.version).toBe(6);
    expect(entry?.publishedAt).toBe("2026-09-16T14:03:07Z");
    expect(entry?.etag).toBe('"from-python"');
    // And the build inside it verified against its own content address on the way out, because
    // `readFromDisk` re-derives it rather than trusting a file it did not watch being written.
    expect(entry?.artifact.buildHash).toHaveLength(64);
  });

  it("and the record it writes itself is the one Python's suite reads", () => {
    const directory = scratch();
    const artifactText = readFileSync(
      join(import.meta.dirname, "..", "..", "core", "src", "artifact", "fixtures", "artifact-v1.json"),
      "utf-8",
    ).trimEnd();
    const artifact = JSON.parse(artifactText) as Parameters<typeof writeToDisk>[2]["artifact"];

    writeToDisk(
      directory,
      "written-by-typescript",
      { artifact, version: 6, publishedAt: "2026-09-16T14:03:07Z", etag: '"from-typescript"' },
      artifactText,
      () => undefined,
    );

    const produced = JSON.parse(readFileSync(join(directory, "written-by-typescript.json"), "utf-8")) as unknown;
    const committed = JSON.parse(readFileSync(join(cross, "written-by-typescript.json"), "utf-8")) as unknown;
    expect(produced).toEqual(committed);
  });

  it("refuses a record whose build has been altered, whoever wrote it", () => {
    // The control. Without it, the two tests above would pass against a reader that accepted
    // anything — and "the two SDKs agree" would be a claim about nothing.
    const directory = scratch();
    const altered = readFileSync(join(cross, "written-by-python.json"), "utf-8").replace(
      "at most 80 words",
      "at most 99 words",
    );
    writeFileSync(join(directory, "tampered.json"), altered, "utf8");

    const warnings: Warning[] = [];
    expect(readFromDisk(directory, "tampered", (warning) => warnings.push(warning))).toBeUndefined();
    expect(warnings.map((warning) => warning.code)).toEqual(["hash_mismatch"]);
  });
});

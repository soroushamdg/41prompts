// SPDX-FileCopyrightText: 2026 <legal entity>
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
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

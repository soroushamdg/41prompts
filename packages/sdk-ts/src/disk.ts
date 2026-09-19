// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The disk cache (EPIC-052).
 *
 * The second source in `CLAUDE.md` rule 8's order, and the one that makes a **restart** cheap: a
 * process that has been up for a week holds everything in memory, and a process that started four
 * seconds ago holds nothing. Without this, every deploy would serve its first requests from the
 * bundled artifact — or from nothing.
 *
 * ## Everything here is best effort and nothing here throws
 *
 * A read-only filesystem, a container with no writable temp directory, a full disk, a file another
 * process is halfway through writing: all of them are normal, none of them is fatal, and each one
 * degrades to a warning and an in-memory cache. `CLAUDE.md` rule 8's "never throws" is not a
 * property of the happy path.
 *
 * ## The write is atomic, and the reason is this package's own reader
 *
 * A partially written file is valid JSON often enough to be dangerous and is caught by the content
 * address the rest of the time — but the rest of the time is a warning a customer sees for no
 * reason. Writing to a temporary name in the same directory and renaming makes a reader see either
 * the old file or the new one, never half of one, on every filesystem this runs on.
 *
 * ## A prompt id is not a path
 *
 * `promptId` reaches this module from a caller's argument, and a caller's argument reaching
 * `join()` is a directory traversal. Ids are `pr_` plus eight hex (`CLAUDE.md` naming); anything
 * that is not plainly a file-safe name is refused before a path is built from it rather than
 * escaped afterwards.
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Entry } from "./entry.js";
import type { Warning } from "./types.js";
import { readArtifact } from "./verify.js";

/** Conservative on purpose: a superset of the id format, and a subset of what a filename may be. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const DEFAULT_CACHE_DIR_NAME = "41prompts-sdk";

export function defaultCacheDir(): string {
  return join(tmpdir(), DEFAULT_CACHE_DIR_NAME);
}

function fileFor(directory: string, promptId: string): string | undefined {
  if (!SAFE_ID.test(promptId)) return undefined;
  return join(directory, `${promptId}.json`);
}

/** The document written to disk. Its own version, so a future shape change is readable rather than corrupt. */
interface DiskRecord {
  readonly cacheVersion: 1;
  readonly version: number | null;
  readonly publishedAt: string | null;
  readonly etag: string | null;
  readonly artifact: string;
}

/**
 * Read one prompt's cached entry.
 *
 * The artifact is stored as the **text** it arrived as and re-verified on the way out, rather than
 * as a nested object trusted because we wrote it. A file on disk is not ours in any sense that
 * matters: another process, another version of this package, or a person with an editor can have
 * changed it, and re-deriving the content address costs microseconds.
 */
export function readFromDisk(
  directory: string,
  promptId: string,
  warn: (warning: Warning) => void,
): Entry | undefined {
  const file = fileFor(directory, promptId);
  if (file === undefined) return undefined;

  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    // Missing is the normal case on a cold start and is not worth a warning.
    return undefined;
  }

  let record: DiskRecord;
  try {
    record = JSON.parse(raw) as DiskRecord;
  } catch {
    warn({ code: "disk", message: "the cached file was not JSON; it is being ignored", promptId });
    return undefined;
  }
  if (record.cacheVersion !== 1 || typeof record.artifact !== "string") {
    warn({ code: "disk", message: "the cached file is not a shape this SDK wrote", promptId });
    return undefined;
  }

  const read = readArtifact(record.artifact);
  if (!read.ok) {
    warn({ ...read.warning, message: `the cached build was rejected: ${read.warning.message}`, promptId });
    return undefined;
  }
  return {
    artifact: read.value,
    version: typeof record.version === "number" ? record.version : null,
    publishedAt: typeof record.publishedAt === "string" ? record.publishedAt : null,
    etag: typeof record.etag === "string" ? record.etag : null,
  };
}

/** Write one prompt's entry. `artifactText` is the bytes as they arrived, not a re-serialisation. */
export function writeToDisk(
  directory: string,
  promptId: string,
  entry: Entry,
  artifactText: string,
  warn: (warning: Warning) => void,
): void {
  const file = fileFor(directory, promptId);
  if (file === undefined) return;

  const record: DiskRecord = {
    cacheVersion: 1,
    version: entry.version,
    publishedAt: entry.publishedAt,
    etag: entry.etag,
    artifact: artifactText,
  };

  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(temporary, JSON.stringify(record), "utf8");
    renameSync(temporary, file);
  } catch (error) {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // Nothing to do about a temporary file we could not remove, and it must not mask the warning.
    }
    warn({ code: "disk", message: `the cache could not be written: ${messageOf(error)}`, promptId });
  }
}

/**
 * The install id, for the telemetry header, created on first use and never derived from anything.
 *
 * A random UUID in a file a person can delete — not a hostname, not a MAC address, not an
 * environment variable, nothing that identifies a machine or an account to anybody who has not
 * already been told. When there is no writable directory there is no install id and the header goes
 * without one, which is the right failure: telemetry is the least important thing this package does.
 */
export function installId(directory: string): string | undefined {
  const file = join(directory, "install-id");
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (SAFE_ID.test(existing)) return existing;
  } catch {
    // Not there yet.
  }
  const created = randomUUID();
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(file, created, "utf8");
    return created;
  } catch {
    return undefined;
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

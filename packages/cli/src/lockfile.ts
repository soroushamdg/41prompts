// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * `41p.lock.json` — what was pulled, not what is Live (EPIC-053 ruling 2).
 *
 * ## The distinction is the whole reason the file is useful
 *
 * A lockfile that stored *the current Live version* would be a cache of a moving number, and
 * `41p check` comparing it against the same source would always pass. This records the state `pull`
 * wrote: for each prompt, the version and build hash that were Live at the moment the bindings were
 * generated. `check` asks `/v1` what is Live **now** and compares the two.
 *
 * So a stale lockfile means exactly one thing: somebody published and this repository has not pulled
 * it. That is a real answer, it exits `1`, and the fix is `41p pull`.
 *
 * ## `41p.lock.json`, and not `.41plock`
 *
 * It is JSON, a person reads it in a code review, and the extension is what makes an editor and a
 * review tool treat it as such. `.41prc` beside it has no suffix because it is dotfile-shaped by
 * convention, and it is configuration rather than a record.
 *
 * ## `generated` is the file's own hash, and it answers a different question
 *
 * The version answers *"has the prompt moved"*. `generated` answers *"has somebody hand-edited the
 * file we wrote"* — which is a thing people do, usually to fix a name, and which the next `pull`
 * silently reverts. `check` reports it separately for that reason: it is not staleness and the fix
 * is not the same.
 */

import { sha256Text } from "@41prompts/core";

export const LOCKFILE_FILENAME = "41p.lock.json";

/**
 * Bumped when this file's own shape changes in a way an older `41p` would read wrongly.
 *
 * A `41p` that meets a lockfile it was written before says so and exits `2` — "cannot answer" —
 * rather than comparing fields it does not understand and reporting a confident wrong answer. Same
 * argument as ADR-005 §3 and the SDK's `unknown_version` warning.
 */
export const LOCKFILE_VERSION = 1;

export interface LockedPrompt {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly buildHash: string;
}

export interface Lockfile {
  readonly lockfileVersion: number;
  /** Which bindings file was written, so `check` knows what to hash. */
  readonly language: "typescript" | "python";
  /** The generated file's path, relative to the lockfile. */
  readonly file: string;
  /** SHA-256 of the generated file's bytes, as `pull` wrote them. */
  readonly generated: string;
  /** Sorted by id, so two pulls of the same state produce the same bytes. */
  readonly prompts: readonly LockedPrompt[];
}

export type LockfileRead =
  | { readonly ok: true; readonly lockfile: Lockfile }
  | { readonly ok: false; readonly reason: "absent" | "malformed" | "unknown_version"; readonly detail: string };

export function readLockfile(raw: string | undefined): LockfileRead {
  if (raw === undefined) return { ok: false, reason: "absent", detail: `no ${LOCKFILE_FILENAME} here` };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: "malformed", detail: `${LOCKFILE_FILENAME} is not valid JSON` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "malformed", detail: `${LOCKFILE_FILENAME} is not an object` };
  }
  const record = parsed as Record<string, unknown>;

  if (typeof record.lockfileVersion !== "number") {
    return { ok: false, reason: "malformed", detail: `${LOCKFILE_FILENAME} has no lockfileVersion` };
  }
  if (record.lockfileVersion > LOCKFILE_VERSION) {
    return {
      ok: false,
      reason: "unknown_version",
      detail: `${LOCKFILE_FILENAME} is version ${record.lockfileVersion}; this 41p understands ${LOCKFILE_VERSION}. Upgrade 41p.`,
    };
  }
  if (!Array.isArray(record.prompts)) {
    return { ok: false, reason: "malformed", detail: `${LOCKFILE_FILENAME} has no prompts` };
  }

  const prompts: LockedPrompt[] = [];
  for (const row of record.prompts) {
    if (
      typeof row !== "object" || row === null ||
      typeof (row as Record<string, unknown>).id !== "string" ||
      typeof (row as Record<string, unknown>).version !== "number" ||
      typeof (row as Record<string, unknown>).buildHash !== "string"
    ) {
      return { ok: false, reason: "malformed", detail: `a row in ${LOCKFILE_FILENAME} is missing id, version or buildHash` };
    }
    const entry = row as Record<string, unknown>;
    prompts.push({
      id: entry.id as string,
      name: typeof entry.name === "string" ? entry.name : "",
      version: entry.version as number,
      buildHash: entry.buildHash as string,
    });
  }

  return {
    ok: true,
    lockfile: {
      lockfileVersion: record.lockfileVersion,
      language: record.language === "python" ? "python" : "typescript",
      file: typeof record.file === "string" ? record.file : "",
      generated: typeof record.generated === "string" ? record.generated : "",
      prompts,
    },
  };
}

/** The bytes `pull` writes. Sorted and two-space indented, because a person reads this in a diff. */
export function lockfileText(lockfile: Lockfile): string {
  const sorted = [...lockfile.prompts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return `${JSON.stringify({ ...lockfile, prompts: sorted }, null, 2)}\n`;
}

/** The hash `generated` holds. Core's SHA-256, the same one that addresses an artifact. */
export const hashOfGeneratedFile = (contents: string): string => sha256Text(contents);

/** One prompt's disagreement between the lockfile and what is Live now. */
export interface Staleness {
  readonly id: string;
  readonly name: string;
  readonly kind: "moved" | "unpublished" | "added" | "removed";
  readonly locked: number | null;
  readonly live: number | null;
}

/**
 * What changed since `pull`.
 *
 * Four kinds, and they are separate because a person reads them differently:
 *
 * - **moved** — the prompt is Live at a version the lockfile does not name. The ordinary case.
 * - **unpublished** — it was Live and is not now. An Undo happened, and the bindings still name a
 *   build nothing serves.
 * - **added** — a prompt exists and is Live that the lockfile has never heard of. Not an error on
 *   its own; the generated file simply has no function for it.
 * - **removed** — the lockfile names a prompt the key can no longer see. Deleted, or the key was
 *   re-scoped to another project, and the second is worth noticing.
 */
export function stalenessAgainst(
  lockfile: Lockfile,
  live: readonly { id: string; name: string; live: { version: number } | null }[],
): Staleness[] {
  const byId = new Map(live.map((row) => [row.id, row]));
  const found: Staleness[] = [];

  for (const locked of lockfile.prompts) {
    const current = byId.get(locked.id);
    if (current === undefined) {
      found.push({ id: locked.id, name: locked.name, kind: "removed", locked: locked.version, live: null });
      continue;
    }
    if (current.live === null) {
      found.push({ id: locked.id, name: current.name, kind: "unpublished", locked: locked.version, live: null });
      continue;
    }
    if (current.live.version !== locked.version) {
      found.push({ id: locked.id, name: current.name, kind: "moved", locked: locked.version, live: current.live.version });
    }
  }

  const locked = new Set(lockfile.prompts.map((row) => row.id));
  for (const row of live) {
    if (!locked.has(row.id) && row.live !== null) {
      found.push({ id: row.id, name: row.name, kind: "added", locked: null, live: row.live.version });
    }
  }

  return found;
}

/** The sentence a person reads for one disagreement. */
export function stalenessLine(entry: Staleness): string {
  const name = entry.name.length > 0 ? `${entry.name} (${entry.id})` : entry.id;
  switch (entry.kind) {
    case "moved":
      return `  ${name}: your lockfile has v${entry.locked}, Live is v${entry.live}`;
    case "unpublished":
      return `  ${name}: your lockfile has v${entry.locked}, nothing is Live now`;
    case "added":
      return `  ${name}: Live at v${entry.live}, and your generated file has no function for it`;
    case "removed":
      return `  ${name}: in your lockfile, and this key can no longer see it`;
  }
}

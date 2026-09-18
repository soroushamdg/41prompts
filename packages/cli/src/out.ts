// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Where a command's output goes, and the filesystem it reads and writes (EPIC-053).
 *
 * ## Why this exists rather than `console.log` and `node:fs` at the call sites
 *
 * A command that writes straight to the global streams is a command a test can only observe by
 * monkey-patching them — and a monkey-patch that leaks makes the *next* test fail for reasons of its
 * own, which is `docs/PROCESS.md`'s lesson 10 with a different cause.
 *
 * The same argument covers the filesystem. `41p pull` writes three files; a test that let it write
 * real ones would either need a temp directory per case or would leave the working tree dirty — and
 * *"a test suite never writes into the working tree"* is a rule here with its own history.
 *
 * So every command takes an `Env`. The real one is built once in `bin.ts`; tests build a recording
 * one. Nothing else in this package touches `process.stdout` or `node:fs`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import type { FetchLike } from "./api.js";

export interface Env {
  /** Where relative paths are resolved from. */
  readonly cwd: string;
  /** Environment variables. Read, never written. */
  readonly vars: Readonly<Record<string, string | undefined>>;
  /** True when a person is at a terminal and a question can be asked. */
  readonly interactive: boolean;
  readonly stdout: (line: string) => void;
  /** Bytes to stdout, verbatim. `exit.ts`'s `raw` explains why this is separate from `stdout`. */
  readonly write: (bytes: string) => void;
  readonly stderr: (line: string) => void;
  readonly readFile: (path: string) => string | undefined;
  readonly writeFile: (path: string, contents: string) => void;
  readonly fetch: FetchLike;
  /** Asks a question at the terminal. Only ever called when `interactive` is true. */
  readonly ask: (question: string) => Promise<string>;
}

/** The real one. Built once, in `bin.ts`, and nowhere else. */
export function nodeEnv(): Env {
  return {
    cwd: process.cwd(),
    vars: process.env,
    interactive: process.stdin.isTTY === true,
    stdout: (line) => process.stdout.write(`${line}\n`),
    write: (bytes) => process.stdout.write(bytes),
    stderr: (line) => process.stderr.write(`${line}\n`),
    readFile: (path) => {
      const full = resolvePath(process.cwd(), path);
      if (!existsSync(full)) return undefined;
      try {
        return readFileSync(full, "utf8");
      } catch {
        // Unreadable is the same answer as absent for every caller here: the file cannot be used.
        // The distinction would matter for a permissions diagnostic, which nothing here offers.
        return undefined;
      }
    },
    writeFile: (path, contents) => {
      const full = resolvePath(process.cwd(), path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, contents, "utf8");
    },
    fetch: (url, init) => globalThis.fetch(url, init),
    ask: async (question) => {
      const { createInterface } = await import("node:readline/promises");
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        return (await rl.question(question)).trim();
      } finally {
        rl.close();
      }
    },
  };
}

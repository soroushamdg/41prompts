// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The recording `Env` every test in this package runs against (EPIC-053).
 *
 * Nothing here touches the real filesystem, the real streams or the real network. `out.ts` explains
 * why that seam exists; this is the other side of it.
 *
 * **`fetch` refuses by default.** A command that reaches the network in a test that did not give it
 * a route fails on the spot with the URL it asked for, rather than hanging or silently succeeding
 * against the internet. That is what makes `decompile`'s "makes no request" assertion a real one:
 * the control is that the same stub *does* fail the other commands' tests when they are not given a
 * route, which `api.test.ts` proves.
 */

import type { FetchLike } from "./api.js";
import type { Env } from "./out.js";

export interface TestEnv extends Env {
  readonly files: Map<string, string>;
  readonly out: string[];
  /** What `write` received, concatenated. `41p run`'s exact bytes. */
  readonly written: { value: string };
  readonly err: string[];
  /** Every URL `fetch` was called with, in order. */
  readonly requested: string[];
  readonly asked: string[];
}

export interface TestEnvOptions {
  readonly files?: Record<string, string>;
  readonly vars?: Record<string, string | undefined>;
  readonly interactive?: boolean;
  readonly answers?: readonly string[];
  /** URL suffix → body. A request whose URL matches no key comes back 404. */
  readonly routes?: Record<string, { status?: number; body: string }>;
  /** Replaces the routing stub entirely, for the network-failure cases. */
  readonly fetch?: FetchLike;
}

export function testEnv(options: TestEnvOptions = {}): TestEnv {
  const files = new Map(Object.entries(options.files ?? {}));
  const out: string[] = [];
  const written = { value: "" };
  const err: string[] = [];
  const requested: string[] = [];
  const asked: string[] = [];
  const answers = [...(options.answers ?? [])];

  const routed: FetchLike = async (url) => {
    requested.push(url);
    const match = Object.entries(options.routes ?? {}).find(([suffix]) => url.endsWith(suffix));
    if (match === undefined) {
      return { ok: false, status: 404, text: async () => "" };
    }
    const [, response] = match;
    const status = response.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => response.body };
  };

  return {
    cwd: "/repo",
    vars: options.vars ?? {},
    interactive: options.interactive ?? false,
    stdout: (line) => out.push(line),
    write: (bytes) => {
      written.value += bytes;
    },
    stderr: (line) => err.push(line),
    readFile: (path) => files.get(path),
    writeFile: (path, contents) => {
      files.set(path, contents);
    },
    fetch: options.fetch ?? routed,
    ask: async (question) => {
      asked.push(question);
      return answers.shift() ?? "";
    },
    files,
    out,
    written,
    err,
    requested,
    asked,
  };
}

/** A `fetch` that fails the test if anything calls it. Used by the offline assertions. */
export const forbiddenFetch: FetchLike = (url) => {
  throw new Error(`this command must make no network request, and it asked for ${url}`);
};

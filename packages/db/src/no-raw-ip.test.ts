import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decompiles, waitlist } from "./schema";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The anonymous-capture tables store no address, and no code path writes one.
 *
 * EPIC-014's criterion is "a grep over the database schema and the logs finds no raw IP". Run
 * literally over the whole schema that grep does find one — `sessions.ip_address` — so this test
 * states the claim precisely instead:
 *
 * - **`sessions.ip_address` is Better Auth's**, created in EPIC-002, written only for a signed-in
 *   session, and outside this epic entirely: `/decompile` has no accounts (decision 9), so nothing
 *   this epic builds ever reaches that table. It is a real piece of personal data with a real
 *   justification — an authenticated person can see and delete their own sessions — and pretending it
 *   is not there would be worse than saying where it is.
 * - **The tables this epic added hold a keyed hash and nothing else.** That is what the test below
 *   enforces, and it is the claim the page's copy makes to a stranger.
 */
describe("the capture tables store no address", () => {
  it("has no column that could hold one", () => {
    for (const [name, table] of [
      ["decompiles", decompiles],
      ["waitlist", waitlist]
    ] as const) {
      const columns = Object.values(table).map((column) => (column as { name?: string }).name ?? "");
      for (const column of columns) {
        expect(column, `${name}.${column}`).not.toMatch(/^ip$|ip_address|address|remote_addr/i);
      }
    }

    // And the one column that is about the caller is named for what it holds.
    const decompileColumns = Object.values(decompiles).map((column) => (column as { name?: string }).name ?? "");
    expect(decompileColumns).toContain("ip_hash");
    expect(decompileColumns).not.toContain("ip");
  });

  it("is written by code that hashes before it stores", () => {
    // The structural guarantee: the only value reaching `ipHash` comes from `hashIdentity`. A column
    // named `ip_hash` holding a raw address would satisfy every other test in this file.
    const actions = readFileSync(join(here, "..", "..", "..", "apps", "web", "app", "decompile", "share-actions.ts"), "utf-8");
    const withoutComments = actions.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

    expect(withoutComments).toContain("hashIdentity");
    // `ipHash:` is assigned from a hash, never from `clientAddress` directly.
    expect(withoutComments).not.toMatch(/ipHash:\s*ip\b/);
    expect(withoutComments).not.toMatch(/ipHash:\s*clientAddress/);
  });

  it("never puts an address in a log line", () => {
    // The other half of the criterion. The address is bound to a local so it can be passed to
    // Turnstile as `remoteip` — which is a call to Cloudflare, not a log — and must not reach a
    // logger from there.
    const actions = readFileSync(join(here, "..", "..", "..", "apps", "web", "app", "decompile", "share-actions.ts"), "utf-8");
    const withoutComments = actions.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
    for (const line of withoutComments.split("\n")) {
      if (/\b(?:logger|console)\.\w+\(/.test(line)) {
        expect(line, "a log line mentioning the address").not.toMatch(/\bip\b(?!Hash)/);
      }
    }
  });
});

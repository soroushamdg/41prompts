// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The never-throw fuzz (EPIC-052, C5).
 *
 * `CLAUDE.md` rule 8: **the SDK never throws.** That is a promise about every caller, including the
 * JavaScript one who never saw the types, the one who passes a value read from a JSON body, and the
 * one whose object has a getter that fails. A typed test can only reach the callers TypeScript would
 * have allowed, which is the half of the population that was never the risk.
 *
 * The generated values are deliberately nasty: cyclic objects, `Object.create(null)`, proxies that
 * throw on every trap, frozen objects, huge strings, a `Symbol`-keyed object, `NaN`, `-0`, a
 * `Promise`, and a getter that throws. Each one goes through `resolve`, `createClient` and
 * `configure`, and the assertion is the same every time: **nothing was thrown, and the result is a
 * well-formed `ResolveResult`.** The second half matters as much as the first — returning `undefined`
 * would also not throw, and would break the caller one line later.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { configure, createClient, resolve } from "./client.js";
import type { Client, ResolveResult } from "./types.js";
import { build } from "./__fixtures__/artifacts.js";

const clients: Client[] = [];
afterEach(() => {
  while (clients.length > 0) clients.pop()?.close();
});

// Several cases below pass a hostile value as the *whole* options object, so they cannot also pass
// an `onWarning`, and the default handler writes to `console.warn`. Silenced so the gate log stays
// readable; `resolve.test.ts` is where that handler's behaviour is asserted.
let quiet: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  quiet = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterAll(() => {
  quiet.mockRestore();
});

/** Every value a caller could plausibly reach us with, and several they could not. */
function hostileValues(): unknown[] {
  const cyclic: Record<string, unknown> = { name: "loop" };
  cyclic["self"] = cyclic;

  const throwingGetter = {};
  Object.defineProperty(throwingGetter, "customer_name", {
    enumerable: true,
    get() {
      throw new Error("this getter is part of the test");
    },
  });

  const hostileProxy = new Proxy(
    {},
    {
      get() {
        throw new Error("every trap throws");
      },
      ownKeys() {
        throw new Error("every trap throws");
      },
      getOwnPropertyDescriptor() {
        throw new Error("every trap throws");
      },
    },
  );

  const nullPrototype = Object.create(null) as Record<string, unknown>;
  nullPrototype["customer_name"] = "Ada";

  const symbolKeyed: Record<string | symbol, unknown> = {};
  symbolKeyed[Symbol("customer_name")] = "Ada";

  return [
    undefined,
    null,
    0,
    -0,
    NaN,
    Infinity,
    "",
    " ",
    "\u0000",
    "x".repeat(100_000),
    true,
    false,
    [],
    [1, 2, 3],
    {},
    cyclic,
    throwingGetter,
    hostileProxy,
    nullPrototype,
    symbolKeyed,
    Object.freeze({ customer_name: "Ada" }),
    new Map([["customer_name", "Ada"]]),
    new Set(["Ada"]),
    new Date("nonsense"),
    /regex/g,
    Promise.resolve("Ada"),
    () => "Ada",
    Symbol("customer_name"),
    123n,
    { customer_name: { nested: { deeply: true } } },
    { __proto__: { polluted: true }, customer_name: "Ada" },
    { toString: () => { throw new Error("toString throws"); } },
  ];
}

/** Every field present and of the right type. "Did not throw" alone is not the promise. */
function expectWellFormed(result: unknown): void {
  expect(typeof result).toBe("object");
  const value = result as ResolveResult;
  expect(["ok", "unavailable"]).toContain(value.status);
  expect(typeof value.text).toBe("string");
  expect(["memory", "disk", "bundled", "none"]).toContain(value.source);
  expect(typeof value.promptId).toBe("string");
  expect(Array.isArray(value.missing)).toBe(true);
  expect(Array.isArray(value.usedDefaults)).toBe(true);
  expect(value.version === null || typeof value.version === "number").toBe(true);
  expect(value.buildHash === null || typeof value.buildHash === "string").toBe(true);
  expect(value.model === null || typeof value.model === "string").toBe(true);
}

describe("nothing in the public surface throws", () => {
  const values = hostileValues();

  it("resolve() survives every generated value in every position", () => {
    const { artifact } = build();
    const sdk = createClient({
      apiKey: "41p_test_x",
      cacheDir: null,
      bundled: [artifact],
      fetch: () => Promise.reject(new Error("offline")),
      onWarning: () => undefined,
    });
    clients.push(sdk);

    let calls = 0;
    for (const promptId of values) {
      for (const vars of values) {
        calls += 1;
        let result: unknown;
        expect(() => {
          result = (sdk.resolve as (a: unknown, b: unknown) => unknown)(promptId, vars);
        }).not.toThrow();
        expectWellFormed(result);
      }
    }
    // The control: the loop actually ran. An empty generator would pass every assertion above.
    expect(calls).toBe(values.length * values.length);
  });

  it("createClient() survives every generated value as its options", () => {
    for (const options of values) {
      let made: Client | undefined;
      expect(() => {
        made = (createClient as (o: unknown) => Client)(options);
      }).not.toThrow();
      if (made !== undefined) {
        clients.push(made);
        expect(() => made?.resolve("pr_1a2b3c4d")).not.toThrow();
        expect(() => made?.close()).not.toThrow();
      }
    }
  });

  it("createClient() survives a hostile value in every individual option", () => {
    const names = [
      "apiKey",
      "baseUrl",
      "bundled",
      "cacheDir",
      "refreshMs",
      "jitter",
      "telemetry",
      "onWarning",
      "fetch",
      "now",
    ] as const;

    for (const name of names) {
      for (const value of values) {
        let made: Client | undefined;
        expect(() => {
          made = (createClient as (o: unknown) => Client)({ [name]: value, onWarning: () => undefined });
        }).not.toThrow();
        if (made !== undefined) {
          clients.push(made);
          expectWellFormed(made.resolve("pr_1a2b3c4d", { customer_name: "Ada" }));
        }
      }
    }
  });

  it("the module-level resolve() and configure() survive the same values", () => {
    for (const value of values) {
      expect(() => (configure as (o: unknown) => void)(value)).not.toThrow();
      expect(() => expectWellFormed((resolve as (a: unknown) => unknown)(value))).not.toThrow();
    }
    // Leave nothing behind for another suite: the last `configure` above installed a live client.
    configure({ apiKey: "41p_test_x", cacheDir: null, fetch: () => Promise.reject(new Error("offline")), onWarning: () => undefined });
  });

  it("an onWarning that throws does not become the SDK throwing", () => {
    const sdk = createClient({
      apiKey: "41p_test_x",
      cacheDir: null,
      fetch: () => Promise.reject(new Error("offline")),
      onWarning: () => {
        throw new Error("the application's logger is broken");
      },
    });
    clients.push(sdk);
    expect(() => sdk.resolve("pr_1a2b3c4d")).not.toThrow();
    expect(() => sdk.close()).not.toThrow();
  });

  it("a refresh against a fetch that throws synchronously resolves rather than rejecting", async () => {
    const sdk = createClient({
      apiKey: "41p_test_x",
      cacheDir: null,
      fetch: () => {
        throw new Error("a fetch implementation that throws rather than rejecting");
      },
      onWarning: () => undefined,
    });
    clients.push(sdk);
    await expect(sdk.refresh("pr_1a2b3c4d")).resolves.toBeUndefined();
  });
});

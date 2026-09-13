import { describe, expect, it } from "vitest";
import { readPositiveInt } from "./abuse-check";

/**
 * The bounds are environment configuration so that the numbers in a public repository stop being
 * the numbers in production. These tests cover the reader, not the values: asserting the defaults
 * here would re-publish exactly what moving them to the environment was meant to stop meaning
 * anything.
 */
describe("readPositiveInt", () => {
  it("takes a positive integer from the environment", () => {
    const seen: string[] = [];
    expect(readPositiveInt("X", 10, { X: "250" }, (n) => seen.push(n))).toBe(250);
    expect(seen).toEqual([]);
  });

  it("does not treat a large valid value as misconfigured", () => {
    const seen: string[] = [];
    expect(readPositiveInt("X", 10, { X: "1000000" }, (n) => seen.push(n))).toBe(1_000_000);
    expect(seen).toEqual([]);
  });

  it.each([[{}], [{ X: "" }], [{ X: "   " }]])(
    "falls back on %j without reporting it — unset is the local and test case, not a mistake",
    (env) => {
      const seen: string[] = [];
      expect(readPositiveInt("X", 10, env, (n) => seen.push(n))).toBe(10);
      expect(seen).toEqual([]);
    }
  );

  it("accepts a value with stray whitespace, which is how a dashboard paste arrives", () => {
    const seen: string[] = [];
    expect(readPositiveInt("X", 10, { X: " 250 " }, (n) => seen.push(n))).toBe(250);
    expect(seen).toEqual([]);
  });

  it.each([["nonsense"], ["0"], ["-5"], ["3.5"], ["1e400"], ["NaN"], ["12abc"]])(
    "falls back on %s and reports it, because a silent fallback restores the published default",
    (value) => {
      const seen: string[] = [];
      expect(readPositiveInt("X", 10, { X: value }, (n) => seen.push(n))).toBe(10);
      expect(seen).toEqual(["X"]);
    }
  );
});

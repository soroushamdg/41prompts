// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { CanonicalJsonError, canonicalJson, type JsonValue } from "./canonical.js";

describe("canonicalJson", () => {
  /**
   * The defect the whole file exists for. **The two objects must be built with their keys inserted
   * in opposite orders** — writing the same literal twice would pass against `JSON.stringify` and
   * prove nothing at all.
   */
  it("gives identical bytes whatever order the keys were inserted in", () => {
    const one: Record<string, JsonValue> = {};
    one.zebra = 1;
    one.alpha = 2;
    one.middle = 3;

    const other: Record<string, JsonValue> = {};
    other.middle = 3;
    other.alpha = 2;
    other.zebra = 1;

    expect(JSON.stringify(one)).not.toBe(JSON.stringify(other)); // the control: plain stringify differs
    expect(canonicalJson(one)).toBe(canonicalJson(other));
    expect(canonicalJson(one)).toBe('{"alpha":2,"middle":3,"zebra":1}');
  });

  it("sorts at every level of nesting, not only at the root", () => {
    const nested: JsonValue = { b: { z: 1, a: { y: 2, b: 3 } }, a: [{ q: 1, p: 2 }] };
    expect(canonicalJson(nested)).toBe('{"a":[{"p":2,"q":1}],"b":{"a":{"b":3,"y":2},"z":1}}');
  });

  it("keeps array order, because order is meaning in an array", () => {
    expect(canonicalJson(["c", "a", "b"])).toBe('["c","a","b"]');
  });

  it("emits no insignificant whitespace", () => {
    expect(canonicalJson({ a: 1, b: [1, 2] })).toBe('{"a":1,"b":[1,2]}');
  });

  it("encodes the scalars the way JSON does", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(false)).toBe("false");
    expect(canonicalJson(0)).toBe("0");
    expect(canonicalJson(-0)).toBe("0");
    expect(canonicalJson(1.5)).toBe("1.5");
    expect(canonicalJson("")).toBe('""');
  });

  it("escapes strings exactly as JSON.stringify does, including control characters", () => {
    expect(canonicalJson('a"b\\c')).toBe(JSON.stringify('a"b\\c'));
    expect(canonicalJson("line\nbreak\ttab")).toBe(JSON.stringify("line\nbreak\ttab"));
    expect(canonicalJson("")).toBe(JSON.stringify(""));
    expect(canonicalJson("🙂 é €")).toBe(JSON.stringify("🙂 é €"));
  });

  it("handles an empty object and an empty array", () => {
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson([])).toBe("[]");
  });

  it("encodes the same object appearing twice, which is a shared reference and not a cycle", () => {
    const shared: JsonValue = { a: 1 };
    expect(canonicalJson({ first: shared, second: shared })).toBe('{"first":{"a":1},"second":{"a":1}}');
  });

  describe("refuses what JSON.stringify would silently alter", () => {
    /** Each of these is a value quietly becoming a different value on the way into a hash. */
    const cases: readonly (readonly [string, unknown, string])[] = [
      ["undefined in a property", { a: undefined }, "a"],
      ["undefined in an array", [1, undefined], "[1]"],
      ["NaN", { cost: Number.NaN }, "cost"],
      ["Infinity", { cost: Number.POSITIVE_INFINITY }, "cost"],
      ["a function", { fn: () => 1 }, "fn"],
      ["a symbol", { s: Symbol("x") }, "s"],
      ["a bigint", { n: 1n }, "n"],
      ["a Date, whose toJSON would pick a format silently", { at: new Date(0) }, "at"],
      ["a Map, which stringifies to {}", { m: new Map([["a", 1]]) }, "m"],
    ];

    it.each(cases)("refuses %s, naming the path", (_name, value, path) => {
      expect(() => canonicalJson(value as JsonValue)).toThrow(CanonicalJsonError);
      try {
        canonicalJson(value as JsonValue);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as CanonicalJsonError).path).toBe(path);
      }
    });

    it("refuses a cycle rather than overflowing the stack", () => {
      const cyclic: Record<string, unknown> = { a: 1 };
      cyclic.self = cyclic;
      expect(() => canonicalJson(cyclic as JsonValue)).toThrow(/contains a cycle/);
    });

    it("names the root when the root itself is the problem", () => {
      try {
        canonicalJson(undefined as unknown as JsonValue);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as CanonicalJsonError).path).toBe("");
        expect((error as Error).message).toContain("the root value");
      }
    });

    it("names a deep path rather than only the field", () => {
      try {
        canonicalJson({ variables: [{ name: "a" }, { name: "b", defaultValue: undefined }] } as JsonValue);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as CanonicalJsonError).path).toBe("variables[1].defaultValue");
      }
    });
  });
});

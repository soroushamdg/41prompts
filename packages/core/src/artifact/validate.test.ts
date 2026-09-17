// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { UnsupportedKeywordError, validate, type JsonSchema } from "./validate.js";

describe("the subset validator", () => {
  /**
   * The property that makes a subset validator honest. An ignoring validator's failure mode is that
   * a schema grows a constraint, the validator skips it, and every fixture keeps passing — the
   * `PARTIAL`-read-as-pass failure `docs/PROCESS.md` is full of, one level down.
   */
  it("refuses a keyword it does not implement, rather than ignoring it", () => {
    expect(() => validate({ type: "object", minProperties: 1 }, {})).toThrow(UnsupportedKeywordError);
    expect(() => validate({ type: "object", minProperties: 1 }, {})).toThrow(/minProperties/);
  });

  it("refuses an unimplemented keyword nested inside properties or items", () => {
    expect(() => validate({ type: "object", properties: { a: { oneOf: [] } } }, { a: 1 })).toThrow(
      UnsupportedKeywordError,
    );
    expect(() => validate({ type: "array", items: { $ref: "#/x" } }, [])).toThrow(UnsupportedKeywordError);
  });

  it("refuses before looking at the value, so a schema it cannot check never returns clean", () => {
    // The value is wildly wrong, and the keyword error is what comes back — not an empty list.
    expect(() => validate({ type: "string", contentEncoding: "base64" }, { not: "a string" })).toThrow(
      UnsupportedKeywordError,
    );
  });

  it("allows annotations, which carry no constraint", () => {
    expect(validate({ $schema: "x", $id: "y", title: "t", description: "d", type: "string" }, "ok")).toEqual([]);
  });

  describe("types", () => {
    const cases: readonly (readonly [string, unknown, boolean])[] = [
      ["string", "a", true],
      ["string", 1, false],
      ["number", 1.5, true],
      ["number", 2, true], // an integer is a number
      ["integer", 2, true],
      ["integer", 1.5, false],
      ["boolean", true, true],
      ["null", null, true],
      ["null", 0, false],
      ["array", [], true],
      ["array", {}, false],
      ["object", {}, true],
      ["object", [], false],
      ["object", null, false],
    ];

    it.each(cases)("type %s against %j is %s", (type, value, ok) => {
      expect(validate({ type }, value).length === 0).toBe(ok);
    });

    it("accepts a union of types", () => {
      expect(validate({ type: ["string", "null"] }, null)).toEqual([]);
      expect(validate({ type: ["string", "null"] }, 1)).toHaveLength(1);
    });

    it("stops at a wrong type rather than reporting six consequences of one mistake", () => {
      expect(validate({ type: "string", minLength: 5, pattern: "^a" }, 1)).toHaveLength(1);
    });

    it("refuses a type name that is not a JSON type", () => {
      expect(() => validate({ type: "date" }, "x")).toThrow(UnsupportedKeywordError);
    });
  });

  describe("objects", () => {
    const schema: JsonSchema = {
      type: "object",
      additionalProperties: false,
      required: ["a", "b"],
      properties: { a: { type: "string" }, b: { type: "integer" } },
    };

    it("accepts a document that fits", () => {
      expect(validate(schema, { a: "x", b: 1 })).toEqual([]);
    });

    it("names a missing required field by path", () => {
      expect(validate(schema, { a: "x" })).toEqual([{ path: "b", message: "required, and missing" }]);
    });

    it("rejects an extra property when additionalProperties is false", () => {
      expect(validate(schema, { a: "x", b: 1, c: true })).toEqual([
        { path: "c", message: "not allowed by the schema" },
      ]);
    });

    it("checks an extra property against a schema when one is given", () => {
      const open: JsonSchema = { type: "object", additionalProperties: { type: "number" } };
      expect(validate(open, { any: 1 })).toEqual([]);
      expect(validate(open, { any: "no" })).toHaveLength(1);
    });

    it("reports a nested path rather than only the field", () => {
      const nested: JsonSchema = {
        type: "object",
        properties: { list: { type: "array", items: { type: "object", properties: { n: { type: "integer" } } } } },
      };
      expect(validate(nested, { list: [{ n: 1 }, { n: "no" }] })[0]?.path).toBe("list[1].n");
    });
  });

  describe("the remaining assertions", () => {
    it("enum", () => {
      expect(validate({ enum: ["a", "b", null] }, null)).toEqual([]);
      expect(validate({ enum: ["a", "b"] }, "c")).toHaveLength(1);
    });

    it("const", () => {
      expect(validate({ const: 1 }, 1)).toEqual([]);
      expect(validate({ const: 1 }, 2)).toHaveLength(1);
    });

    it("minimum", () => {
      expect(validate({ type: "integer", minimum: 1 }, 1)).toEqual([]);
      expect(validate({ type: "integer", minimum: 1 }, 0)).toHaveLength(1);
    });

    it("minLength", () => {
      expect(validate({ type: "string", minLength: 1 }, "")).toHaveLength(1);
    });

    it("minItems", () => {
      expect(validate({ type: "array", minItems: 1 }, [])).toHaveLength(1);
    });

    it("pattern, with unicode semantics so an astral character is one character", () => {
      expect(validate({ type: "string", pattern: "^pr_[0-9a-f]{8}$" }, "pr_0000beef")).toEqual([]);
      expect(validate({ type: "string", pattern: "^pr_[0-9a-f]{8}$" }, "pr_nothex1")).toHaveLength(1);
      expect(validate({ type: "string", pattern: "^.$" }, "🚀")).toEqual([]);
    });
  });
});

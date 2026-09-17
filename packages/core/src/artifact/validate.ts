// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * A deliberately small JSON Schema validator, so that the two documents this package publishes are
 * **checked** rather than decorative.
 *
 * ## Why this exists rather than a dependency
 *
 * `packages/core` is zero-dependency (`CLAUDE.md`), so Ajv is not available. The alternative was to
 * export the two schema documents and never run them against anything — and a schema nothing
 * validates is a comment with punctuation. It drifts from the code the first time somebody adds a
 * field, and the first person to find out is whoever wrote a reader in another language from it.
 *
 * ## What makes it safe to be small
 *
 * **It refuses a keyword it does not implement.** That is the single property that makes a subset
 * validator honest: the failure mode of an ignoring validator is that a schema grows a constraint,
 * the validator silently skips it, and every fixture keeps passing — the `PARTIAL`-read-as-pass
 * failure `docs/PROCESS.md` is full of, one level down. Here, adding `minProperties` to a schema
 * throws `UnsupportedKeywordError` on the next run and somebody implements it or removes it.
 *
 * ## What it is not
 *
 * Not a general-purpose validator, and not hardened against a hostile schema: `pattern` is compiled
 * with `RegExp` and a catastrophic pattern would hang. The schemas it is given are the two literals
 * in `json-schema.ts`. `check/pattern-safety.ts` is the module for patterns a user wrote.
 */

/** A JSON Schema document, as far as this module is concerned. */
export type JsonSchema = { readonly [keyword: string]: unknown };

/** One place a value disagrees with the schema. */
export interface SchemaViolation {
  /** Dotted path from the root, e.g. `variables[0].name`. `""` is the root value itself. */
  readonly path: string;
  readonly message: string;
}

/** Thrown when a schema uses a keyword this validator does not implement. Never for a bad value. */
export class UnsupportedKeywordError extends Error {
  readonly keyword: string;

  constructor(keyword: string, where: string) {
    super(
      `JSON Schema keyword ${JSON.stringify(keyword)} at ${where === "" ? "the root schema" : where} is not implemented by this validator. Implement it or remove it — silently ignoring it would let a constraint pass unchecked.`,
    );
    this.name = "UnsupportedKeywordError";
    this.keyword = keyword;
  }
}

/** Annotations carry no constraint, so skipping them is not the same as ignoring a keyword. */
const ANNOTATIONS = new Set(["$schema", "$id", "$comment", "title", "description"]);

const ASSERTIONS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "minimum",
  "minLength",
  "minItems",
  "pattern",
]);

const TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  // `integer` is reported for whole numbers so that a `type: "integer"` message reads correctly;
  // `matchesType` accepts an integer wherever `number` is asked for.
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

const matchesType = (actual: string, expected: string): boolean =>
  actual === expected || (expected === "number" && actual === "integer");

/** Recursively refuse any keyword this validator does not implement. Runs before any value is seen. */
function assertKeywords(schema: JsonSchema, where: string): void {
  for (const keyword of Object.keys(schema)) {
    if (ANNOTATIONS.has(keyword)) continue;
    if (!ASSERTIONS.has(keyword)) throw new UnsupportedKeywordError(keyword, where);
  }
  const properties = schema.properties;
  if (properties !== undefined) {
    for (const [name, sub] of Object.entries(properties as Record<string, JsonSchema>)) {
      assertKeywords(sub, `${where}.properties.${name}`);
    }
  }
  if (typeof schema.additionalProperties === "object" && schema.additionalProperties !== null) {
    assertKeywords(schema.additionalProperties as JsonSchema, `${where}.additionalProperties`);
  }
  if (schema.items !== undefined) assertKeywords(schema.items as JsonSchema, `${where}.items`);
}

function check(schema: JsonSchema, value: unknown, path: string, out: SchemaViolation[]): void {
  const actual = typeOf(value);

  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    for (const one of expected) {
      if (!TYPES.has(one)) throw new UnsupportedKeywordError(`type: ${one}`, path);
    }
    if (!expected.some((one) => matchesType(actual, one))) {
      out.push({ path, message: `expected ${expected.join(" or ")}, got ${actual}` });
      // A wrong type makes every other constraint here meaningless, and reporting six consequences
      // of one mistake is how a validator's output stops being readable.
      return;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    out.push({ path, message: `expected the constant ${JSON.stringify(schema.const)}` });
  }

  if (schema.enum !== undefined) {
    const allowed = schema.enum as readonly unknown[];
    if (!allowed.includes(value)) {
      out.push({ path, message: `${JSON.stringify(value)} is not one of ${JSON.stringify(allowed)}` });
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      out.push({ path, message: `shorter than ${schema.minLength} characters` });
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      out.push({ path, message: `${JSON.stringify(value)} does not match ${schema.pattern}` });
    }
  }

  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) {
    out.push({ path, message: `less than the minimum ${schema.minimum}` });
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      out.push({ path, message: `fewer than ${schema.minItems} items` });
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => check(schema.items as JsonSchema, item, `${path}[${index}]`, out));
    }
  }

  if (actual === "object") {
    const object = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;

    for (const name of (schema.required ?? []) as readonly string[]) {
      if (!Object.prototype.hasOwnProperty.call(object, name)) {
        out.push({ path: path === "" ? name : `${path}.${name}`, message: "required, and missing" });
      }
    }

    for (const [name, raw] of Object.entries(object)) {
      const at = path === "" ? name : `${path}.${name}`;
      const sub = properties[name];
      if (sub !== undefined) {
        check(sub, raw, at, out);
      } else if (schema.additionalProperties === false) {
        out.push({ path: at, message: "not allowed by the schema" });
      } else if (typeof schema.additionalProperties === "object" && schema.additionalProperties !== null) {
        check(schema.additionalProperties as JsonSchema, raw, at, out);
      }
    }
  }
}

/**
 * Every way `value` disagrees with `schema`. Empty means it validates.
 *
 * @throws {UnsupportedKeywordError} if the schema uses a keyword this validator does not implement.
 * Always before any value is looked at, so a schema this cannot check never returns a clean result.
 */
export function validate(schema: JsonSchema, value: unknown): SchemaViolation[] {
  assertKeywords(schema, "");
  const out: SchemaViolation[] = [];
  check(schema, value, "", out);
  return out;
}

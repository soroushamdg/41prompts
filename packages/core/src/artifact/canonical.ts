// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * One value, one sequence of bytes. The encoding the build artifact is addressed by.
 *
 * ## The defect this closes
 *
 * `artifact/schema.ts` v0 hashed `JSON.stringify(body)`, and its own header named the problem as
 * EPIC-050's first job: *"JSON key order is not canonical, so two equal artifacts can hash
 * differently."* `JSON.stringify` emits object keys in **insertion order**, so the same artifact
 * assembled from a database row and from a form post could produce two different hashes — and a
 * content-addressed format where equal content has two addresses is not content-addressed. The
 * failure is silent: both artifacts are valid, both serve, and the cache, the R2 key and the SDK's
 * verification all quietly disagree about which one is which.
 *
 * ## The rules, all of them
 *
 * 1. **Object keys are sorted**, ascending, by UTF-16 code unit — plain `<` on JavaScript strings.
 *    This is RFC 8785's rule, and every key in this format is ASCII, where code-unit order and code
 *    point order agree. Duplicate keys cannot occur: the input is a JavaScript object.
 * 2. **Array order is preserved.** Order is meaning in an array; sorting one would be a different
 *    document.
 * 3. **No insignificant whitespace.** `{"a":1}`, never `{ "a": 1 }`.
 * 4. **Strings are escaped by `JSON.stringify`**, which ECMA-262 specifies exactly (QuoteJSONString,
 *    and well-formed output for lone surrogates since ES2019). Re-implementing it would be a second
 *    copy of a specification that is already in every engine.
 * 5. **Numbers are serialised by `JSON.stringify`**, which is ECMAScript's `Number::toString` and is
 *    equally exact. `-0` becomes `0`, as it does everywhere.
 * 6. **Bytes are UTF-8**, produced by `utf8Bytes` at the point of hashing.
 *
 * ## What it refuses, and why refusing is the point
 *
 * `JSON.stringify` silently drops an `undefined` property, turns `undefined` in an array into
 * `null`, turns `NaN` and `Infinity` into `null`, and calls `toJSON` on anything that has one. Each
 * of those is a value quietly becoming a different value on the way into a hash that something else
 * will later verify. So `canonicalJson` throws instead, naming the path, and the caller finds out at
 * the moment the artifact is assembled rather than when a customer's SDK rejects it.
 */

/** What this encoder accepts. Anything else is a `CanonicalJsonError`. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * A value that cannot be encoded canonically, with the path to it.
 *
 * A named class rather than a bare `Error` because `@41prompts/sdk` never throws (`CLAUDE.md`
 * rule 8) and has to be able to tell this apart from a programming mistake it should let through.
 */
export class CanonicalJsonError extends Error {
  /** Dotted path from the root, e.g. `variables[2].defaultValue`. `""` for the root itself. */
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`cannot canonically encode ${path === "" ? "the root value" : path}: ${reason}`);
    this.name = "CanonicalJsonError";
    this.path = path;
  }
}

/**
 * A plain object, by **prototype** rather than by `typeof`.
 *
 * `typeof x === "object"` is true of a `Map`, a `Set`, a `RegExp` and every class instance, and
 * `Object.keys` of all four is `[]` — so the loose test encoded a `Map` holding data as `{}`, which
 * is the silent-substitution failure this whole module exists to prevent, arriving through the one
 * door it had left open. Found by the test, not by reading the code.
 *
 * `null` prototype is accepted because `Object.create(null)` is a dictionary and behaves as one.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function encode(value: unknown, path: string, seen: Set<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      // `Number.isFinite` rather than `!isNaN`: `Infinity` is the other value `JSON.stringify`
      // turns into `null`, and a length or a cost that arrived as `Infinity` becoming `null` in a
      // published artifact is exactly the silent substitution this function exists to stop.
      if (!Number.isFinite(value)) throw new CanonicalJsonError(path, `${String(value)} has no JSON form`);
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "undefined":
      throw new CanonicalJsonError(path, "undefined is dropped by JSON.stringify rather than encoded");
    case "bigint":
      throw new CanonicalJsonError(path, "a bigint has no JSON form");
    case "function":
      throw new CanonicalJsonError(path, "a function is dropped by JSON.stringify rather than encoded");
    case "symbol":
      throw new CanonicalJsonError(path, "a symbol is dropped by JSON.stringify rather than encoded");
    default:
      break;
  }

  // A cycle is the one input that makes this function not terminate, so it is checked before the
  // recursion rather than caught as a stack overflow afterwards.
  const asObject = value as object;
  if (seen.has(asObject)) throw new CanonicalJsonError(path, "the value contains a cycle");
  seen.add(asObject);

  let out: string;
  if (Array.isArray(value)) {
    out = `[${value.map((item, index) => encode(item, `${path}[${index}]`, seen)).join(",")}]`;
  } else if (isPlainObject(value)) {
    // `toJSON` would run inside `JSON.stringify` and hand back a value nobody here has seen.
    // Dates are the common case and the reason this is caught by name: a `Date` in an artifact is a
    // timestamp somebody meant to format, and formatting it here would pick the format silently.
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
      throw new CanonicalJsonError(path, "the value defines toJSON, so what would be encoded is not this value");
    }
    const keys = Object.keys(value).sort();
    out = `{${keys
      .map((key) => `${JSON.stringify(key)}:${encode(value[key], path === "" ? key : `${path}.${key}`, seen)}`)
      .join(",")}}`;
  } else {
    throw new CanonicalJsonError(path, `${Object.prototype.toString.call(value)} has no JSON form`);
  }

  // Removed on the way out, so that the *same* object appearing twice side by side — which is a
  // shared reference, not a cycle — encodes rather than being refused.
  seen.delete(asObject);
  return out;
}

/**
 * The canonical JSON text of a value.
 *
 * Deterministic: two structurally equal values produce identical strings whatever order their keys
 * were inserted in, at every depth.
 *
 * @throws {CanonicalJsonError} when the value contains anything `JSON.stringify` would silently
 * alter or drop — `undefined`, a function, a symbol, a bigint, `NaN`, `Infinity`, a `toJSON`
 * method, a cycle, or a host object.
 */
export function canonicalJson(value: JsonValue): string {
  return encode(value, "", new Set());
}

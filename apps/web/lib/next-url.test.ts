/**
 * The fallback assertions name `DEFAULT_NEXT_PATH`, not a path.
 *
 * They used to say `"/app"` — what the code did, rather than what a user needs — so when `/app`
 * turned out to be a dead end, nothing here could notice. What these tests are actually about is
 * that a hostile `next` falls back to *the default*, whatever it is. Where sign-in lands is a
 * product decision; it should not require editing a security test.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT_PATH, safeNextPath } from "./next-url.js";

describe("safeNextPath", () => {
  it("accepts a plain relative path", () => {
    expect(safeNextPath("/app/projects")).toBe("/app/projects");
  });

  it("accepts a relative path with a query string", () => {
    expect(safeNextPath("/app/account?x=1")).toBe("/app/account?x=1");
  });

  it("rejects an absolute URL", () => {
    expect(safeNextPath("https://evil.example")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeNextPath("//evil.example")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects a backslash variant of a protocol-relative URL", () => {
    expect(safeNextPath("/\\evil.example")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects a tab-prefixed scheme bypass", () => {
    expect(safeNextPath("\t/evil.example")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/\t/evil.example")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects a javascript: URL", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe(DEFAULT_NEXT_PATH);
  });

  it("rejects null, undefined, and empty string", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath(undefined)).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("")).toBe(DEFAULT_NEXT_PATH);
  });

  it("uses a custom fallback when given one", () => {
    expect(safeNextPath("//evil.example", "/sign-in")).toBe("/sign-in");
  });

  it("accepts a same-origin path containing a literal @ or percent-encoded slash", () => {
    expect(safeNextPath("/@evil.example")).toBe("/@evil.example");
    expect(safeNextPath("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
  });
});

import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-url.js";

describe("safeNextPath", () => {
  it("accepts a plain relative path", () => {
    expect(safeNextPath("/app")).toBe("/app");
  });

  it("accepts a relative path with a query string", () => {
    expect(safeNextPath("/app/account?x=1")).toBe("/app/account?x=1");
  });

  it("rejects an absolute URL", () => {
    expect(safeNextPath("https://evil.example")).toBe("/app");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeNextPath("//evil.example")).toBe("/app");
  });

  it("rejects a backslash variant of a protocol-relative URL", () => {
    expect(safeNextPath("/\\evil.example")).toBe("/app");
  });

  it("rejects a tab-prefixed scheme bypass", () => {
    expect(safeNextPath("\t/evil.example")).toBe("/app");
    expect(safeNextPath("/\t/evil.example")).toBe("/app");
  });

  it("rejects a javascript: URL", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe("/app");
  });

  it("rejects null, undefined, and empty string", () => {
    expect(safeNextPath(null)).toBe("/app");
    expect(safeNextPath(undefined)).toBe("/app");
    expect(safeNextPath("")).toBe("/app");
  });

  it("uses a custom fallback when given one", () => {
    expect(safeNextPath("//evil.example", "/sign-in")).toBe("/sign-in");
  });

  it("accepts a same-origin path containing a literal @ or percent-encoded slash", () => {
    expect(safeNextPath("/@evil.example")).toBe("/@evil.example");
    expect(safeNextPath("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
  });
});

import { describe, expect, it } from "vitest";
import { visiblePath } from "./use-visible-path";

describe("visiblePath", () => {
  it("strips the internal tree prefix and keeps visible paths as they are", () => {
    expect(visiblePath("/app")).toBe("/");
    expect(visiblePath("/app/settings")).toBe("/settings");
    expect(visiblePath("/site")).toBe("/");
    expect(visiblePath("/settings")).toBe("/settings");
    expect(visiblePath("/application")).toBe("/application");
    expect(visiblePath(null)).toBe("/");
  });
});

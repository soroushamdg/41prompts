import { describe, expect, it } from "vitest";
import { nameFromText, nextFreeSlug, slugify } from "./slug";
import { relativeTime, versionTime } from "./time";
import { findVariables, splitVariables } from "./variables";

describe("slugify", () => {
  it("makes names like the mockup's", () => {
    expect(slugify("Support Reply")).toBe("support-reply");
    expect(slugify("  Café — résumé!! v2 ")).toBe("cafe-resume-v2");
    expect(slugify("---")).toBe("untitled-prompt");
    expect(slugify("a".repeat(80))).toHaveLength(60);
  });
  it("names a paste from its first words", () => {
    expect(nameFromText("You are the order assistant for Northwind.")).toBe("you-are-the-order");
    expect(nameFromText("{{x}}  \n\n# ")).toBe("untitled-prompt");
  });
  it("finds the next free variant", () => {
    expect(nextFreeSlug("a", new Set())).toBe("a");
    expect(nextFreeSlug("a", new Set(["a", "a-2"]))).toBe("a-3");
  });
});

describe("variables", () => {
  it("detects distinct names, tolerating spaces inside braces", () => {
    expect(findVariables("Hi {{ name }}, order {{order_id}}", "{{name}} again")).toEqual(["name", "order_id"]);
    expect(findVariables("{{not valid}} {{}}")).toEqual([]);
  });
  it("splits text into runs and variables", () => {
    expect(splitVariables("Greet {{customer_name}}.")).toEqual([{ text: "Greet " }, { text: "{{customer_name}}", variable: "customer_name" }, { text: "." }]);
  });
});

describe("relative times", () => {
  const now = new Date(2026, 9, 9, 15, 0);
  it("reads like the mockup", () => {
    expect(relativeTime(new Date(2026, 9, 9, 14, 59, 40), now)).toBe("Just now");
    expect(relativeTime(new Date(2026, 9, 9, 14, 58), now)).toBe("2 min ago");
    expect(relativeTime(new Date(2026, 9, 9, 11, 0), now)).toBe("4 h ago");
    expect(relativeTime(new Date(2026, 9, 8, 22, 0), now)).toBe("Yesterday");
    expect(relativeTime(new Date(2026, 9, 6, 9, 0), now)).toBe("Oct 6");
    expect(relativeTime(new Date(2025, 8, 28), now)).toBe("Sep 28, 2025");
    expect(versionTime(new Date(2026, 9, 9, 9, 14), now)).toBe("Today, 09:14");
    expect(versionTime(new Date(2026, 9, 8, 18, 2), now)).toBe("Yesterday, 18:02");
  });
});

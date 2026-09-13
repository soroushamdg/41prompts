import { describe, expect, it } from "vitest";
import { hasPreviewableDefaults, previewText } from "./preview";
import type { VariableDeclaration } from "@41prompts/core";

const declare = (name: string, defaultValue: string | null): VariableDeclaration => ({
  name,
  defaultValue,
  description: null,
});

describe("previewText", () => {
  it("renders a default in place of its variable", () => {
    expect(previewText("Hello {{customer}}.", [declare("customer", "Ada")])).toBe("Hello Ada.");
  });

  it("renders every occurrence, including ones written with inner spaces", () => {
    expect(previewText("{{ a }} and {{a}}", [declare("a", "x")])).toBe("x and x");
  });

  it("leaves a required variable visible, because that is what the prompt will contain", () => {
    expect(previewText("Hello {{customer}}.", [declare("customer", null)])).toBe("Hello {{customer}}.");
  });

  it("renders an empty default as empty, which is a real answer and not a missing one", () => {
    expect(previewText("Notes: {{extra}}|", [declare("extra", "")])).toBe("Notes: |");
  });

  it("is correct when a default is longer than the placeholder it replaces", () => {
    expect(previewText("{{a}} {{a}} {{a}}", [declare("a", "a considerably longer value")])).toBe(
      "a considerably longer value a considerably longer value a considerably longer value"
    );
  });

  it("leaves an undeclared variable alone", () => {
    expect(previewText("{{a}} {{b}}", [declare("a", "1")])).toBe("1 {{b}}");
  });

  it("returns the text unchanged when nothing has a default", () => {
    const text = "Hello {{customer}}.";
    expect(previewText(text, [declare("customer", null)])).toBe(text);
    expect(previewText(text, [])).toBe(text);
  });

  it("does not mutate or re-wrap a value that itself looks like a variable", () => {
    // A default of "{{b}}" is substituted once and not chased — otherwise a pair of variables
    // defaulting to each other would not terminate.
    expect(previewText("{{a}}", [declare("a", "{{b}}"), declare("b", "z")])).toBe("{{b}}");
  });
});

describe("hasPreviewableDefaults", () => {
  it("is false when the preview would be a copy of the compiled text", () => {
    expect(hasPreviewableDefaults("Hello {{customer}}.", [declare("customer", null)])).toBe(false);
    expect(hasPreviewableDefaults("No variables here.", [declare("a", "x")])).toBe(false);
  });

  it("is true when at least one default would appear", () => {
    expect(hasPreviewableDefaults("Hello {{customer}}.", [declare("customer", "Ada")])).toBe(true);
  });
});

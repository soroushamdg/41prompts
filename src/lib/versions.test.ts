import { describe, expect, it } from "vitest";
import type { Blok } from "./bloks";
import { describeBloks, describeChange, maxBlokNumber } from "./versions";

const b = (id: string, type: Blok["type"], text: string): Blok => ({ id, type, text });
const base = [b("B1", "context", "You are a support agent."), b("B2", "constraint", "Reply in under 80 words."), b("B3", "example", "Customer: hi")];

describe("describeChange", () => {
  it("names edits, adds, deletes and reorders", () => {
    expect(describeChange(base, base)).toBe("No changes");
    expect(describeChange(base, [base[0]!, b("B2", "constraint", "Reply in under 60 words."), base[2]!])).toBe("Edited B2");
    expect(describeChange(base, [...base, b("B4", "expects", "")])).toBe("Added B4");
    expect(describeChange(base, [base[0]!, base[2]!])).toBe("Deleted B2");
    expect(describeChange(base, [base[1]!, base[0]!, base[2]!])).toBe("Reordered bloks");
  });

  it("recognises a duplicate, a split and a type change", () => {
    expect(describeChange(base, [base[0]!, base[1]!, b("B4", "constraint", "Reply in under 80 words."), base[2]!])).toBe("Duplicated B2");
    const pasted = [b("B1", "context", "You are a support agent.\n\nReply in under 80 words.")];
    expect(describeChange(pasted, [b("B1", "context", "You are a support agent."), b("B2", "context", "Reply in under 80 words.")])).toBe("Split B1");
    expect(describeChange(base, [base[0]!, b("B2", "expects", base[1]!.text), base[2]!])).toBe("Changed B2 to expects");
  });

  it("combines several changes and caps the note", () => {
    expect(describeChange(base, [b("B1", "context", "x"), base[1]!, b("B4", "context", "new")])).toBe("Added B4 · Deleted B3 · Edited B1");
    const many = describeChange(base, [b("B1", "expects", "x"), b("B4", "context", "n")]);
    expect(many).toMatch(/· and \d more$/);
  });
});

describe("describeBloks and IDs", () => {
  it("takes the first line of the first non-empty blok", () => {
    expect(describeBloks([b("B1", "context", "  "), b("B2", "context", "Answers order questions\nmore")])).toBe("Answers order questions");
    expect(describeBloks([])).toBe("");
  });
  it("finds the highest blok number", () => {
    expect(maxBlokNumber([b("B2", "context", ""), b("B11", "context", "")])).toBe(11);
  });
});

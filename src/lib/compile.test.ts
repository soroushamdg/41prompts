import { describe, expect, it } from "vitest";
import type { Blok } from "./bloks";
import { compile, countLabel, toJson, toMarkdown } from "./compile";

const bloks: Blok[] = [
  { id: "B1", type: "context", text: "You are a support agent for Northwind Outfitters." },
  { id: "B2", type: "constraint", text: "Reply in under 80 words. Greet the customer as {{customer_name}}." },
  { id: "B3", type: "example", text: "Customer: My boots arrived in the wrong size.\n\n\n\nAgent: Sorry about that, Sam.  " },
  { id: "B4", type: "expects", text: "Never promises a refund." },
  { id: "B5", type: "context", text: "   " },
];

describe("compile", () => {
  it("joins non-expects bloks with a blank line and never includes expects", () => {
    const c = compile(bloks);
    expect(c.text).toBe(
      "You are a support agent for Northwind Outfitters.\n\nReply in under 80 words. Greet the customer as {{customer_name}}.\n\nCustomer: My boots arrived in the wrong size.\n\nAgent: Sorry about that, Sam.",
    );
    expect(c.text).not.toContain("refund");
    expect(c.segments.map((s) => s.id)).toEqual(["B1", "B2", "B3"]);
    expect(c.variables).toEqual(["customer_name"]);
    expect(c.tokens).toBe(Math.round(c.chars / 4));
  });

  it("fills variables that have a value and keeps the rest as template", () => {
    const filled = compile(bloks, "filled", { customer_name: "Sam" });
    expect(filled.text).toContain("Greet the customer as Sam.");
    expect(filled.segments[1]!.parts).toContainEqual({ text: "Sam", variable: "customer_name", filled: true });
    expect(compile(bloks, "filled", { customer_name: "  " }).text).toContain("{{customer_name}}");
  });

  it("copies as Markdown and JSON exactly like the mockup", () => {
    expect(toMarkdown("support-reply", bloks.slice(0, 2))).toBe(
      "# support-reply\n\n## Context (B1)\n\nYou are a support agent for Northwind Outfitters.\n\n## Constraint (B2)\n\nReply in under 80 words. Greet the customer as {{customer_name}}.",
    );
    expect(JSON.parse(toJson("support-reply", 7, bloks.slice(3, 4)))).toEqual({ name: "support-reply", version: 7, bloks: [{ id: "B4", type: "expects", text: "Never promises a refund." }] });
    expect(countLabel({ tokens: 1234, chars: 4936 })).toBe("≈ 1,234 tokens · 4,936 chars");
  });
});

// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { bindVariables, serialiseRow } from "./bind.js";
import type { VariableDeclaration } from "../variables/types.js";

const required = (name: string): VariableDeclaration => ({ name, defaultValue: null, description: null });
const optional = (name: string, value: string): VariableDeclaration => ({
  name,
  defaultValue: value,
  description: null
});

function bound(text: string, values: Record<string, string>, declarations: VariableDeclaration[] = []) {
  const result = bindVariables(text, new Map(Object.entries(values)), declarations);
  if (!result.ok) throw new Error(`expected a binding, missing ${result.missing.join(", ")}`);
  return result;
}

describe("bindVariables", () => {
  it("substitutes a row into the compiled text", () => {
    expect(bound("Reply to {{customer}} about {{order}}.", { customer: "Ada", order: "A-1" }).text).toBe(
      "Reply to Ada about A-1."
    );
  });

  it("substitutes every occurrence of the same name", () => {
    expect(bound("{{a}} then {{a}} then {{a}}", { a: "x" }).text).toBe("x then x then x");
  });

  it("keeps the whitespace form the author wrote", () => {
    expect(bound("Hello {{ customer }}.", { customer: "Ada" }).text).toBe("Hello Ada.");
  });

  it("refuses a required name the row does not supply, rather than emptying it", () => {
    const result = bindVariables("Hello {{customer}}.", new Map(), [required("customer")]);
    expect(result).toEqual({ ok: false, missing: ["customer"] });
  });

  it("names every missing required variable once, in the order they appear", () => {
    const result = bindVariables("{{b}} {{a}} {{b}}", new Map(), [required("a"), required("b")]);
    expect(result).toEqual({ ok: false, missing: ["b", "a"] });
  });

  it("falls back to a declared default and says which names used one", () => {
    const result = bound("Hi {{customer}}{{extra}}", { customer: "Ada" }, [optional("extra", " — thanks")]);
    expect(result.text).toBe("Hi Ada — thanks");
    expect(result.usedDefaults).toEqual(["extra"]);
  });

  it("treats an empty default as a real value, not as an absence", () => {
    // `prompt_variables.defaultValue` distinguishes null from empty precisely so this case exists.
    const result = bound("A{{extra}}B", {}, [optional("extra", "")]);
    expect(result.text).toBe("AB");
    expect(result.usedDefaults).toEqual(["extra"]);
  });

  it("prefers the row's value over the default", () => {
    const result = bound("{{tone}}", { tone: "warm" }, [optional("tone", "neutral")]);
    expect(result.text).toBe("warm");
    expect(result.usedDefaults).toEqual([]);
  });

  /**
   * The three cases the epic names, and the reason they are named.
   *
   * A value is a customer's words. If it happens to contain `{{name}}` and the binder rescanned its
   * own output, those words would become a binding — which is a value substituted into a prompt by
   * nobody's decision.
   */
  it("inserts a value containing braces verbatim and never rescans it", () => {
    const result = bound("Transcript: {{body}}", { body: "the customer wrote {{refund}} in the form" });
    expect(result.text).toBe("Transcript: the customer wrote {{refund}} in the form");
  });

  it("inserts a value that is itself a placeholder as those characters", () => {
    const result = bound("{{a}}", { a: "{{b}}" }, [required("a"), optional("b", "SURPRISE")]);
    expect(result.text).toBe("{{b}}");
  });

  it("does not let one value's length move the next occurrence", () => {
    // Right to left, so every offset is still valid when it is used.
    const result = bound("{{a}}|{{b}}", { a: "a very much longer value indeed", b: "B" });
    expect(result.text).toBe("a very much longer value indeed|B");
  });

  it("leaves text with no variables exactly as it was", () => {
    expect(bound("Nothing to bind here.", { unused: "x" }).text).toBe("Nothing to bind here.");
  });

  it("is a pure function of its inputs", () => {
    const values = new Map([["a", "1"]]);
    expect(bindVariables("{{a}}", values, [])).toEqual(bindVariables("{{a}}", values, []));
  });
});

describe("serialiseRow", () => {
  it("does not depend on column order", () => {
    const one = serialiseRow(new Map([["b", "2"], ["a", "1"]]));
    const two = serialiseRow(new Map([["a", "1"], ["b", "2"]]));
    expect(one).toBe(two);
  });

  it("gives two different rows two different strings, whatever they contain", () => {
    const one = serialiseRow(new Map([["a", "x,y"], ["b", "z"]]));
    const two = serialiseRow(new Map([["a", "x"], ["b", "y,z"]]));
    expect(one).not.toBe(two);
  });
});

// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The Python bindings (EPIC-053).
 *
 * Written beside `typescript.test.ts` and asserting the same behaviours where the two languages
 * agree, so a reader can hold them side by side and see where they do not. The one place they
 * genuinely diverge is the awkward-name case — `python.ts`'s own comment has the measurement.
 */

import { describe, expect, it } from "vitest";
import { LICENCE_LINE } from "./header.js";
import { parameterFor, pythonPromptsFile, snakeCase } from "./python.js";
import type { CodegenPrompt } from "./types.js";

const prompt = (over: Partial<CodegenPrompt> = {}): CodegenPrompt => ({
  id: "pr_1a2b3c4d",
  name: "Refund classifier",
  variables: [],
  ...over,
});

describe("snakeCase, over the identifier TypeScript already computed", () => {
  it("splits a camel hump", () => {
    expect(snakeCase("refundClassifier")).toBe("refund_classifier");
    expect(snakeCase("dailySummary")).toBe("daily_summary");
    expect(snakeCase("p2024Refunds")).toBe("p2024_refunds");
  });

  it("handles a run of capitals without emitting a double underscore", () => {
    expect(snakeCase("rEFUNDCLASSIFIER")).toBe("r_efundclassifier");
    expect(snakeCase("parseHTMLDocument")).toBe("parse_html_document");
  });

  it("suffixes a Python keyword, which is PEP 8's convention", () => {
    expect(snakeCase("class")).toBe("class_");
    expect(snakeCase("import")).toBe("import_");
    expect(snakeCase("None")).toBe("none"); // lower-cased first, so it is no longer the keyword
  });

  it("leaves a soft keyword alone, because it is a legal identifier", () => {
    // `match`, `case` and `type` are soft keywords: renaming them would be a rename for no reason.
    expect(snakeCase("match")).toBe("match");
    expect(snakeCase("type")).toBe("type");
  });
});

describe("parameterFor, over a prompt variable name", () => {
  it("passes an ordinary name through", () => {
    expect(parameterFor("email")).toBe("email");
    expect(parameterFor("order_id")).toBe("order_id");
  });

  it("replaces what Python will not accept", () => {
    expect(parameterFor("customer name")).toBe("customer_name");
    expect(parameterFor("x-locale")).toBe("x_locale");
  });

  it("puts an underscore in front of a leading digit", () => {
    expect(parameterFor("2fa")).toBe("_2fa");
  });

  it("falls back rather than emitting nothing", () => {
    expect(parameterFor("!!!")).toBe("___");
    expect(parameterFor("")).toBe("v");
  });

  it("suffixes a keyword", () => {
    expect(parameterFor("class")).toBe("class_");
    expect(parameterFor("from")).toBe("from_");
  });
});

describe("the generated prompts.py", () => {
  it("writes one function per prompt, taking keyword arguments", () => {
    const file = pythonPromptsFile([
      prompt({ variables: [{ name: "email", optional: false, declared: true }] }),
    ]);
    expect(file).toContain("from fortyone import ResolveResult, resolve");
    expect(file).toContain("def refund_classifier(*, email: str) -> ResolveResult:");
    expect(file).toContain('    v: dict[str, str] = {"email": email}');
    expect(file).toContain('    return resolve("pr_1a2b3c4d", v)');
  });

  it("gives an optional variable a None default and adds it only when supplied", () => {
    const file = pythonPromptsFile([
      prompt({
        variables: [
          { name: "email", optional: false, declared: true },
          { name: "locale", optional: true, declared: true },
        ],
      }),
    ]);
    expect(file).toContain("def refund_classifier(*, email: str, locale: Optional[str] = None) -> ResolveResult:");
    expect(file).toContain('    v: dict[str, str] = {"email": email}');
    expect(file).toContain("    if locale is not None:");
    expect(file).toContain('        v["locale"] = locale');
  });

  it("imports Optional only when something is optional", () => {
    // An unused import is a lint failure in the customer's project, and the file we write should
    // not be the thing that fails their build.
    const withOptional = pythonPromptsFile([
      prompt({ variables: [{ name: "locale", optional: true, declared: true }] }),
    ]);
    const without = pythonPromptsFile([
      prompt({ variables: [{ name: "email", optional: false, declared: true }] }),
    ]);
    expect(withOptional).toContain("from typing import Optional");
    expect(without).not.toContain("from typing import Optional");
  });

  it("takes no argument when a prompt has no variables", () => {
    const file = pythonPromptsFile([prompt({ name: "Daily summary" })]);
    expect(file).toContain("def daily_summary() -> ResolveResult:");
    expect(file).toContain('    return resolve("pr_1a2b3c4d")');
  });

  /**
   * The divergence from TypeScript, and the reason it exists.
   *
   * TypeScript quotes the key and keeps the prompt's own name in the signature. Python cannot — a
   * keyword argument must be an identifier — so the parameter is sanitised and the real name goes
   * back in the dict literal one line later, where it is visible.
   */
  it("sanitises an awkward name into the parameter and puts the real one in the mapping", () => {
    const file = pythonPromptsFile([
      prompt({
        variables: [
          { name: "customer name", optional: false, declared: true },
          { name: "x-locale", optional: true, declared: true },
        ],
      }),
    ]);
    expect(file).toContain("def refund_classifier(*, customer_name: str, x_locale: Optional[str] = None)");
    expect(file).toContain('    v: dict[str, str] = {"customer name": customer_name}');
    expect(file).toContain('        v["x-locale"] = x_locale');
  });

  it("resolves two variable names that clean to the same parameter", () => {
    const file = pythonPromptsFile([
      prompt({
        variables: [
          { name: "customer name", optional: false, declared: true },
          { name: "customer-name", optional: false, declared: true },
        ],
      }),
    ]);
    expect(file).toContain("def refund_classifier(*, customer_name: str, customer_name2: str)");
    expect(file).toContain('{"customer name": customer_name, "customer-name": customer_name2}');
  });

  it("never marks an undeclared variable optional, whatever it is told", () => {
    const file = pythonPromptsFile([
      prompt({ variables: [{ name: "customer_name", optional: true, declared: false }] }),
    ]);
    expect(file).toContain("def refund_classifier(*, customer_name: str) -> ResolveResult:");
    expect(file).not.toContain("Optional");
  });

  it("resolves a function-name collision the same way TypeScript does", () => {
    const file = pythonPromptsFile([
      prompt({ id: "pr_aaaaaaaa", name: "Refund classifier" }),
      prompt({ id: "pr_bbbbbbbb", name: "refund-classifier" }),
    ]);
    expect(file).toContain("def refund_classifier() -> ResolveResult:");
    expect(file).toContain("def refund_classifier2() -> ResolveResult:");
  });

  it("says so when a project has no prompts", () => {
    const file = pythonPromptsFile([]);
    expect(file).toContain("This project has no prompts yet");
    expect(file).not.toContain("import");
  });

  it("carries the ownership sentence, with Python's comment marker", () => {
    expect(pythonPromptsFile([prompt()])).toContain(`# ${LICENCE_LINE}`);
  });

  it("separates definitions with two blank lines, which is PEP 8", () => {
    const file = pythonPromptsFile([
      prompt({ id: "pr_aaaaaaaa", name: "One" }),
      prompt({ id: "pr_bbbbbbbb", name: "Two" }),
    ]);
    expect(file).toContain(')\n\n\ndef two()');
    expect(file.endsWith(")\n")).toBe(true);
  });
});

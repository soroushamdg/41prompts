import { FINDING_KINDS } from "@41prompts/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { exampleFor, runningExample, RUNNING_EXAMPLE_NAME } from "./article-examples";
import { FINDING_COPY } from "./finding-copy";

/**
 * The nav reads the session on the server, which makes it an async component that
 * `renderToStaticMarkup` cannot render. Swapped for the **real** nav in its signed-out state rather
 * than for a stub, so the footer and nav are still in the markup these assertions walk — a truth
 * audit that skipped the chrome would not catch a testimonial added to the footer.
 * `site-chrome.test.tsx` covers both session states directly.
 */
vi.mock("@/app/site-chrome", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/site-chrome")>();
  return { ...actual, SiteNavWithSession: () => actual.SiteNav({ signedIn: false }) };
});

const { default: ArticlePage } = await import("@/app/guides/what-your-prompt-does-not-check/page.js");

const html = renderToStaticMarkup(ArticlePage());
const text = html
  .replace(/<[^>]+>/g, " ")
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/&[a-z]+;/g, " ")
  .replace(/\s+/g, " ");

/**
 * The article promises a stranger — and a model that may cite it — six specific things about what
 * this product finds. This is what stops that promise drifting away from the product.
 */
describe("every example in the article comes from the committed corpus", () => {
  it.each(FINDING_KINDS.map((kind) => [kind] as const))("%s is still produced by the real detectors", (kind) => {
    const example = exampleFor(kind);
    expect(example, `no fixture in the corpus produces a ${kind} finding any more`).toBeDefined();
    expect(example!.message.length).toBeGreaterThan(10);
  });

  it("shows each one on the page, worded exactly as the detector words it", () => {
    // Not "a message about contradictions" — *the* message, character for character. If a detector's
    // copy is edited, this fails and the article is regenerated rather than quietly going stale.
    for (const kind of FINDING_KINDS) {
      const example = exampleFor(kind)!;
      expect(text, `${kind}'s real message is missing from the article`).toContain(example.message);
    }
  });

  it("names all six in reading order and claims exactly six", () => {
    const positions = FINDING_KINDS.map((kind) => text.indexOf(FINDING_COPY[kind].name));
    expect(positions.every((p) => p >= 0), "a finding name is missing from the article").toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(FINDING_KINDS).toHaveLength(6);
    expect(text).toContain("six ways");
  });

  it("shows the running example verbatim, and counts it rather than asserting a number", () => {
    const { source, findings } = runningExample();
    expect(source.length).toBeGreaterThan(500);
    expect(text).toContain(RUNNING_EXAMPLE_NAME);
    // The count in the prose is rendered from `findings.length`, so this checks the fixture still
    // produces enough to be worth showing rather than checking a hard-coded number.
    expect(findings.length).toBeGreaterThanOrEqual(6);
    expect(text).toContain(`finds ${findings.length} things in it`);
  });
});

describe("the article claims nothing the product cannot do", () => {
  it.each([
    // The lookbehind matters: the page *does* contain "It does not rewrite your prompt", which is
    // the opposite of the claim being guarded against and which the first version of this matched.
    ["an editor that exists", /(?<!not )(?:edit|rewrite)s? your prompt/i],
    ["running a prompt", /\bwe run (?:it|your prompt)\b/i],
    ["scores", /\bscores? your prompt\b/i],
    ["social proof", /trusted by|used by|\bjoin \d|customers/i],
    ["invented counts", /\b\d[\d,]*\s*(?:companies|teams|engineers|developers|users)\b/i]
  ])("does not claim %s", (_what, pattern) => {
    expect(text).not.toMatch(pattern);
  });

  it("says plainly what it does not do", () => {
    expect(text).toContain("It does not rewrite your prompt");
    expect(text).toContain("There is no editor");
  });

  it("sends the reader to the decompiler and asks for nothing", () => {
    expect(html).toContain('href="/decompile"');
    expect(html).not.toMatch(/href="\/sign-up"/);
    expect(text).toContain("no account");
  });
});

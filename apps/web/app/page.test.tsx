import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Page from "./page.js";

const html = renderToStaticMarkup(Page());
const text = html
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

describe("/", () => {
  it("leads with the failure, not the tool", () => {
    // The position, decided 2026-09-11. If this sentence changes, it changes because Soroush
    // replaced it, not because somebody tidied the hero.
    expect(text).toContain("A prompt change ships. Nothing checks it. You find out from a user.");
  });

  it("names bloks and checks in the subhead, and promises nothing else", () => {
    expect(text).toContain("named bloks");
    expect(text).toContain("nothing checks");
  });

  it("puts the ask bar on the page as a real form that posts", () => {
    // Not a link dressed as a box: the paste has to travel, and it has to travel with JavaScript off.
    expect(html).toMatch(/<form[^>]*>[\s\S]*<textarea[^>]*name="prompt"/);
    expect(html).toContain('type="submit"');
  });
});

/**
 * Criterion 10, as a test rather than as a line in a report.
 *
 * "No testimonial, logo, counter or claim on the page that is not literally true today." A sentence
 * in a report saying the check was made is worth exactly as much as the day it was written; this
 * fails the build the first time somebody pastes in a "trusted by" row.
 */
describe("nothing on this page is a claim we cannot back", () => {
  it.each([
    ["trusted by", /trusted by/i],
    ["used by / loved by", /\b(?:used|loved|chosen) by\b/i],
    ["join N others", /\bjoin \d/i],
    ["customer counts", /\b\d[\d,.]*\s*(?:\+|k\b|m\b)?\s*(?:companies|teams|engineers|developers|users|customers|prompts)/i],
    ["testimonial furniture", /testimonial|—\s*[A-Z][a-z]+ [A-Z][a-z]+,\s*(?:CTO|CEO|VP|Head of)/],
    ["star ratings", /[★⭐]|\d(?:\.\d)?\s*\/\s*5\b/],
    ["fake urgency", /limited (?:beta|time|spots)|only \d+ (?:left|spots)|ends (?:today|soon)|countdown/i],
    ["invented awards", /#1\b|award|best[- ]in[- ]class|leading/i]
  ])("carries no %s", (_label, pattern) => {
    expect(text).not.toMatch(pattern);
  });

  it("shows no images, so there are no partner logos to be wrong about", () => {
    expect(html).not.toMatch(/<img\b/);
  });

  /**
   * Every number on the page, justified.
   *
   * A counter is the easiest lie to add and the hardest to notice in review, because it looks like
   * data. So the rule here is inverted: a digit that appears on this page has to be listed below
   * with a reason, or the test fails and somebody has to say what it is.
   */
  it("shows only numbers that are facts about the product", () => {
    const allowed = new Map([
      ["01", "step number in the three-step strip"],
      ["02", "step number"],
      ["03", "step number"],
      ["41", "the product's name"],
      ["100", "the input cap in KB — MAX_INPUT_BYTES, enforced in code"]
    ]);
    const numbers = text.match(/\d[\d.,]*/g) ?? [];
    for (const number of numbers) {
      expect(allowed.has(number), `unexplained number "${number}" on the landing page`).toBe(true);
    }
  });
});

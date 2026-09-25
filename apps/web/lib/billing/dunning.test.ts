import { describe, expect, it } from "vitest";
import { dunningMessage } from "./dunning";

/**
 * The dunning email's **copy**, which is the deliverable (EPIC-070 scope 10, ADR-007 §4).
 *
 * Every assertion here is about a sentence rather than about a send. That is the right level: the
 * send is three lines of Resend and one `try`, and what can actually be wrong is what the email
 * says — specifically, whether it says the thing every other dunning email on the internet says and
 * this product has decided not to do.
 */

const MESSAGE = dunningMessage("https://app.41prompts.ai/app/settings/billing");

describe("what the email says when a card fails", () => {
  it("says what happened, without a word a reader has to decode", () => {
    expect(MESSAGE.subject).toContain("could not take that payment");
    expect(MESSAGE.text).toContain("declined");
  });

  /**
   * **The four promises ADR-007 §4 makes, each asserted.**
   *
   * These are not a checklist for its own sake. Each one is a thing the customer is, at that
   * moment, afraid has just happened to them, and each is the opposite of what the standard
   * dunning email implies.
   */
  it("says nothing has been taken away", () => {
    expect(MESSAGE.text).toContain("Nothing has been taken away");
  });

  it("says the work is still there and still exportable", () => {
    expect(MESSAGE.text).toMatch(/still there and still\s+exportable/);
  });

  it("says publishing to Live keeps working, which is the one that protects a deploy", () => {
    expect(MESSAGE.text).toMatch(/publishing to Live keeps working/);
  });

  it("says what does change, so the email is not merely reassuring", () => {
    // An email that only says "nothing is wrong" gives somebody no reason to fix the card. The
    // Free limit is the actual consequence and it is stated with its number.
    expect(MESSAGE.text).toMatch(/fall back to the Free limit of 50/);
  });

  /**
   * **The sentence this email must never contain**, with the patterns written out.
   *
   * `/security` publishes the claim that an application depending on us keeps running if we are
   * unreachable. A product whose billing state can break a customer's production path contradicts
   * the sentence it sells itself with, and a *threat* to do so is the same contradiction made
   * earlier. ADR-007 §4 settled it; this is the settlement as a test.
   */
  it.each([
    ["suspension", /suspend/i],
    ["deletion", /delete|deleted|removed/i],
    ["losing access", /lose access|locked out|access will be/i],
    ["a deadline", /within \d+ (?:days|hours)|before .* or your/i],
    ["publishing stopping", /publishing will stop|cannot publish/i]
  ])("never threatens %s", (_what, pattern) => {
    expect(MESSAGE.text).not.toMatch(pattern);
  });

  /**
   * The control on the five above.
   *
   * They are all `not.toMatch`, so they would all pass over an empty string — and over a body that
   * had quietly stopped being generated. This is the standard sentence they exist to refuse, proved
   * to be something the patterns actually catch.
   */
  it.each([
    ["Your account will be suspended in 7 days.", /suspend/i],
    ["Update your card within 3 days or your projects will be deleted.", /delete|deleted|removed/i],
    ["You will lose access to your prompts.", /lose access|locked out|access will be/i]
  ])("would catch %s", (sentence, pattern) => {
    expect(sentence).toMatch(pattern);
  });

  it("carries the billing page, so there is something to do about it", () => {
    expect(MESSAGE.text).toContain("https://app.41prompts.ai/app/settings/billing");
  });

  it("says Stripe will retry, so nobody pays twice trying to fix it by hand", () => {
    expect(MESSAGE.text).toMatch(/try the card again/);
  });

  it("says cancelling keeps everything, because that is the other thing they might want", () => {
    expect(MESSAGE.text).toMatch(/keep everything either\s+way/);
  });
});

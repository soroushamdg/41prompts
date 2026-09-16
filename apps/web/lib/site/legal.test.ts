import {
  ACCOUNT_PURGE_WINDOW_DAYS,
  DECOMPILE_RETENTION_DAYS,
  RUN_COUNT_RETENTION_DAYS,
  RUN_PAYLOAD_RETENTION_DAYS,
} from "@41prompts/db";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LAST_UPDATED,
  LEGAL_DOCS,
  LEGAL_DOC_SLUGS,
  SECURITY_LAST_UPDATED,
  UNREVIEWED_NOTICE,
  type LegalPart,
} from "./legal";
import {
  KEY_GUIDANCE_ACTIONS,
  KEY_GUIDANCE_HOLDING,
  KEY_GUIDANCE_SUMMARY,
  KEY_GUIDANCE_TITLE,
} from "../providers/key-guidance";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

function textOf(doc: { readonly parts: readonly LegalPart[] }): string {
  return doc.parts
    .map((part) => {
      switch (part.kind) {
        case "p":
        case "h2":
          return part.text;
        case "ul":
          return part.items.join(" ");
        case "table":
          return [part.caption, ...part.head, ...part.rows.flat()].join(" ");
      }
    })
    .join("\n");
}

describe("the retention table cannot drift from the code", () => {
  /**
   * **The roadmap's own test for this epic**: "retention numbers match the code in 014, 031, 002".
   *
   * The page imports the constants rather than typing the numbers, so the only way it can be wrong
   * is if someone replaces the import with a literal. That is exactly what this asserts — the page's
   * text has to contain the number the purge job enforces, whatever that number becomes.
   */
  it.each([
    ["a shared decompile", DECOMPILE_RETENTION_DAYS],
    ["a counted run", RUN_COUNT_RETENTION_DAYS],
    ["an account after deletion", ACCOUNT_PURGE_WINDOW_DAYS],
    ["a raw model response", RUN_PAYLOAD_RETENTION_DAYS],
  ])("states the enforced number of days for %s", (_what, days) => {
    expect(textOf(LEGAL_DOCS.privacy!)).toContain(`${days} days`);
  });

  it("names the file that enforces each number, and that file exists", () => {
    const table = LEGAL_DOCS.privacy!.parts.find(
      (part): part is Extract<LegalPart, { kind: "table" }> =>
        part.kind === "table" && part.head.includes("Enforced by")
    );
    expect(table, "the retention table should be findable by its heading").toBeDefined();

    const cited = table!.rows.map((row) => row[row.length - 1]!).filter((cell) => cell !== "—");
    expect(cited.length).toBeGreaterThan(0);
    for (const path of cited) {
      // A citation to a file that does not exist is worse than no citation: it reads as verifiable
      // and is not.
      expect(existsSync(join(REPO_ROOT, path)), `${path} should exist`).toBe(true);
    }
  });

  /**
   * **This test used to assert the opposite**, and that was correct until EPIC-031 shipped.
   *
   * It read: *says the 12-month payload retention is not built yet, and names the epic* — checking
   * the page contained the literal "12 months — not built yet". True then, and a test asserting a
   * placeholder the moment the placeholder stopped being true. `PROCESS.md`'s helper rule covers the
   * family; this is the one place in the codebase where the inversion was planned in advance rather
   * than discovered.
   *
   * What it asserts now is what the other four rows assert: the enforced number, and a citation that
   * exists. The "not built yet" wording must never come back while the job does.
   */
  it("no longer says the payload retention is unbuilt, because it is built", () => {
    const text = textOf(LEGAL_DOCS.privacy!);
    expect(text).not.toContain("not built yet");
    expect(text).toContain(`${RUN_PAYLOAD_RETENTION_DAYS} days`);
  });

  /**
   * Prose and table say the same duration in the units each is for: "12 months" is what a person
   * reads, `365 days` is what the code counts and what the test above compares to the constant.
   */
  it("keeps the prose in months and the cell in days, and they agree", () => {
    expect(RUN_PAYLOAD_RETENTION_DAYS).toBe(365);
    const table = LEGAL_DOCS.privacy!.parts.find(
      (part): part is Extract<LegalPart, { kind: "table" }> =>
        part.kind === "table" && part.head.includes("Enforced by")
    )!;
    const payloadRow = table.rows.find((row) => row[0]!.includes("Raw model responses"))!;
    expect(payloadRow[1]).toBe(`${RUN_PAYLOAD_RETENTION_DAYS} days`);
    expect(payloadRow[2]).toContain("Twelve months");
    expect(payloadRow[3]).toBe("apps/worker/src/jobs/purge-run-payloads.ts");
  });
});

describe("the not-reviewed-by-a-lawyer line", () => {
  it("is on terms and privacy", () => {
    expect(LEGAL_DOCS.terms!.unreviewed).toBe(true);
    expect(LEGAL_DOCS.privacy!.unreviewed).toBe(true);
    expect(UNREVIEWED_NOTICE).toContain("has not been reviewed by a lawyer");
  });

  /** "Do not add warnings anywhere else" — asserted, so a fourth page cannot quietly grow one. */
  it("is on nothing else", () => {
    const others = LEGAL_DOC_SLUGS.filter((slug) => slug !== "terms" && slug !== "privacy");
    expect(others.length).toBeGreaterThan(0);
    for (const slug of others) {
      expect(LEGAL_DOCS[slug]!.unreviewed, `${slug} should not carry the notice`).toBe(false);
    }
  });

  it("appears once in the document, not repeated through the body", () => {
    for (const slug of ["terms", "privacy"]) {
      const occurrences = textOf(LEGAL_DOCS[slug]!).split("has not been reviewed by a lawyer").length - 1;
      expect(occurrences, `${slug} body should not repeat the notice`).toBe(0);
    }
  });
});

describe("the four clauses that matter for this product", () => {
  const terms = () => textOf(LEGAL_DOCS.terms!);

  it("licenses pasted prompts without claiming them", () => {
    expect(terms()).toContain("You keep every right you already had");
    expect(terms()).toContain("claim no ownership");
    expect(terms()).toContain("do not sell it, train on it");
  });

  it("disclaims warranty in the terms the law recognises", () => {
    const text = terms();
    expect(text).toContain("as is");
    expect(text).toContain("merchantability");
    expect(text).toContain("fitness for a particular purpose");
    expect(text).toContain("non-infringement");
  });

  it("caps liability with a floor a free service can still name", () => {
    const text = terms();
    expect(text).toContain("consequential");
    expect(text).toContain("fifty Canadian dollars");
  });

  it("is governed by Québec law, in both languages the province expects", () => {
    const text = terms();
    expect(text).toContain("Province of Québec");
    expect(text).toContain("judicial district of Montréal");
    expect(text).toContain("rédigées en anglais");
  });
});

describe("processors are named honestly", () => {
  const processorTable = () =>
    LEGAL_DOCS["sub-processors"]!.parts.find(
      (part): part is Extract<LegalPart, { kind: "table" }> => part.kind === "table"
    )!;

  it("lists only what the code actually uses today", () => {
    const names = processorTable().rows.map((row) => row[0]);
    expect(names).toEqual([
      "Amazon Web Services",
      "Cloudflare",
      "Resend",
      "Google",
      "GitHub",
      "PostHog",
      "Sentry",
    ]);
  });

  /**
   * The roadmap's list has eight and four of them are not wired yet. Naming them as current would be
   * the same class of error as the 12-month row, so they are listed separately and said to be unused.
   */
  it("says plainly which planned processors are not in use", () => {
    const text = textOf(LEGAL_DOCS["sub-processors"]!);
    expect(text).toContain("Not in use yet");
    for (const name of ["Anthropic", "OpenAI", "Stripe"]) {
      expect(text, `${name} should be listed as not yet used`).toContain(name);
    }
    expect(text).toContain("Not built.");
  });

  it("keeps the privacy page's processor list identical to the sub-processor page's", () => {
    const onPrivacy = LEGAL_DOCS.privacy!.parts.find(
      (part): part is Extract<LegalPart, { kind: "table" }> =>
        part.kind === "table" && part.head.includes("Where")
    )!;
    // Two lists that can disagree eventually will.
    expect(onPrivacy.rows).toEqual(processorTable().rows);
  });
});

describe("every legal page", () => {
  it.each(LEGAL_DOC_SLUGS)("%s has a title, a summary and real content", (slug) => {
    const doc = LEGAL_DOCS[slug]!;
    expect(doc.title.length).toBeGreaterThan(0);
    expect(doc.summary.length).toBeGreaterThan(0);
    expect(doc.parts.length).toBeGreaterThan(3);
    // The stub these replaced said exactly this. It must never come back.
    expect(textOf(doc)).not.toContain("not written yet");
  });
});

/**
 * EPIC-043's guidance reaches a rendered page, and reaches it from one source.
 *
 * `/legal/security` is where a person can read it today; EPIC-042 renders the same three actions
 * beside the input. The test is that the page's text **is** the module's text — not that it says
 * something similar — so the two cannot drift once there are two renderings of them.
 */
describe("the provider-key guidance", () => {
  const securityText = textOf(LEGAL_DOCS.security!);

  it("puts every action from the one source on the page", () => {
    for (const each of KEY_GUIDANCE_ACTIONS) {
      expect(securityText).toContain(each.action);
      expect(securityText).toContain(each.because);
    }
  });

  it("says how the key is held, in the same words the module uses", () => {
    expect(securityText).toContain(KEY_GUIDANCE_TITLE);
    expect(securityText).toContain(KEY_GUIDANCE_SUMMARY);
    for (const holding of KEY_GUIDANCE_HOLDING) {
      expect(securityText).toContain(holding);
    }
  });

  it("names the three controls that only the provider has", () => {
    // The whole point of the section: scope, cap, revoke — each at the provider, not here.
    expect(securityText).toMatch(/spending limit/i);
    expect(securityText).toMatch(/revoke it at your provider/i);
    expect(securityText).toMatch(/not the one your production service already uses/i);
  });

  it("does not claim a key is stored today, because none is", () => {
    expect(securityText).toContain("Nothing stores a provider key today");
  });

  /**
   * The drive found this one by looking at the page: it said "Last updated 14 September 2026" under
   * a section written on the 16th. A page carrying a date that its own content has moved past is a
   * small lie in the one place a reader checks whether to re-read it.
   */
  it("carries its own last-updated date, moved past the other three pages'", () => {
    expect(securityText).toContain(`Last updated ${SECURITY_LAST_UPDATED}`);
    expect(securityText).not.toContain(`Last updated ${LAST_UPDATED}`);
    // The pages that did not change keep the date they had.
    expect(textOf(LEGAL_DOCS.privacy!)).toContain(`Last updated ${LAST_UPDATED}`);
    expect(textOf(LEGAL_DOCS.terms!)).toContain(`Last updated ${LAST_UPDATED}`);
  });
});

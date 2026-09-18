// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { fixtureArtifact, fixtureLiveMarker } from "./fixtures/inputs.js";

/**
 * EPIC-050's Review line, as a test: **"Nothing internal leaks through the format."**
 *
 * An artifact is written to R2 with immutable headers and served to anyone holding the Live marker's
 * URL. A marker is fetched more often still. Neither is behind a session. So the question is not
 * "would we mind if this were public" — it *is* public, and this asserts that nothing arrived in it
 * that nobody decided to publish.
 *
 * ## It is a denylist, and a denylist alone would be worth very little
 *
 * A new field with a name nobody thought of goes straight through. That is why `schema.test.ts`'s
 * twelve-field freeze is the primary guard and this is the second: the freeze catches *any* new
 * field and makes somebody look at it; this catches the specific families that would be worst, and
 * catches them inside nested objects the freeze does not enumerate.
 */
const FORBIDDEN = new Set([
  // Identity and tenancy.
  "owner", "user", "account", "email", "actor", "author", "publishedby", "member", "team", "org",
  // Credentials.
  "key", "secret", "token", "password", "credential", "apikey", "sealed", "envelope",
  // Money and telemetry, which belong to the workbench and not to a served prompt.
  "cost", "price", "cents", "spend", "budget", "usage", "latency", "tokens",
  // Internal addressing and storage.
  "project", "url", "bucket", "database", "session", "cookie", "ip", "rank",
  // The provider's own words about somebody's input.
  "payload", "response", "output", "completion", "prompttext",
]);

/**
 * A key broken into its words, plus the whole thing joined.
 *
 * **Whole words, not substrings**, and the first draft of this test got it wrong in exactly the way
 * that matters: `ip` matched inside `description`, so the denylist reported the format's own
 * documentation field as a leak. A denylist that cries wolf is a denylist somebody deletes.
 *
 * The joined form is kept as well so a two-word name can be listed as one entry — `prompttext` is a
 * leak while `text` on its own is the format's central field.
 */
const partsOf = (key: string): string[] => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  return [...words, words.join("")];
};

/**
 * Every key in a value, at every depth — **except the keys inside `params`**.
 *
 * `params` is the one place in this format where the key names are not ours: they are the provider's
 * parameter names, chosen by whoever triggered the run, and the published schema says so
 * (`additionalProperties` with a scalar type rather than a fixed property list). `maxOutputTokens`
 * contains two denylisted words and is exactly what a person meant to publish. Policing it here
 * would mean this test decides which provider parameters are allowed to exist, which is not its job
 * and would break on the next provider.
 *
 * What still guards `params` is the schema — scalars only, so a nested object of run telemetry
 * cannot be smuggled in under a harmless key — and `schema.test.ts`'s twelve-field freeze.
 */
function everyKey(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) everyKey(item, into);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, sub] of Object.entries(value)) {
      into.add(key);
      if (key !== "params") everyKey(sub, into);
    }
  }
  return into;
}

const offenders = (value: unknown): string[] =>
  [...everyKey(value)]
    .filter((key) => partsOf(key).some((part) => FORBIDDEN.has(part)))
    .map((key) => partsOf(key).at(-1)!)
    .sort();

describe("nothing internal leaks through the format", () => {
  it("finds nothing forbidden anywhere in an artifact, at any depth", () => {
    expect(offenders(fixtureArtifact())).toEqual([]);
  });

  it("finds nothing forbidden in a Live marker", () => {
    expect(offenders(fixtureLiveMarker())).toEqual([]);
  });

  /**
   * **The positive control**, and it is not decoration.
   *
   * `docs/epics/HANDOVER.md` lesson 8: EPIC-043 shipped three assertions about an absence that could
   * never have failed — a `rows: []` that is always empty, a `#hex` that never equals an `rgb()`, an
   * `"".startsWith("")` that is true of everything — and each read as a green tick over a claim
   * nobody had tested. Before asserting a thing is missing, prove the search can find it.
   */
  it("would find one: the search is proved against a planted key, nested two levels down", () => {
    const planted = {
      ...fixtureArtifact(),
      bloks: [{ id: "x", kind: "context", text: "t", position: 0, ownerEmail: "someone@example.com" }],
    };
    expect(offenders(planted)).toEqual(["owneremail"]);
  });

  it("would find one whose name is spelled around a separator or a capital", () => {
    expect(offenders({ api_key: "x" })).toEqual(["apikey"]);
    expect(offenders({ "cost-cents": 1 })).toEqual(["costcents"]);
    expect(offenders({ ownerId: "x" })).toEqual(["ownerid"]);
  });

  /**
   * The false positive the first draft of this test had. Kept as a case rather than only fixed, so
   * that a later tightening of `partsOf` back to substring matching fails here instead of quietly
   * making the whole test noise.
   */
  it("does not trip on the format's own words — `description` is not a leak because it contains `ip`", () => {
    expect(offenders({ description: "x", textEnd: 1, schemaVersion: 1, buildHash: "x" })).toEqual([]);
  });

  /**
   * `params` keys are the provider's, not ours. What guards them is the schema's scalar-only rule,
   * asserted in `json-schema.test.ts`, not this denylist.
   */
  it("does not police the keys inside params, which are the provider's own parameter names", () => {
    expect(offenders({ params: { maxOutputTokens: 1024, temperature: 0 } })).toEqual([]);
    expect(fixtureArtifact().params).toHaveProperty("maxOutputTokens");
  });

  /**
   * The four things ruling 5 decided to leave out, asserted by name rather than only by the denylist
   * — each was in the shape at some point in this epic's design and each was removed for a stated
   * reason, so each deserves a test that says which one it is.
   */
  it("carries no span hash, no blok order, no actor and no timestamp on the artifact", () => {
    const artifact = fixtureArtifact();
    expect(artifact.spans.every((span) => !("hash" in span))).toBe(true);
    expect(artifact.bloks.every((blok) => !("order" in blok))).toBe(true);
    expect(Object.keys(artifact)).not.toContain("publishedAt");
    expect(Object.keys(artifact)).not.toContain("owner");
  });

  it("carries no actor on the marker, which is the one document that has a person behind it", () => {
    expect(Object.keys(fixtureLiveMarker()).sort()).toEqual([
      "buildHash",
      "promptId",
      "publishedAt",
      "schemaVersion",
      "version",
    ]);
  });
});

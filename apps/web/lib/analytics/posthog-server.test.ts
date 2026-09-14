import { afterEach, describe, expect, it } from "vitest";
import type { EventName } from "./events";
import { captureEvent, hasAnalyticsConsent } from "./posthog-server";

describe("captureEvent", () => {
  it("throws at runtime for a name outside the closed set, even past a TypeScript cast", () => {
    expect(() => captureEvent("user_1", "not_a_real_event" as EventName)).toThrow(
      /not one of the allowed event names/,
    );
  });

  it("is a no-op (does not throw) for a real event name when no PostHog key is configured", () => {
    expect(() => captureEvent("user_1", "signup")).not.toThrow();
  });
});

describe("hasAnalyticsConsent", () => {
  const originalDeployEnv = process.env.DEPLOY_ENV;

  afterEach(() => {
    if (originalDeployEnv === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = originalDeployEnv;
  });

  /**
   * **Reversed 2026-09-14, and the old assertion is quoted so the change is visible.**
   *
   * This test used to read `expect(hasAnalyticsConsent({ isSignedIn: true })).toBe(true)` — a
   * signed-in user in production was counted without ever choosing. EPIC-004 decided that when
   * there was no consent mechanism at all, so requiring a yes would have meant measuring nothing.
   * EPIC-017 built the mechanism and the exception stopped having a reason; Soroush ruled it
   * universal. `isSignedIn` is gone from the signature entirely.
   */
  it("does not count anybody in production who has not chosen, signed in or not", () => {
    process.env.DEPLOY_ENV = "production";
    expect(hasAnalyticsConsent({})).toBe(false);
    expect(hasAnalyticsConsent({ consentCookie: undefined })).toBe(false);
  });

  it("does not send an anonymous production visitor to PostHog without explicit consent", () => {
    // This flipped twice in a day and the round trip is the point. EPIC-004: opt-in. EPIC-015: opt-out,
    // because the M1 funnel ran through here and opt-in made it read zero. Then: back to opt-in,
    // because counting EU and Québec visitors by default through a processor outside Canada is not
    // defensible whatever it does for the number — and the measurement moved to our own Postgres
    // instead, where no cookie and no third party are involved. PostHog is supplementary now.
    process.env.DEPLOY_ENV = "production";
    expect(hasAnalyticsConsent({})).toBe(false);
  });

  it("allows an anonymous visitor in production once consent is granted", () => {
    process.env.DEPLOY_ENV = "production";
    expect(hasAnalyticsConsent({ consentCookie: "granted" })).toBe(true);
  });

  it("does not count a visitor who declines, anywhere, however they say it", () => {
    for (const env of ["production", "staging"]) {
      process.env.DEPLOY_ENV = env;
      expect(hasAnalyticsConsent({ doNotTrack: "1" }), `DNT in ${env}`).toBe(false);
      expect(hasAnalyticsConsent({ globalPrivacyControl: "1" }), `GPC in ${env}`).toBe(false);
      expect(hasAnalyticsConsent({ consentCookie: "denied" }), `cookie in ${env}`).toBe(false);
    }
  });

  it("treats only the exact values as declining, not any truthy header", () => {
    process.env.DEPLOY_ENV = "production";
    // Browsers send "0" for "tracking is fine" and browsers that have never been asked send nothing.
    // Neither is a *decline*, so neither should block a visitor who has separately said yes.
    const granted = { consentCookie: "granted" };
    expect(hasAnalyticsConsent({ ...granted, doNotTrack: "0" })).toBe(true);
    expect(hasAnalyticsConsent({ ...granted, doNotTrack: null })).toBe(true);
    expect(hasAnalyticsConsent({ ...granted, globalPrivacyControl: null })).toBe(true);
  });

  it("allows an anonymous visitor outside production regardless of consent", () => {
    process.env.DEPLOY_ENV = "staging";
    expect(hasAnalyticsConsent({})).toBe(true);
  });

  it("defaults to allowed when DEPLOY_ENV is unset (local dev)", () => {
    delete process.env.DEPLOY_ENV;
    expect(hasAnalyticsConsent({})).toBe(true);
  });
});

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

  it("allows a signed-in visitor in production with no consent cookie", () => {
    process.env.DEPLOY_ENV = "production";
    expect(hasAnalyticsConsent({ isSignedIn: true })).toBe(true);
  });

  it("counts an anonymous visitor in production who has stated no preference", () => {
    // **EPIC-015 reversed this**, and the old assertion is worth remembering: it used to be `false`,
    // which was right when there was nothing to measure and no banner. Every visitor in the
    // thirty-day window is anonymous and in production, so opt-in would have produced a funnel
    // reading zero for thirty days — a measurement that looks like a result. Decision 9: a visitor
    // who *declines* is not counted, and declining is an act.
    process.env.DEPLOY_ENV = "production";
    expect(hasAnalyticsConsent({ isSignedIn: false })).toBe(true);
  });

  it("allows an anonymous visitor in production once consent is granted", () => {
    process.env.DEPLOY_ENV = "production";
    expect(hasAnalyticsConsent({ isSignedIn: false, consentCookie: "granted" })).toBe(true);
  });

  it("does not count a visitor who declines, anywhere, however they say it", () => {
    for (const env of ["production", "staging"]) {
      process.env.DEPLOY_ENV = env;
      expect(hasAnalyticsConsent({ isSignedIn: false, doNotTrack: "1" }), `DNT in ${env}`).toBe(false);
      expect(hasAnalyticsConsent({ isSignedIn: false, globalPrivacyControl: "1" }), `GPC in ${env}`).toBe(false);
      expect(hasAnalyticsConsent({ isSignedIn: false, consentCookie: "denied" }), `cookie in ${env}`).toBe(false);
      // Declining outranks being signed in. A setting that only applies to logged-out people is not
      // a setting anybody can trust.
      expect(hasAnalyticsConsent({ isSignedIn: true, doNotTrack: "1" }), `signed in, DNT, ${env}`).toBe(false);
    }
  });

  it("treats only the exact values as declining, not any truthy header", () => {
    process.env.DEPLOY_ENV = "production";
    // Browsers send "0" for "tracking is fine" and browsers that have never been asked send nothing.
    expect(hasAnalyticsConsent({ isSignedIn: false, doNotTrack: "0" })).toBe(true);
    expect(hasAnalyticsConsent({ isSignedIn: false, doNotTrack: null })).toBe(true);
    expect(hasAnalyticsConsent({ isSignedIn: false, globalPrivacyControl: null })).toBe(true);
  });

  it("allows an anonymous visitor outside production regardless of consent", () => {
    process.env.DEPLOY_ENV = "staging";
    expect(hasAnalyticsConsent({ isSignedIn: false })).toBe(true);
  });

  it("defaults to allowed when DEPLOY_ENV is unset (local dev)", () => {
    delete process.env.DEPLOY_ENV;
    expect(hasAnalyticsConsent({ isSignedIn: false })).toBe(true);
  });
});

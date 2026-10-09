import { describe, expect, it } from "vitest";
import { mayAskForReview, type ReviewState } from "./product-hunt";

const now = new Date("2026-10-20T12:00:00Z");
const base: ReviewState = { status: "open", snoozedUntil: null, askCount: 0, lastAskedAt: null, accountCreatedAt: "2026-10-01T00:00:00Z" };

describe("mayAskForReview", () => {
  it("asks an established user who has never been asked", () => {
    expect(mayAskForReview(base, now)).toBe(true);
  });
  it("never asks again after never, or after a review", () => {
    expect(mayAskForReview({ ...base, status: "never" }, now)).toBe(false);
    expect(mayAskForReview({ ...base, status: "reviewed" }, now)).toBe(false);
  });
  it("waits out a snooze, a recent ask, and a brand new account", () => {
    expect(mayAskForReview({ ...base, status: "snoozed", snoozedUntil: "2026-10-25T00:00:00Z" }, now)).toBe(false);
    expect(mayAskForReview({ ...base, status: "snoozed", snoozedUntil: "2026-10-19T00:00:00Z" }, now)).toBe(true);
    expect(mayAskForReview({ ...base, askCount: 1, lastAskedAt: "2026-10-19T00:00:00Z" }, now)).toBe(false);
    expect(mayAskForReview({ ...base, accountCreatedAt: "2026-10-20T11:50:00Z" }, now)).toBe(false);
  });
  it("stops after three asks", () => {
    expect(mayAskForReview({ ...base, askCount: 3, lastAskedAt: "2026-09-01T00:00:00Z" }, now)).toBe(false);
  });
});

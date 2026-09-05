import { describe, expect, it } from "vitest";
import { newApiKeyId, newProjectId, newPromptId } from "./ids";

describe("id generation", () => {
  it("formats project ids as proj_ + 4 hex chars", () => {
    expect(newProjectId()).toMatch(/^proj_[0-9a-f]{4}$/);
  });

  it("formats prompt ids as pr_ + 8 hex chars", () => {
    expect(newPromptId()).toMatch(/^pr_[0-9a-f]{8}$/);
  });

  it("formats api key ids as key_ + 16 hex chars", () => {
    expect(newApiKeyId()).toMatch(/^key_[0-9a-f]{16}$/);
  });

  it("draws unique ids across many calls", () => {
    // CLAUDE.md's own shape (proj_ + 4 hex = 2 bytes, 65536 values) trades collision-freedom
    // for a short, readable id — at 1000 draws the birthday bound puts the expected collision
    // count near 8, not 0. A prompt id (4 bytes) is the one actually asserted collision-free
    // here; project ids rely on the column's primary key plus a retry-on-conflict at insert
    // time (not built by this epic, since nothing creates a project yet beyond the seed
    // script), not on the generator alone.
    const ids = new Set(Array.from({ length: 1000 }, () => newPromptId()));
    expect(ids.size).toBe(1000);
  });
});

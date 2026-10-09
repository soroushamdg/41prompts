import { describe, expect, it } from "vitest";
import { DUR, E, HOLD, logoPaths } from "./logo-morph";

/* The d attributes of the logo in docs/mockup/41prompts.ai/index.html. The
   server-rendered logo must equal them, so the morph starts from the mockup. */
const MOCKUP_LEFT = "M18.00 14.00L32.00 14.00L32.00 50.00L25.00 50.00L25.00 41.00L8.00 41.00L8.00 41.00L8.00 41.00L8.00 34.00Z M25.00 17.00L25.00 34.00L15.00 34.00Z";
const MOCKUP_RIGHT = "M38.00 21.00L44.00 14.00L48.00 14.00L48.00 50.00L41.00 50.00L41.00 21.00Z";

describe("logo morph", () => {
  it("draws 41 at rest exactly as the mockup does", () => {
    expect(logoPaths(0)).toEqual({ left: MOCKUP_LEFT, right: MOCKUP_RIGHT });
  });

  it("draws AI at the end of the morph", () => {
    expect(logoPaths(1)).toEqual({
      left: "M28.00 14.00L34.00 14.00L44.00 50.00L36.00 50.00L31.00 41.00L21.00 41.00L16.00 50.00L8.00 50.00L16.00 36.00Z M30.00 20.00L31.00 34.00L24.00 34.00Z",
      right: "M45.00 14.00L45.00 14.00L51.00 14.00L45.00 50.00L38.00 50.00L41.50 32.00Z",
    });
  });

  it("clamps progress outside 0..1", () => {
    expect(logoPaths(-1)).toEqual(logoPaths(0));
    expect(logoPaths(2)).toEqual(logoPaths(1));
  });

  it("eases cubic in-out", () => {
    expect(E(0)).toBe(0);
    expect(E(0.25)).toBeCloseTo(0.0625);
    expect(E(0.5)).toBe(0.5);
    expect(E(0.75)).toBeCloseTo(0.9375);
    expect(E(1)).toBe(1);
  });

  it("keeps the timing of logo.js", () => {
    expect(DUR).toBe(500);
    expect(HOLD).toBe(900);
  });
});

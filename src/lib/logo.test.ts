import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOGO_DURATION_MS, LOGO_HOLD_MS, logoEase, logoPaths, logoShapes } from "./logo";

const morph = JSON.parse(readFileSync("docs/assets/logo/logo-morph.json", "utf8"));
const mockup = readFileSync("docs/mockup/app.41prompts.ai/library.html", "utf8");
const aiSvg = readFileSync("docs/assets/logo/mark-ai-hover.svg", "utf8");

describe("logo morph", () => {
  it("renders exactly the mockup's static 41 markup at rest", () => {
    const { left, right } = logoPaths(0);
    expect(mockup).toContain(`data-logo-left d="${left}"`);
    expect(mockup).toContain(`data-logo-right d="${right}"`);
  });

  it("ends exactly on the AI mark", () => {
    const { left, right } = logoPaths(1);
    const norm = (d: string) => d.replace(/(\d+(?:\.\d+)?)/g, (n) => Number(n).toFixed(2)).replace(/\s+/g, "");
    const ai = [...aiSvg.matchAll(/ d="([^"]+)"/g)].map((m) => norm(m[1]!));
    expect(ai).toContain(norm(left));
    expect(ai).toContain(norm(right));
  });

  it("uses the shapes, timing and easing in logo-morph.json", () => {
    expect(logoShapes).toEqual(morph.shapes);
    expect(LOGO_DURATION_MS).toBe(morph.morph.durationMs);
    expect(LOGO_HOLD_MS).toBe(morph.morph.holdOnLoadMs);
    expect(logoEase(0.25)).toBeCloseTo(4 * 0.25 ** 3);
    expect(logoEase(0.75)).toBeCloseTo(1 - Math.pow(-2 * 0.75 + 2, 3) / 2);
  });
});

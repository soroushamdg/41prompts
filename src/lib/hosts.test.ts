import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./hosts";

describe("normalizeUrl", () => {
  it("serves real domains over https, so sign-in trusts the origin the browser sends", () => {
    expect(normalizeUrl("http://app.41prompts.ai")).toBe("https://app.41prompts.ai");
    expect(normalizeUrl("http://app.41prompts.ai/")).toBe("https://app.41prompts.ai");
    expect(normalizeUrl("https://41prompts.ai/")).toBe("https://41prompts.ai");
  });
  it("leaves local addresses alone", () => {
    expect(normalizeUrl("http://localhost:3141")).toBe("http://localhost:3141");
    expect(normalizeUrl("http://site.localhost:3141/")).toBe("http://site.localhost:3141");
    expect(normalizeUrl("http://127.0.0.1:3142")).toBe("http://127.0.0.1:3142");
  });
});

import { describe, expect, it } from "vitest";
import {
  browserReach,
  cleanSettings,
  costUsd,
  destinationOf,
  draftProblem,
  formatCost,
  formatPrice,
  freeLabel,
  isLocalAddress,
  ModelIdSchema,
  parseHeaders,
  providerById,
  PROVIDERS,
  SettingsSchema,
  suggestRunsIn,
} from "./catalog";

const p = (id: string) => providerById(id)!;

describe("catalog", () => {
  it("has unique ids, https base URLs for hosted providers, and a key link for each", () => {
    const ids = PROVIDERS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of PROVIDERS.filter((x) => x.runsIn === "server" && x.baseURL)) {
      expect(def.baseURL).toMatch(/^https:\/\//);
      expect(def.keyUrl).toMatch(/^https:\/\//);
    }
    expect(PROVIDERS.filter((x) => x.group === "popular").map((x) => x.id)).toEqual(["openai", "anthropic", "google", "openrouter"]);
  });

  it("refuses settings that could change where a call goes", () => {
    expect(SettingsSchema.safeParse({ resourceName: "evil.com/x" }).success).toBe(false);
    expect(SettingsSchema.safeParse({ resourceName: "my-resource" }).success).toBe(true);
    expect(SettingsSchema.safeParse({ region: "us-east-1.evil.com" }).success).toBe(false);
    expect(SettingsSchema.safeParse({ region: "eu-central-1" }).success).toBe(true);
    expect(SettingsSchema.safeParse({ baseURL: "not a url" }).success).toBe(false);
    expect(SettingsSchema.safeParse({ somethingElse: "x" }).success).toBe(false);
  });

  it("keeps only the settings a provider uses", () => {
    expect(cleanSettings(p("openai"), { baseURL: "https://evil.example", organization: " org-1 " })).toEqual({ organization: "org-1" });
    expect(cleanSettings(p("custom"), { baseURL: "https://llm.example.com/v1/", includeUsage: false })).toEqual({ baseURL: "https://llm.example.com/v1", includeUsage: false });
  });

  it("explains what is missing or not allowed", () => {
    expect(draftProblem(p("openai"), "server", {}, null, false)).toBe("API key is required.");
    expect(draftProblem(p("openai"), "server", {}, null, true)).toBeNull();
    expect(draftProblem(p("openai"), "browser", {}, { apiKey: "sk" }, false)).toMatch(/runs on our server/);
    expect(draftProblem(p("custom"), "server", {}, null, false)).toBe("Base URL is required.");
    expect(draftProblem(p("custom"), "server", { baseURL: "http://llm.example.com/v1" }, null, false)).toMatch(/https/);
    expect(draftProblem(p("custom"), "server", { baseURL: "https://192.168.1.4/v1" }, null, false)).toMatch(/cannot reach/);
    expect(draftProblem(p("custom"), "browser", { baseURL: "http://192.168.1.4:8000/v1" }, null, false)).toBeNull();
    expect(draftProblem(p("custom"), "browser", { baseURL: "javascript:alert(1)" }, null, false)).toMatch(/http/);
    expect(draftProblem(p("bedrock"), "server", { region: "us-east-1" }, { accessKeyId: "AKIA" }, false)).toMatch(/access key/);
    expect(draftProblem(p("bedrock"), "server", { region: "us-east-1" }, { accessKeyId: "AKIA", secretAccessKey: "s" }, false)).toBeNull();
    expect(draftProblem(p("ollama"), "browser", { baseURL: "http://localhost:11434/v1" }, null, false)).toBeNull();
  });

  it("decides where a custom model runs from its address", () => {
    for (const u of ["http://localhost:8000/v1", "http://127.0.0.1:1234/v1", "http://192.168.1.20:11434/v1", "http://10.0.0.5/v1", "http://gpu-box.local:8000/v1", "https://gpu.tail1234.ts.net/v1", "http://gpubox:8000/v1", "http://[::1]:8000/v1"]) {
      expect(isLocalAddress(u)).toBe(true);
      expect(suggestRunsIn(p("custom"), u)).toBe("browser");
    }
    expect(suggestRunsIn(p("custom"), "https://llm.example.com/v1")).toBe("server");
    expect(suggestRunsIn(p("ollama"), "https://llm.example.com/v1")).toBe("browser");
  });

  it("binds saved keys to where they may be sent", () => {
    expect(destinationOf("openai", { organization: "a" })).toBe("openai");
    expect(destinationOf("custom", { baseURL: "https://a.example/v1" })).toBe(destinationOf("custom", { baseURL: "https://a.example/other" }));
    expect(destinationOf("custom", { baseURL: "https://a.example/v1" })).not.toBe(destinationOf("custom", { baseURL: "https://b.example/v1" }));
    expect(destinationOf("azure", { resourceName: "one" })).not.toBe(destinationOf("azure", { resourceName: "two" }));
  });

  it("parses extra headers and refuses unsafe ones", () => {
    expect(parseHeaders("X-Team: research\n\nX-Route:eu")).toEqual({ "X-Team": "research", "X-Route": "eu" });
    expect(() => parseHeaders("Host: evil.example")).toThrow(/not allowed/);
    expect(() => parseHeaders("Cookie: a=b")).toThrow(/not allowed/);
    expect(() => parseHeaders("no colon here")).toThrow(/Name: value/);
  });

  it("says which browsers can reach an address", () => {
    const ok = (url: string) => Object.fromEntries(browserReach(url).map((r) => [r.browser, r.ok]));
    expect(ok("http://localhost:11434/v1")).toEqual({ chrome: true, firefox: true, safari: true });
    expect(ok("http://192.168.1.20:11434/v1")).toEqual({ chrome: true, firefox: false, safari: false });
    expect(ok("https://gpu.tail1234.ts.net/v1")).toEqual({ chrome: true, firefox: true, safari: true });
  });

  it("checks labels and model IDs", () => {
    expect(freeLabel("OpenAI", ["openai", "OpenAI 2"])).toBe("OpenAI 3");
    expect(freeLabel("Work", [])).toBe("Work");
    expect(ModelIdSchema.safeParse("anthropic/claude-sonnet-5-5").success).toBe(true);
    expect(ModelIdSchema.safeParse("has space").success).toBe(false);
    expect(ModelIdSchema.safeParse("x".repeat(201)).success).toBe(false);
  });

  it("estimates cost only when price and usage are known", () => {
    expect(costUsd({ input: 3, output: 15 }, 1_000_000, 100_000)).toBeCloseTo(4.5);
    expect(costUsd({ input: null, output: null }, 10, 10)).toBeNull();
    expect(costUsd({ input: 1, output: 1 }, null, 10)).toBeNull();
    expect(costUsd({ input: 0, output: 0 }, 500, 500)).toBe(0);
    expect(formatCost(0.0011)).toBe("$0.0011");
    expect(formatCost(0.37)).toBe("$0.370");
    expect(formatCost(null)).toBe("—");
    expect(formatPrice({ input: 2, output: 10 })).toBe("$2 in · $10 out per 1M");
    expect(formatPrice({ input: 0.075, output: 0.3 })).toBe("$0.075 in · $0.3 out per 1M");
    expect(formatPrice({ input: 0, output: 0 })).toBe("Free to run");
    expect(formatPrice({ input: null, output: 1 })).toBe("No price set");
  });
});

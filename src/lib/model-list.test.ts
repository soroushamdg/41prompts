import { describe, expect, it } from "vitest";
import { nextPageQuery, parseModelList } from "./model-list";

describe("parseModelList", () => {
  it("reads OpenAI-style lists and drops models that cannot chat", () => {
    const json = { data: [{ id: "gpt-6.1-sol" }, { id: "text-embedding-3-large" }, { id: "whisper-1" }, { id: "tts-1" }, { id: "gpt-6.1-sol" }, { id: "bad id" }] };
    expect(parseModelList("openai", json)).toEqual([{ id: "gpt-6.1-sol" }]);
  });

  it("reads OpenRouter's per-token prices as per-million", () => {
    const json = { data: [{ id: "anthropic/claude-sonnet-5-5", name: "Anthropic: Claude Sonnet 5.5", pricing: { prompt: "0.000002", completion: "0.00001" } }] };
    expect(parseModelList("openrouter", json)).toEqual([{ id: "anthropic/claude-sonnet-5-5", name: "Anthropic: Claude Sonnet 5.5", input: 2, output: 10, source: "provider" }]);
  });

  it("reads Anthropic and Google lists, with paging", () => {
    expect(parseModelList("anthropic", { data: [{ id: "claude-opus-5-5", display_name: "Claude Opus 5.5" }] })).toEqual([{ id: "claude-opus-5-5", name: "Claude Opus 5.5" }]);
    expect(nextPageQuery("anthropic", { has_more: true, last_id: "claude-x" })).toBe("after_id=claude-x");
    const google = { models: [{ name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] }], nextPageToken: "abc" };
    expect(parseModelList("google", google)).toEqual([{ id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" }]);
    expect(nextPageQuery("google", google)).toBe("pageToken=abc");
  });

  it("reads local servers' lists", () => {
    expect(parseModelList("ollama", { object: "list", data: [{ id: "llama3.2:latest", object: "model" }, { id: "nomic-embed-text:latest" }] })).toEqual([{ id: "llama3.2:latest" }]);
  });

  it("survives junk", () => {
    expect(parseModelList("custom", null)).toEqual([]);
    expect(parseModelList("custom", { data: "nope" })).toEqual([]);
    expect(parseModelList("together", [{ id: "m", pricing: { input: 0.88, output: 0.88 } }])).toEqual([{ id: "m", input: 0.88, output: 0.88, source: "provider" }]);
  });
});

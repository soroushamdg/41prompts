import { afterEach, describe, expect, it, vi } from "vitest";
import { listModelsInBrowser, runInBrowser, UnreachableError } from "./browser-run";
import type { RunEvent } from "./run-events";

function sse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

const target = { provider: "ollama", baseURL: "http://localhost:11434/v1/", modelId: "llama3.2", includeUsage: true };
const collect = async (it: AsyncGenerator<RunEvent>) => {
  const out: RunEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
};

afterEach(() => vi.unstubAllGlobals());

describe("runInBrowser", () => {
  it("streams deltas and reports usage and cost", async () => {
    const fetch = vi.fn(async () =>
      sse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3}}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetch);
    const events = await collect(runInBrowser(target, "Llama", "Be brief.", "Hi", { input: 0, output: 0 }, new AbortController().signal));
    expect(events.filter((e) => e.t === "delta").map((e) => (e as { text: string }).text).join("")).toBe("Hello");
    expect(events.at(-1)).toMatchObject({ t: "done", inputTokens: 12, outputTokens: 3, cost: 0 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit & { targetAddressSpace?: string }];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init.targetAddressSpace).toBe("loopback");
    expect(init.credentials).toBe("omit");
    const body = JSON.parse(String(init.body));
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.messages[0]).toEqual({ role: "system", content: "Be brief." });
  });

  it("retries without stream_options when the server rejects it, and reports unknown usage as null", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 400 })).mockResolvedValueOnce(sse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n']));
    vi.stubGlobal("fetch", fetch);
    const events = await collect(runInBrowser(target, "Llama", "", "Hi", { input: 1, output: 1 }, new AbortController().signal));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetch.mock.calls[1] as [string, RequestInit])[1].body)).stream_options).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ t: "done", inputTokens: null, outputTokens: null, cost: null });
  });

  it("explains a refused key without echoing secrets, and a network failure as unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"bad token"}', { status: 401 })));
    const events = await collect(runInBrowser({ ...target, apiKey: "lm-secret" }, "LM Studio", "", "Hi", { input: null, output: null }, new AbortController().signal));
    expect(events.at(-1)).toEqual({ t: "error", message: "LM Studio refused the key. Check it in Settings." });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(collect(runInBrowser(target, "Llama", "", "Hi", { input: null, output: null }, new AbortController().signal))).rejects.toBeInstanceOf(UnreachableError);
  });
});

describe("listModelsInBrowser", () => {
  it("lists models and sends the key only as a bearer header", async () => {
    const fetch = vi.fn(async () => Response.json({ data: [{ id: "qwen3-8b" }, { id: "text-embedding-nomic" }] }));
    vi.stubGlobal("fetch", fetch);
    const r = await listModelsInBrowser("lmstudio", "LM Studio", "http://192.168.1.20:1234/v1", "lm-secret");
    expect(r.models).toEqual([{ id: "qwen3-8b" }]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit & { targetAddressSpace?: string }];
    expect(url).toBe("http://192.168.1.20:1234/v1/models");
    expect(init.targetAddressSpace).toBe("local");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer lm-secret");
  });
});

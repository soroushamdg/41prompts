import { checkSummaryContract, heuristicSummariser, HEURISTIC_SUMMARISER_VERSION, summaryInputHash } from "@41prompts/core";
import { SUMMARY_CONTRACT_CASES } from "@41prompts/core/fixtures";
import { describe, expect, it } from "vitest";
import {
  createModelSummariser,
  MODEL_SUMMARISER_VERSION,
  SUMMARY_MODEL,
  type SummaryCache,
  type SummaryModelClient
} from "./model-summariser";

/**
 * The worker's half of the shared contract suite.
 *
 * `SUMMARY_CONTRACT_CASES` and `checkSummaryContract` are the *same* file `packages/core`'s
 * `heuristic.test.ts` imports — one list of cases and one checker, run against both
 * implementations, so the two cannot drift into satisfying different contracts.
 */

/** Answers with a fixed line. Enough to satisfy the contract without a provider. */
const echoClient: SummaryModelClient = {
  complete: async ({ prompt }) => `A model line about ${prompt.length} characters of prompt.`
};

const failingClient: SummaryModelClient = {
  complete: async () => {
    throw new Error("provider returned 503");
  }
};

function memoryCache(): SummaryCache & { readonly writes: string[] } {
  const store = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    get: async (key) => store.get(key),
    set: async (key, text) => {
      writes.push(key);
      store.set(key, text);
    }
  };
}

describe("the model summariser against the shared contract", () => {
  const summariser = createModelSummariser({ client: echoClient });

  it.each(SUMMARY_CONTRACT_CASES.map((c) => ({ name: c.name, testCase: c })))(
    "satisfies the contract on $name",
    async ({ testCase }) => {
      const summary = await summariser.summarise(testCase.blok, testCase.source);
      const version = summary.source === "model" ? MODEL_SUMMARISER_VERSION : HEURISTIC_SUMMARISER_VERSION;
      expect(checkSummaryContract(testCase.blok, testCase.source, summary, version)).toEqual([]);
    }
  );

  it("says source: model when the model answered", async () => {
    const testCase = SUMMARY_CONTRACT_CASES.find((c) => c.name === "an ordinary one-sentence rule")!;
    const summary = await summariser.summarise(testCase.blok, testCase.source);
    expect(summary.source).toBe("model");
  });
});

describe("falling back to the heuristic", () => {
  it("returns a heuristic summary when the model call fails, and says so", async () => {
    // The criterion, with the failure injected. A failed summary must never fail a decompile: the
    // summary is metadata, and taking the whole decompile down with it would trade something
    // cosmetic for the only thing the user actually asked for.
    const fallbacks: unknown[] = [];
    const summariser = createModelSummariser({
      client: failingClient,
      onFallback: (error) => fallbacks.push(error)
    });
    const testCase = SUMMARY_CONTRACT_CASES.find((c) => c.name === "an ordinary one-sentence rule")!;

    const summary = await summariser.summarise(testCase.blok, testCase.source);

    expect(summary.source).toBe("heuristic");
    expect(summary.text).toBe(heuristicSummariser.summarise(testCase.blok, testCase.source).text);
    expect(fallbacks).toHaveLength(1);
    expect((fallbacks[0] as Error).message).toContain("503");
  });

  it("keys a fallback summary to the heuristic's version, so it can never serve as a cached model summary", async () => {
    const summariser = createModelSummariser({ client: failingClient });
    const testCase = SUMMARY_CONTRACT_CASES.find((c) => c.name === "an ordinary one-sentence rule")!;

    const summary = await summariser.summarise(testCase.blok, testCase.source);

    expect(summary.inputHash).toBe(summaryInputHash(testCase.blok, testCase.source, HEURISTIC_SUMMARISER_VERSION));
    expect(summary.inputHash).not.toBe(summaryInputHash(testCase.blok, testCase.source, MODEL_SUMMARISER_VERSION));
  });

  it("falls back rather than returning an empty summary", async () => {
    // An empty answer is a failed answer. A blank card looks like a bug in the blok rather than in
    // the summariser, which sends the reader looking in the wrong place.
    const summariser = createModelSummariser({ client: { complete: async () => "   \n  " } });
    const testCase = SUMMARY_CONTRACT_CASES.find((c) => c.name === "an ordinary one-sentence rule")!;
    const summary = await summariser.summarise(testCase.blok, testCase.source);
    expect(summary.source).toBe("heuristic");
    expect(summary.text.length).toBeGreaterThan(0);
  });

  it("never throws, whatever the client does", async () => {
    for (const client of [
      failingClient,
      { complete: async () => "" },
      { complete: async () => { throw "not even an Error"; } },
      { complete: () => Promise.reject(new Error("rejected")) }
    ] as SummaryModelClient[]) {
      const summariser = createModelSummariser({ client });
      const testCase = SUMMARY_CONTRACT_CASES.find((c) => c.name === "an ordinary one-sentence rule")!;
      await expect(summariser.summarise(testCase.blok, testCase.source)).resolves.toMatchObject({
        source: "heuristic"
      });
    }
  });
});

describe("caching by inputHash", () => {
  const testCase = SUMMARY_CONTRACT_CASES.find((c) => c.name === "an ordinary one-sentence rule")!;

  it("writes under the model version's key and reads it back without calling the model again", async () => {
    const cache = memoryCache();
    let calls = 0;
    const client: SummaryModelClient = {
      complete: async () => {
        calls += 1;
        return "A line from the model.";
      }
    };
    const summariser = createModelSummariser({ client, cache });

    const first = await summariser.summarise(testCase.blok, testCase.source);
    const second = await summariser.summarise(testCase.blok, testCase.source);

    expect(calls).toBe(1);
    expect(second.text).toBe(first.text);
    expect(second.source).toBe("model");
    expect(cache.writes).toEqual([summaryInputHash(testCase.blok, testCase.source, MODEL_SUMMARISER_VERSION)]);
  });

  it("misses when the blok's text changes", async () => {
    const cache = memoryCache();
    let calls = 0;
    const client: SummaryModelClient = {
      complete: async () => {
        calls += 1;
        return `A line, call ${calls}.`;
      }
    };
    const summariser = createModelSummariser({ client, cache });

    await summariser.summarise(testCase.blok, testCase.source);
    await summariser.summarise(testCase.blok, `${testCase.source.slice(0, -1)}!`);

    expect(calls).toBe(2);
  });
});

describe("the pinned model", () => {
  it("is pinned by version rather than a floating alias", () => {
    // `CLAUDE.md` rule 7. `claude-sonnet-5` would silently become a different model under us, and a
    // summary that changes because a provider shipped something new is not reproducible — a cached
    // summary and a fresh one would disagree with no way to tell why.
    expect(SUMMARY_MODEL).toMatch(/-\d{8}$/);
    expect(MODEL_SUMMARISER_VERSION).toContain(SUMMARY_MODEL);
  });

  it("puts the model id in the cache key, so changing model invalidates every cached summary", () => {
    const other = `model@1:claude-haiku-4-5-19700101`;
    expect(summaryInputHash(testCaseBlok(), "x", MODEL_SUMMARISER_VERSION)).not.toBe(
      summaryInputHash(testCaseBlok(), "x", other)
    );
  });

  function testCaseBlok() {
    return SUMMARY_CONTRACT_CASES.find((c) => c.name === "single character")!.blok;
  }
});

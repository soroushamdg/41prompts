import { afterEach, describe, expect, it } from "vitest";
import { handoffSizeForTest, HANDOFF_TTL_MS, put, resetHandoffForTest, take } from "./handoff";

afterEach(() => resetHandoffForTest());

/**
 * The four fixtures the criterion asks for, as the browser actually sends them.
 *
 * A textarea submission is normalised to CRLF by the browser regardless of what the author typed —
 * EPIC-013 learned that the expensive way, two characters at a time. These assert the handoff is
 * transparent: whatever arrives at the Server Action is exactly what `/decompile` receives, because
 * anything this layer "tidies" moves every offset in the source map.
 */
const FIXTURES = {
  crlf: "Rules:\r\n1. Always respond in JSON.\r\n2. Never apologise.\r\n",
  tabs: "Fields:\r\n\tcategory\r\n\t\tone of: billing, technical\r\n\tsummary\r\n",
  emoji: "Reply with 👍 when it worked and 🧑‍🚒 when a human must take over. Family: 👨‍👩‍👧‍👦\r\n",
  rtl: "القاعدة: أجب بصيغة JSON فقط.\r\nMixed ‫عربي‬ and English.\r\n"
} as const;

describe("the prompt survives the handoff byte for byte", () => {
  for (const [name, text] of Object.entries(FIXTURES)) {
    it(`keeps ${name} identical`, () => {
      const back = take(put(text));
      expect(back).toBe(text);
      // Not just equal as a string — the same code units, which is what the source map indexes.
      expect([...(back ?? "")].map((c) => c.codePointAt(0))).toEqual([...text].map((c) => c.codePointAt(0)));
      expect(back).toHaveLength(text.length);
    });
  }

  it("does not normalise CRLF to LF, which would move every offset after line one", () => {
    const back = take(put(FIXTURES.crlf));
    expect(back).toContain("\r\n");
    expect(back?.indexOf("\n")).toBe(FIXTURES.crlf.indexOf("\n"));
  });

  it("carries a prompt at the full input cap", () => {
    const big = "x".repeat(102_400);
    expect(take(put(big))).toHaveLength(102_400);
  });
});

describe("an id is single use", () => {
  it("returns the text once and nothing after that", () => {
    // So a /decompile?start=… in a history list, a bookmark or a shared link is not a working link
    // to somebody else's prompt.
    const id = put("a prompt");
    expect(take(id)).toBe("a prompt");
    expect(take(id)).toBeNull();
  });

  it("returns null for an id nobody issued, rather than throwing", () => {
    expect(take("deadbeef")).toBeNull();
    expect(take("")).toBeNull();
    expect(take(null)).toBeNull();
    expect(take(undefined)).toBeNull();
  });

  it("issues a different id every time", () => {
    const ids = new Set(Array.from({ length: 50 }, () => put("same text")));
    expect(ids.size).toBe(50);
  });
});

describe("nothing lingers", () => {
  it("expires after the TTL", () => {
    const start = 1_000_000;
    const id = put("a prompt", start);
    expect(take(id, start + HANDOFF_TTL_MS - 1)).toBe("a prompt");

    const second = put("another", start);
    expect(take(second, start + HANDOFF_TTL_MS)).toBeNull();
  });

  it("drops expired entries even when nobody comes back for them", () => {
    const start = 1_000_000;
    put("abandoned", start);
    expect(handoffSizeForTest()).toBe(1);

    // Somebody else's paste sweeps it.
    put("later", start + HANDOFF_TTL_MS + 1);
    expect(handoffSizeForTest()).toBe(1);
  });

  it("stays bounded when nobody ever follows the redirect", () => {
    // Each entry can be 100 KB, so an unbounded map is a memory-exhaustion primitive.
    const ids = Array.from({ length: 200 }, () => put("x".repeat(1_000)));
    expect(handoffSizeForTest()).toBe(64);

    // The oldest were dropped, the newest survive: the reader in front of us is the one who matters.
    expect(take(ids[0])).toBeNull();
    expect(take(ids[199])).toBe("x".repeat(1_000));
  });
});

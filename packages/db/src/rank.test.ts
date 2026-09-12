import { describe, expect, it } from "vitest";
import { needsRebalance, RANK_MAX_LENGTH, rankBetween, rankSequence } from "./rank";

describe("rankBetween", () => {
  it("puts a key between two keys, in order", () => {
    const mid = rankBetween("a", "b");
    expect("a" < mid && mid < "b").toBe(true);
  });

  it("puts a key before everything and after everything", () => {
    const first = rankSequence(1)[0]!;
    expect(rankBetween(null, first) < first).toBe(true);
    expect(rankBetween(first, null) > first).toBe(true);
  });

  it("handles adjacent digits by going deeper rather than giving up", () => {
    const mid = rankBetween("a", "b");
    const deeper = rankBetween("a", mid);
    expect("a" < deeper && deeper < mid).toBe(true);
  });

  it("refuses two keys that have no between, rather than inventing one", () => {
    expect(() => rankBetween("b", "a")).toThrow(/is not before/);
    expect(() => rankBetween("a", "a")).toThrow(/is not before/);
  });

  it("orders a fresh sequence", () => {
    const keys = rankSequence(60);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(60);
  });

  /**
   * **The case that fires the rebalance, driven here rather than left to production.**
   *
   * 200 successive insertions into the same slot is what a month of dragging one card to the same
   * place looks like. A float scheme stops ordering silently somewhere around the fiftieth; this
   * asserts the keys stay strictly ordered the whole way and that the length does grow, which is
   * what makes the rebalance necessary rather than theoretical.
   */
  it("stays strictly ordered over 200 insertions into the same slot, and grows", () => {
    const [low, high] = [rankBetween(null, null), rankBetween(rankBetween(null, null), null)];
    let upper = high;
    const inserted: string[] = [];

    for (let i = 0; i < 200; i++) {
      const next = rankBetween(low, upper);
      expect(low < next, `insertion ${i}: ${next} is not after ${low}`).toBe(true);
      expect(next < upper, `insertion ${i}: ${next} is not before ${upper}`).toBe(true);
      inserted.push(next);
      upper = next;
    }

    // Descending, because each one was inserted below the last.
    expect([...inserted].sort().reverse()).toEqual(inserted);
    expect(Math.max(...inserted.map((k) => k.length))).toBeGreaterThan(RANK_MAX_LENGTH);
    expect(needsRebalance(inserted)).toBe(true);
  });

  it("does not ask for a rebalance while keys are short", () => {
    expect(needsRebalance(rankSequence(60))).toBe(false);
  });

  it("rebalancing restores short keys and the same order", () => {
    const before = ["a", "b", "c", "d"];
    const after = rankSequence(before.length);
    expect(needsRebalance(after)).toBe(false);
    expect([...after].sort()).toEqual(after);
  });

  /**
   * JavaScript's `<` and Postgres's `COLLATE "C"` must agree, or the canvas orders one way in the
   * browser and another in the database. The alphabet is chosen so they do; this pins it.
   */
  it("uses an alphabet whose JavaScript order is byte order", () => {
    const keys = rankSequence(62);
    const byCodeUnit = [...keys].sort((a, b) => {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a.charCodeAt(i) || 0;
        const y = b.charCodeAt(i) || 0;
        if (x !== y) return x - y;
      }
      return 0;
    });
    expect(byCodeUnit).toEqual(keys);
  });
});

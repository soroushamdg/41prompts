import { describe, expect, it } from "vitest";
import { inBatches } from "./concurrency";

/** A `work` function that records the greatest number of calls it ever had open at once. */
function counting(delayMs = 5) {
  const state = { inFlight: 0, peak: 0, order: [] as number[] };
  return {
    state,
    async work(item: number, index: number) {
      state.inFlight += 1;
      state.peak = Math.max(state.peak, state.inFlight);
      // A deliberately uneven delay, so completion order differs from index order and a result
      // placed by completion would be visibly wrong.
      await new Promise((resolve) => setTimeout(resolve, index % 2 === 0 ? delayMs : 1));
      state.order.push(index);
      state.inFlight -= 1;
      return item * 10;
    },
  };
}

describe("inBatches", () => {
  it("never has more than `size` in flight", async () => {
    const { state, work } = counting();
    await inBatches([1, 2, 3, 4, 5, 6, 7], 3, work);
    expect(state.peak).toBe(3);
  });

  it("does have more than one in flight, which is the whole point", async () => {
    const { state, work } = counting();
    await inBatches([1, 2, 3, 4], 4, work);
    expect(state.peak).toBeGreaterThan(1);
  });

  it("is sequential at a concurrency of one", async () => {
    const { state, work } = counting();
    await inBatches([1, 2, 3], 1, work);
    expect(state.peak).toBe(1);
  });

  /** The defect this design exists to prevent: a result landing under another input's index. */
  it("places results by index even when they complete out of order", async () => {
    const { state, work } = counting();
    const { results } = await inBatches([1, 2, 3, 4], 4, work);
    expect(results).toEqual([10, 20, 30, 40]);
    // And the completion order really was different, or the assertion above proves nothing.
    expect(state.order).not.toEqual([0, 1, 2, 3]);
  });

  it("stops after the batch in which something said to, keeping everything that ran", async () => {
    const { work } = counting(1);
    const { results, stopped } = await inBatches([1, 2, 3, 4, 5, 6], 2, work, (_r, _i, index) => index === 2);
    expect(stopped).toBe(true);
    // Inputs 0 and 1 in the first batch, 2 and 3 in the batch that stopped. Nothing after.
    expect(results.filter((r) => r !== undefined)).toEqual([10, 20, 30, 40]);
  });

  it("treats a size below one as one rather than looping forever", async () => {
    const { results } = await inBatches([1, 2], 0, async (item) => item);
    expect(results).toEqual([1, 2]);
  });

  it("does nothing with nothing", async () => {
    const { results, stopped } = await inBatches([], 4, async () => 1);
    expect(results).toEqual([]);
    expect(stopped).toBe(false);
  });
});

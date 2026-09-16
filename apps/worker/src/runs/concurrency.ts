/**
 * Run a list of pieces of work with a bound on how many are in flight, in order, stopping when one
 * of them says to.
 *
 * ## Why batches and not a rolling pool
 *
 * A rolling pool finishes sooner. It also makes "stop at the budget cap" ambiguous: a call already
 * in flight when the cap is hit has been paid for, and one not yet started has not, and a pool has
 * no moment at which that distinction is clean. Batches give one — the batch boundary — and
 * `docs/roadmap.md`'s EPIC-031 decision 6 is precisely about keeping what already ran.
 *
 * The cost is the tail of each batch: with four in flight and one slow call, three slots idle until
 * it returns. At a concurrency of 1, 2 or 4 over a hundred inputs that is a small fraction of a
 * gain that was previously zero.
 *
 * ## The index travels with the item
 *
 * Results are placed at their own index rather than pushed in completion order. Nothing downstream
 * may learn that two inputs were run at the same time — `suite_results.input_index` is the number a
 * person reads as "input 17", and it has to keep meaning the seventeenth row of their file.
 */
export async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T, index: number) => Promise<R>,
  stopAfter?: (result: R, item: T, index: number) => boolean,
): Promise<{ readonly results: readonly R[]; readonly stopped: boolean }> {
  const width = Math.max(1, Math.floor(size));
  const results: R[] = [];
  let stopped = false;

  for (let start = 0; start < items.length; start += width) {
    const batch = items.slice(start, start + width);
    const done = await Promise.all(batch.map((item, offset) => work(item, start + offset)));

    // Placed by index, never pushed by completion. See the note above.
    for (const [offset, result] of done.entries()) results[start + offset] = result;

    if (stopAfter !== undefined) {
      for (const [offset, result] of done.entries()) {
        if (stopAfter(result, batch[offset]!, start + offset)) stopped = true;
      }
    }
    if (stopped) break;
  }

  return { results, stopped };
}

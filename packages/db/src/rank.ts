/**
 * Fractional indexing: a short string key that orders bloks and lets one card move in **one row
 * write**.
 *
 * ## Why not an integer, and why not a float
 *
 * EPIC-021a decision 2 rules out array position and "a float that eventually collides", and its
 * criterion is that reordering one card writes exactly one row.
 *
 * - **Integer positions** mean moving a card rewrites every row after it. At 60 bloks that is 59
 *   writes for one drag, and each one is a chance for two clients to disagree.
 * - **Floats** run out of precision after roughly fifty insertions into the same slot — `(a + b) / 2`
 *   converges on `a` — and then stop ordering *silently*, which is the worst available failure.
 * - **A string key ordered lexicographically** can always have another key placed strictly between
 *   two others by appending a digit, so the write is one row, always.
 *
 * ## The alphabet
 *
 * Base 62 in ASCII order: `0-9`, `A-Z`, `a-z`. ASCII order matters because Postgres compares `text`
 * by the database collation, and a collation that treats `a` and `A` as equal would break the
 * ordering this whole scheme rests on — so the comparison is pinned with `COLLATE "C"` at the query
 * site, and this alphabet is chosen so that JavaScript's `<` on the same strings agrees with it.
 * Tested in both directions.
 */

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const FIRST = DIGITS[0]!;
const LAST = DIGITS[DIGITS.length - 1]!;
const MID = DIGITS[Math.floor(DIGITS.length / 2)]!;

/**
 * How long a key may grow before the prompt's ranks are rewritten.
 *
 * Repeatedly inserting into the same slot grows the key by about one character each time, so this is
 * roughly "32 insertions into the same gap". Deliberately small enough that the rebalance **runs in
 * tests and in ordinary use** rather than firing for the first time in production after a month of
 * dragging — a rebalance nobody has run is a rebalance that does not work.
 */
export const RANK_MAX_LENGTH = 32;

/**
 * A key strictly between `before` and `after`, either of which may be absent for "at the start" or
 * "at the end".
 *
 * Throws when the two are equal or out of order: that is a caller bug, and inventing a key between
 * two keys that have no between would put two bloks in an order the database cannot reproduce.
 */
export function rankBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`rankBetween: ${JSON.stringify(before)} is not before ${JSON.stringify(after)}`);
  }
  if (before === null && after === null) return MID;
  if (before === null) return rankBefore(after!);
  if (after === null) return rankAfter(before);

  let prefix = "";
  for (let i = 0; ; i++) {
    const lo = before[i] ?? FIRST;
    const hi = after[i] ?? undefined;

    if (hi !== undefined && lo === hi) {
      prefix += lo;
      continue;
    }

    const loIndex = DIGITS.indexOf(lo);
    const hiIndex = hi === undefined ? DIGITS.length : DIGITS.indexOf(hi);

    // Room for a digit strictly between them: take the middle and stop.
    if (hiIndex - loIndex > 1) {
      return prefix + DIGITS[Math.floor((loIndex + hiIndex) / 2)]!;
    }

    // Adjacent digits, so the answer has to be longer than `before`: keep `before`'s digit and
    // carry on past it, which lands somewhere after `before` and still before `after`.
    prefix += lo;
    // Past the end of `before`, everything after the shared prefix is free.
    if (i >= before.length) return prefix + MID;
  }
}

/** A key before every existing one. */
function rankBefore(after: string): string {
  const head = DIGITS.indexOf(after[0]!);
  if (head > 0) return DIGITS[Math.floor(head / 2)]!;
  // `after` starts at the lowest digit, so go deeper rather than lower.
  return FIRST + rankBefore(after.slice(1) === "" ? LAST : after.slice(1));
}

/** A key after every existing one. */
function rankAfter(before: string): string {
  const head = DIGITS.indexOf(before[0]!);
  if (before.length === 1 && head < DIGITS.length - 1) {
    return DIGITS[Math.floor((head + DIGITS.length) / 2)]!;
  }
  if (head < DIGITS.length - 1) return DIGITS[head + 1]!;
  return before[0]! + rankAfter(before.slice(1) === "" ? FIRST : before.slice(1));
}

/** `n` evenly spread keys, for seeding a prompt or for the rebalance below. */
export function rankSequence(n: number): string[] {
  const keys: string[] = [];
  let previous: string | null = null;
  for (let i = 0; i < n; i++) {
    previous = rankBetween(previous, null);
    keys.push(previous);
  }
  return keys;
}

/**
 * Whether this set of keys has grown long enough to be rewritten.
 *
 * **The rebalance is the only operation in the canvas that touches more than one row**, which is why
 * it is a named, tested decision rather than something that happens quietly. It is O(bloks), it runs
 * in one transaction, and at 60 bloks it is one statement.
 */
export function needsRebalance(ranks: readonly string[]): boolean {
  return ranks.some((rank) => rank.length > RANK_MAX_LENGTH);
}

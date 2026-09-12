import { and, gte, lt, sql } from "drizzle-orm";
import type { Db } from "./client";
import { decompileRuns, decompiles, waitlist } from "./schema";

/**
 * M1's criterion, read straight from our own database.
 *
 * *"300 unique decompiles in the first 30 days without announcement; ≥15% share or waitlist rate."*
 *
 * One function rather than three queries pasted into a report, because the number that decides GATE 1
 * should be derived the same way every time it is read — including the denominator, which is the part
 * an ad hoc query gets wrong. **"Unique" means a distinct address hash**, so a row with no hash counts
 * toward `runs` and not toward `uniqueCallers`; that is a floor, and `m1-window.md` says so.
 */
export interface M1Reading {
  /** Distinct address hashes that ran a decompile in the window. This is the "300". */
  readonly uniqueCallers: number;
  /** Every run, including repeats and callers whose address was unknown. */
  readonly runs: number;
  /** Distinct callers who created a permalink. */
  readonly sharers: number;
  /** Waitlist rows created in the window. Not caller-keyed — the waitlist stores no hash. */
  readonly waitlistJoins: number;
  /** `sharers / uniqueCallers`, or 0 when nobody has run one yet. This is the "≥15%". */
  readonly shareRate: number;
}

export async function readM1(db: Db, from: Date, to: Date): Promise<M1Reading> {
  const inWindow = (column: Parameters<typeof gte>[0]) => and(gte(column, from), lt(column, to));

  const [runRow] = await db
    .select({
      runs: sql<number>`count(*)::int`,
      uniqueCallers: sql<number>`count(distinct ${decompileRuns.ipHash})::int`
    })
    .from(decompileRuns)
    .where(inWindow(decompileRuns.createdAt));

  const [shareRow] = await db
    .select({ sharers: sql<number>`count(distinct ${decompiles.ipHash})::int` })
    .from(decompiles)
    .where(inWindow(decompiles.createdAt));

  const [waitlistRow] = await db
    .select({ joins: sql<number>`count(*)::int` })
    .from(waitlist)
    .where(inWindow(waitlist.createdAt));

  const uniqueCallers = runRow?.uniqueCallers ?? 0;
  const sharers = shareRow?.sharers ?? 0;
  const waitlistJoins = waitlistRow?.joins ?? 0;

  return {
    uniqueCallers,
    runs: runRow?.runs ?? 0,
    sharers,
    waitlistJoins,
    // Deliberately not `(sharers + waitlistJoins) / uniqueCallers`: the waitlist is not caller-keyed,
    // so adding it to a caller-keyed numerator would compare two different things and could exceed
    // 1. The report reads both numbers; the rate is the one the criterion can actually defend.
    shareRate: uniqueCallers === 0 ? 0 : sharers / uniqueCallers
  };
}

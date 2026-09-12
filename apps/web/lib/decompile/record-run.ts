import { decompileRuns } from "@41prompts/db";
import { getDb } from "@/lib/db";

/**
 * One row per decompile that ran. **This is M1's measurement**, and it is the number GATE 1 reads.
 *
 * It replaced a PostHog funnel on 2026-09-12. Counting anonymous EU and Québec visitors by default,
 * with a cookie and a stable id, through a processor outside Canada, is not defensible under GDPR or
 * Law 25 — and a consent banner would not have fixed it, because the resulting number would measure
 * who accepts banners rather than whether the wedge works.
 *
 * So: no cookie, no third party, nothing leaving Montréal, no address, no prompt text. The key is the
 * keyed hash `decompiles` already stores, and the only other things kept are two integers about the
 * shape of the result — which EPIC-084 needs for the blok-count distribution and which say nothing
 * about what was in the prompt.
 *
 * **Never throws.** A measurement that can break a decompile is worse than a measurement with a gap.
 */
export async function recordRun(row: {
  readonly ipHash: string | null;
  readonly bloks: number;
  readonly findings: number;
}): Promise<void> {
  try {
    await getDb().insert(decompileRuns).values(row);
  } catch (error) {
    // Deliberately not silent: a gap in the count needs to be visible in the logs, or a database
    // problem would show up at GATE 1 as a low number rather than as an incident.
    console.error("[m1] failed to record a decompile run", error);
  }
}

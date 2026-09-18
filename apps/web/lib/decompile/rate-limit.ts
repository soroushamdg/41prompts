/**
 * Rate limits for the public decompiler.
 *
 * **The mechanism moved to `apps/web/lib/rate-limit.ts` in EPIC-057** and is re-exported here, so
 * the three call sites in this feature did not move with it. That file carries the reasoning about
 * why the store is in-memory and what that costs now that `/v1` depends on it too; this one is the
 * three numbers and why each is what it is.
 */

export { checkLimit, resetLimitsForTest, type Limit, type LimitVerdict } from "@/lib/rate-limit";

/**
 * Decompiling: deliberately generous, because of what it actually costs.
 *
 * A decompile is local CPU bounded by the 100 KB cap — no provider call, no row written, nothing
 * that costs money. The thing that costs money is the *model* summariser, which has its own per-caller
 * budget in the worker, and the thing that costs storage is a permalink, limited separately below.
 *
 * Set at 30 first, and the test suite found the problem with that: an evaluator paying real attention
 * pastes more than thirty prompts in an hour, and that person is exactly the ICP. Refusing them to
 * protect CPU we are not short of would be the funnel dying for nothing. Two a minute sustained is far
 * past any human and still bounds a script.
 */
export const DECOMPILE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000, name: "120 decompiles an hour" } as const;

/** Creating a permalink: tighter, because it writes a row that lives for thirty days. */
export const SHARE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000, name: "20 shared links an hour" } as const;

/** The waitlist: one person does not need many attempts. */
export const WAITLIST_LIMIT = { max: 5, windowMs: 60 * 60 * 1000, name: "5 waitlist attempts an hour" } as const;

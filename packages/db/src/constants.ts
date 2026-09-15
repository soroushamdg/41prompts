// A soft-deleted user's row is purged this many days after `users.deletedAt` is set.
// Product promise (EPIC-002 decision 5): the window itself, not just its enforcement,
// must never be a bare literal in the code that checks it.
export const ACCOUNT_PURGE_WINDOW_DAYS = 30;

/**
 * An anonymous decompile is hard-purged this many days after it was created.
 *
 * The number the page promises before anyone shares a link (EPIC-014 decision 3), so it must never be
 * a bare literal in the job that enforces it. A soft delete is explicitly not enough here: the row
 * goes, because "we still have it but marked it deleted" is not what the sentence on the page says.
 */
export const DECOMPILE_RETENTION_DAYS = 30;


/**
 * A counted run is kept this many days.
 *
 * Longer than `DECOMPILE_RETENTION_DAYS` because this is the measurement rather than the content:
 * M1's window closes at thirty days and EPIC-084 reads the same rows afterwards, so purging at
 * thirty would delete the evidence on the day it is needed. Six months is enough for both and is
 * still a promise that nothing here is kept forever.
 *
 * The row holds no prompt text — a keyed hash, two integers and a timestamp.
 */
export const RUN_COUNT_RETENTION_DAYS = 180;

/**
 * A run's raw provider payload is kept this many days.
 *
 * **The number the privacy page promises** (EPIC-017's retention table), so it must never be a bare
 * literal in the job that enforces it — the same rule the three constants above live under, and the
 * mechanism that stops the page and the code drifting apart.
 *
 * 365 rather than "12 months" because a purge does arithmetic in days and months are not a unit it
 * can use. The page may say either; the enforcement says this.
 *
 * **This is the privacy-sensitive column in the whole run record.** The payload is whatever a model
 * said about whatever a user put in, which is the one thing in a run that cannot be predicted, and
 * the clock on it is why `runs.purgeAfter` is a stored column rather than a policy somebody
 * remembers.
 */
export const RUN_PAYLOAD_RETENTION_DAYS = 365;

// ── EPIC-032: the contract between `apps/web` and `apps/worker` ───────────────────────────────
//
// Three values both processes must agree on, in the one package they both already depend on.
// Neither app may import the other, so the alternative was a literal written out twice — and a
// copy goes stale **silently**, which is the whole argument `apps/web/e2e/env.mjs` records one
// level down. A queue name that drifts is a trigger that enqueues into nothing: the run sits
// `queued` for ever and the page shows a spinner that never ends.

/** The pg-boss queue a triggered run is sent on. The web sends; the worker works. */
export const RUN_SUITE_QUEUE = "run-suite";

/**
 * The one model a run uses (EPIC-032: one provider, pinned; the matrix is EPIC-042).
 *
 * **A pinned id, never a floating alias** — `CLAUDE.md` rule 7 for grading, and the same reasoning
 * for anything whose cost is charged to somebody. `apps/worker`'s price table must carry a row for
 * it, and a test there asserts exactly that, because a model absent from the table does not run.
 */
export const DEFAULT_RUN_MODEL = "claude-sonnet-5";

/**
 * What is sent with every run, stored on the row as `params` (rule 6: as sent, not as configured).
 *
 * `temperature: 0` because a run that cannot be reproduced cannot be a test. The output cap is
 * modest on purpose: it bounds one answer, while the reservation still covers the model's worst
 * case, so a cap here can never make the budget under-count.
 */
export const RUN_PARAMS: Readonly<Record<string, unknown>> = { temperature: 0, maxOutputTokens: 1024 };

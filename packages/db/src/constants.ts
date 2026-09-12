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

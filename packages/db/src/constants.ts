// A soft-deleted user's row is purged this many days after `users.deletedAt` is set.
// Product promise (EPIC-002 decision 5): the window itself, not just its enforcement,
// must never be a bare literal in the code that checks it.
export const ACCOUNT_PURGE_WINDOW_DAYS = 30;

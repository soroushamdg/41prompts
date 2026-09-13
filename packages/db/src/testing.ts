/**
 * The one place "this test needs a database" is expressed.
 *
 * ## Why this exists
 *
 * Five test files across three packages need Postgres. Each of them used to `throw` in `beforeAll`
 * when `DATABASE_URL` was unset, which made "no database here" indistinguishable from "this code is
 * broken" — and, because `turbo run test` stopped at the first failing package, it also meant every
 * package scheduled after the first database-dependent one **never ran at all** while the summary
 * line said "5 successful, 8 total". A local pass reported that the first few packages passed. That
 * is not what anyone reading it believed, and local passes were used as CI's substitute for two days
 * during the Actions billing block.
 *
 * So: a test that needs a database **skips**, loudly, naming itself and the reason — and
 * `scripts/gates.mjs` starts a throwaway Postgres before the run so that the normal case is that
 * nothing skips at all.
 */

/** Whether a database is configured for this run. */
export const HAS_TEST_DATABASE =
  typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0;

/**
 * The URL, for use inside a suite that has already been skipped when there is none.
 *
 * Throws rather than returning `undefined` so a suite that forgets `skipIf` fails immediately and
 * obviously instead of connecting to whatever `undefined` resolves to.
 */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error(
      "testDatabaseUrl() was called without DATABASE_URL. Guard the suite with `describe.skipIf(!HAS_TEST_DATABASE)`."
    );
  }
  return url;
}

/**
 * Say out loud that a suite is being skipped and why.
 *
 * Printed at module load, before vitest's own reporter, so it appears even when the run is quiet.
 * A silent skip is the failure this whole file is fixing.
 */
export function announceDatabaseSkip(suite: string): void {
  if (HAS_TEST_DATABASE) return;
  console.warn(
    `\n  SKIPPED — ${suite} needs a database and DATABASE_URL is unset.` +
      `\n  Run \`pnpm test\` from the repository root: it starts a throwaway Postgres for the run.\n`
  );
}

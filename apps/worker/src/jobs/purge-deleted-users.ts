import { ACCOUNT_PURGE_WINDOW_DAYS, users, type Db } from "@41prompts/db";
import { lt } from "drizzle-orm";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

// FK cascades (users -> sessions/accounts/projects, projects -> api_keys, all ON DELETE
// CASCADE) do the rest of the row's cleanup — one statement here reaches every table decision
// 5 names. `lt` against a nullable column already excludes untouched (deletedAt IS NULL)
// rows, since SQL's `NULL < x` is neither true nor false. `now` is injected so the clock can
// move in a test without faking global timers.
export async function purgeDeletedUsers(db: Db, now: () => Date = () => new Date()): Promise<number> {
  const cutoff = new Date(now().getTime() - ACCOUNT_PURGE_WINDOW_DAYS * DAY_IN_MS);
  const deleted = await db.delete(users).where(lt(users.deletedAt, cutoff)).returning({ id: users.id });
  return deleted.length;
}

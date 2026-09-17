import { createApiKey, prompts, users, verifications } from "@41prompts/db";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "./db";

/**
 * The database reach publishing needs — used by `publish.spec.ts` **and** by
 * `scripts/drive-epic-051.mts`.
 *
 * ## Why the drive imports it from here
 *
 * `scripts/` is not a workspace package, so the repository root cannot resolve `@41prompts/db` or
 * `drizzle-orm` by name — a module in `scripts/` that imports either by name fails at resolution.
 * A module inside `apps/web` resolves both. The root may reach into a package and a package may not
 * reach out (`apps/web/e2e/env.mjs` records that asymmetry and why `turbo boundaries` enforces it),
 * so this is the direction that works and the one already used.
 *
 * ## Minting a key here is not a shortcut around the product's own UI
 *
 * `docs/AUTONOMOUS.md` says to build a drive's data by clicking, and everything else in both the
 * spec and the drive does. There is no Settings → API keys tab to click — it is EPIC-055's task
 * line, verbatim — so there is nothing to click yet, and the report says which step was not driven
 * through the product.
 */
export { createApiKey, prompts, eq, db };

/**
 * `delete from users where email like 'claude-drive-%@example.com'` — the drive's cleanup.
 *
 * Standing permission, granted 2026-09-14, narrowed to exactly this statement. Two independent
 * guards make the blast radius a set that cannot contain a real account: the `claude-drive-` prefix
 * is ours and appears nowhere else, and `example.com` is reserved by RFC 2606 so no deliverable
 * address can ever match. Deleting the user is enough — projects, prompts, bloks, versions and the
 * publish log all cascade.
 *
 * Idempotent, and deleting nothing is a normal outcome: it runs at the start of a drive as well as
 * at the end, so a drive whose browser died is self-healing rather than something the next run has
 * to notice.
 */
export async function deleteDriveUsers(): Promise<number> {
  const removed = await db
    .delete(users)
    .where(sql`${users.email} like 'claude-drive-%@example.com'`)
    .returning({ id: users.id });
  return removed.length;
}

/** The magic-link token for an address, straight from the table `apps/web/e2e/db.ts` already reads. */
export async function magicLinkTokenFor(email: string): Promise<string | undefined> {
  const [row] = await db
    .select({ identifier: verifications.identifier })
    .from(verifications)
    .where(sql`(${verifications.value}::jsonb ->> 'email') = ${email}`)
    .orderBy(desc(verifications.createdAt))
    .limit(1);
  return row?.identifier;
}

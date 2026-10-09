import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { user } from "@/db/schema";
import type { Plan } from "@/lib/plans";

/** The plan as Stripe webhooks last set it. Read from the database, never a cached session. */
export async function planFor(db: Db, userId: string): Promise<Plan> {
  const [row] = await db.select({ plan: user.plan }).from(user).where(eq(user.id, userId));
  return row?.plan ?? "free";
}

export class PerformanceRequired extends Error {
  constructor() {
    super("This needs the Performance plan.");
  }
}

/** Server-side gate for every Performance capability. The UI lock is only a hint. */
export async function requirePerformance(db: Db, userId: string): Promise<void> {
  if ((await planFor(db, userId)) !== "performance") throw new PerformanceRequired();
}

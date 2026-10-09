import { lt } from "drizzle-orm";
import { db } from "@/db";
import { verification } from "@/db/schema";
import { purgeDeleted } from "@/server/prompts";

export const dynamic = "force-dynamic";

/* Daily (vercel.json): prompts deleted more than 24 hours ago are removed for
   good, with every version; expired sign-in tokens are cleared. Vercel Cron
   sends CRON_SECRET as a bearer token. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const prompts = await purgeDeleted(db, new Date(Date.now() - 24 * 60 * 60 * 1000));
  const tokens = await db.delete(verification).where(lt(verification.expiresAt, new Date())).returning({ id: verification.id });
  return Response.json({ ok: true, prompts, tokens: tokens.length });
}

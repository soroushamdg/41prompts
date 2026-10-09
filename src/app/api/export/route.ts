import { db } from "@/db";
import { exportPage } from "@/server/account";
import { currentUserId } from "@/server/session";

export const dynamic = "force-dynamic";

/** One page of the user's library with every version, for the .zip export. */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Your session ended. Sign in again." }, { status: 401 });
  const offset = Math.max(0, Number(new URL(req.url).searchParams.get("offset") ?? 0) || 0);
  return Response.json(await exportPage(db, userId, offset), { headers: { "cache-control": "no-store" } });
}

import { db } from "@/db";
import { currentUserId } from "@/server/session";
import { SaveSchema, saveVersion } from "@/server/versions";

export const dynamic = "force-dynamic";

/* Autosave endpoint. A route handler rather than a server action so the
   editor can flush with fetch(keepalive) when the tab is closing. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Your session ended. Sign in again." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "That save was not valid." }, { status: 400 });
  const result = await saveVersion(db, userId, id, parsed.data);
  if (!result) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(result);
}

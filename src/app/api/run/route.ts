import { streamText } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { MAX_PROMPT_CHARS } from "@/lib/bloks";
import { costUsd, providerName } from "@/lib/catalog";
import type { RunEvent } from "@/lib/run-events";
import { getConnection, readSecret } from "@/server/connections";
import { languageModelFor, providerErrorMessage } from "@/server/providers";
import { currentUserId } from "@/server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  connectionId: z.string().uuid(),
  system: z.string().max(MAX_PROMPT_CHARS + 20_000),
  message: z.string().min(1).max(20_000),
});

/* Run once (M06) on one of the user's server-run models, streamed as NDJSON
   so errors arrive as events rather than as a silently empty reply. Models
   on the user's own machine never come here; the browser runs them. Nothing
   about the run is stored or logged. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Your session ended. Sign in again." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Write a test message to run." }, { status: 400 });
  const { connectionId, system, message } = parsed.data;
  const row = await getConnection(db, userId, connectionId);
  if (!row) return Response.json({ error: "That model was removed. Pick another one or add it again in Settings.", code: "no_model" }, { status: 404 });
  if (row.runsIn !== "server") return Response.json({ error: "This model runs in your browser." }, { status: 409 });
  // A custom endpoint goes by the user's own label in messages.
  const name = row.provider === "custom" ? row.label : providerName(row.provider);
  let secret;
  try {
    secret = readSecret(userId, row);
  } catch {
    return Response.json({ error: `The saved key for ${row.label} could not be opened. Replace it in Settings.`, code: "no_key" }, { status: 409 });
  }

  const enc = new TextEncoder();
  const t0 = performance.now();
  const prices = { input: row.inputPerMtok, output: row.outputPerMtok };
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: RunEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      send({ t: "start", model: row.modelId });
      try {
        const result = streamText({
          model: await languageModelFor(row, secret),
          system: system.trim() || undefined,
          prompt: message,
          maxOutputTokens: 2048,
          abortSignal: req.signal,
          maxRetries: 1,
          onError: () => {},
        });
        let failed = false;
        for await (const part of result.stream) {
          if (part.type === "text-delta") send({ t: "delta", text: part.text });
          else if (part.type === "error") {
            failed = true;
            send({ t: "error", message: providerErrorMessage(name, part.error) });
          } else if (part.type === "finish" && !failed) {
            const input = part.totalUsage.inputTokens ?? null;
            const output = part.totalUsage.outputTokens ?? null;
            send({ t: "done", inputTokens: input, outputTokens: output, ms: Math.round(performance.now() - t0), cost: costUsd(prices, input, output) });
          }
        }
      } catch (error) {
        if (!req.signal.aborted) send({ t: "error", message: providerErrorMessage(name, error) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

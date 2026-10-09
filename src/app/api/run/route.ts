import { streamText } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { PROVIDERS } from "@/db/schema";
import { MAX_PROMPT_CHARS } from "@/lib/bloks";
import { costUsd, findModel } from "@/lib/models";
import { PROVIDER_LABEL } from "@/lib/providers";
import { readKey } from "@/server/keys";
import { languageModel, runErrorMessage } from "@/server/run";
import { currentUserId } from "@/server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  provider: z.enum(PROVIDERS),
  model: z.string().max(100),
  system: z.string().max(MAX_PROMPT_CHARS + 20_000),
  message: z.string().min(1).max(20_000),
});

export type RunEvent =
  | { t: "start"; model: string }
  | { t: "delta"; text: string }
  | { t: "done"; inputTokens: number; outputTokens: number; ms: number; cost: number | null }
  | { t: "error"; message: string };

/* Run once (M06), streamed as NDJSON so errors arrive as events rather than
   as a silently empty reply. Nothing about the run is stored or logged. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Your session ended. Sign in again." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Write a test message to run." }, { status: 400 });
  const { provider, model, system, message } = parsed.data;
  if (!findModel(provider, model)) return Response.json({ error: "That model is not in the list." }, { status: 400 });
  const apiKey = await readKey(db, userId, provider);
  if (!apiKey) return Response.json({ error: `Add a ${PROVIDER_LABEL[provider]} key in Settings to run on this model.`, code: "no_key" }, { status: 409 });

  const enc = new TextEncoder();
  const t0 = performance.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: RunEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      send({ t: "start", model });
      try {
        const result = streamText({
          model: await languageModel(provider, model, apiKey),
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
            send({ t: "error", message: runErrorMessage(provider, part.error) });
          } else if (part.type === "finish" && !failed) {
            const input = part.totalUsage.inputTokens ?? 0;
            const output = part.totalUsage.outputTokens ?? 0;
            send({ t: "done", inputTokens: input, outputTokens: output, ms: Math.round(performance.now() - t0), cost: costUsd(provider, model, input, output) });
          }
        }
      } catch (error) {
        if (!req.signal.aborted) send({ t: "error", message: runErrorMessage(provider, error) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

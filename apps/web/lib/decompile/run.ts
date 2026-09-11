import { cluster, detect, heuristicSummariser, segment, uncheckedRuleCount } from "@41prompts/core";
import { clientAddress, hashIdentity } from "@41prompts/db";
import { headers } from "next/headers";
import { captureVisitorEvent } from "@/lib/analytics/visitor";
import { byteLength, MAX_INPUT_BYTES, type DecompileState } from "./limits";
import { checkLimit, DECOMPILE_LIMIT } from "./rate-limit";
import { buildView } from "./view-model";

/**
 * The whole pipeline, on the server, called from two places.
 *
 * It lives here rather than inside `app/decompile/actions.ts` because EPIC-016's ask bar means the
 * page itself can arrive with a prompt already in hand (a landing-page handoff) and has to render a
 * result on first paint. **Two entry points, one path** — a page that re-derived the pipeline would
 * be a second implementation to keep honest, including the size cap and the rate limit.
 *
 * Epic decision 1: the client ships no algorithm and a slow phone is not punished. Everything
 * expensive happens here and what crosses to the browser is plain data. `packages/core` is imported
 * and never reimplemented; this file is a call sequence, not a copy.
 */
export async function runDecompile(source: string): Promise<DecompileState> {
  // Measured before anything else runs. A prompt over the cap must never reach the segmenter, or the
  // cap is a suggestion rather than a limit.
  const bytes = byteLength(source);
  if (bytes > MAX_INPUT_BYTES) return { status: "too-long", bytes };

  // Rate-limited per caller (EPIC-014 decision 5), and checked *after* the size cap so an oversized
  // paste is refused on the honest reason rather than quietly consuming somebody's allowance. The
  // bucket is a hash, never an address.
  const limit = checkLimit(hashIdentity(clientAddress(await headers())), DECOMPILE_LIMIT);
  if (!limit.allowed) {
    return { status: "rate-limited", message: limit.message ?? "That is the limit for now." };
  }

  // Empty and whitespace-only are the same calm state, not an error (EPIC-013 decision 7). Somebody
  // who pressed the button before pasting has not done anything wrong.
  if (source.trim().length === 0) return { status: "empty" };

  const bloks = cluster(segment(source));
  const findings = detect(bloks, source);
  const summaries = new Map(
    bloks.map((blok) => {
      const summary = heuristicSummariser.summarise(blok, source);
      return [blok.id, { text: summary.text, source: summary.source }] as const;
    })
  );

  // EPIC-015: counted here rather than in the action, so the landing page's handoff — which reaches
  // the pipeline without a form submission — is counted too. Deliberately **not** on the empty,
  // too-long or rate-limited paths: somebody pressing the button on an empty box has not run
  // anything, and inflating the denominator would flatter the funnel.
  void captureVisitorEvent("decompile_run", { bloks: bloks.length, findings: findings.length });

  return {
    status: "ok",
    source,
    view: buildView({
      source,
      bloks,
      findings,
      summaries,
      uncheckedRuleTotal: uncheckedRuleCount(bloks, source, findings)
    })
  };
}

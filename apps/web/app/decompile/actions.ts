"use server";

import { cluster, detect, heuristicSummariser, segment, uncheckedRuleCount } from "@41prompts/core";
import { byteLength, MAX_INPUT_BYTES, type DecompileState } from "@/lib/decompile/limits";
import { buildView } from "@/lib/decompile/view-model";

/**
 * The whole pipeline, on the server.
 *
 * Epic decision 1: the client ships no algorithm and a slow phone is not punished. Everything
 * expensive — segmentation, clustering, detection, summarising — happens here, and what crosses to
 * the browser is plain data the view renders. Epic decision 10: `packages/core` is imported and
 * never reimplemented; this file is a call sequence, not a copy.
 *
 * Epic decision 9: no persistence, no permalink, no rate limit, no analytics beyond a page view.
 * Nothing here writes anything down. EPIC-014 adds capture, purge, rate limits and abuse checks;
 * building any of it now would be building it twice.
 *
 * **Nothing but async functions may be exported from this file.** Next 16 rejects a `"use server"`
 * module that exports a constant or a type, and it does so at request time with a 500 rather than at
 * typecheck — which is why the cap, the state type and the copy all live in `lib/decompile/limits`.
 */
export async function decompile(_previous: DecompileState, formData: FormData): Promise<DecompileState> {
  const raw = formData.get("prompt");
  const source = typeof raw === "string" ? raw : "";

  // Measured before anything else runs. A prompt over the cap must never reach the segmenter, or the
  // cap is a suggestion rather than a limit.
  const bytes = byteLength(source);
  if (bytes > MAX_INPUT_BYTES) return { status: "too-long", bytes };

  // Empty and whitespace-only are the same calm state, not an error (epic decision 7). Somebody who
  // pressed the button before pasting has not done anything wrong.
  if (source.trim().length === 0) return { status: "empty" };

  const bloks = cluster(segment(source));
  const findings = detect(bloks, source);
  const summaries = new Map(
    bloks.map((blok) => {
      const summary = heuristicSummariser.summarise(blok, source);
      return [blok.id, { text: summary.text, source: summary.source }] as const;
    })
  );

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

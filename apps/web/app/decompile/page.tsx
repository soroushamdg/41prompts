import type { Metadata } from "next";
import { INITIAL_STATE } from "@/lib/decompile/limits";
import { runDecompile } from "@/lib/decompile/run";
import { turnstileSiteKey } from "@/lib/decompile/turnstile";
import { take } from "@/lib/landing/handoff";
import { DecompileView } from "./decompile-view";

export const metadata: Metadata = {
  title: "Decompile a prompt · 41Prompts",
  description:
    "Paste a prompt and get it back as named bloks, mapped to the exact text they came from, with what is worth knowing about it listed underneath. No account, nothing stored."
};

/**
 * `/decompile` — public, no auth, no signup wall (EPIC-013 decision 1).
 *
 * The page itself is a Server Component: the shell renders on the server, and the pipeline runs
 * there too. What reaches the browser is plain data plus the interaction that links a blok to its
 * ranges.
 *
 * **`?start=` is the landing page's ask bar arriving** (EPIC-016). The id is opaque and single use;
 * the prompt itself never travels in the URL. Taking it here rather than in an effect is the whole
 * point — the reader who pasted on the home page sees their result on first paint, with no spinner
 * and no second submit.
 */
export default async function DecompilePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const start = typeof params.start === "string" ? params.start : undefined;
  const handed = take(start);

  // A `start` that missed — used already, expired after its minute, or served by a container that
  // never saw it. Not an error state: the box is right there.
  const missed = start !== undefined && handed === null;
  const initialState = handed === null ? INITIAL_STATE : await runDecompile(handed);

  return (
    <main className="decompile" id="main">
      <header className="decompile-head">
        <h1>See what is actually in your prompt.</h1>
        <p>
          Paste it. It comes back as named bloks, each mapped to the exact text it came from, with
          anything worth knowing about it underneath. No account, and nothing is stored.
        </p>
      </header>
      {missed && (
        <p className="decompile-notice" role="status">
          That link had already been used. Paste the prompt again and it will run straight away.
        </p>
      )}
      <DecompileView turnstileSiteKey={turnstileSiteKey()} initialState={initialState} />
    </main>
  );
}

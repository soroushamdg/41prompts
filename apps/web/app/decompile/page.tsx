import type { Metadata } from "next";
import { turnstileSiteKey } from "@/lib/decompile/turnstile";
import { DecompileView } from "./decompile-view";

export const metadata: Metadata = {
  title: "Decompile a prompt · 41Prompts",
  description:
    "Paste a prompt and get it back as named bloks, mapped to the exact text they came from, with what is worth knowing about it listed underneath. No account, nothing stored."
};

/**
 * `/decompile` — public, no auth, no signup wall (epic decision 1).
 *
 * The page itself is a Server Component: the shell renders on the server, and the pipeline runs
 * there too (`actions.ts`). What reaches the browser is plain data plus the interaction that links
 * a blok to its ranges.
 */
export default function DecompilePage() {
  return (
    <main className="decompile" id="main">
      <header className="decompile-head">
        <h1>See what is actually in your prompt.</h1>
        <p>
          Paste it. It comes back as named bloks, each mapped to the exact text it came from, with
          anything worth knowing about it underneath. No account, and nothing is stored.
        </p>
      </header>
      <DecompileView turnstileSiteKey={turnstileSiteKey()} />
    </main>
  );
}

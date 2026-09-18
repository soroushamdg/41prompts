import type { Metadata } from "next";
import { claim } from "@/lib/site/claims";
import { AskChip, AskChipRow } from "../ask-chip";
import { GridItem, SitePage } from "../site-page";

export const metadata: Metadata = {
  title: "Features · 41Prompts",
  description:
    "A prompt as typed bloks, compiled per blok, checked by deterministic checks and a pinned judge, with every failure attributed to the blok that caused it.",
  alternates: { canonical: "/features" }
};

/**
 * What the product does, twelve items, each one a sentence from `lib/site/claims.ts`.
 *
 * The mockup's own twelve are the shape of this page and not its content. Three of them — a
 * "Defragment" tool, "Manual override", "CI export" — name things that either do not exist or have
 * been renamed by ADR-003, and one of them ("Assertions") is a word this repository does not use.
 * `site-claims.test.ts` is what stops a future edit putting any of them back.
 */
export default function FeaturesPage() {
  return (
    <SitePage
      current="features"
      eyebrow="Features"
      heading="Everything in the prompt layer, in one place."
      // **No count in this sentence, deliberately.** It said "Twelve things this does today" and the
      // page grew to twenty-one in the same session — a claim that went stale between one commit and
      // the next. `site-claims.test.tsx` requires every *digit* on a page to be explained, and a
      // spelled-out count walks straight past that: "Twelve" is a word. The cheapest guard is not to
      // carry a number that has to be maintained alongside the thing it counts.
      lede="Everything below is built. Every sentence names the part of the codebase that does it, and a test in this repository fails if one of them stops being true."
    >
      <div className="site-wrap">
        <div className="site-grid site-grid-3">
          <GridItem group="Editor" title="Blok canvas" body={claim("blok-canvas")} />
          <GridItem group="Editor" title="Per-blok compilation" body={claim("per-blok-compilation")} />
          <GridItem group="Editor" title="Edited by hand" body={claim("edited-by-hand")} />
          <GridItem group="Editor" title="Typed variables" body={claim("variables-contract")} />
          <GridItem group="Import" title="Decompiler" body={claim("decompiler")} />
          <GridItem group="Import" title="Findings" body={claim("diagnostics")} />
          <GridItem group="Import" title="Rules nothing checks" body={claim("rules-without-checks")} />
          <GridItem group="Import" title="One blok, many ranges" body={claim("multi-range-bloks")} />
          <GridItem group="Runs" title="Three providers" body={claim("three-providers")} />
          <GridItem group="Runs" title="Checks in plain words" body={claim("eight-check-kinds")} />
          <GridItem group="Runs" title="Attribution" body={claim("attribution")} />
          <GridItem group="History" title="Semantic difference" body={claim("semantic-diff")} />
        </div>

        <h2 style={{ marginTop: "var(--spacing-s8)" }}>And the parts that only show up once you rely on it.</h2>
        <div className="site-grid site-grid-3">
          <GridItem group="Editor" title="Your words, not ours" body={claim("verbatim-spans")} />
          <GridItem group="Import" title="Nothing guesses" body={claim("deterministic-segmentation")} />
          <GridItem group="Runs" title="Ungraded is not passed" body={claim("not-graded-is-not-a-pass")} />
          <GridItem group="Runs" title="A judge, pinned" body={claim("judge-pinned")} />
          <GridItem group="Runs" title="From a failure to a rule" body={claim("constraint-from-failure")} />
          <GridItem group="Runs" title="By input as well as by check" body={claim("heatmap")} />
          <GridItem group="History" title="Versions mint themselves" body={claim("versions-automatic")} />
          <GridItem group="History" title="Two versions, one set of inputs" body={claim("ab-two-versions")} />
          <GridItem group="History" title="Restore" body={claim("restore")} />
        </div>

        <AskChipRow>
          <AskChip question="Explain what it means for a failing prompt test to be attributed to one clause of the prompt rather than to the prompt as a whole, and why that changes how you fix it.">
            Why does attribution matter?
          </AskChip>
          <AskChip question="Compare running one prompt across Claude, GPT and Gemini with a tool that records cost, latency and pass rate, versus pasting it into each provider's playground by hand.">
            Why compare models this way?
          </AskChip>
        </AskChipRow>
      </div>
    </SitePage>
  );
}

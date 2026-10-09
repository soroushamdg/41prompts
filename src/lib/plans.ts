/* Plans (docs/FEATURES.md). Free: every must-be feature, unlimited.
   Performance: every performance feature and delighter. */

export type Plan = "free" | "performance";

export const PERFORMANCE_PERKS: ReadonlyArray<readonly [id: string, text: string]> = [
  ["P01", "Failure attribution to the exact blok"],
  ["P02", "Linter for repeats, conflicts and untestable lines"],
  ["P03", "Decompiler: long prompts split into bloks"],
  ["P04", "Tests from expects bloks"],
  ["P05", "Your models side by side, with cost and latency"],
  ["P06", "Search inside prompts, tags and filters"],
  ["P07", "Semantic diffs between versions"],
  ["P08", "Shared workspaces with roles"],
  ["D01", "Public share pages"],
  ["D02", "Typed function export"],
];

/** Names used on locked controls; each opens the upgrade sheet on Free. */
export type PerformanceFeature =
  | "The linter"
  | "Tests"
  | "Side-by-side runs"
  | "Semantic diff"
  | "Share pages"
  | "Typed export"
  | "The decompiler"
  | "Search inside prompts"
  | "Tags and filters";

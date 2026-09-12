import { cluster, detect, type Finding, type FindingKind, segment } from "@41prompts/core";
import { DETECT_FIXTURES, SEGMENT_FIXTURES } from "@41prompts/core/fixtures";

/**
 * The article's examples, produced by running the real detectors over the committed corpus.
 *
 * EPIC-015 criterion 2: *"Every example in it comes from the committed corpus."* The way to make that
 * true and keep it true is not to copy messages into prose — it is to render what
 * `detect(cluster(segment(fixture)))` returns, right now, from fixtures that are already under test.
 * If a detector's wording changes, the article changes with it; if a detector stops firing, the
 * article loses that example and `article-examples.test.ts` fails.
 *
 * Computed once per process, not per request: the corpus is fixed and the pipeline is deterministic.
 */

export interface ArticleExample {
  /** The fixture it came from, named so a reader can go and look. */
  readonly fixture: string;
  readonly severity: Finding["severity"];
  readonly message: string;
  readonly suggestion?: string;
}

/**
 * `support-email-router` carries four of the six on its own — a realistic 200-word support prompt,
 * which is the point: these are not contrived. The other two come from the detector fixtures, which
 * are equally committed and equally under test.
 */
const SOURCES: readonly { readonly name: string; readonly source: string }[] = [
  ...SEGMENT_FIXTURES.map((fixture) => ({ name: fixture.name, source: fixture.text })),
  ...DETECT_FIXTURES.map((fixture) => ({ name: fixture.name, source: fixture.text }))
];

function firstOfEachKind(): Map<FindingKind, ArticleExample> {
  const found = new Map<FindingKind, ArticleExample>();
  for (const { name, source } of SOURCES) {
    if (typeof source !== "string" || source.length === 0) continue;
    for (const finding of detect(cluster(segment(source)), source)) {
      if (found.has(finding.kind)) continue;
      found.set(finding.kind, {
        fixture: name,
        severity: finding.severity,
        message: finding.message,
        ...(finding.suggestion === undefined ? {} : { suggestion: finding.suggestion })
      });
    }
  }
  return found;
}

const EXAMPLES = firstOfEachKind();

export function exampleFor(kind: FindingKind): ArticleExample | undefined {
  return EXAMPLES.get(kind);
}

/** The prompt the article shows in full. Everything it claims about it is derived, never asserted. */
export const RUNNING_EXAMPLE_NAME = "support-email-router";

export function runningExample(): { readonly source: string; readonly findings: readonly Finding[] } {
  const fixture = SEGMENT_FIXTURES.find((f) => f.name === RUNNING_EXAMPLE_NAME);
  if (fixture === undefined) return { source: "", findings: [] };
  return { source: fixture.text, findings: detect(cluster(segment(fixture.text)), fixture.text) };
}

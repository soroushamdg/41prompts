/**
 * What shipped, grouped by the stage it shipped in.
 *
 * ## Why this is not the mockup's changelog
 *
 * `41prompts-full-mockup.html` draws four entries with version numbers and dates —
 * `v0.9 · Aug 19, 2026`, `v0.8`, `v0.7`, `v0.6`. None of those releases exists. The newest tag in
 * this repository is `v0.5.0`, and `docs/epics/RELEASE-DUE.md` records that production is many
 * commits behind it. A changelog whose version numbers are invented is worse than no changelog: it
 * is the one page a reader uses to work out whether a project is alive.
 *
 * ## What a row is instead
 *
 * A row is a **stage**, and it names the epics it shipped. Every epic id here is checked against
 * `docs/epics/reports/` by `changelog.test.ts`, which is what "shipped" means in this repository:
 * merged into `main` with a report that has evidence for every criterion.
 *
 * ## The half that catches the next omission
 *
 * The test also walks `docs/epics/reports/` in the other direction and fails on a report this file
 * does not mention, unless its id is in `NOT_USER_VISIBLE` below with a reason. So an epic that
 * ships something a reader would care about cannot quietly fail to appear here — somebody has to
 * either write the row or say in one line why there is nothing to say.
 */

export interface ChangelogEntry {
  /** Stable, for the anchor. */
  readonly id: string;
  /** The stage as this project numbers them. */
  readonly stage: string;
  readonly heading: string;
  readonly body: string;
  /** Every epic this row shipped. Each must have a report. */
  readonly epics: readonly string[];
}

/**
 * Epics whose work a reader of the marketing site cannot see, each with the reason.
 *
 * This list is the escape hatch for the reverse check, and it is deliberately tedious to add to: an
 * id goes here only when there is genuinely nothing a user could notice.
 */
export const NOT_USER_VISIBLE: Readonly<Record<string, string>> = {
  "EPIC-000": "the monorepo, TypeScript strict, lint and the boundary allow-list",
  "EPIC-001": "the box, Compose, TLS and the nightly backup",
  "EPIC-004": "Sentry, PostHog, uptime and structured logs",
  "EPIC-007": "the compliance workflow: REUSE, dependency-cruiser, the SBOM and the mirror dry run",
  "EPIC-008": "how container images are built",
  "EPIC-009": "how much those builds were costing",
  "EPIC-011a-fixup": "a correction to EPIC-011a, shipped inside it",
  "EPIC-031a": "one deliberate first call to a real provider, to find out what broke",
  "EPIC-043": "the threat model behind stored provider keys; its findings are what EPIC-042 shipped",
  "EPIC-057": "the threat model behind delivery; its findings are what the rate limit and the cache-directory refusal shipped",
  "EPIC-900": "the tech-debt sweep: a dead-code gate, twenty dependency upgrades and three corrections to CLAUDE.md",
  "EPIC-901": "the monthly security and licence audit, and the licence headers of files nobody publishes"
};

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: "stage-6",
    stage: "Stage 6",
    heading: "The site says what the product does, and a test keeps it honest",
    body: "Features, Delivery, Docs, Security, Changelog and Guides, plus the third-party notices. Every claim on them is held as data naming the work that shipped it, and the build fails if a page says something this repository cannot back.",
    epics: ["EPIC-072"]
  },
  {
    id: "stage-5b",
    stage: "Stage 5b",
    heading: "A command line, Python, and the open repository",
    body: "41p link, pull, check, run and decompile. A Python SDK at parity with the TypeScript one, zero dependencies in both. The engine, the build format, both SDKs and the CLI became Apache-2.0.",
    epics: ["EPIC-053", "EPIC-054", "EPIC-056"]
  },
  {
    id: "stage-5a",
    stage: "Stage 5a",
    heading: "A prompt can leave the building",
    body: "The published build format, frozen. Publish, undo and the gate that stops a publish whose checks fail. The TypeScript SDK that resolves it without ever waiting on the network. The Deploy and Connect pages, and API keys.",
    epics: ["EPIC-050", "EPIC-051", "EPIC-052", "EPIC-055"]
  },
  {
    id: "stage-4",
    stage: "Stage 4",
    heading: "Versions, and three providers",
    body: "A version is minted as you work, and a run pins the one it ran. Semantic difference between any two, restore, and A/B on one set of inputs. Anthropic, OpenAI and Google behind one interface, with your own keys sealed at rest.",
    epics: ["EPIC-040", "EPIC-041", "EPIC-042"]
  },
  {
    id: "stage-3",
    stage: "Stage 3",
    heading: "Checks and runs",
    body: "Expected bloks compile to checks rather than to text. Deterministic graders first, a judge pinned by version second, and every failure attributed to the blok that owns the span that caused it. Inputs arrive as a CSV or typed in by hand, and a set some run has already used is copied rather than changed, so what that run scored stays answerable.",
    epics: ["EPIC-030", "EPIC-031", "EPIC-032", "EPIC-032a", "EPIC-033", "EPIC-034"]
  },
  {
    id: "stage-2",
    stage: "Stage 2",
    heading: "The canvas and the compiled prompt",
    body: "A prompt became a set of typed bloks you can add, edit, reorder and delete, compiled one blok at a time. The compiled pane links each span to its blok, and a span you edit by hand is released and marked. A left rail arrived later and put every one of a prompt's screens — the canvas, runs, versions, deploy and connect — one click from each other, with the draft and live version named on all of them. Then the canvas became a column of cards that open when you select one, projects became a grid that says how each is doing, and the checks a prompt compiles to got a page of their own.",
    epics: ["EPIC-020", "EPIC-021a", "EPIC-021b", "EPIC-022", "EPIC-023", "EPIC-024"]
  },
  {
    id: "stage-1",
    stage: "Stage 1",
    heading: "The decompiler, in public",
    body: "Paste a prompt and get it back as named bloks mapped to your own text, with repetition, contradiction, untestable wording and rules nothing checks called out. No account, and nothing stored unless you ask for a link. The home page later grew to show the product itself — a prompt open in the editor, a suite graded across three models, and a failure resolving to the blok that owns it — with every illustration marked as one.",
    epics: ["EPIC-010", "EPIC-011a", "EPIC-011b", "EPIC-012a", "EPIC-012b", "EPIC-013", "EPIC-014", "EPIC-015", "EPIC-016", "EPIC-016b", "EPIC-017"]
  },
  {
    id: "stage-0",
    stage: "Stage 0",
    heading: "Accounts, and a design system",
    body: "Sign in, protected routes and an account you can delete. The token set, the components, light and dark designed together, and reduced motion showing the end of an animation rather than skipping it.",
    epics: ["EPIC-002", "EPIC-003"]
  }
];

/** Every epic id the changelog cites, flattened. */
export const CHANGELOG_EPICS: readonly string[] = CHANGELOG.flatMap((entry) => entry.epics);

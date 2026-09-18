/**
 * The Connect page's TypeScript steps (EPIC-055).
 *
 * ## Why this is a module and not four snippets inside a component
 *
 * `packages/sdk-ts/README.md` is the canonical copy of these instructions — EPIC-052's handover
 * says so, and it is the one that goes to npm, so it is the one a customer actually follows.
 * Two copies of an install instruction is the defect `apps/web/e2e/env.mjs` exists to prevent one
 * level down and the defect `buildHashOf` exists to prevent one level up: **the copy goes stale
 * silently**, and here the stale one is the page a person reads before they have the package.
 *
 * `apps/web` may not import `packages/sdk-ts` — it is a public package and `CLAUDE.md` rule 11 runs
 * the other way — so the two are held together by `steps.test.ts`, which reads the README and fails
 * when a line this file claims is shared is not in it. Ruling 4.
 *
 * ## Four steps, all of which work today
 *
 * The mockup's steps 3 and 4 are `41p pull` and a generated file, which is EPIC-053. What is here
 * is the path that exists: install, key, resolve, and what happens when we are unreachable. The
 * generated file is on the same page, under its own heading, because the page writes it (ruling 3).
 */

export interface ConnectStep {
  /** Used as the DOM id and the test's handle. */
  slug: string;
  title: string;
  /** One sentence. Read before the code, so it says why rather than what. */
  says: string;
  code: string;
  language: "bash" | "ts" | "text";
  /**
   * The substrings of this step that must appear verbatim in `packages/sdk-ts/README.md`.
   *
   * Not always the whole snippet: step 2 is an environment file, which the README documents as an
   * option rather than printing as a line. What is shared is the **name**, and the name is what
   * goes wrong. A test asserting the whole block would force the README to carry a `.env` example
   * it has no reason to, which is how a pinning test starts distorting the thing it pins.
   */
  readmeMustContain: readonly string[];
}

/** The exact header an opted-in client sends. Printed on the page because the README prints it. */
export const TELEMETRY_HEADER_EXAMPLE = "41p-client: ts/0.1.0/node22/3f5b9c31-0a44-4d6e-9f11-2a7c8e4d6b01";

const RESOLVE_EXAMPLE = `import { createClient } from "@41prompts/sdk";

const prompts = createClient({ apiKey: process.env.FORTYONE_API_KEY });

const { status, text } = prompts.resolve("pr_1a2b3c4d", { customer_name: "Ada" });
if (status === "ok") {
  await model.complete(text);
}`;

export const CONNECT_STEPS: readonly ConnectStep[] = [
  {
    slug: "install",
    title: "Install the package",
    says: "One package, no dependencies behind it, and no configuration file.",
    code: "npm install @41prompts/sdk",
    language: "bash",
    readmeMustContain: ["npm install @41prompts/sdk"],
  },
  {
    slug: "key",
    title: "Add your key",
    says: "A live key and a test key both resolve what is Live. Which one you used is recorded, so a build server is never counted as an application.",
    code: "FORTYONE_API_KEY=41p_live_…",
    language: "text",
    // The name, not the line: see `readmeMustContain` above.
    readmeMustContain: ["FORTYONE_API_KEY"],
  },
  {
    slug: "resolve",
    title: "Resolve a prompt",
    says: "The call is synchronous and never waits for the network. Branch on status; an unavailable result is never a prompt worth sending.",
    code: RESOLVE_EXAMPLE,
    language: "ts",
    readmeMustContain: [RESOLVE_EXAMPLE],
  },
  {
    slug: "offline",
    title: "Be right on a cold start",
    says: "The first call in a fresh process has nothing cached yet. Wait once in your own start-up — naming the prompt, because a client you have just built has not been asked for anything — or ship the builds with your deploy.",
    code: `// Wait once, where waiting is allowed — in your own start-up, not in a request.
await prompts.refresh("pr_1a2b3c4d");`,
    language: "ts",
    readmeMustContain: [
      'await prompts.refresh("pr_1a2b3c4d");',
      "// Wait once, where waiting is allowed — in your own start-up, not in a request.",
    ],
  },
];

/**
 * What the page says about telemetry.
 *
 * On the page because a person deciding whether to connect their application is exactly who wants
 * to know, and putting it only in the README means they read it after they have installed.
 */
export const TELEMETRY_NOTE = {
  title: "What we send",
  says: "Nothing, unless you turn it on. Off is the default and there is no request the SDK makes to tell us it exists.",
  onSays: "With telemetry: true, one header is added to a request it was already making — never a request of its own:",
  header: TELEMETRY_HEADER_EXAMPLE,
  readmeMustContain: [TELEMETRY_HEADER_EXAMPLE],
} as const;

// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

// Corpus prompts that exercise the block rules: fences, tag blocks, headings, lists, nesting.

import type { SegmentFixture } from "../types.js";
import { lf } from "./text.js";

export const STRUCTURE_FIXTURES: readonly SegmentFixture[] = [
  {
    name: "support-email-router",
    describes:
      "The decompiler prototype's own sample prompt, verbatim. Segments identically to the prototype: 15 segments, same offsets.",
    text: lf(
      "You are a helpful customer support assistant for Northwind, a B2B SaaS company that sells inventory software. You should always be professional and friendly.",
      "",
      "Your job is to read an incoming support email and decide how to route it.",
      "",
      "Rules:",
      "1. Always classify the email into one of these categories: billing, technical, onboarding, cancellation, other.",
      "2. You must respond in JSON only. Do not include any explanation outside the JSON.",
      "3. Never mention that you are an AI model.",
      "4. Keep the summary field reasonably short and use appropriate language.",
      "5. If the customer sounds angry, set the priority field to high.",
      "6. Always be professional and friendly in the summary field.",
      "",
      "The JSON should have these fields: category, priority, summary, needs_human.",
      "Please make sure the output is valid JSON. Thank you!",
      "",
      "For example, if the email says 'I was charged twice this month', you would return {\"category\":\"billing\",\"priority\":\"medium\"}.",
      "",
      "When the email mentions a chargeback, always set needs_human to true.",
      "",
      "Do not use markdown formatting in your response. Format the summary as a markdown bullet list if there are multiple issues.",
      "",
      "If you are unsure about the category, use your best judgement and pick the most likely one.",
      "",
      "Remember: respond in JSON only, with no extra text before or after."
    )
  },
  {
    name: "fenced-json-schema",
    describes:
      "A fence holding a blank line and a line that looks like a markdown heading. Neither may split it (rule 1 over rules 3 and 4).",
    text: lf(
      "You extract structured data from invoices.",
      "",
      "Return exactly this shape:",
      "",
      "```json",
      "{",
      '  "vendor": "string",',
      '  "total_cents": 0,',
      "",
      '  "# not a heading": "the hash above is inside the fence",',
      "",
      '  "line_items": []',
      "}",
      "```",
      "",
      "Never add fields that are not in the schema.",
      ""
    )
  },
  {
    name: "fenced-tilde-and-backticks",
    describes:
      "A tilde fence containing backtick fence markers, plus a separate backtick fence with an info string. A tilde fence is never closed by backticks.",
    text: lf(
      "Show the user how to write a fenced block:",
      "",
      "~~~",
      "```python",
      "print('hello')",
      "```",
      "",
      "# still inside the tilde fence",
      "~~~",
      "",
      "And run this yourself:",
      "",
      "```bash",
      "41p check --all",
      "```",
      ""
    )
  },
  {
    name: "unterminated-fence",
    describes: "A fence the author never closed. It runs to the end of the input rather than falling apart into paragraphs.",
    text: lf(
      "Reply with a diff in this format:",
      "",
      "```diff",
      "- old line",
      "+ new line",
      "",
      "Anything after this point is still inside the fence.",
      ""
    )
  },
  {
    name: "xml-instruction-tags",
    describes: "Matched tag regions, the Anthropic house style. Each is atomic even though it holds blank lines and lists.",
    text: lf(
      "<role>",
      "You are a senior code reviewer for a TypeScript monorepo.",
      "</role>",
      "",
      "<instructions>",
      "Review the diff below.",
      "",
      "1. Correctness first.",
      "2. Then simplification.",
      "3. Never comment on formatting.",
      "</instructions>",
      "",
      "<output_format>",
      "One finding per line, most severe first.",
      "</output_format>",
      ""
    )
  },
  {
    name: "xml-nested-same-tag",
    describes: "A tag region nesting the same tag name inside itself. The outer pair matches the outer close, not the inner one.",
    text: lf(
      "Follow the worked examples.",
      "",
      "<examples>",
      "<example>",
      "Input: I was charged twice.",
      "Output: billing",
      "</example>",
      "<example>",
      "Input: The app will not start.",
      "Output: technical",
      "</example>",
      "</examples>",
      "",
      "Now classify the email below.",
      ""
    )
  },
  {
    name: "unmatched-tag",
    describes: "An opening tag with no closing tag. Not a region: it falls through to the paragraph rules, which is all we honestly know about it.",
    text: lf(
      "Wrap your reasoning in tags.",
      "",
      "<scratchpad>",
      "Think step by step here. Do not show this to the user.",
      "",
      "Then give the final answer.",
      ""
    )
  },
  {
    name: "numbered-rules",
    describes: "The commonest shape in a real system prompt: a lead-in line and a numbered list of rules.",
    text: lf(
      "You are a triage bot for an on-call rota.",
      "",
      "Rules:",
      "1. Page the on-call engineer only for severity 1 and severity 2.",
      "2. For severity 3, open a ticket and post in #ops.",
      "3. Never page between 22:00 and 07:00 local time unless severity is 1.",
      "4. If the alert has fired more than three times in an hour, group it.",
      "5. Always include the runbook link.",
      "",
      "Respond with the action you took and why.",
      ""
    )
  },
  {
    name: "bulleted-with-nesting",
    describes: "A bulleted list with sub-bullets. Each nested list stays with its parent item (rule 5) rather than becoming a loose segment.",
    text: lf(
      "Style guide for replies:",
      "",
      "- Be direct.",
      "  - No filler openings.",
      "  - No apologies unless we broke something.",
      "- Use the customer's own words for their problem.",
      "  - Quote at most one sentence.",
      "- Close with the next concrete step.",
      "  + Include a date if you promise one.",
      "  + Never promise a date you cannot hold.",
      "",
      "Anything not covered here: use judgement and flag it.",
      ""
    )
  },
  {
    name: "markdown-heavy",
    describes: "Headings, lists and a fence together. Headings separate; each heading line is its own segment (rule 3).",
    text: lf(
      "# Release notes assistant",
      "",
      "You turn a list of merged pull requests into release notes.",
      "",
      "## Voice",
      "",
      "Plain, short sentences. No marketing language.",
      "",
      "## Sections",
      "",
      "- Added",
      "- Changed",
      "- Fixed",
      "",
      "### Skip these",
      "",
      "- Dependency bumps with no user-visible effect",
      "- Internal refactors",
      "",
      "## Output",
      "",
      "```markdown",
      "## v1.4.0",
      "",
      "### Added",
      "- ...",
      "```",
      "",
      "Never invent a change that is not in the input.",
      ""
    )
  },
  {
    name: "few-shot-examples",
    describes: "Input/Output pairs written as plain paragraphs, the way most people write few-shot examples before they discover tags.",
    text: lf(
      "Classify the sentiment of a product review as positive, negative or mixed.",
      "",
      "Input: This thing arrived broken and support ignored me for a week.",
      "Output: negative",
      "",
      "Input: Battery life is great, but the app crashes daily.",
      "Output: mixed",
      "",
      "Input: Exactly what I needed, no notes.",
      "Output: positive",
      "",
      "Answer with one word and nothing else.",
      ""
    )
  },
  {
    name: "tool-use-agent",
    describes: "A realistic agent prompt: tags, a fence, a numbered list and prose in one document, exercising every rule in one pass.",
    text: lf(
      "# Deploy assistant",
      "",
      "<role>",
      "You operate a deployment pipeline. You may read anything and change nothing without approval.",
      "</role>",
      "",
      "## Tools",
      "",
      "```json",
      "{",
      '  "name": "read_logs",',
      '  "arguments": { "service": "string", "since": "duration" }',
      "}",
      "```",
      "",
      "## Procedure",
      "",
      "1. Read the failing job's logs before saying anything about the cause.",
      "2. Quote the exact error line. Never paraphrase an error.",
      "3. Propose one command. Wait for approval.",
      "4. After approval, run it and report the outcome, including a failure.",
      "",
      "<constraints>",
      "Never run a command that changes production without an explicit yes.",
      "Never print an environment variable's value.",
      "</constraints>",
      "",
      "If the logs do not explain the failure, say so instead of guessing.",
      ""
    )
  }
];

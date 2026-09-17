// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * Real artifacts for this package's suite (EPIC-052).
 *
 * **Built with `artifactOf` and serialised with `artifactBytes`, never written out by hand.** A
 * hand-written fixture would carry a hand-written `buildHash`, and every verification test in this
 * package would then be asserting against the same guess it was testing — which is EPIC-050's
 * lesson 13 arriving through a fixture file. These go through the publisher's own code path, so a
 * change in core's canonical encoding fails these tests rather than silently agreeing with them.
 *
 * Excluded from `tsconfig.build.json`: test support does not ship.
 */

import {
  artifactBytes,
  artifactOf,
  compile,
  liveMarkerOf,
  type Artifact,
  type ArtifactVariable,
  type LiveMarker,
  type PromptBlok,
} from "@41prompts/core";

export const PROMPT_ID = "pr_1a2b3c4d";

export const TWO_VARIABLES: readonly ArtifactVariable[] = [
  { name: "customer_name", defaultValue: null, description: "who the reply is to" },
  { name: "tone", defaultValue: "warm", description: null },
];

export interface Built {
  readonly artifact: Artifact;
  readonly artifactText: string;
  readonly marker: LiveMarker;
  readonly markerText: string;
}

/** One artifact, and the Live marker that names it. `body` changes the text, so two calls differ. */
export function build(
  options: {
    promptId?: string;
    body?: string;
    variables?: readonly ArtifactVariable[];
    version?: number;
    model?: string;
  } = {},
): Built {
  const promptId = options.promptId ?? PROMPT_ID;
  const bloks: readonly PromptBlok[] = [
    { id: "blk_1", kind: "context", text: "You are a support agent.", order: 1 },
    {
      id: "blk_2",
      kind: "constraint",
      text: options.body ?? "Reply to {{customer_name}} in a {{tone}} register.",
      order: 2,
    },
  ];
  const artifact = artifactOf({
    promptId,
    compiled: compile(bloks),
    bloks,
    model: options.model ?? "claude-sonnet-5",
    params: { temperature: 0 },
    variables: options.variables ?? TWO_VARIABLES,
    checkSuiteId: null,
  });
  const marker = liveMarkerOf({
    promptId,
    buildHash: artifact.buildHash,
    version: options.version ?? 1,
    publishedAt: new Date("2026-09-17T09:00:00Z"),
  });
  return {
    artifact,
    artifactText: artifactBytes(artifact),
    marker,
    markerText: JSON.stringify(marker),
  };
}

/** A minimal `FetchResponse`. `headers` is a plain map so a test can assert what was asked for. */
export function response(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): { ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> } {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: () => Promise.resolve(body),
  };
}

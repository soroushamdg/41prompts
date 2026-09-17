// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * Artifacts and `/v1` answers the tests share (EPIC-053).
 *
 * The artifacts are **built by `artifactOf`** rather than written out by hand, so their `buildHash`
 * is the real one and `api.ts`'s verification is exercised rather than bypassed. A hand-written
 * fixture with a made-up hash would make every verification test pass for the wrong reason — which
 * is `docs/PROCESS.md`'s lesson 8, and lesson 13's false negative, in the same place.
 */

import { artifactOf, buildHashOf, compile, type Artifact } from "@41prompts/core";

export interface FixtureOptions {
  readonly promptId?: string;
  readonly text?: string;
  readonly variables?: readonly { name: string; defaultValue: string | null; description: string | null }[];
}

/**
 * A real artifact, compiled the way a publish compiles one.
 *
 * `compile()` rather than a hand-written `spans` array, so the spans tile the text exactly and
 * `ARTIFACT_JSON_SCHEMA` has something real to validate. A fixture that satisfied the schema by
 * accident would make `api.ts`'s verification pass for the wrong reason.
 */
export function artifactFixture(options: FixtureOptions = {}): Artifact {
  const text = options.text ?? "Classify this email: {{email}}";
  const bloks = [{ id: "b1", kind: "context" as const, text, order: 0 }];
  return artifactOf({
    promptId: options.promptId ?? "pr_1a2b3c4d",
    compiled: compile(bloks),
    bloks,
    model: "claude-sonnet-5",
    params: { temperature: 0 },
    variables: options.variables ?? [{ name: "email", defaultValue: null, description: null }],
    checkSuiteId: null,
  });
}

/** What the routing stub accepts: a body, and optionally the status to answer with. */
export interface RouteBody {
  readonly status?: number;
  readonly body: string;
}

/** `{ "<buildHash>": artifact }` routes, so a test can hand several builds to the stub at once. */
export function buildRoutes(...artifacts: readonly Artifact[]): Record<string, RouteBody> {
  const routes: Record<string, RouteBody> = {};
  for (const build of artifacts) {
    routes[`/v1/build/${buildHashOf(build)}`] = { body: JSON.stringify(build) };
  }
  return routes;
}

export function promptsRoute(
  rows: readonly { id: string; name: string; artifact?: Artifact; version?: number }[],
  environment = "live",
): Record<string, RouteBody> {
  return {
    "/v1/prompts": {
      body: JSON.stringify({
        environment,
        prompts: rows.map((row) => ({
          id: row.id,
          name: row.name,
          live:
            row.artifact === undefined
              ? null
              : {
                  buildHash: buildHashOf(row.artifact),
                  version: row.version ?? 1,
                  publishedAt: "2026-09-17T00:00:00.000Z",
                  markerUrl: `https://example.invalid/markers/${row.id}.json`,
                },
        })),
      }),
    },
  };
}

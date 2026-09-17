// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The one place a test reaches for the real SDK (EPIC-053, C6).
 *
 * `41p pull` writes bundled builds so that `createClient({ bundled })` can answer with no cache and
 * no network. Asserting the *shape* of those documents would prove nothing — the question is whether
 * the SDK accepts them, and the only honest way to answer it is to hand them over and resolve.
 *
 * It lives beside the test rather than in it so that `pull.test.ts` reads as a list of claims, and
 * so the `cacheDir: null` below — which is what stops a unit test writing into a temp directory —
 * is explained once.
 */

import { createClient } from "@41prompts/sdk";
export { buildHashOf } from "@41prompts/core";

export function createClientArtifactCheck(
  bundled: readonly unknown[],
  promptId: string,
  vars: Record<string, string>,
): { status: string; source: string; text: string } {
  const client = createClient({
    bundled,
    // No key and no base URL: the point is that a bundled answer needs neither. `cacheDir: null`
    // keeps the disk out of it, which is both faster and the rule about tests not writing anywhere.
    cacheDir: null,
    onWarning: () => undefined,
  });
  const result = client.resolve(promptId, vars);
  return { status: result.status, source: result.source, text: result.text };
}

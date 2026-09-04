// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

export interface ResolveOptions {
  onWarning?: (message: string) => void;
}

export interface ResolveResult {
  text: string;
  status: "ok" | "unavailable";
}

/**
 * Stub for EPIC-000. Never throws (CLAUDE.md rule 8): reports unavailability
 * through the result and the optional onWarning callback instead.
 */
export function resolve(
  _promptId: string,
  _vars?: Record<string, unknown>,
  options?: ResolveOptions
): ResolveResult {
  options?.onWarning?.("not implemented");
  return { text: "", status: "unavailable" };
}

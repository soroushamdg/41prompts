// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * This package's own version, as a value the bundle can carry (EPIC-052).
 *
 * Written out rather than imported from `package.json`, because `rootDir` is `src` and reaching
 * outside it would put a copy of the manifest into `dist`. `package.test.ts` pins the two together
 * so the copy cannot go stale — the same trade `apps/web/e2e-env.test.ts` makes for `ci.yml`'s
 * literal, and for the same reason: a copy is fine when something fails the moment it diverges.
 */
export const SDK_VERSION = "0.1.0";

/** The default host for `/v1`. `docs/PROCESS.md`'s host split leaves `/v1` reachable on both. */
export const DEFAULT_BASE_URL = "https://app.41prompts.ai";

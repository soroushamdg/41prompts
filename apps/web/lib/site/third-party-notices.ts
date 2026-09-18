import notices from "./third-party-notices.generated.json";

/**
 * Every third-party package this service runs on, with the licence each one declares.
 *
 * The JSON beside this file is written by `scripts/third-party-notices.mjs` from
 * `pnpm licenses list --prod --json` — the same command `scripts/license-gate.mjs` reads to produce
 * the SBOM. It is committed because a page cannot run the package manager at request time, and it
 * is kept current by `third-party-notices.test.ts`, which re-runs the generator and fails on a
 * stale file rather than trusting anybody to remember.
 */

export interface NoticePackage {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly homepage: string | null;
}

export interface NoticeGroup {
  readonly license: string;
  readonly packages: readonly NoticePackage[];
}

export const NOTICE_PACKAGES: readonly NoticePackage[] = notices.packages;

/** The command that produced the file, printed on the page so a reader can run it themselves. */
export const NOTICE_SOURCE: string = notices.generatedFrom;

/**
 * Grouped by licence, commonest first, because that is the order a reader scans for the one
 * unusual entry — and the unusual entries are the reason this page exists.
 */
export function noticeGroups(): readonly NoticeGroup[] {
  const byLicense = new Map<string, NoticePackage[]>();
  for (const entry of NOTICE_PACKAGES) {
    const existing = byLicense.get(entry.license);
    if (existing) existing.push(entry);
    else byLicense.set(entry.license, [entry]);
  }
  return [...byLicense.entries()]
    .map(([license, packages]) => ({ license, packages }))
    .sort((a, b) => b.packages.length - a.packages.length || a.license.localeCompare(b.license));
}
